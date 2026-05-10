#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[+]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[x]${NC} $*"; exit 1; }

# --- Pre-flight checks ---
info "Checking Docker..."
if ! command -v docker &>/dev/null; then
  error "Docker is not installed. Install Docker Desktop: https://docker.com/products/docker-desktop"
fi
if ! docker info &>/dev/null; then
  error "Docker daemon is not running. Start Docker Desktop first."
fi
info "Docker is running."

# --- Create data directories ---
info "Creating data directories..."
mkdir -p data/zeek-logs data/elasticsearch

# Elasticsearch needs write access
chmod 777 data/elasticsearch
chmod 777 data/zeek-logs
info "Directories ready."

# --- Pull images ---
info "Pulling Docker images (this may take a while)..."
docker compose pull

# --- Start the stack ---
info "Starting the stack..."
docker compose up -d

# --- Wait for Elasticsearch ---
info "Waiting for Elasticsearch..."
until curl -sf http://localhost:9200/_cluster/health &>/dev/null; do
  sleep 3
done
info "Elasticsearch is ready."

# --- Wait for Kibana ---
info "Waiting for Kibana (this takes ~60s)..."
until curl -sf http://localhost:5601/api/status &>/dev/null; do
  sleep 5
done
info "Kibana is ready."

echo ""
echo "============================================"
echo "  Network Monitor Stack is Running"
echo "============================================"
echo ""
info "Kibana:         http://localhost:5601"
info "Elasticsearch:  http://localhost:9200"
echo ""
warn "IMPORTANT (macOS):"
warn "  Docker Desktop does NOT support network_mode: host."
warn "  The Zeek container will NOT capture traffic on macOS."
warn "  Instead, run Zeek natively:"
warn "    brew install zeek"
warn "    ./zeek-native.sh"
warn ""
warn "  See README.md for full details."
echo ""
info "Next steps:"
info "  1. Start Zeek natively (macOS) or verify container (Linux)"
info "  2. Open Kibana at http://localhost:5601"
info "  3. Create index patterns: zeek-conn-*, zeek-dns-*, etc."
info "  4. Explore connection data in Discover"
echo ""
