require('dotenv').config();
const express = require('express');
const promClient = require('prom-client');
const winston = require('winston');
const https = require('follow-redirects').https;

const app = express();
app.use(express.json());

// ============================================
// PROMETHEUS METRICS
// ============================================

const whatsappDuration = new promClient.Histogram({
  name: 'whatsapp_request_duration_ms',
  help: 'Duration of WhatsApp template requests in ms',
  labelNames: ['status_code'],
  buckets: [100, 200, 500, 800, 1000, 2000, 5000]
});

const whatsappErrors = new promClient.Counter({
  name: 'whatsapp_errors_total',
  help: 'Total number of WhatsApp API errors',
  labelNames: ['error_type', 'status_code']
});

const interactive_message_sent_total = new promClient.Counter({
  name: 'interactive_message_sent_total',
  help: 'Total number of successfully sent WhatsApp templates',
  labelNames: ['language', 'platform']
});

const systemLoad = new promClient.Gauge({
  name: 'system_load_avg',
  help: 'System load average'
});

const memoryUsage = new promClient.Gauge({
  name: 'process_memory_usage_bytes',
  help: 'Process memory usage in bytes',
  labelNames: ['type']
});

const platformDeliveryStatus = new promClient.Gauge({
  name: 'platform_delivery_status',
  help: 'Delivery state: 1 = Delivered, 0.5 = Pending, 0 = Rejected or Failed',
  labelNames: ['platform', 'status_name']
});

// ============================================
// LOGGING SETUP
// ============================================

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: './logs/api.log' }),
    new winston.transports.Console()
  ]
});

// ============================================
// ENDPOINT: Send WhatsApp Template
// ============================================

app.post('/whatsapp/send-template', async (req, res) => {
  const start = Date.now();

  const {
    to = '573005944681',
    from = '447860099299',
    platform = 'default'
  } = req.body;


  const payload = JSON.stringify({
    from,
    to,
    messageId: `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    content: {
      body: {
        text: "👋 Hi! How can we assist you today?"
      },
      action: {
        title: "Choose a Service",
        sections: [
          {
            title: "📦 Account & Services",
            rows: [
              {
                id: "check-balance",
                title: "💰 Check My Balance",
                description: "View your current available balance."
              },
              {
                id: "transactions",
                title: "📑 Recent Transactions",
                description: "See your last 5 transactions."
              }
            ]
          },
          {
            title: "🛠️ Support Options",
            rows: [
              {
                id: "speak-agent",
                title: "🧑‍💼 Talk to an Agent",
                description: "Connect with a customer service rep."
              },
              {
                id: "faq",
                title: "❓ FAQs",
                description: "Get answers to common questions."
              }
            ]
          }
        ]
      }
    },
    callbackData: "user-interaction",
    notifyUrl: "https://yourdomain.com/whatsapp/callback",
    urlOptions: {
      shortenUrl: true,
      trackClicks: true,
      trackingUrl: "https://yourdomain.com/track-clicks",
      removeProtocol: true
    }
  });


  const options = {
    method: 'POST',
    hostname: 'v344z1.api.infobip.com',
    path: '/whatsapp/1/message/interactive/list',
    headers: {
      Authorization: 'Secret Key',
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
  };

  const infobipReq = https.request(options, (infobipRes) => {
    let chunks = [];

    infobipRes.on('data', chunk => chunks.push(chunk));

    infobipRes.on('end', () => {
      const duration = Date.now() - start;
      const body = Buffer.concat(chunks).toString();
      const statusCode = infobipRes.statusCode;

      if (statusCode >= 200 && statusCode < 300) {
        interactive_message_sent_total.inc({ language: 'interactive', platform });
      }
      if (statusCode >= 400) {
        // Classify 4xx vs 5xx
        const errType = statusCode >= 500 ? 'server_error' : 'client_error';
        whatsappErrors.inc({ error_type: errType, status_code: statusCode });

        logger.error('Infobip HTTP error', { statusCode, body });
      }

      whatsappDuration.observe({ status_code: statusCode }, duration);

      let status;
      try {
        const parsed = JSON.parse(body);

        // Support both formats:
        if (parsed.messages?.[0]?.status) {
          status = parsed.messages[0].status;
        } else if (parsed.status) {
          status = parsed.status;
        }

        let deliveryValue = 0;
        let statusName = 'unknown';

        if (status?.groupId === 3) {
          deliveryValue = 1; // Delivered
        } else if (status?.groupId === 1) {
          deliveryValue = 0.5; // Pending
        } else {
          deliveryValue = 0; // Failed or Rejected
        }

        if (status?.name) {
          statusName = status.name;
        }

        platformDeliveryStatus.set({ platform, status_name: statusName }, deliveryValue);
      } catch (err) {
        logger.warn('Failed to parse delivery status', { error: err.message });
      }



      res.status(statusCode).send(body);

      logger.info('Infobip response', {
        statusCode,
        duration_ms: duration,
        to,                // request context
        platform,
        status_json: body  // raw response for quick inspection
      });

    });
  });

  infobipReq.on('error', (err) => {
    const duration = Date.now() - start;
    whatsappErrors.inc({ error_type: 'network_error', status_code: 0 });
    logger.error('Network error while calling Infobip', { error: err.message });
    res.status(500).json({ error: 'Request failed', message: err.message });
  });

  infobipReq.write(payload);
  infobipReq.end();
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', time: new Date().toISOString() });
});

// ============================================
// METRICS ENDPOINT
// ============================================

app.get('/metrics', async (req, res) => {
  const mem = process.memoryUsage();
  memoryUsage.set({ type: 'rss' }, mem.rss);
  memoryUsage.set({ type: 'heapUsed' }, mem.heapUsed);
  memoryUsage.set({ type: 'heapTotal' }, mem.heapTotal);
  systemLoad.set(Math.random() * 3);

  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

// ============================================
// SERVER START
// ============================================

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logger.info(`WhatsApp API Monitoring running on port ${PORT}`);
  console.log(`🚀 http://localhost:${PORT}/whatsapp/send-template`);
  console.log(`📊 Metrics exposed at http://localhost:${PORT}/metrics`);
});
