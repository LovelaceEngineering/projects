"""Discord notification formatting."""
from __future__ import annotations

from datetime import datetime, timezone


def deal_opened(pair: str, tier: int, price: float, size_eur: float, dry_run: bool) -> str:
    mode = "[DRY-RUN] " if dry_run else ""
    return (
        f"🟢 {mode}New position opened | **{pair}** (Tier {tier}) "
        f"@ €{price:,.2f} | Size: €{size_eur:,.2f}"
    )


def take_profit(pair: str, tp_level: int, price: float, pnl_pct: float, dry_run: bool) -> str:
    mode = "[DRY-RUN] " if dry_run else ""
    return f"🎯 {mode}TP{tp_level} hit | **{pair}** @ €{price:,.2f} | +{pnl_pct*100:.1f}%"


def stop_loss(pair: str, price: float, pnl_pct: float, dry_run: bool) -> str:
    mode = "[DRY-RUN] " if dry_run else ""
    return f"🛑 {mode}Stop-loss | **{pair}** @ €{price:,.2f} | {pnl_pct*100:.1f}%"


def circuit_breaker(reason: str) -> str:
    return f"⚠️ Circuit breaker: {reason}"


def error(pair: str, msg: str) -> str:
    return f"⚠️ Error | {pair} | {msg}"


def hourly_summary(
    positions: dict,
    regime: str,
    watchlist: list[str],
    portfolio_value: float = 0,
    cash: float = 0,
    dry_run: bool = True,
) -> str:
    now = datetime.now(timezone.utc)
    mode = "[DRY-RUN] " if dry_run else ""
    lines = [
        f"📊 {mode}**Hourly Summary** — {now.strftime('%a %b %d, %H:%M UTC')}",
        f"Market regime: **{regime}**",
        "",
    ]

    if portfolio_value:
        invested = portfolio_value - cash
        lines.append(f"💼 Portfolio: €{portfolio_value:,.2f}")
        lines.append(f"  Invested: €{invested:,.2f} ({invested/portfolio_value*100:.1f}%) | Cash: €{cash:,.2f} ({cash/portfolio_value*100:.1f}%)")
        lines.append("")

    if positions:
        lines.append(f"**📋 Open Positions ({len(positions)})**")
        for pair, pos in positions.items():
            pnl = pos.get("unrealized_pnl_pct", 0)
            emoji = "🟢" if pnl >= 0 else "🔴"
            entry = pos.get("avg_price", pos.get("entry_price", 0))
            current = pos.get("current_price", entry)
            tp_hit = pos.get("tp_levels_hit", 0)
            cost = pos.get("total_cost_eur", 0)
            lines.append(
                f"  {emoji} **{pair}** (T{pos.get('tier',3)}) | "
                f"Entry: €{entry:,.2f} → Now: €{current:,.2f} | "
                f"{pnl*100:+.2f}% | €{cost:,.2f} | TP{tp_hit}/3"
            )
    else:
        lines.append("📋 No open positions — all in cash")

    lines.append("")
    lines.append(f"👁️ Watchlist: {', '.join(watchlist[:5])}" + (f" +{len(watchlist)-5} more" if len(watchlist) > 5 else ""))

    return "\n".join(lines)


def status_report(positions: dict, watchlist: list[str] = None, regime: str = "UNKNOWN") -> None:
    """Print a formatted status report to stdout."""
    now = datetime.now(timezone.utc)
    print(f"\n📊 Status Report | {now.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"Market Regime: {regime}")
    print("-" * 60)

    if positions:
        for pair, pos in positions.items():
            status = pos.get("status", "?").upper()
            avg = pos.get("avg_price", 0)
            cost = pos.get("total_cost_eur", 0)
            tp = pos.get("tp_levels_hit", 0)
            pnl = pos.get("unrealized_pnl_pct", 0)
            print(f"  {pair}: {status} | Avg: €{avg:,.2f} | "
                  f"Invested: €{cost:,.2f} | TP{tp}/3 | P&L: {pnl*100:+.2f}%")
    else:
        print("  No open positions")

    if watchlist:
        print(f"\n👁️ Watchlist: {', '.join(watchlist)}")
    print("-" * 60)
