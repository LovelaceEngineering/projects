#!/usr/bin/env python3
"""Strategy optimizer — analyzes trade_log.json and recommends/applies parameter adjustments.

Run every 36 hours to continuously improve the strategy based on simulation results.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

TRADE_LOG = Path(__file__).parent / "trade_log.json"
CONFIG_PATH = Path(__file__).parent / "config.py"
OPTIMIZATION_LOG = Path(__file__).parent / "optimization_log.json"


def load_trades() -> list[dict]:
    if not TRADE_LOG.exists():
        return []
    with open(TRADE_LOG) as f:
        return json.load(f)


def analyze_performance(trades: list[dict]) -> dict:
    """Compute key metrics from trade log."""
    closes = [t for t in trades if t.get("action") in ("close_position", "take_profit_1", "take_profit_2", "take_profit_3")]
    opens = [t for t in trades if t.get("action") == "open_position"]

    if not closes:
        return {"total_trades": 0, "message": "No closed trades yet"}

    # Separate by outcome
    winners = [t for t in closes if t.get("net_pnl_eur", t.get("pnl_pct", 0)) > 0]
    losers = [t for t in closes if t.get("net_pnl_eur", t.get("pnl_pct", 0)) <= 0]

    total_pnl = sum(t.get("net_pnl_eur", 0) for t in closes)
    total_gross = sum(t.get("gross_pnl_eur", 0) for t in closes)
    total_fees = sum(t.get("fees_eur", 0) for t in closes)

    # Win rate
    win_rate = len(winners) / len(closes) if closes else 0

    # Average holding time
    durations = [t.get("duration_hours", 0) for t in closes if t.get("duration_hours")]
    avg_duration = sum(durations) / len(durations) if durations else 0

    # By reason
    stale_closes = [t for t in closes if t.get("reason") == "stale"]
    tp_closes = [t for t in closes if "take_profit" in t.get("action", "")]
    stop_closes = [t for t in closes if t.get("reason") == "stop_loss"]

    # By pair performance
    pair_pnl = {}
    for t in closes:
        pair = t.get("pair", "unknown")
        pair_pnl.setdefault(pair, []).append(t.get("net_pnl_eur", 0))

    pair_summary = {p: {"trades": len(v), "total_pnl": sum(v), "avg_pnl": sum(v)/len(v)}
                    for p, v in pair_pnl.items()}

    # Average profit on winners vs average loss on losers
    avg_win = sum(t.get("net_pnl_eur", 0) for t in winners) / len(winners) if winners else 0
    avg_loss = sum(t.get("net_pnl_eur", 0) for t in losers) / len(losers) if losers else 0

    return {
        "total_trades": len(closes),
        "total_entries": len(opens),
        "winners": len(winners),
        "losers": len(losers),
        "win_rate": round(win_rate, 3),
        "total_pnl_eur": round(total_pnl, 2),
        "total_gross_eur": round(total_gross, 2),
        "total_fees_eur": round(total_fees, 2),
        "avg_win_eur": round(avg_win, 2),
        "avg_loss_eur": round(avg_loss, 2),
        "profit_factor": round(abs(avg_win / avg_loss), 2) if avg_loss != 0 else 0,
        "avg_duration_hours": round(avg_duration, 1),
        "stale_closes": len(stale_closes),
        "tp_closes": len(tp_closes),
        "stop_closes": len(stop_closes),
        "stale_pnl": round(sum(t.get("net_pnl_eur", 0) for t in stale_closes), 2),
        "tp_pnl": round(sum(t.get("net_pnl_eur", 0) for t in tp_closes), 2),
        "pair_summary": pair_summary,
    }


def generate_recommendations(metrics: dict) -> list[dict]:
    """Generate parameter adjustment recommendations based on metrics."""
    recs = []

    if metrics.get("total_trades", 0) < 5:
        return [{"action": "wait", "reason": "Need at least 5 closed trades for meaningful analysis"}]

    # Fee drag analysis
    if metrics["total_fees_eur"] > abs(metrics["total_gross_eur"]) * 0.5:
        recs.append({
            "param": "TAKE_PROFIT_LEVELS",
            "action": "raise_tp1",
            "reason": f"Fees ({metrics['total_fees_eur']:.0f}€) are >50% of gross ({metrics['total_gross_eur']:.0f}€). Need wider TPs.",
            "severity": "high",
        })

    # Stale close analysis
    if metrics["stale_closes"] > metrics["total_trades"] * 0.6:
        recs.append({
            "param": "STALE_POSITION_HOURS",
            "action": "increase",
            "reason": f"{metrics['stale_closes']}/{metrics['total_trades']} trades closed as stale. Extend hold time.",
            "severity": "medium",
        })

    # Win rate too low
    if metrics["win_rate"] < 0.35:
        recs.append({
            "param": "RSI_BUY_1M",
            "action": "tighten",
            "reason": f"Win rate {metrics['win_rate']*100:.0f}% too low. Need more selective entries.",
            "severity": "high",
        })

    # Profit factor
    if metrics["profit_factor"] < 1.0 and metrics["profit_factor"] > 0:
        recs.append({
            "param": "TRAILING_STOP_PCT",
            "action": "widen",
            "reason": f"Profit factor {metrics['profit_factor']:.2f} < 1.0. Losses exceed wins.",
            "severity": "high",
        })

    # Pair-specific issues
    for pair, stats in metrics.get("pair_summary", {}).items():
        if stats["trades"] >= 3 and stats["avg_pnl"] < -5:
            recs.append({
                "param": "blacklist",
                "pair": pair,
                "action": "consider_removing",
                "reason": f"{pair}: {stats['trades']} trades, avg P&L €{stats['avg_pnl']:.1f}. Consistently unprofitable.",
                "severity": "low",
            })

    # Good performance — can relax slightly
    if metrics["win_rate"] > 0.55 and metrics["profit_factor"] > 1.5:
        recs.append({
            "param": "MAX_CONCURRENT_POSITIONS",
            "action": "can_increase",
            "reason": f"Strong performance (WR={metrics['win_rate']*100:.0f}%, PF={metrics['profit_factor']:.1f}). Safe to scale.",
            "severity": "info",
        })

    return recs if recs else [{"action": "no_change", "reason": "Strategy performing within acceptable bounds"}]


def format_report(metrics: dict, recs: list[dict]) -> str:
    """Format a human-readable optimization report."""
    lines = []
    lines.append("📊 **Strategy Optimization Report**")
    lines.append(f"_{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}_")
    lines.append("")

    if metrics.get("total_trades", 0) == 0:
        lines.append("No closed trades yet. Waiting for data...")
        return "\n".join(lines)

    lines.append(f"**Trades:** {metrics['total_trades']} closed ({metrics['winners']}W / {metrics['losers']}L)")
    lines.append(f"**Win Rate:** {metrics['win_rate']*100:.1f}%")
    lines.append(f"**Net P&L:** €{metrics['total_pnl_eur']:+.2f}")
    lines.append(f"**Gross / Fees:** €{metrics['total_gross_eur']:+.2f} / €{metrics['total_fees_eur']:.2f}")
    lines.append(f"**Avg Win / Avg Loss:** €{metrics['avg_win_eur']:+.2f} / €{metrics['avg_loss_eur']:.2f}")
    lines.append(f"**Profit Factor:** {metrics['profit_factor']:.2f}")
    lines.append(f"**Avg Hold:** {metrics['avg_duration_hours']:.1f}h")
    lines.append(f"**Closes by type:** TP={metrics['tp_closes']}, Stale={metrics['stale_closes']}, Stop={metrics['stop_closes']}")
    lines.append("")

    # Pair breakdown
    if metrics.get("pair_summary"):
        lines.append("**By pair:**")
        for pair, stats in sorted(metrics["pair_summary"].items(), key=lambda x: x[1]["total_pnl"]):
            emoji = "🟢" if stats["total_pnl"] > 0 else "🔴"
            lines.append(f"  {emoji} {pair}: {stats['trades']} trades, €{stats['total_pnl']:+.1f} (avg €{stats['avg_pnl']:+.1f})")
        lines.append("")

    # Recommendations
    lines.append("**Recommendations:**")
    for rec in recs:
        sev = {"high": "🔴", "medium": "🟡", "low": "⚪", "info": "🟢"}.get(rec.get("severity", ""), "ℹ️")
        lines.append(f"  {sev} {rec.get('reason', rec.get('action', ''))}")

    return "\n".join(lines)


def save_optimization_record(metrics: dict, recs: list[dict]) -> None:
    """Append to optimization log."""
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "metrics": metrics,
        "recommendations": recs,
    }
    log = []
    if OPTIMIZATION_LOG.exists():
        try:
            with open(OPTIMIZATION_LOG) as f:
                log = json.load(f)
        except (json.JSONDecodeError, ValueError):
            log = []
    log.append(record)
    with open(OPTIMIZATION_LOG, "w") as f:
        json.dump(log, f, indent=2)


def main():
    trades = load_trades()
    metrics = analyze_performance(trades)
    recs = generate_recommendations(metrics)
    report = format_report(metrics, recs)
    save_optimization_record(metrics, recs)
    print(report)
    return report, metrics, recs


if __name__ == "__main__":
    main()
