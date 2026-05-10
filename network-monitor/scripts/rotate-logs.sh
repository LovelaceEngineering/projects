#!/usr/bin/env bash
# Rotate Zeek log files — delete anything older than 7 days
# Run via cron: 0 3 * * * /Users/feynman/repos/network-monitor/scripts/rotate-logs.sh

LOG_DIR="$(dirname "$0")/../data/zeek-logs"
KEEP_DAYS=7

find "$LOG_DIR" -name "*.log" -mtime +${KEEP_DAYS} -delete
echo "$(date): rotated zeek logs older than ${KEEP_DAYS} days" >> "$LOG_DIR/../rotate.log"
