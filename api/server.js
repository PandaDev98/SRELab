const express = require('express');
const promClient = require('prom-client');
const winston = require('winston');

const app = express();
app.use(express.json());

// ============================================
// PROMETHEUS METRICS (4 Golden Signals)
// ============================================

// 1. LATENCY - Response time histogram
const httpDuration = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [50, 100, 200, 500, 1000, 2000, 5000]
});

// 2. TRAFFIC - Request rate counter
const httpRequests = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

// 3. ERRORS - Error rate counter
const httpErrors = new promClient.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors',
  labelNames: ['method', 'route', 'error_type', 'status_code']
});

// 4. SATURATION - System resource usage
const systemLoad = new promClient.Gauge({
  name: 'system_load_avg',
  help: 'System load average'
});

const memoryUsage = new promClient.Gauge({
  name: 'process_memory_usage_bytes',
  help: 'Process memory usage in bytes',
  labelNames: ['type']
});

// SMS-specific metrics
const smsQueue = new promClient.Gauge({
  name: 'sms_queue_depth',
  help: 'Number of SMS messages waiting in queue'
});

const smsDelivered = new promClient.Counter({
  name: 'sms_delivered_total',
  help: 'Total SMS messages delivered',
  labelNames: ['destination_country', 'status']
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
    new winston.transports.File({ filename: '../logs/api.log' }),
    new winston.transports.Console()
  ]
});

// ============================================
// SIMULATION DATA
// ============================================

let currentQueueDepth = 50;
let systemUnderLoad = false;

// Simulate realistic response times based on system load
function getResponseTime() {
  if (systemUnderLoad) {
    return Math.random() * 2000 + 500; // 500-2500ms under load
  }
  return Math.random() * 200 + 50; // 50-250ms normal
}

// Simulate error scenarios
function shouldSimulateError() {
  if (systemUnderLoad) {
    return Math.random() < 0.5; // 50% error rate under load
  }
  return Math.random() < 0.001; // 0.1% normal error rate
}

// ============================================
// MIDDLEWARE
// ============================================

// Metrics collection middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    if (req.path === '/metrics') {
      return next();
    }
    const duration = Date.now() - start;
    const labels = {
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode
    };

    httpDuration.observe(labels, duration);
    httpRequests.inc(labels);

    if (res.statusCode >= 400) {
      httpErrors.inc({
        method: req.method,
        route: req.route?.path || req.path,
        status_code: res.statusCode.toString(), 
        error_type: res.statusCode >= 500 ? 'server_error' : 'client_error'
      });
    }

    logger.info('API Request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: duration,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  });

  next();
});

// ============================================
// API ENDPOINTS
// ============================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    queueDepth: currentQueueDepth
  });
});

// SMS sending endpoint (main API)
app.post('/sms/send', async (req, res) => {

  const { to, text, from } = req.body;

  // Simulate realistic processing time
  const processingTime = getResponseTime();

  // Simulate errors under load
  if (shouldSimulateError()) {
    logger.error('SMS Send Error', {
      to: to,
      error: 'Internal server error',
      queueDepth: currentQueueDepth
    });

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Unable to process SMS request'
    });
  }

  // Simulate validation errors
  if (!to || !text) {
    logger.warn('SMS Validation Error', {
      to: to,
      error: 'Missing required fields'
    });

    return res.status(400).json({
      error: 'Bad request',
      message: 'Missing required fields: to, text'
    });
  }

  // Simulate rate limiting
  if (req.headers['x-api-key'] === 'rate-limited-key') {
    logger.warn('Rate Limit Exceeded', {
      apiKey: req.headers['x-api-key'],
      to: to
    });

    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests, please slow down',
      retryAfter: 30
    });
  }

  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, processingTime));

  // Update queue metrics
  currentQueueDepth += Math.random() * 10 - 5; // Random queue fluctuation
  currentQueueDepth = Math.max(0, currentQueueDepth);
  smsQueue.set(Math.round(currentQueueDepth));

  // Simulate successful delivery
  const country = to.startsWith('+1') ? 'US' :
    to.startsWith('+44') ? 'UK' :
      to.startsWith('+49') ? 'DE' : 'OTHER';

  smsDelivered.inc({ destination_country: country, status: 'delivered' });

  logger.info('SMS Sent Successfully', {
    to: to,
    from: from,
    country: country,
    processingTime: processingTime,
    queueDepth: currentQueueDepth
  });

  res.json({
    messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    status: 'accepted',
    to: to,
    estimatedDelivery: new Date(Date.now() + 5000).toISOString()
  });
});

// Load simulation endpoint
app.post('/admin/simulate-load', (req, res) => {
  systemUnderLoad = req.body.enabled || false;
  logger.info('Load Simulation Changed', { enabled: systemUnderLoad });
  res.json({ loadSimulation: systemUnderLoad });
});

// Metrics endpoint for Prometheus
app.get('/metrics', async (req, res) => {
  // Update system metrics
  const memUsage = process.memoryUsage();
  memoryUsage.set({ type: 'rss' }, memUsage.rss);
  memoryUsage.set({ type: 'heapUsed' }, memUsage.heapUsed);
  memoryUsage.set({ type: 'heapTotal' }, memUsage.heapTotal);

  systemLoad.set(Math.random() * 3); // Simulate load average

  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logger.info(`Infobip SMS API listening on port ${PORT}`);
  console.log(`🚀 SMS API running on http://localhost:${PORT}`);
  console.log(`📊 Metrics available at http://localhost:${PORT}/metrics`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});