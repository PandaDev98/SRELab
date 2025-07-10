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
  labelNames: ['destination_country', 'status', 'platform']
});

// ============================================
// PLATFORM-SPECIFIC METRICS
// ============================================

const platformError = new promClient.Counter({
  name: 'platform_error_total',
  help: 'Total number of platform-specific API errors',
  labelNames: ['platform', 'api', 'error_type']
});

const sendMessageCalls = new promClient.Counter({
  name: 'send_message_calls_total',
  help: 'Total sendMessage API calls',
  labelNames: ['platform']
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

let currentQueueDepth = 0;
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
  const platform = (req.get('x-platform') || req.headers['x-platform'] || 'unknown').trim().toLowerCase();
  const processingTime = getResponseTime();

  // Always count send attempt
  sendMessageCalls.inc({ platform });

  // Simulate delay
  await new Promise(resolve => setTimeout(resolve, processingTime));
  logger.info(`[DEBUG] platform: '${platform}'`);
  console.log(`[DEBUG] platform: '${platform}'`);

  // Track delivery
  const messageDelivered = platform.toLowerCase() !== 'ios';

  if (!messageDelivered) {
    currentQueueDepth += 1;
    logger.warn(`[iOS Silent Failure] Message to ${to} not delivered (platform: ${platform})`);
  } else {
    
    smsDelivered.inc({ destination_country: 'US', status: 'delivered', platform });
  }
  smsQueue.set(currentQueueDepth);

  // Log API call
  logger.info('SMS API response', {
    to,
    from,
    platform,
    accepted: true,
    delivered: messageDelivered,
    queueDepth: currentQueueDepth,
    processingTime
  });

  // Respond as if it's accepted either way (to simulate silent failure)
  res.json({
    messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    status: 'accepted',
    to,
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