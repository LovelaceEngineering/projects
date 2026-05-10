#!/usr/bin/env python3
"""Trading bot main loop — Phase 1: Multi-pair scanner + signal engine.

Usage:
    python bot.py              # dry-run (default, no real trades)
    python bot.py --live       # live trading
    python bot.py --status     # show current positions + watchlist
    python bot.py --scan       # run scanner once and show results
"""
from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import scanner
import signals
import executor
import risk
import regime as regime_mod
import config
import notify
from state import load_state, save_state


def run_scan(state: dict) -> list[dict]:
    """Run the market scanner and display results."""
    results = scanner.scan_market(state)
    print(f"\n{'='*75}")
    print(f"Market Scan | {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"{'='*75}")
    print(f"{'Rank':>4}  {'Pair':<12} {'Tier':>4} {'Score':>7} {'Vol 24h':>12} {'Spread':>8} {'1h Chg':>8} {'RSI 15m':>8}")
    print("-" * 75)
    for i, r in enumerate(results, 1):
        chg = f"{r['change_1h']*100:+.2f}%" if r.get('change_1h') else "—"
        rsi = f"{r['rsi_15m']:.1f}" if r.get('rsi_15m') else "—"
        print(f"{i:>4}  {r['pair']:<12} T{r['tier']:>3} {r['momentum_score']:>7.4f} "
              f"€{r['volume_24h']:>10,.0f} {r['spread']*100:>7.3f}% {chg:>8} {rsi:>8}")
    eligible = scanner.get_eligible_pairs(state)
    print(f"\nEligible for trading: {eligible or 'None (need 2 consecutive scans)'}")
    return results


def run_signals(state: dict, dry_run: bool) -> list[str]:
    """Check signals for eligible pairs and execute trades. Returns events."""
    eligible = scanner.get_eligible_pairs(state)
    events = []

    for pair in eligible:
        # Skip if already in position
        if pair in state.get("positions", {}):
            continue

        # Risk check
        allowed, reason = risk.check_can_open(pair, state, dry_run)
        if not allowed:
            continue

        # Generate signal
        sig = signals.generate_signal(pair, state)
        min_conf = getattr(config, 'MIN_SIGNAL_CONFIDENCE', 0.60)
        # In RANGING regime, require even higher conviction
        if state.get('regime') == config.REGIME_RANGING:
            min_conf = max(min_conf, 0.70)
        if sig["signal"] == "BUY" and sig["confidence"] >= min_conf:
            pos = executor.open_position(pair, state, dry_run)
            if pos:
                state.setdefault("positions", {})[pair] = pos
                save_state(state)
                tier = config.get_tier(pair)
                msg = notify.deal_opened(pair, tier, pos["entry_price"], pos["total_cost_eur"], dry_run)
                print(msg)
                events.append(msg)

    return events


def manage_positions(state: dict, dry_run: bool) -> list[str]:
    """Manage all open positions. Returns events."""
    events = []
    positions = state.get("positions", {})
    to_remove = []

    for pair, pos in list(positions.items()):
        updated, pos_events = executor.manage_position(pair, pos, state, dry_run)
        events.extend(pos_events)

        if updated is None:
            to_remove.append(pair)
        else:
            positions[pair] = updated

    for pair in to_remove:
        del positions[pair]

    if to_remove:
        save_state(state)

    return events


def run_regime(state: dict) -> str:
    """Detect and update market regime."""
    r = regime_mod.detect_regime(state)
    state["regime"] = r
    state["last_regime_check"] = datetime.now(timezone.utc).isoformat()
    return r


def run_hourly(state: dict, dry_run: bool) -> str:
    """Run hourly summary and regime check."""
    r = run_regime(state)
    positions = state.get("positions", {})
    watchlist = state.get("watchlist", [])

    try:
        total, cash = risk.get_portfolio_value()
    except Exception:
        total, cash = 0, 0

    # Check drawdown
    dd = risk.check_drawdown(state, total)
    if dd:
        print(notify.circuit_breaker(dd))

    summary = notify.hourly_summary(positions, r, watchlist, total, cash, dry_run)
    print(f"\n{summary}")
    return summary


def main_loop(dry_run: bool) -> None:
    """Main trading loop: 60s signal tick, 5m scanner, 1h regime+summary."""
    state = load_state()
    mode = "DRY-RUN" if dry_run else "⚠️ LIVE"

    print(f"\n{'='*60}")
    print(f"  Trading Bot Phase 1 | {mode}")
    print(f"  Started: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"  Pairs: {len(config.ALL_CANDIDATES)} candidates")
    print(f"  Max positions: {config.MAX_CONCURRENT_POSITIONS}")
    print(f"{'='*60}\n")

    # Initialize daily tracking
    try:
        total, _ = risk.get_portfolio_value()
        state.setdefault("stats", {})["daily_start_value"] = total
        state["stats"]["daily_start_time"] = datetime.now(timezone.utc).isoformat()
    except Exception:
        pass

    # Initial scan
    print("Running initial market scan...")
    run_scan(state)
    save_state(state)

    last_scan = time.time()
    last_hourly = time.time()
    tick = 0

    while True:
        try:
            now = time.time()
            tick += 1

            # Every 5 min: scanner
            if now - last_scan >= config.SCANNER_INTERVAL_SEC:
                print(f"\n[Tick {tick}] Running scanner...")
                run_scan(state)
                save_state(state)
                last_scan = now

            # Every 60s: check signals + manage positions
            eligible = scanner.get_eligible_pairs(state)
            if eligible:
                events = run_signals(state, dry_run)
                for e in events:
                    print(e)

            pos_events = manage_positions(state, dry_run)
            for e in pos_events:
                print(e)

            # Every hour: regime + summary
            if now - last_hourly >= config.REGIME_INTERVAL_SEC:
                run_hourly(state, dry_run)
                save_state(state)
                last_hourly = now

            save_state(state)

            # Wait for next tick
            elapsed = time.time() - now
            sleep_time = max(config.SIGNAL_INTERVAL_SEC - elapsed, 1)
            time.sleep(sleep_time)

        except KeyboardInterrupt:
            print("\n\nShutting down gracefully...")
            save_state(state)
            break
        except Exception as e:
            print(f"\n⚠️ Error in main loop: {e}")
            save_state(state)
            time.sleep(10)


def show_status() -> None:
    """Show current status and exit."""
    state = load_state()
    r = regime_mod.detect_regime(state)
    positions = state.get("positions", {})
    watchlist = state.get("watchlist", [])

    # Update current prices for positions
    for pair, pos in positions.items():
        try:
            price = __import__("coinbase_api").get_price(pair)
            avg = pos.get("avg_price", pos.get("entry_price", 0))
            pos["current_price"] = price
            pos["unrealized_pnl_pct"] = (price - avg) / avg if avg else 0
        except Exception:
            pass

    notify.status_report(positions, watchlist, r)

    try:
        total, cash = risk.get_portfolio_value()
        print(f"\n💼 Portfolio: €{total:,.2f} | Cash: €{cash:,.2f} ({cash/total*100:.1f}%)")
    except Exception as e:
        print(f"\n⚠️ Could not fetch portfolio: {e}")


def main() -> None:
    parser = argparse.ArgumentParser(description="DCA Trading Bot - Phase 1")
    parser.add_argument("--dry-run", action="store_true", default=True, help="Simulate (default)")
    parser.add_argument("--live", action="store_true", help="Live trading (real orders)")
    parser.add_argument("--status", action="store_true", help="Show status and exit")
    parser.add_argument("--scan", action="store_true", help="Run scanner once and exit")
    args = parser.parse_args()

    if args.status:
        show_status()
        return

    if args.scan:
        state = load_state()
        run_scan(state)
        save_state(state)
        return

    dry_run = not args.live
    if not dry_run:
        print("⚠️  LIVE MODE — real orders will be placed!", file=sys.stderr)

    main_loop(dry_run)


if __name__ == "__main__":
    main()
