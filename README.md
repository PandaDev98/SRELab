# 📡 INFOBIP Monitoring Lab

This project is a hands-on lab to practice **API observability**, chaos testing, and the **4 Golden Signals** using:

- ✅ **Express.js** — SMS API server
- ✅ **Prometheus** — collect metrics
- ✅ **Grafana** (optional) — visualize metrics
- ✅ **Custom load test** — simulate real & chaotic traffic

---

## 📂 Project Structure

```
INFOBIP-MONITORING-LAB/
├── api/
│   ├── node_modules/
│   ├── package.json
│   ├── package-lock.json
│   ├── server.js
│
├── logs/
│   ├── api.log
│
├── monitoring/
│   ├── prometheus.yml
│   ├── grafana-dashboard.json
│
├── test/
│   ├── node_modules/
│   ├── package.json
│   ├── package-lock.json
│   ├── loadTest.js
```

---

## 🚀 Start the API

```bash
cd api
npm install
npm start
```

- **Base URL:** `http://localhost:3000`
- **Metrics:** `http://localhost:3000/metrics`
- Logs stored in `logs/api.log` and shown in console.

---

## ⚙️ Run the Load Test

```bash
cd test
npm install

# Run normal load
npm run loadTest -- --chaos=false

# Run with chaos mode ON
npm run loadTest -- --chaos=true
```

The `--chaos` flag turns on simulated high load, latency, and errors.

---

## 📊 Metrics Available

| Metric | Description |
|--------|--------------|
| `http_request_duration_ms` | Request latency (histogram) |
| `http_requests_total` | Total HTTP requests |
| `http_errors_total` | Total HTTP errors |
| `system_load_avg` | Simulated CPU load |
| `process_memory_usage_bytes` | Node memory usage (rss, heapTotal, heapUsed) |
| `sms_queue_depth` | Fake SMS queue size |
| `sms_delivered_total` | SMS delivered per country |

Covers all **4 Golden Signals**:
- Latency
- Traffic
- Errors
- Saturation

---

## 🔀 Toggle Chaos Mode Manually

Enable chaos:
```bash
curl -X POST http://localhost:3000/admin/simulate-load \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

Disable chaos:
```bash
curl -X POST http://localhost:3000/admin/simulate-load \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

---

## 📈 Use Prometheus & Grafana

- Prometheus scrape: `http://localhost:3000/metrics`
- Grafana: import `grafana-dashboard.json` to plot:
  - Requests
  - Latency quantiles
  - Error rates
  - Queue depth
  - System load

Example PromQL:
```promql
rate(http_requests_total[1m])
histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket[1m])) by (le))
```

---

## ✅ Best Practices

- `api/` and `test/` have their own dependencies for clear separation.
- Logs saved in `logs/` — add to `.gitignore` for big files.
- Chaos mode: flag or API toggle.
- Structure is easy to containerize or run in CI/CD.

---

## 🎉 All Set

- Start your API ✅
- Run the load test ✅
- Check `/metrics` ✅
- Watch in Prometheus & Grafana ✅
- Toggle chaos and watch metrics respond ✅

**Author:** Juan Diego Tovaria Castro  
**Lab:** INFOBIP Monitoring Lab  
**Purpose:** Learn modern monitoring hands-on.

🚀✨ Happy monitoring!
