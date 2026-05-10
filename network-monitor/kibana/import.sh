#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIBANA_URL="${KIBANA_URL:-http://localhost:5601}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[+]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[x]${NC} $*"; exit 1; }

# Wait for Kibana to be ready
info "Waiting for Kibana at $KIBANA_URL ..."
until curl -sf "$KIBANA_URL/api/status" &>/dev/null; do
  sleep 3
done
info "Kibana is ready."

# Import data views
info "Importing data views..."
RESP=$(curl -s -w "\n%{http_code}" -X POST "$KIBANA_URL/api/saved_objects/_import?overwrite=true" \
  -H "kbn-xsrf: true" \
  -F file=@"$SCRIPT_DIR/data-views.ndjson")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
  info "Data views imported successfully."
else
  error "Failed to import data views (HTTP $HTTP_CODE): $BODY"
fi

# Import dashboards
info "Importing dashboards..."
RESP=$(curl -s -w "\n%{http_code}" -X POST "$KIBANA_URL/api/saved_objects/_import?overwrite=true" \
  -H "kbn-xsrf: true" \
  -F file=@"$SCRIPT_DIR/dashboards.ndjson")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
  info "Dashboards imported successfully."
else
  error "Failed to import dashboards (HTTP $HTTP_CODE): $BODY"
fi

echo ""
info "All Kibana objects imported. Open $KIBANA_URL/app/dashboards to view."

echo "[+] Importing geo map..."
curl -s -X POST "${KIBANA_URL}/api/saved_objects/_import?overwrite=true&compatibilityMode=true" \
  -H "kbn-xsrf: true" \
  -F "file=@${SCRIPT_DIR}/geo-map.ndjson" | python3 -c "import sys,json; d=json.load(sys.stdin); print('  geo map:', 'OK' if d['success'] else d)"
