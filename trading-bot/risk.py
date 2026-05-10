"""Risk manager — position limits, drawdown circuit breakers, safety checks."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

import config
import coinbase_api


def get_portfolio_value() -> tuple[float, float]:
    """Returns (total_value_eur, cash_eur).
    Converts USDC holdings to EUR equivalent."""
    accounts = coinbase_api.get_accounts()
    total = 0
    cash = 0
    for acc in accounts:
        bal = float(acc.get("available_balance", {}).get("value", 0))
        hold_val = float(acc.get("hold", {}).get("value", 0))
        total_bal = bal + hold_val
        if total_bal < 0.001:
            continue
        cur = acc.get("currency", "")
        if cur in ("EUR",):
            cash += total_bal
            total += total_bal
        elif cur in ("USDC", "USD"):
            # Approximate EUR conversion
            eur_val = total_bal * 0.92  # rough USD→EUR
            cash += eur_val
            total += eur_val
        else:
            try:
                price = coinbase_api.get_price(f"{cur}-EUR")
                total += total_bal * price
            except Exception:
                try:
                    price_usd = coinbase_api.get_price(f"{cur}-USDC")
                    total += total_bal * price_usd * 0.92
                except Exception:
                    pass
    return round(total, 2), round(cash, 2)


def check_can_open(pair: str, state: dict, dry_run: bool = True) -> tuple[bool, str]:
    """Check if we can open a new position. Returns (allowed, reason)."""
    now = datetime.now(timezone.utc)
    positions = state.get("positions", {})

    # Already in this pair?
    if pair in positions:
        return False, f"Already holding {pair}"

    # Max concurrent positions
    if len(positions) >= config.MAX_CONCURRENT_POSITIONS:
        return False, f"Max {config.MAX_CONCURRENT_POSITIONS} positions reached"

    # Trading halted?
    halt_until = state.get("stats", {}).get("halt_until")
    if halt_until:
        try:
            if now < datetime.fromisoformat(halt_until):
                return False, f"Trading halted until {halt_until}"
        except (ValueError, TypeError):
            pass

    # Consecutive losses pause
    consec = state.get("stats", {}).get("consecutive_losses", 0)
    if consec >= 3:
        return False, f"{consec} consecutive losses — paused"

    # Blacklisted?
    bl_until = state.get("blacklist", {}).get(pair)
    if bl_until:
        try:
            if now < datetime.fromisoformat(bl_until):
                return False, f"{pair} blacklisted until {bl_until}"
        except (ValueError, TypeError):
            pass

    # Pump chase prevention
    try:
        candles = coinbase_api.get_candles(pair, "FIFTEEN_MINUTE", 2)
        if len(candles) >= 2:
            old_p = float(candles[-2]["close"])
            new_p = float(candles[-1]["close"])
            change = abs(new_p - old_p) / old_p if old_p else 0
            if change > config.PUMP_CHASE_THRESHOLD:
                return False, f"Pump detected: {change*100:.1f}% in 15min"
    except Exception:
        pass

    if not dry_run:
        # Check portfolio limits
        try:
            total, cash = get_portfolio_value()
            if total == 0:
                return False, "Cannot determine portfolio value"

            # Exposure check
            invested = total - cash
            if invested / total > config.MAX_TOTAL_EXPOSURE_PCT:
                return False, f"Exposure {invested/total*100:.1f}% > {config.MAX_TOTAL_EXPOSURE_PCT*100}% limit"

            # Dry powder check
            if cash / total < config.MIN_DRY_POWDER_PCT:
                return False, f"Cash {cash/total*100:.1f}% < {config.MIN_DRY_POWDER_PCT*100}% minimum"
        except Exception as e:
            return False, f"Portfolio check failed: {e}"

    # Correlation guard: don't hold too many correlated assets
    held_tiers = {config.get_tier(p) for p in positions}
    new_tier = config.get_tier(pair)
    tier1_count = sum(1 for p in positions if config.get_tier(p) == 1)
    if new_tier <= 2 and tier1_count >= 2:
        return False, "Correlation guard: already holding 2+ Tier 1/2 positions"

    return True, "OK"


def get_position_size_eur(pair: str, portfolio_value: float) -> float:
    """Calculate position size in EUR based on tier and conditions."""
    tier = config.get_tier(pair)
    max_pct = config.MAX_POSITION_PCT[tier]
    size = portfolio_value * max_pct

    # Weekend reduction
    if config.is_weekend():
        size *= config.WEEKEND_SIZE_REDUCTION

    return round(size, 2)


def check_drawdown(state: dict, current_value: float) -> str | None:
    """Check if drawdown circuit breaker should trigger.
    Returns halt duration description or None."""
    stats = state.get("stats", {})
    daily_start = stats.get("daily_start_value")
    if not daily_start or daily_start == 0:
        return None

    drawdown = (daily_start - current_value) / daily_start
    if drawdown >= 0.10:
        halt_until = (datetime.now(timezone.utc) + timedelta(seconds=config.DRAWDOWN_HALT_10PCT_SEC)).isoformat()
        state.setdefault("stats", {})["halt_until"] = halt_until
        return f"10% drawdown — halted for 24h until {halt_until}"
    elif drawdown >= 0.05:
        halt_until = (datetime.now(timezone.utc) + timedelta(seconds=config.DRAWDOWN_HALT_5PCT_SEC)).isoformat()
        state.setdefault("stats", {})["halt_until"] = halt_until
        return f"5% drawdown — halted for 2h until {halt_until}"

    return None


if __name__ == "__main__":
    try:
        total, cash = get_portfolio_value()
        print(f"Portfolio: €{total:,.2f} | Cash: €{cash:,.2f} ({cash/total*100:.1f}%)")
        for pair in ["BTC-EUR", "ETH-EUR", "SOL-EUR"]:
            size = get_position_size_eur(pair, total)
            print(f"  {pair} (Tier {config.get_tier(pair)}): max €{size:,.2f}")
    except Exception as e:
        print(f"Error: {e}")
