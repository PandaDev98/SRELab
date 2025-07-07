// loadTest.js
const axios = require('axios');

const BASE_URL = 'http://localhost:3001';  // uses your server
const NUM_REQUESTS = 50;                   // number of SMS requests

// Get chaos flag from command line, e.g. --chaos=true
const ENABLE_CHAOS = process.argv.includes('--chaos=true');
console.log(`🔀 Chaos mode flag: ${ENABLE_CHAOS}`);


// Helper to enable or disable chaos
async function toggleChaos(enabled) {
  const res = await axios.post(`${BASE_URL}/admin/simulate-load`, { enabled });
  console.log(`🔀 Chaos mode is now: ${res.data.loadSimulation}`);
}

// Send a single SMS with optional rate-limit header
async function sendSMS(i) {
  try {
    const headers = {};

    // ~20% chance to simulate rate limit
    if (Math.random() < 0.2) {
      headers['x-api-key'] = 'rate-limited-key';
    }

    const payload = {
      to: `+1444555${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
      text: `Hello from test #${i}`,
      from: "AutomationScript"
    };
    // ~10% chance to omit 'to' field
    if (Math.random() < 0.1) delete payload.to;

    const res = await axios.post(`${BASE_URL}/sms/send`, payload, { headers });
    console.log(`[${i}] ✅ Sent: ${res.data.status} | ${res.data.to}`);
  } catch (err) {
    const data = err.response?.data || err.message;
    console.error(`[${i}] ❌ Error:`, data);
  }
}

// MAIN run
(async () => {
  if (ENABLE_CHAOS) await toggleChaos(true);

  console.log(`🚀 Sending ${NUM_REQUESTS} SMS requests...`);

  const promises = [];
  for (let i = 1; i <= NUM_REQUESTS; i++) {
    promises.push(sendSMS(i));
  }

  await Promise.all(promises);

  if (ENABLE_CHAOS) {
    await toggleChaos(false);
    console.log(`✅ Chaos mode disabled after test.`);
  }

  console.log(`🎉 Load test completed.`);
})();
