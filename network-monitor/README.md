# Network Monitor

Full-stack network monitoring for macOS using **Zeek**, **Elasticsearch**, **Kibana**, and **ElastAlert2**. Captures every connection on your machine, indexes it for search and visualization, and alerts on anomalies — all from a single `docker compose up`.

## Architecture

```
                        ┌──────────────────────────────────────────────────────────┐
                        │                     Docker Compose                       │
                        │                                                          │
┌──────────────┐        │  ┌───────────┐    ┌─────────────────┐    ┌────────────┐  │
│              │  JSON   │  │           │    │                 │    │            │  │
│  Zeek        │  logs   │  │ Filebeat  │───▶│ Elasticsearch   │◀───│  Kibana    │  │
│  (native)    │────────▶│  │           │    │  :9200          │    │  :5601     │  │
│              │         │  └───────────┘    └────────┬────────┘    └────────────┘  │
│  sniffs en0  │         │                           │                             │
│  via BPF     │         │                  ┌────────▼────────┐                    │
└──────────────┘         │                  │  ElastAlert2    │                    │
       │                 │                  │  - port scan    │                    │
       │                 │                  │  - new ext conn │                    │
       ▼                 │                  └─────────────────┘                    │
  data/zeek-logs/        │                                                         │
  (shared volume)        └─────────────────────────────────────────────────────────┘
```

**Data flow:** Zeek captures packets on your network interface → writes JSON logs to `data/zeek-logs/` → Filebeat ships each log type to date-stamped Elasticsearch indices (`zeek-conn-YYYY.MM.DD`, `zeek-dns-YYYY.MM.DD`, etc.) → Kibana visualizes with pre-built dashboards → ElastAlert2 monitors for suspicious patterns.

## Prerequisites

| Requirement | Install |
|---|---|
| Docker Desktop for Mac (or Docker on Linux) | [docker.com](https://www.docker.com/products/docker-desktop/) |
| macOS 12+ or Linux | — |
| Zeek (for native macOS capture) | `brew install zeek` |
| ~4 GB free RAM (ES + Kibana) | — |

## Quick Start

```bash
# Clone and enter the repo
git clone <this-repo-url> && cd network-monitor

# Start the Docker stack (ES, Kibana, Filebeat, ElastAlert2)
./setup.sh

# Start Zeek natively (required on macOS — needs sudo for BPF)
sudo ./zeek-native.sh

# Import Kibana data views and dashboards
./kibana/import.sh

# Open Kibana
open http://localhost:5601/app/dashboards
```

That's it. Data starts flowing within seconds.

## macOS: Why Zeek Runs Natively

`network_mode: host` does **not** work on macOS Docker Desktop — Docker runs containers inside a Linux VM, so containers cannot access the host's network interfaces. The Zeek container is included for Linux compatibility but will not capture traffic on macOS.

The solution: run Zeek natively via Homebrew while the rest of the stack runs in Docker. Filebeat reads from the same shared `data/zeek-logs/` directory.

```bash
brew install zeek
sudo ./zeek-native.sh          # default: en0
sudo ./zeek-native.sh en1      # specify interface
```

## macOS launchd Daemon (Auto-Start Zeek)

To run Zeek automatically at boot using the included plist:

```bash
# Edit the plist if your interface isn't en5
#   <string>en5</string>  →  <string>en0</string>
vim com.network-monitor.zeek.plist

# Install the daemon
sudo cp com.network-monitor.zeek.plist /Library/LaunchDaemons/
sudo launchctl load /Library/LaunchDaemons/com.network-monitor.zeek.plist

# Check status
sudo launchctl list | grep network-monitor

# Stop the daemon
sudo launchctl unload /Library/LaunchDaemons/com.network-monitor.zeek.plist
```

Logs go to `data/zeek.stdout.log` and `data/zeek.stderr.log`.

## Kibana Dashboards

Import the pre-built data views and "Zeek Network Overview" dashboard:

```bash
./kibana/import.sh
```

The dashboard includes:
- **Connections over time** — line chart of connection volume
- **Top destination IPs** — who your machine talks to most
- **Top source IPs** — who talks to your machine
- **Top destination ports** — most-used services
- **Protocol breakdown** — TCP vs UDP vs ICMP pie chart
- **Bytes out over time** — outbound data transfer volume
- **External vs internal traffic** — metric comparison

### Manual Data View Setup

If you prefer to set up data views manually in Kibana:

1. Go to **Stack Management → Data Views**
2. Create these patterns (time field: `@timestamp`):
   - `zeek-conn-*` — TCP/UDP/ICMP connections
   - `zeek-dns-*` — DNS queries and responses
   - `zeek-http-*` — HTTP requests
   - `zeek-ssl-*` — TLS/SSL handshakes
   - `zeek-weird-*` — Protocol anomalies

## Analysis Script

Run a standalone network analysis report without Kibana:

```bash
./scripts/analyze.sh
```

The report includes:
- Total connection count
- Top 10 source IPs
- Top 10 destination IPs (with reverse DNS)
- Top 15 destination ports (with service name guesses)
- External IPs (non-RFC1918) with reverse DNS
- SSL/TLS top server names
- DNS top 20 queried domains
- Unencrypted HTTP connections (port 80)
- Large data transfers (>1 MB sent)
- Weird log summary

Set a custom Elasticsearch URL: `ES_URL=http://es-host:9200 ./scripts/analyze.sh`

## What Each Zeek Log Contains

| Log | Index Pattern | Key Fields | Description |
|---|---|---|---|
| `conn.log` | `zeek-conn-*` | `id.orig_h`, `id.resp_h`, `id.resp_p`, `proto`, `orig_bytes`, `resp_bytes`, `duration` | Every TCP/UDP/ICMP connection |
| `dns.log` | `zeek-dns-*` | `query`, `qtype_name`, `answers`, `rcode_name` | DNS queries and responses |
| `http.log` | `zeek-http-*` | `host`, `uri`, `method`, `status_code`, `user_agent` | HTTP requests (unencrypted only) |
| `ssl.log` | `zeek-ssl-*` | `server_name`, `version`, `cipher`, `validation_status` | TLS handshakes and SNI |
| `weird.log` | `zeek-weird-*` | `name`, `addl`, `notice` | Protocol violations and anomalies |

## ElastAlert2 Rules

Two detection rules are included, outputting to ElastAlert2 debug logs by default:

### Port Scan Detection (`elastalert2/rules/port-scan.yml`)
Triggers when a single source IP connects to **>20 unique destination ports** within 5 minutes.

### New External Connection (`elastalert2/rules/new-external-connection.yml`)
Triggers when an outgoing connection reaches a destination IP **not seen in the last 24 hours**.

### Adding New Rules

Create a new YAML file in `elastalert2/rules/` following the [ElastAlert2 rule format](https://elastalert2.readthedocs.io/en/latest/ruletypes.html). The container hot-reloads rules automatically.

Example — alert on connections to known-bad ports:

```yaml
name: "Suspicious Port Connection"
type: any
index: zeek-conn-*
filter:
  - terms:
      id.resp_p: [4444, 5555, 6666, 1337, 31337]
alert:
  - debug
```

### Adding Slack Alerting

1. Create a [Slack Incoming Webhook](https://api.slack.com/messaging/webhooks)
2. Edit any rule file and replace the alert section:

```yaml
alert:
  - slack
slack_webhook_url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
slack_channel_override: "#security-alerts"
slack_username_override: "Network Monitor"
slack_emoji_override: ":shield:"
```

3. Restart ElastAlert2: `docker compose restart elastalert2`

## Example KQL Queries

Use these in Kibana **Discover** with the appropriate data view:

```
# All outbound connections from this machine
id.orig_h: "192.168.178.3"

# Connections to a specific port
id.resp_p: 443

# DNS lookups for a domain
query: "*.example.com"

# External destinations only
NOT id.resp_h: 192.168.178.*

# Long-lived connections (> 60 seconds)
duration > 60

# Large uploads (> 1 MB)
orig_bytes > 1000000

# Non-standard ports (not 80/443/53)
NOT id.resp_p: (80 OR 443 OR 53)

# SSL without SNI (potential C2)
NOT server_name: * AND zeek_log_type: ssl

# HTTP to external hosts (unencrypted!)
id.resp_p: 80 AND NOT id.resp_h: 192.168.*
```

## What to Look For

### Suspicious Patterns

| Pattern | What It Means | KQL Example |
|---|---|---|
| High port count from one IP | Port scanning | `id.orig_h: "x.x.x.x" AND id.resp_p > 1024` |
| SSL connections without SNI | Possible C2 or tunneling | `NOT server_name: * AND zeek_log_type: ssl` |
| DNS to unusual TLDs | DNS tunneling or DGA | `query: *.xyz OR query: *.top OR query: *.tk` |
| Large outbound transfers | Data exfiltration | `orig_bytes > 10000000` |
| Connections to port 80 | Unencrypted traffic | `id.resp_p: 80` |
| Repeated short connections | Beaconing / C2 heartbeat | `duration < 1 AND id.resp_h: "x.x.x.x"` |
| New external IPs | First-contact with unknown servers | Check ElastAlert2 new-external-connection alerts |
| Weird log spikes | Protocol abuse or misconfiguration | Check `zeek-weird-*` index |

### Beaconing Detection

Look for regular-interval connections to the same destination:

```
id.resp_h: "suspicious-ip" AND id.resp_p: 443
```

Then check if timestamps are evenly spaced (e.g., every 60s). Consistent intervals suggest automated C2 callbacks.

## File Structure

```
network-monitor/
├── docker-compose.yml                  # Full stack: ES, Kibana, Filebeat, ElastAlert2
├── setup.sh                            # One-command setup (pulls images, starts stack)
├── zeek-native.sh                      # Run Zeek natively on macOS
├── com.network-monitor.zeek.plist      # macOS launchd plist for auto-start
├── .gitignore
├── zeek/
│   └── local.zeek                      # Zeek site policy (local nets, JSON logging)
├── filebeat/
│   └── filebeat.yml                    # Log shipping config (per-type indices)
├── elastalert2/
│   ├── config.yml                      # ElastAlert2 base config
│   └── rules/
│       ├── port-scan.yml               # >20 ports in 5 min = alert
│       └── new-external-connection.yml # New dest IP in 24h = alert
├── kibana/
│   ├── data-views.ndjson               # Kibana data view definitions
│   ├── dashboards.ndjson               # "Zeek Network Overview" dashboard
│   └── import.sh                       # One-command Kibana import
├── scripts/
│   └── analyze.sh                      # CLI network analysis report
└── data/                               # Runtime data (gitignored)
    ├── zeek-logs/                      # Zeek JSON output
    └── elasticsearch/                  # ES data
```

## Managing the Stack

```bash
docker compose up -d              # Start
docker compose down               # Stop
docker compose down -v && rm -rf data/   # Stop and delete all data
docker compose logs -f filebeat   # Follow Filebeat logs
docker compose logs -f elastalert2  # Follow alert logs
docker compose restart filebeat   # Restart single service
```

## Troubleshooting

### Elasticsearch won't start — "permission denied"
```bash
chmod 777 data/elasticsearch
```
ES runs as uid 1000 inside the container and needs write access to its data directory.

### Filebeat: "Harvester could not be started" / no logs appearing
Zeek hasn't written any logs yet. Ensure Zeek is running and check:
```bash
ls -la data/zeek-logs/conn.log
```

### Zeek container exits immediately (macOS)
Expected on macOS — `network_mode: host` doesn't work in Docker Desktop. Use `./zeek-native.sh` instead.

### Zeek: "failed to open interface en0"
Zeek needs root/sudo to access BPF for packet capture:
```bash
sudo ./zeek-native.sh en0
```

### Wrong network interface
List available interfaces and find the active one:
```bash
networksetup -listallhardwareports
# or
ifconfig | grep -E '^(en|utun)'
```
Pass the correct interface: `sudo ./zeek-native.sh en5`

### No data in Kibana
1. Verify Zeek logs exist: `ls -la data/zeek-logs/`
2. Check Filebeat: `docker compose logs filebeat | tail -20`
3. Query ES directly: `curl http://localhost:9200/zeek-conn-*/_count`
4. Ensure data views exist: run `./kibana/import.sh`

### ElastAlert2 errors
```bash
docker compose logs elastalert2 | tail -30
```
Common causes:
- ES not ready yet — ElastAlert2 retries automatically
- Rule syntax errors — validate with `elastalert-test-rule`
- Index doesn't exist yet — wait for Zeek data to flow

### Volume mount issues on macOS
If Filebeat can't read logs, ensure the `data/zeek-logs` path is shared in Docker Desktop:
**Settings → Resources → File Sharing** — add the repo directory.

## Linux Usage

On Linux, `network_mode: host` works natively. Edit `docker-compose.yml` to set the correct interface name (e.g., `eth0`, `ens33`) in the Zeek container command, then:

```bash
./setup.sh
# Zeek runs in Docker — no need for zeek-native.sh
```

## License

MIT
