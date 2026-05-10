# openclaw-prometheus-exporter

A Prometheus exporter for [OpenClaw](https://openclaw.ai) AI token usage and cost metrics, powered by [CodexBar](https://github.com/steipete/CodexBar).

Exposes per-day, per-model token consumption and cost data scraped from CodexBar's local cost log — ready to visualise in Grafana.

---

## Metrics

| Metric | Labels | Description |
|--------|--------|-------------|
| `openclaw_tokens_30d_total` | `provider` | Total tokens last 30 days |
| `openclaw_cost_30d_usd` | `provider` | Total cost (USD) last 30 days |
| `openclaw_session_tokens` | `provider` | Tokens in current/latest session |
| `openclaw_session_cost_usd` | `provider` | Cost (USD) of current/latest session |
| `openclaw_daily_tokens_total` | `provider`, `date` | Total tokens per day |
| `openclaw_daily_cost_usd` | `provider`, `date` | Cost per day |
| `openclaw_daily_input_tokens` | `provider`, `date` | Input tokens per day |
| `openclaw_daily_output_tokens` | `provider`, `date` | Output tokens per day |
| `openclaw_daily_cache_read_tokens` | `provider`, `date` | Cache-read tokens per day |
| `openclaw_daily_cache_creation_tokens` | `provider`, `date` | Cache-creation tokens per day |
| `openclaw_model_daily_cost_usd` | `provider`, `date`, `model` | Cost per model per day |

---

## Requirements

- **macOS** (CodexBar is macOS-only for now)
- [CodexBar](https://github.com/steipete/CodexBar) installed (`brew install steipete/tap/codexbar`)
- Python 3.8+
- `prometheus_client` Python package

```bash
pip install prometheus_client
```

---

## Quick Start

```bash
# Test once — prints metrics to stdout, no server
python3 openclaw_exporter.py --once --verbose

# Run the exporter (metrics on :9101)
python3 openclaw_exporter.py

# Custom port, include Codex provider too
python3 openclaw_exporter.py --port 9200 --providers claude codex
```

---

## Prometheus config

Add to `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: openclaw
    static_configs:
      - targets: ['localhost:9101']
    scrape_interval: 5m
```

---

## Grafana Dashboard

Import `dashboards/openclaw-token-usage.json` into Grafana (Dashboards → Import → Upload JSON).

Panels included:
- 📊 30-day token & cost stat cards
- 📅 Daily cost bar chart
- 🤖 Per-model cost breakdown
- 🔍 Token type breakdown (input / output / cache)
- 📋 Raw detail table

---

## Run as a macOS service (launchd)

```bash
# Copy the plist (edit paths if you cloned elsewhere)
cp com.openclaw.exporter.plist ~/Library/LaunchAgents/

# Load it
launchctl load ~/Library/LaunchAgents/com.openclaw.exporter.plist

# Check status
launchctl list | grep openclaw

# Logs
tail -f /tmp/openclaw-exporter.log

# Stop / unload
launchctl unload ~/Library/LaunchAgents/com.openclaw.exporter.plist
```

---

## CLI Reference

```
usage: openclaw_exporter.py [-h] [--port PORT] [--interval INTERVAL]
                             [--providers {claude,codex} [...]]
                             [--once] [--verbose]

optional arguments:
  --port        Port to expose metrics on (default: 9101)
  --interval    Scrape interval in seconds (default: 300)
  --providers   Providers to collect: claude, codex (default: claude)
  --once        Collect once and exit (useful for testing)
  --verbose     Enable debug logging
```

---

## License

MIT
