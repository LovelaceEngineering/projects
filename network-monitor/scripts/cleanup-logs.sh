#!/bin/bash
# Delete raw log files older than 3 days
DATADIR="/Users/feynman/repos/network-monitor/data"

find "$DATADIR/netflow-logs" -type f -mtime +3 -delete 2>/dev/null
find "$DATADIR/zeek-logs" -type f -mtime +3 -delete 2>/dev/null
find "$DATADIR/proc-logs" -type f -mtime +3 -delete 2>/dev/null

echo "$(date): Cleanup done" >> "$DATADIR/rotate.log"
