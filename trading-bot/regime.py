"""Market regime detector — BTC-based regime classification."""
from __future__ import annotations

import coinbase_api
import indicators
import config


def detect_regime(state: dict) -> str:
    """Detect current market regime based on BTC-EUR.

    Returns one of: TRENDING_UP, TRENDING_DOWN, RANGING, VOLATILE
    """
    pair = config.REGIME_PAIR
    try:
        candles_1h = coinbase_api.get_candles(pair, "ONE_HOUR", 48)
        candles_1d = coinbase_api.get_candles(pair, "ONE_DAY", 14)

        if len(candles_1h) < 24:
            return config.REGIME_RANGING  # not enough data

        # EMA trend detection
        ema9 = indicators.compute_ema(candles_1h, 9)
        ema21 = indicators.compute_ema(candles_1h, 21)

        if len(ema9) < config.REGIME_TREND_HOURS or len(ema21) < config.REGIME_TREND_HOURS:
            return config.REGIME_RANGING

        # Check last N hours of EMA relationship
        hours = config.REGIME_TREND_HOURS
        bullish_count = sum(1 for i in range(-hours, 0) if ema9[i] > ema21[i])
        bearish_count = sum(1 for i in range(-hours, 0) if ema9[i] < ema21[i])

        # Volatility check (ATR)
        atr_1h = indicators.compute_atr(candles_1h, 14)
        atr_1d = indicators.compute_atr(candles_1d, 7)

        if atr_1h and atr_1d and atr_1d > 0:
            atr_ratio = atr_1h / atr_1d
            if atr_ratio > config.REGIME_VOLATILE_ATR_MULT:
                return config.REGIME_VOLATILE

        # Ranging check: price within tight band
        recent = [float(c["close"]) for c in candles_1h[-config.REGIME_RANGE_HOURS:]]
        if recent:
            high = max(recent)
            low = min(recent)
            mid = (high + low) / 2
            band = (high - low) / mid if mid else 0
            if band < config.REGIME_RANGE_BAND:
                return config.REGIME_RANGING

        # Trend
        if bullish_count >= hours:
            return config.REGIME_TRENDING_UP
        if bearish_count >= hours:
            return config.REGIME_TRENDING_DOWN

        return config.REGIME_RANGING

    except Exception:
        return config.REGIME_RANGING


if __name__ == "__main__":
    from state import load_state
    st = load_state()
    regime = detect_regime(st)
    print(f"Current market regime: {regime}")
