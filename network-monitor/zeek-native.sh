#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/data/zeek-logs"
ZEEK_SITE="$SCRIPT_DIR/zeek/local.zeek"
INTERFACE="${1:-en0}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[+]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[x]${NC} $*"; exit 1; }

# --- Pre-flight ---
if ! command -v zeek &>/dev/null; then
  error "Zeek is not installed. Install with: brew install zeek"
fi

info "Zeek version: $(zeek --version)"
info "Interface:    $INTERFACE"
info "Log dir:      $LOG_DIR"
info "Site policy:  $ZEEK_SITE"

mkdir -p "$LOG_DIR"

# Create a modified local.zeek that writes to our log directory
ZEEK_TMP="$(mktemp -d)/local.zeek"
sed "s|/zeek-logs|$LOG_DIR|g" "$ZEEK_SITE" > "$ZEEK_TMP"

info "Starting Zeek on $INTERFACE (requires sudo)..."
info "Press Ctrl+C to stop."
echo ""

cd "$LOG_DIR"
sudo zeek -i "$INTERFACE" "$ZEEK_TMP"
