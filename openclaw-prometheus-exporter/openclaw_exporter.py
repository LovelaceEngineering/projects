#!/usr/bin/env python3
"""
openclaw-prometheus-exporter
Exports OpenClaw (Claude/Codex) token usage metrics from CodexBar to Prometheus.

Metrics exposed on :9101/metrics (configurable via --port).
"""

import argparse
import json
import logging
import subprocess
import sys
import time

from prometheus_client import Gauge, Info, start_http_server

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("openclaw_exporter")

# ── Metric definitions ────────────────────────────────────────────────────────

LABELS_PROVIDER = ["provider"]
LABELS_DAILY    = ["provider", "date"]
LABELS_MODEL    = ["provider", "date", "model"]

m_tokens_30d    = Gauge("openclaw_tokens_30d_total",
                        "Total tokens consumed in the last 30 days",
                        LABELS_PROVIDER)
m_cost_30d      = Gauge("openclaw_cost_30d_usd",
                        "Total cost (USD) in the last 30 days",
                        LABELS_PROVIDER)
m_session_tok   = Gauge("openclaw_session_tokens",
                        "Tokens used in the current/latest session",
                        LABELS_PROVIDER)
m_session_cost  = Gauge("openclaw_session_cost_usd",
                        "Cost (USD) of the current/latest session",
                        LABELS_PROVIDER)

m_daily_tokens  = Gauge("openclaw_daily_tokens_total",
                        "Total tokens consumed on a given day",
                        LABELS_DAILY)
m_daily_cost    = Gauge("openclaw_daily_cost_usd",
                        "Total cost (USD) on a given day",
                        LABELS_DAILY)

m_daily_input   = Gauge("openclaw_daily_input_tokens",
                        "Input tokens on a given day",
                        LABELS_DAILY)
m_daily_output  = Gauge("openclaw_daily_output_tokens",
                        "Output tokens on a given day",
                        LABELS_DAILY)
m_daily_cache_r = Gauge("openclaw_daily_cache_read_tokens",
                        "Cache-read tokens on a given day",
                        LABELS_DAILY)
m_daily_cache_c = Gauge("openclaw_daily_cache_creation_tokens",
                        "Cache-creation tokens on a given day",
                        LABELS_DAILY)

m_model_cost    = Gauge("openclaw_model_daily_cost_usd",
                        "Cost (USD) for a specific model on a given day",
                        LABELS_MODEL)

m_info          = Info("openclaw_build",
                       "OpenClaw exporter metadata")
m_info.info({"version": "1.0.0", "source": "codexbar"})


# ── Collection ────────────────────────────────────────────────────────────────

def fetch_codexbar(provider: str) -> dict:
    """Run `codexbar cost --format json --provider <provider>` and return parsed JSON."""
    result = subprocess.run(
        ["codexbar", "cost", "--format", "json", "--provider", provider],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        raise RuntimeError(f"codexbar exited {result.returncode}: {result.stderr.strip()}")
    data = json.loads(result.stdout)
    # codexbar returns a list; grab the first element
    return data[0] if isinstance(data, list) else data


def collect(provider: str) -> None:
    log.debug("Collecting metrics for provider=%s", provider)
    try:
        data = fetch_codexbar(provider)
    except Exception as exc:
        log.error("Failed to fetch data for %s: %s", provider, exc)
        return

    p = provider

    # 30-day totals
    m_tokens_30d.labels(provider=p).set(data.get("last30DaysTokens", 0))
    m_cost_30d.labels(provider=p).set(data.get("last30DaysCostUSD", 0))

    # Session
    m_session_tok.labels(provider=p).set(data.get("sessionTokens", 0))
    m_session_cost.labels(provider=p).set(data.get("sessionCostUSD", 0))

    # Daily breakdown
    for day in data.get("daily", []):
        date = day["date"]

        m_daily_tokens.labels(provider=p, date=date).set(day.get("totalTokens", 0))
        m_daily_cost.labels(provider=p, date=date).set(day.get("totalCost", 0))
        m_daily_input.labels(provider=p, date=date).set(day.get("inputTokens", 0))
        m_daily_output.labels(provider=p, date=date).set(day.get("outputTokens", 0))
        m_daily_cache_r.labels(provider=p, date=date).set(day.get("cacheReadTokens", 0))
        m_daily_cache_c.labels(provider=p, date=date).set(day.get("cacheCreationTokens", 0))

        # Per-model cost for this day
        for mb in day.get("modelBreakdowns", []):
            m_model_cost.labels(
                provider=p,
                date=date,
                model=mb["modelName"]
            ).set(mb.get("cost", 0))

    log.info("✓ %s — 30d tokens=%s  cost=$%.4f",
             p,
             data.get("last30DaysTokens", 0),
             data.get("last30DaysCostUSD", 0))


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Prometheus exporter for OpenClaw token usage via CodexBar"
    )
    parser.add_argument("--port", type=int, default=9101,
                        help="Port to expose metrics on (default: 9101)")
    parser.add_argument("--interval", type=int, default=300,
                        help="Scrape interval in seconds (default: 300)")
    parser.add_argument("--providers", nargs="+", default=["claude"],
                        choices=["claude", "codex"],
                        help="Providers to collect (default: claude)")
    parser.add_argument("--once", action="store_true",
                        help="Collect once and exit (useful for testing)")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Enable debug logging")
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    if not args.once:
        start_http_server(args.port)
        log.info("🚀 OpenClaw exporter running on :%d  interval=%ds  providers=%s",
                 args.port, args.interval, args.providers)

    while True:
        for provider in args.providers:
            collect(provider)

        if args.once:
            break

        time.sleep(args.interval)


if __name__ == "__main__":
    main()
