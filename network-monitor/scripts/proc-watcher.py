#!/usr/bin/env python3
"""
proc-watcher.py — correlate macOS network connections with process names
Polls lsof every N seconds, writes JSON logs that Filebeat ships to ES.
Correlate with Zeek conn logs via id.orig_p == src_port + timestamp proximity.
"""

import subprocess
import json
import time
import os
import sys
import re
from datetime import datetime, timezone

LOG_DIR = os.environ.get(
    "PROC_WATCHER_LOG_DIR",
    os.path.join(os.path.dirname(__file__), "..", "data", "proc-logs")
)
INTERVAL = float(os.environ.get("PROC_WATCHER_INTERVAL", "3"))
LOG_FILE = None
LOG_DATE = None


def get_log_file():
    """Rotate log file daily."""
    global LOG_FILE, LOG_DATE
    today = datetime.now().strftime("%Y-%m-%d")
    if LOG_DATE != today:
        LOG_DATE = today
        path = os.path.join(LOG_DIR, f"proc-conn-{today}.log")
        if LOG_FILE:
            LOG_FILE.close()
        LOG_FILE = open(path, "a", buffering=1)
    return LOG_FILE


def parse_lsof():
    """Run lsof -i -n -P and parse TCP/UDP connections."""
    try:
        result = subprocess.run(
            ["/usr/sbin/lsof", "-i", "-n", "-P", "-F", "pcnPsTi"],
            capture_output=True, text=True, timeout=5
        )
    except subprocess.TimeoutExpired:
        return []

    connections = []
    current = {}

    for line in result.stdout.splitlines():
        if not line:
            continue
        field, value = line[0], line[1:]

        if field == 'p':  # PID (starts new record)
            if current.get('pid') and current.get('name') and current.get('src_port'):
                connections.append(current)
            current = {'pid': int(value)}
        elif field == 'c':  # command name
            current['process'] = value
        elif field == 'n':  # network address (host:port->host:port)
            # Parse "192.168.1.1:54321->8.8.8.8:443" or "*:80" or "localhost:8080"
            m = re.match(r'(.+):(\d+)->(.+):(\d+)', value)
            if m:
                current['src_ip'] = m.group(1)
                current['src_port'] = int(m.group(2))
                current['dst_ip'] = m.group(3)
                current['dst_port'] = int(m.group(4))
        elif field == 's':  # connection state
            current['state'] = value
        elif field == 'T':  # protocol info (ST=state etc)
            pass
        elif field == 'i':  # inode
            current['inode'] = value

    if current.get('pid') and current.get('process') and current.get('src_port'):
        connections.append(current)

    return connections


def lsof_simple():
    """Simpler lsof parsing using standard output format."""
    try:
        result = subprocess.run(
            ["/usr/sbin/lsof", "-i", "-n", "-P"],
            capture_output=True, text=True, timeout=5
        )
    except subprocess.TimeoutExpired:
        return []

    connections = []
    for line in result.stdout.splitlines()[1:]:  # skip header
        parts = line.split()
        if len(parts) < 9:
            continue
        process = parts[0]
        try:
            pid = int(parts[1])
        except ValueError:
            continue
        proto = parts[7].lower()  # TCP/UDP
        addr = parts[8]
        state = parts[9] if len(parts) > 9 else ""

        # Parse address: src->dst or src (LISTEN)
        if '->' in addr:
            src, dst = addr.split('->', 1)
        else:
            src = addr
            dst = None

        # Parse src port
        src_parts = src.rsplit(':', 1)
        if len(src_parts) != 2:
            continue
        src_ip, src_port_s = src_parts
        try:
            src_port = int(src_port_s)
        except ValueError:
            continue

        entry = {
            'process': process,
            'pid': pid,
            'proto': proto.replace('4', '').replace('6', ''),
            'src_ip': src_ip,
            'src_port': src_port,
            'state': state.strip('()'),
        }

        if dst:
            dst_parts = dst.rsplit(':', 1)
            if len(dst_parts) == 2:
                entry['dst_ip'] = dst_parts[0]
                try:
                    entry['dst_port'] = int(dst_parts[1])
                except ValueError:
                    pass

        # Only log outgoing/established connections (skip LISTEN)
        if state not in ('(LISTEN)', 'LISTEN') and dst:
            connections.append(entry)

    return connections


def main():
    os.makedirs(LOG_DIR, exist_ok=True)
    print(f"[proc-watcher] logging to {LOG_DIR}, interval={INTERVAL}s", flush=True)

    seen = set()  # deduplicate within a polling window

    while True:
        ts = datetime.now(timezone.utc).isoformat()
        try:
            conns = lsof_simple()
        except Exception as e:
            print(f"[proc-watcher] lsof error: {e}", file=sys.stderr)
            time.sleep(INTERVAL)
            continue

        f = get_log_file()
        new_seen = set()

        for c in conns:
            # Dedup key: process+src_port+dst_ip+dst_port
            key = (c['process'], c.get('src_port'), c.get('dst_ip'), c.get('dst_port'))
            new_seen.add(key)

            if key not in seen:
                record = {
                    '@timestamp': ts,
                    'log_source': 'proc-watcher',
                    **c
                }
                f.write(json.dumps(record) + '\n')

        seen = new_seen
        time.sleep(INTERVAL)


if __name__ == '__main__':
    main()
