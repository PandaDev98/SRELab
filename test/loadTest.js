const axios = require('axios');

const BASE_URL = 'http://localhost:3001';
const NUM_REQUESTS = 50;

// Flags
const SIMULATE_IOS_INCIDENT = process.argv.includes('--ios-incident=true');

// Send a single SMS
async function sendSMS(i) {
  try {
      // Choose platform: force or randomly assign
    const platform = (SIMULATE_IOS_INCIDENT ?
      (Math.random() < 0.7 ? 'ios' : 'android') :
      (Math.random() < 0.5 ? 'ios' : 'android'));

    const headers = {
      'x-platform': platform
    };

    const payload = {
      to: `+1444555${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
      text: `Hello from ${platform} test #${i}`,
      from: "AutomationScript"
    };

    const res = await axios.post(`${BASE_URL}/sms/send`, payload, { headers });
    console.log(`[${i}] ✅ [${platform}] Sent: ${res.data.status} | ${res.data.to}`);
  } catch (err) {
    const data = err.response?.data || err.message;
    console.error(`[${i}] ❌ Error:`, data);
  }
}

// MAIN
(async () => {

  console.log(`🚀 Sending ${NUM_REQUESTS} SMS requests...`);

  const promises = [];
  for (let i = 1; i <= NUM_REQUESTS; i++) {
    promises.push(sendSMS(i));
  }

  await Promise.all(promises);

  console.log(`🎉 Load test completed.`);
})();
