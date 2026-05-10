"""Market scanner — discovers high-momentum pairs from the Coinbase universe."""
from __future__ import annotations

import time
from datetime import datetime, timezone

import coinbase_api
import indicators
import config


def _get_spread(pair: str) -> float | None:
    """Get bid-ask spread as a fraction."""
    try:
        path = f"/api/v3/brokerage/best_bid_ask?product_ids={pair}"
        data = coinbase_api._request("GET", path)
        for pb in data.get("pricebooks", []):
            if pb.get("product_id") == pair:
                bid = float(pb["bids"][0]["price"])
                ask = float(pb["asks"][0]["price"])
                mid = (bid + ask) / 2
                return (ask - bid) / mid if mid else None
    except Exception:
        return None


def _get_24h_volume(pair: str) -> float | None:
    """Get 24h trading volume in quote currency."""
    try:
        path = f"/api/v3/brokerage/products/{pair}"
        data = coinbase_api._request("GET", path)
        return float(data.get("volume_24h", 0)) * float(data.get("price", 0))
    except Exception:
        return None


def _get_1h_change(pair: str) -> float | None:
    """Get 1-hour price change percentage."""
    try:
        candles = coinbase_api.get_candles(pair, "ONE_HOUR", 2)
        if len(candles) >= 2:
            old = float(candles[-2]["close"])
            new = float(candles[-1]["close"])
            return (new - old) / old if old else 0
    except Exception:
        return None


def scan_market(state: dict) -> list[dict]:
    """Scan all candidate pairs and return ranked watchlist.

    Returns list of dicts: [{pair, tier, momentum_score, volume_24h, spread, change_1h, rsi_15m}, ...]
    """
    results = []
    watchlist_history = state.get("watchlist_history", {})

    for pair in config.ALL_CANDIDATES:
        try:
            # Liquidity filter
            spread = _get_spread(pair)
            if spread is None or spread > config.MAX_SPREAD_PCT:
                continue

            vol = _get_24h_volume(pair)
            if vol is None or vol < config.MIN_VOLUME_EUR:
                continue

            # Get indicators for scoring
            change_1h = _get_1h_change(pair) or 0

            candles_15m = coinbase_api.get_candles(pair, "FIFTEEN_MINUTE", 30)
            rsi_15m = indicators.compute_rsi(candles_15m, 14)
            atr = indicators.compute_atr(candles_15m, 14)

            # Momentum score
            # Normalize components to 0-1 range
            change_score = min(max((change_1h + 0.05) / 0.10, 0), 1)  # -5% to +5% → 0-1
            vol_score = min(vol / 1_000_000, 1)  # up to 1M = max score
            rsi_oversold_score = max(1 - (rsi_15m or 50) / 50, 0) if rsi_15m else 0  # lower RSI = higher score

            # ATR expansion (compare to a baseline)
            candles_1d = coinbase_api.get_candles(pair, "ONE_DAY", 7)
            atr_1d = indicators.compute_atr(candles_1d, 7)
            atr_score = 0
            if atr and atr_1d and atr_1d > 0:
                atr_ratio = atr / atr_1d
                atr_score = min(atr_ratio / 2, 1)

            momentum = (
                0.35 * change_score +
                0.25 * vol_score +
                0.20 * rsi_oversold_score +
                0.20 * atr_score
            )

            results.append({
                "pair": pair,
                "tier": config.get_tier(pair),
                "momentum_score": round(momentum, 4),
                "volume_24h": round(vol, 0),
                "spread": round(spread, 6),
                "change_1h": round(change_1h, 4),
                "rsi_15m": rsi_15m,
            })

        except Exception as e:
            continue  # Skip pairs that error out

        # Rate limit: don't hammer the API
        time.sleep(0.15)

    # Sort by momentum score descending
    results.sort(key=lambda x: x["momentum_score"], reverse=True)

    # Top N → active watchlist
    watchlist = results[:config.WATCHLIST_SIZE]

    # Update watchlist history for warmup tracking
    current_pairs = {r["pair"] for r in watchlist}
    new_history = {}
    for pair in current_pairs:
        new_history[pair] = watchlist_history.get(pair, 0) + 1
    # Pairs no longer on watchlist get reset
    state["watchlist_history"] = new_history
    state["watchlist"] = [r["pair"] for r in watchlist]
    state["last_scan"] = datetime.now(timezone.utc).isoformat()

    return watchlist


def get_eligible_pairs(state: dict) -> list[str]:
    """Return pairs eligible for trading (on watchlist >= WARMUP cycles, not blacklisted)."""
    now = datetime.now(timezone.utc)
    history = state.get("watchlist_history", {})
    blacklist = state.get("blacklist", {})
    eligible = []

    for pair in state.get("watchlist", []):
        # Warmup check
        if history.get(pair, 0) < config.WATCHLIST_WARMUP_CYCLES:
            continue
        # Blacklist check
        bl_until = blacklist.get(pair)
        if bl_until:
            try:
                if now < datetime.fromisoformat(bl_until):
                    continue
            except (ValueError, TypeError):
                pass
        eligible.append(pair)

    return eligible


if __name__ == "__main__":
    print("Scanning market...")
    from state import load_state
    st = load_state()
    results = scan_market(st)
    print(f"\nTop {len(results)} pairs by momentum:\n")
    print(f"{'Rank':>4}  {'Pair':<12} {'Tier':>4} {'Score':>7} {'Vol 24h':>12} {'Spread':>8} {'1h Chg':>8} {'RSI 15m':>8}")
    print("-" * 75)
    for i, r in enumerate(results, 1):
        chg = f"{r['change_1h']*100:+.2f}%" if r['change_1h'] else "—"
        rsi = f"{r['rsi_15m']:.1f}" if r['rsi_15m'] else "—"
        print(f"{i:>4}  {r['pair']:<12} T{r['tier']:>3} {r['momentum_score']:>7.4f} €{r['volume_24h']:>10,.0f} {r['spread']*100:>7.3f}% {chg:>8} {rsi:>8}")
    print(f"\nEligible for trading: {get_eligible_pairs(st)}")
