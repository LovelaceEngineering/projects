"""Signal generator — deterministic BUY/SELL/HOLD signals on watchlist pairs."""
from __future__ import annotations

import coinbase_api
import indicators
import config


def generate_signal(pair: str, state: dict) -> dict:
    """Generate a trading signal for a pair.

    Returns: {
        "pair": str,
        "signal": "BUY" | "SELL" | "HOLD",
        "confidence": float 0-1,
        "reasons": [str],
        "indicators": {rsi_1m, rsi_15m, ema_cross, bb_position, volume_surge}
    }
    """
    result = {
        "pair": pair,
        "signal": "HOLD",
        "confidence": 0,
        "reasons": [],
        "indicators": {},
    }

    try:
        # Fetch candle data
        candles_1m = coinbase_api.get_candles(pair, "ONE_MINUTE", 30)
        candles_15m = coinbase_api.get_candles(pair, "FIFTEEN_MINUTE", 48)
        candles_1d = coinbase_api.get_candles(pair, "ONE_DAY", 7)

        # Compute indicators
        rsi_1m = indicators.compute_rsi(candles_1m, 14)
        rsi_15m = indicators.compute_rsi(candles_15m, 14)
        ema_cross = indicators.ema_crossover(candles_15m, 9, 21)
        bb = indicators.compute_bollinger(candles_15m, 20, 2.0)
        vol_surge = indicators.volume_surge_ratio(candles_1m[-10:], candles_1d) if candles_1d else None

        current_price = coinbase_api.get_price(pair)

        result["indicators"] = {
            "rsi_1m": rsi_1m,
            "rsi_15m": rsi_15m,
            "ema_cross": ema_cross,
            "bb": bb,
            "volume_surge": vol_surge,
            "price": current_price,
        }

        # Check spread at time of signal
        spread = None
        try:
            data = coinbase_api._request("GET", f"/api/v3/brokerage/best_bid_ask?product_ids={pair}")
            for pb in data.get("pricebooks", []):
                if pb.get("product_id") == pair:
                    bid = float(pb["bids"][0]["price"])
                    ask = float(pb["asks"][0]["price"])
                    mid = (bid + ask) / 2
                    spread = (ask - bid) / mid if mid else None
        except Exception:
            pass

        # ── BUY signal check ──
        buy_conditions = []
        buy_score = 0

        if rsi_1m is not None and rsi_1m < config.RSI_BUY_1M:
            buy_conditions.append(f"RSI(1m)={rsi_1m:.1f} < {config.RSI_BUY_1M}")
            buy_score += 0.25

        if rsi_15m is not None and rsi_15m < config.RSI_BUY_15M:
            buy_conditions.append(f"RSI(15m)={rsi_15m:.1f} < {config.RSI_BUY_15M}")
            buy_score += 0.25

        if ema_cross == "BULLISH":
            buy_conditions.append("EMA(9) crossed above EMA(21)")
            buy_score += 0.20

        if vol_surge is not None and vol_surge > config.VOLUME_SURGE_RATIO:
            buy_conditions.append(f"Volume surge {vol_surge:.2f}x > {config.VOLUME_SURGE_RATIO}x")
            buy_score += 0.15

        if bb and current_price <= bb["lower"] * 1.005:
            buy_conditions.append(f"Price {current_price:.2f} near lower BB {bb['lower']:.2f}")
            buy_score += 0.15

        # Spread check
        if spread is not None and spread > config.MAX_ENTRY_SPREAD:
            buy_conditions.clear()
            buy_score = 0
            result["reasons"].append(f"Spread {spread*100:.3f}% too wide")

        # Need at least RSI conditions + one more
        if rsi_1m and rsi_1m < config.RSI_BUY_1M and rsi_15m and rsi_15m < config.RSI_BUY_15M and buy_score >= 0.50:
            result["signal"] = "BUY"
            result["confidence"] = min(buy_score, 1.0)
            result["reasons"] = buy_conditions

        # ── SELL signal check (for existing positions) ──
        if pair in state.get("positions", {}):
            sell_reasons = []
            if rsi_1m and rsi_1m > config.RSI_SELL_1M and rsi_15m and rsi_15m > config.RSI_SELL_15M:
                sell_reasons.append(f"RSI overbought: 1m={rsi_1m:.1f} 15m={rsi_15m:.1f}")
            if ema_cross == "BEARISH":
                sell_reasons.append("EMA bearish crossover")

            if sell_reasons:
                result["signal"] = "SELL"
                result["confidence"] = 0.7
                result["reasons"] = sell_reasons

    except Exception as e:
        result["reasons"].append(f"Error: {e}")

    return result


if __name__ == "__main__":
    from state import load_state
    st = load_state()

    # Test signal on BTC-EUR
    for pair in ["BTC-EUR", "ETH-EUR", "SOL-EUR"]:
        print(f"\n{'='*50}")
        print(f"Signal for {pair}:")
        sig = generate_signal(pair, st)
        print(f"  Signal: {sig['signal']} (confidence: {sig['confidence']:.2f})")
        print(f"  Reasons: {sig['reasons']}")
        ind = sig['indicators']
        print(f"  RSI 1m: {ind.get('rsi_1m')}, RSI 15m: {ind.get('rsi_15m')}")
        print(f"  EMA cross: {ind.get('ema_cross')}, Vol surge: {ind.get('volume_surge')}")
        if ind.get('bb'):
            print(f"  BB: lower={ind['bb']['lower']:.2f} mid={ind['bb']['middle']:.2f} upper={ind['bb']['upper']:.2f}")
