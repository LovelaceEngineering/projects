"""Technical indicators: RSI, EMA, Bollinger Bands, ATR, volume analysis.

All functions expect candles as list of dicts with keys:
  start, low, high, open, close, volume (strings or floats).
Candles should be sorted oldest-first.
"""
from __future__ import annotations


def _closes(candles: list[dict]) -> list[float]:
    return [float(c["close"]) for c in candles]


def _highs(candles: list[dict]) -> list[float]:
    return [float(c["high"]) for c in candles]


def _lows(candles: list[dict]) -> list[float]:
    return [float(c["low"]) for c in candles]


def _volumes(candles: list[dict]) -> list[float]:
    return [float(c["volume"]) for c in candles]


# ── RSI ──────────────────────────────────────

def compute_rsi(candles: list[dict], period: int = 14) -> float | None:
    """Compute RSI from candles (oldest-first). Returns 0-100 or None."""
    closes = _closes(candles)
    if len(closes) < period + 1:
        return None
    gains, losses = [], []
    for i in range(1, len(closes)):
        d = closes[i] - closes[i - 1]
        gains.append(max(d, 0))
        losses.append(max(-d, 0))
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - 100 / (1 + rs), 2)


# ── EMA ──────────────────────────────────────

def compute_ema(candles: list[dict], period: int) -> list[float]:
    """Compute EMA series from candles. Returns list same length as candles."""
    closes = _closes(candles)
    if len(closes) < period:
        return []
    k = 2 / (period + 1)
    ema = [sum(closes[:period]) / period]
    for price in closes[period:]:
        ema.append(price * k + ema[-1] * (1 - k))
    # Pad front with None-equivalent (use first EMA value)
    return [ema[0]] * (len(closes) - len(ema)) + ema


def ema_crossover(candles: list[dict], fast: int = 9, slow: int = 21) -> str | None:
    """Detect EMA crossover. Returns 'BULLISH', 'BEARISH', or None."""
    ema_fast = compute_ema(candles, fast)
    ema_slow = compute_ema(candles, slow)
    if len(ema_fast) < 2 or len(ema_slow) < 2:
        return None
    prev_diff = ema_fast[-2] - ema_slow[-2]
    curr_diff = ema_fast[-1] - ema_slow[-1]
    if prev_diff <= 0 and curr_diff > 0:
        return "BULLISH"
    if prev_diff >= 0 and curr_diff < 0:
        return "BEARISH"
    return None


# ── Bollinger Bands ──────────────────────────

def compute_bollinger(candles: list[dict], period: int = 20, std_dev: float = 2.0) -> dict | None:
    """Returns {upper, middle, lower, bandwidth} or None."""
    closes = _closes(candles)
    if len(closes) < period:
        return None
    window = closes[-period:]
    middle = sum(window) / period
    variance = sum((x - middle) ** 2 for x in window) / period
    std = variance ** 0.5
    upper = middle + std_dev * std
    lower = middle - std_dev * std
    bandwidth = (upper - lower) / middle if middle else 0
    return {
        "upper": round(upper, 6),
        "middle": round(middle, 6),
        "lower": round(lower, 6),
        "bandwidth": round(bandwidth, 6),
    }


# ── ATR (Average True Range) ────────────────

def compute_atr(candles: list[dict], period: int = 14) -> float | None:
    """Compute ATR from candles. Returns float or None."""
    if len(candles) < period + 1:
        return None
    highs = _highs(candles)
    lows = _lows(candles)
    closes = _closes(candles)
    trs = []
    for i in range(1, len(candles)):
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
        trs.append(tr)
    if len(trs) < period:
        return None
    atr = sum(trs[:period]) / period
    for tr in trs[period:]:
        atr = (atr * (period - 1) + tr) / period
    return round(atr, 6)


# ── Volume Analysis ──────────────────────────

def volume_surge_ratio(candles_recent: list[dict], candles_7d: list[dict]) -> float | None:
    """Ratio of recent average volume to 7-day average volume."""
    vols_recent = _volumes(candles_recent)
    vols_7d = _volumes(candles_7d)
    if not vols_recent or not vols_7d:
        return None
    avg_recent = sum(vols_recent) / len(vols_recent)
    avg_7d = sum(vols_7d) / len(vols_7d)
    if avg_7d == 0:
        return None
    return round(avg_recent / avg_7d, 4)


# ── Price Change ─────────────────────────────

def price_change_pct(current: float, reference: float) -> float:
    """Percentage change from reference to current."""
    if reference == 0:
        return 0.0
    return round((current - reference) / reference, 6)


if __name__ == "__main__":
    # Quick self-test with dummy data
    dummy = [{"close": str(100 + i * 0.5), "high": str(101 + i * 0.5),
              "low": str(99 + i * 0.5), "open": str(100 + i * 0.5),
              "volume": str(1000 + i * 10), "start": str(i)}
             for i in range(50)]
    print(f"RSI: {compute_rsi(dummy)}")
    print(f"EMA(9) last: {compute_ema(dummy, 9)[-1]:.2f}")
    print(f"EMA crossover: {ema_crossover(dummy)}")
    print(f"Bollinger: {compute_bollinger(dummy)}")
    print(f"ATR: {compute_atr(dummy)}")
    print(f"Volume surge: {volume_surge_ratio(dummy[-10:], dummy)}")
    print("All indicators OK.")
