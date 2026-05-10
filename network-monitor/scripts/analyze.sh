#!/usr/bin/env bash
set -euo pipefail

ES_URL="${ES_URL:-http://localhost:9200}"
BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

header()  { echo -e "\n${BOLD}${CYAN}═══════════════════════════════════════════${NC}"; echo -e "${BOLD}${CYAN}  $*${NC}"; echo -e "${BOLD}${CYAN}═══════════════════════════════════════════${NC}"; }
section() { echo -e "\n${BOLD}${GREEN}── $* ──${NC}"; }

# Check Elasticsearch is reachable
if ! curl -sf "$ES_URL/_cluster/health" &>/dev/null; then
  echo -e "${RED}[x] Cannot reach Elasticsearch at $ES_URL${NC}"
  exit 1
fi

query() {
  curl -sf -H "Content-Type: application/json" "$ES_URL/$1/_search" -d "$2" 2>/dev/null
}

rdns() {
  local ip="$1"
  local name
  name=$(host "$ip" 2>/dev/null | awk '/domain name pointer/ {gsub(/\.$/, "", $NF); print $NF; exit}')
  echo "${name:--}"
}

port_service() {
  local port="$1"
  case "$port" in
    22)   echo "SSH" ;;
    25)   echo "SMTP" ;;
    53)   echo "DNS" ;;
    80)   echo "HTTP" ;;
    110)  echo "POP3" ;;
    143)  echo "IMAP" ;;
    443)  echo "HTTPS" ;;
    445)  echo "SMB" ;;
    993)  echo "IMAPS" ;;
    995)  echo "POP3S" ;;
    3306) echo "MySQL" ;;
    3389) echo "RDP" ;;
    5228) echo "Google Play" ;;
    5353) echo "mDNS" ;;
    5432) echo "PostgreSQL" ;;
    8080) echo "HTTP-Alt" ;;
    8443) echo "HTTPS-Alt" ;;
    *)    echo "-" ;;
  esac
}

header "NETWORK MONITOR — ANALYSIS REPORT"
echo -e "  Generated: $(date '+%Y-%m-%d %H:%M:%S')"
echo -e "  ES Target: $ES_URL"

# ─── Total connections ───
section "Total Connections"
TOTAL=$(curl -sf "$ES_URL/zeek-conn-*/_count" | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo 0)
echo "  $TOTAL connections logged"

# ─── Top 10 source IPs ───
section "Top 10 Source IPs"
RESULT=$(query "zeek-conn-*" '{
  "size": 0,
  "aggs": { "top_src": { "terms": { "field": "id.orig_h", "size": 10 } } }
}')
echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for b in data.get('aggregations',{}).get('top_src',{}).get('buckets',[]):
    print(f\"  {b['key']:>20s}  {b['doc_count']:>8d} connections\")
" 2>/dev/null || echo "  (no data)"

# ─── Top 10 destination IPs (with rdns) ───
section "Top 10 Destination IPs"
RESULT=$(query "zeek-conn-*" '{
  "size": 0,
  "aggs": { "top_dst": { "terms": { "field": "id.resp_h", "size": 10 } } }
}')
echo "$RESULT" | python3 -c "
import sys, json, subprocess
data = json.load(sys.stdin)
for b in data.get('aggregations',{}).get('top_dst',{}).get('buckets',[]):
    ip = b['key']
    try:
        r = subprocess.run(['host', ip], capture_output=True, text=True, timeout=2)
        lines = [l for l in r.stdout.splitlines() if 'domain name pointer' in l]
        name = lines[0].split('pointer')[-1].strip().rstrip('.') if lines else '-'
    except: name = '-'
    print(f\"  {ip:>20s}  {b['doc_count']:>8d}  ({name})\")
" 2>/dev/null || echo "  (no data)"

# ─── Top 15 destination ports ───
section "Top 15 Destination Ports"
RESULT=$(query "zeek-conn-*" '{
  "size": 0,
  "aggs": { "top_ports": { "terms": { "field": "id.resp_p", "size": 15 } } }
}')
echo "$RESULT" | python3 -c "
import sys, json
services = {22:'SSH',25:'SMTP',53:'DNS',80:'HTTP',110:'POP3',143:'IMAP',443:'HTTPS',
            445:'SMB',993:'IMAPS',995:'POP3S',3306:'MySQL',3389:'RDP',5228:'Google Play',
            5353:'mDNS',5432:'PostgreSQL',8080:'HTTP-Alt',8443:'HTTPS-Alt'}
data = json.load(sys.stdin)
for b in data.get('aggregations',{}).get('top_ports',{}).get('buckets',[]):
    port = b['key']
    svc = services.get(int(port), '-')
    print(f\"  {str(port):>8s}  {b['doc_count']:>8d}  ({svc})\")
" 2>/dev/null || echo "  (no data)"

# ─── External IPs (not 192.168.x.x) ───
section "External Destination IPs (non-RFC1918)"
RESULT=$(query "zeek-conn-*" '{
  "size": 0,
  "query": {
    "bool": {
      "must_not": [
        { "prefix": { "id.resp_h": "192.168." } },
        { "prefix": { "id.resp_h": "10." } },
        { "prefix": { "id.resp_h": "172.16." } },
        { "term":   { "id.resp_h": "127.0.0.1" } }
      ]
    }
  },
  "aggs": { "ext_ips": { "terms": { "field": "id.resp_h", "size": 20 } } }
}')
echo "$RESULT" | python3 -c "
import sys, json, subprocess
data = json.load(sys.stdin)
buckets = data.get('aggregations',{}).get('ext_ips',{}).get('buckets',[])
if not buckets:
    print('  (none found)')
else:
    for b in buckets:
        ip = b['key']
        try:
            r = subprocess.run(['host', ip], capture_output=True, text=True, timeout=2)
            lines = [l for l in r.stdout.splitlines() if 'domain name pointer' in l]
            name = lines[0].split('pointer')[-1].strip().rstrip('.') if lines else '-'
        except: name = '-'
        print(f\"  {ip:>20s}  {b['doc_count']:>8d}  ({name})\")
" 2>/dev/null || echo "  (no data)"

# ─── SSL/TLS: top domains ───
section "SSL/TLS — Top Server Names"
RESULT=$(query "zeek-ssl-*" '{
  "size": 0,
  "aggs": { "top_sni": { "terms": { "field": "server_name.keyword", "size": 20 } } }
}')
echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
buckets = data.get('aggregations',{}).get('top_sni',{}).get('buckets',[])
if not buckets:
    print('  (no SSL data)')
else:
    for b in buckets:
        print(f\"  {b['key']:>45s}  {b['doc_count']:>6d}\")
" 2>/dev/null || echo "  (no SSL data)"

# ─── DNS: top 20 queried domains ───
section "DNS — Top 20 Queried Domains"
RESULT=$(query "zeek-dns-*" '{
  "size": 0,
  "aggs": { "top_queries": { "terms": { "field": "query.keyword", "size": 20 } } }
}')
echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
buckets = data.get('aggregations',{}).get('top_queries',{}).get('buckets',[])
if not buckets:
    print('  (no DNS data)')
else:
    for b in buckets:
        print(f\"  {b['key']:>50s}  {b['doc_count']:>6d}\")
" 2>/dev/null || echo "  (no DNS data)"

# ─── Unencrypted HTTP (port 80) ───
section "Unencrypted HTTP Connections (port 80)"
RESULT=$(query "zeek-conn-*" '{
  "size": 50,
  "query": { "term": { "id.resp_p": 80 } },
  "_source": ["ts", "id.orig_h", "id.resp_h", "orig_bytes", "resp_bytes", "duration"]
}')
echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
hits = data.get('hits',{}).get('hits',[])
total = data.get('hits',{}).get('total',{}).get('value',0)
if not hits:
    print('  (none)')
else:
    print(f'  {total} total connections on port 80:')
    print(f\"  {'Source':>20s}  {'Destination':>20s}  {'Sent':>10s}  {'Recv':>10s}  {'Duration':>10s}\")
    for h in hits[:20]:
        s = h['_source']
        orig = s.get('orig_bytes', '-')
        resp = s.get('resp_bytes', '-')
        dur  = s.get('duration', '-')
        if isinstance(dur, (int,float)): dur = f'{dur:.1f}s'
        print(f\"  {s.get('id.orig_h','-'):>20s}  {s.get('id.resp_h','-'):>20s}  {str(orig):>10s}  {str(resp):>10s}  {str(dur):>10s}\")
    if total > 20:
        print(f'  ... and {total - 20} more')
" 2>/dev/null || echo "  (no data)"

# ─── Large data transfers (orig_bytes > 1MB) ───
section "Large Data Transfers (orig_bytes > 1 MB)"
RESULT=$(query "zeek-conn-*" '{
  "size": 50,
  "query": { "range": { "orig_bytes": { "gt": 1000000 } } },
  "sort": [{ "orig_bytes": "desc" }],
  "_source": ["ts", "id.orig_h", "id.resp_h", "id.resp_p", "orig_bytes", "duration"]
}')
echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
hits = data.get('hits',{}).get('hits',[])
total = data.get('hits',{}).get('total',{}).get('value',0)
if not hits:
    print('  (none)')
else:
    print(f'  {total} connections with >1 MB sent:')
    print(f\"  {'Source':>20s}  {'Destination':>20s}  {'Port':>6s}  {'Bytes Sent':>12s}  {'Duration':>10s}\")
    for h in hits[:20]:
        s = h['_source']
        mb = s.get('orig_bytes',0) / 1048576
        dur = s.get('duration', '-')
        if isinstance(dur, (int,float)): dur = f'{dur:.1f}s'
        print(f\"  {s.get('id.orig_h','-'):>20s}  {s.get('id.resp_h','-'):>20s}  {str(s.get('id.resp_p','-')):>6s}  {mb:>10.2f} MB  {str(dur):>10s}\")
    if total > 20:
        print(f'  ... and {total - 20} more')
" 2>/dev/null || echo "  (no data)"

# ─── Weird log summary ───
section "Weird Log Summary"
RESULT=$(query "zeek-weird-*" '{
  "size": 0,
  "aggs": { "weird_names": { "terms": { "field": "name.keyword", "size": 20 } } }
}')
WEIRD_TOTAL=$(curl -sf "$ES_URL/zeek-weird-*/_count" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo 0)
echo "  $WEIRD_TOTAL total weird events"
echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
buckets = data.get('aggregations',{}).get('weird_names',{}).get('buckets',[])
if buckets:
    for b in buckets:
        print(f\"  {b['key']:>45s}  {b['doc_count']:>6d}\")
" 2>/dev/null

header "END OF REPORT"
