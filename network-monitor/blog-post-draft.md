# Auditing Every Connection on Your Mac with Zeek, Elasticsearch, and ElastAlert2

_A practical guide to building a full-stack network monitoring setup for macOS — with persistent storage, Kibana dashboards, and anomaly alerts._

---

## Why bother?

Your laptop talks to dozens of servers every day. Most of those connections are expected — your browser loading pages, your apps phoning home for updates. But some aren't. A misconfigured app, a compromised dependency, or something nastier can all show up the same way: as outgoing connections you didn't initiate.

The only way to know for sure what your machine is doing is to log every connection, store it somewhere queryable, and alert when something looks off. That's what this guide builds.

---

## The Stack

```
Zeek (native macOS)  →  data/zeek-logs/  →  Filebeat  →  Elasticsearch
                                                              ├── Kibana (dashboards)
                                                              └── ElastAlert2 (alerts)
```

- **Zeek** — open-source network analysis framework. Reads packets off the wire and produces rich structured logs: connections, DNS queries, HTTP requests, TLS handshakes, protocol anomalies.
- **Elasticsearch** — stores and indexes everything. Fast queries across millions of connection records.
- **Kibana** — visualization and search UI. Build dashboards, run KQL queries, explore your traffic.
- **ElastAlert2** — rule-based alerting on top of Elasticsearch. Detects port scans, new external hosts, spikes in traffic.
- **Filebeat** — the glue. Ships Zeek's JSON logs into Elasticsearch.

Everything except Zeek runs in Docker. Zeek runs natively on macOS — more on why below.

---

## The macOS Problem (and how to solve it)

If you're on Linux, you can run Zeek in a Docker container with `network_mode: host` and it'll happily sniff your network interface. On macOS, Docker Desktop runs containers inside a Linux VM — so containers can't see your Mac's network interfaces. The Zeek container will start, but it'll capture nothing.

The fix is straightforward: run Zeek natively on the Mac, have it write JSON logs to a local directory, and let the Dockerized Filebeat read from that directory. The rest of the stack stays in Docker.

```bash
brew install zeek
```

That's the only native dependency.

---

## Project Structure

```
network-monitor/
├── docker-compose.yml
├── setup.sh
├── zeek-native.sh
├── zeek/
│   └── local.zeek
├── filebeat/
│   └── filebeat.yml
├── elastalert2/
│   ├── config.yml
│   └── rules/
│       ├── port-scan.yml
│       └── new-external-connection.yml
└── data/
    ├── zeek-logs/         ← Zeek writes here, Filebeat reads here
    └── elasticsearch/     ← persistent ES data
```

---

## Setting It Up

### 1. Clone and run setup

```bash
git clone https://github.com/youruser/network-monitor
cd network-monitor
chmod +x setup.sh zeek-native.sh
./setup.sh
```

`setup.sh` creates the data directories, pulls Docker images, starts the stack, and waits for Kibana to be ready. Takes about 2-3 minutes on first run (image pulls).

### 2. Start Zeek

```bash
./zeek-native.sh
```

This runs Zeek with sudo (needed to access `en0`), pointing log output at `data/zeek-logs/`. You'll see JSON files appear: `conn.log`, `dns.log`, `http.log`, `ssl.log`, `weird.log`.

### 3. Open Kibana

```
http://localhost:5601
```

Go to **Stack Management → Index Patterns** and create patterns for `zeek-conn-*`, `zeek-dns-*`, `zeek-http-*`, `zeek-ssl-*`, `zeek-weird-*`.

Now open **Discover**, select `zeek-conn-*`, and you're looking at every connection your machine has made.

---

## What Zeek Logs Look Like

Each connection in `conn.log` gets a JSON record like this:

```json
{
  "ts": 1711472400.123456,
  "uid": "CmFqNu3aG4E2KJsYTk",
  "id.orig_h": "192.168.178.3",
  "id.orig_p": 54231,
  "id.resp_h": "142.250.74.46",
  "id.resp_p": 443,
  "proto": "tcp",
  "service": "ssl",
  "duration": 2.341,
  "orig_bytes": 4096,
  "resp_bytes": 87654,
  "conn_state": "SF",
  "history": "ShADadFf"
}
```

Every outgoing connection: source IP/port, destination IP/port, protocol, duration, bytes sent, bytes received. DNS, HTTP, SSL logs add more fields specific to each protocol.

---

## Useful Queries in Kibana

Once data is flowing, here are queries worth bookmarking:

```kql
# All outgoing connections from this machine
id.orig_h: "192.168.178.3" AND NOT id.resp_h: 192.168.178.*

# Large data uploads (>1MB sent)
orig_bytes > 1000000

# SSL/TLS connections with no server name (SNI missing — suspicious)
NOT server_name: * AND zeek_log_type: ssl

# Traffic to non-standard ports
NOT id.resp_p: (80 OR 443 OR 53 OR 22 OR 123)

# Long-lived connections (>60 seconds)
duration > 60

# All DNS queries for a domain
query: *google*
```

The `weird.log` index is particularly useful — Zeek writes there when it detects protocol anomalies, malformed packets, or unexpected behavior.

---

## Alerts with ElastAlert2

Two rules ship out of the box:

### Port Scan Detection

```yaml
name: port-scan
type: cardinality
index: zeek-conn-*
timeframe:
  minutes: 5
cardinality_field: id.resp_p
max_cardinality: 20
query_key: id.orig_h
```

Fires when a single source IP touches more than 20 unique destination ports in 5 minutes. Catches both external scanners and internal tools behaving badly.

### New External Connection

```yaml
name: new-external-connection
type: new_term
index: zeek-conn-*
fields:
  - id.resp_h
terms_window_size:
  days: 1
```

Fires when an outgoing connection is made to a destination IP not seen in the previous 24 hours. Noisy at first (lots of new IPs are legitimate), but useful for baselining after a few days and then tightening the filter.

Both rules are configured with `alert: debug` by default — they print to the ElastAlert2 container logs. To get Slack or email alerts, change to:

```yaml
alert: slack
slack_webhook_url: "https://hooks.slack.com/..."
```

---

## Adding More Rules

ElastAlert2 supports [many rule types](https://elastalert2.readthedocs.io/en/latest/ruletypes.html):

- `spike` — traffic volume spikes
- `frequency` — X events in Y minutes
- `flatline` — expected traffic stops (heartbeat monitoring)
- `any` — raw ES query match

Drop new `.yml` files in `elastalert2/rules/` and restart the container.

---

## Keeping the Stack Running

The Docker services restart automatically (`restart: unless-stopped`). For Zeek, you'll want a launchd plist on macOS to auto-start it:

```xml
<!-- ~/Library/LaunchAgents/com.network-monitor.zeek.plist -->
<key>ProgramArguments</key>
<array>
  <string>/path/to/zeek-native.sh</string>
</array>
<key>RunAtLoad</key>
<true/>
```

Or just add it to your shell startup.

---

## What's Next

- **Geo-IP enrichment**: Add MaxMind GeoLite2 to Zeek and get country/city for every connection
- **Threat intel**: Feed IPs into AbuseIPDB or VirusTotal to flag known bad actors
- **Grafana**: Connect Grafana to Elasticsearch for richer dashboards
- **Long-term retention**: Ship old indices to cold storage (S3, NAS) — Zeek generates surprisingly little data even on a busy machine
- **Process attribution**: Zeek doesn't know which process made a connection. Combine with `lsof` or `dtrace` for that

---

## Resources

- [Zeek documentation](https://docs.zeek.org)
- [Zeek scripting guide](https://docs.zeek.org/en/master/scripting/index.html)
- [ElastAlert2 rule types](https://elastalert2.readthedocs.io/en/latest/ruletypes.html)
- [Kibana KQL reference](https://www.elastic.co/guide/en/kibana/current/kuery-query.html)
- [Filebeat Zeek module](https://www.elastic.co/guide/en/beats/filebeat/current/filebeat-module-zeek.html)

---

_The full project is available at `~/repos/network-monitor`. Questions or improvements — open an issue._
