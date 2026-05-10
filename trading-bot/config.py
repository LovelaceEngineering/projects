"""Configuration constants and mutable parameters for the trading bot."""

from datetime import datetime, timezone

# ──────────────────────────────────────────────
# Fee rates (Coinbase Advanced Trade, <$10K/mo)
# ──────────────────────────────────────────────
MAKER_FEE = 0.006   # 0.60%
TAKER_FEE = 0.008   # 0.80%
ROUND_TRIP_FEE = MAKER_FEE * 2  # 1.20% best case (both limit)
MIN_PROFIT_AFTER_FEES = 0.005   # 0.5% minimum expected gain

# ──────────────────────────────────────────────
# Pair tiers and candidates
# ──────────────────────────────────────────────
TIER_1 = {"BTC-EUR", "ETH-EUR"}
TIER_2 = {"SOL-EUR", "XRP-EUR", "DOGE-EUR", "LINK-EUR", "AVAX-EUR"}
TIER_3_CANDIDATES_EUR = {"ADA-EUR", "DOT-EUR", "POL-EUR"}
TIER_3_CANDIDATES_USDC = {"NEAR-USDC", "ARB-USDC", "OP-USDC", "UNI-USDC", "AAVE-USDC"}

ALL_CANDIDATES = TIER_1 | TIER_2 | TIER_3_CANDIDATES_EUR | TIER_3_CANDIDATES_USDC

MAX_POSITION_PCT = {1: 0.07, 2: 0.05, 3: 0.03}  # max % of portfolio per tier

def get_tier(pair: str) -> int:
    if pair in TIER_1: return 1
    if pair in TIER_2: return 2
    return 3

# ──────────────────────────────────────────────
# Scanner
# ──────────────────────────────────────────────
SCANNER_INTERVAL_SEC = 300        # 5 minutes
SIGNAL_INTERVAL_SEC = 60          # 1 minute
REGIME_INTERVAL_SEC = 3600        # 1 hour
WATCHLIST_SIZE = 10               # top N pairs
WATCHLIST_WARMUP_CYCLES = 2       # must appear N consecutive scans
MIN_VOLUME_EUR = 200_000          # minimum 24h volume
MAX_SPREAD_PCT = 0.003            # maximum bid-ask spread 0.3%

# ──────────────────────────────────────────────
# Signals
# ──────────────────────────────────────────────
RSI_BUY_1M = 25                   # tightened from 30 — more selective entries
RSI_BUY_15M = 35                  # tightened from 40
RSI_SELL_1M = 70
RSI_SELL_15M = 60
VOLUME_SURGE_RATIO = 1.5          # raised from 1.3 — only enter on real volume
MAX_ENTRY_SPREAD = 0.0015         # tightened from 0.2% to 0.15%
MIN_SIGNAL_CONFIDENCE = 0.60      # raised from 0.50 — higher conviction entries

# ──────────────────────────────────────────────
# Position management
# ──────────────────────────────────────────────
MAX_CONCURRENT_POSITIONS = 4
MAX_TOTAL_EXPOSURE_PCT = 0.25     # 25% of portfolio
MIN_DRY_POWDER_PCT = 0.50         # keep 50% in cash
DCA_SPLITS = [0.0, -0.005, -0.01] # 0%, -0.5%, -1.0% from signal price
DCA_WEIGHTS = [0.34, 0.33, 0.33]
ORDER_EXPIRY_SEC = 900            # 15 minutes

# Trailing stop-loss by tier
TRAILING_STOP_PCT = {1: 0.025, 2: 0.030, 3: 0.035}  # widened — fewer stop-outs in noise

# Take-profit levels: (threshold_pct, close_fraction)
TAKE_PROFIT_LEVELS = [
    (0.020, 0.35),   # TP1: +2.0% → close 35% (was 1.5%/40% — too thin after fees)
    (0.035, 0.35),   # TP2: +3.5% → close 35%
    (0.060, 0.30),   # TP3: +6.0% → close remaining
]

STALE_POSITION_HOURS = 12         # was 4h — way too short, most moves need time
STALE_MIN_GAIN_PCT = 0.008        # 0.8% — must clear fees to justify holding

# ──────────────────────────────────────────────
# Risk management
# ──────────────────────────────────────────────
MAX_SINGLE_LOSS_PCT = 0.03        # 3% → blacklist pair
BLACKLIST_DURATION_SEC = 3600     # 60 minutes
DRAWDOWN_HALT_5PCT_SEC = 7200     # 2 hours
DRAWDOWN_HALT_10PCT_SEC = 86400   # 24 hours
CONSECUTIVE_LOSS_PAUSE_SEC = 3600 # 60 min after 3 consecutive losses (was 30m)
PUMP_CHASE_THRESHOLD = 0.05      # 5% move in 15 min → no entry
WEEKEND_SIZE_REDUCTION = 0.50     # halve position sizes on weekends

# ──────────────────────────────────────────────
# Market regime
# ──────────────────────────────────────────────
REGIME_PAIR = "BTC-EUR"           # reference pair for regime detection
REGIME_TREND_HOURS = 3
REGIME_RANGE_BAND = 0.015         # 1.5%
REGIME_RANGE_HOURS = 4
REGIME_VOLATILE_ATR_MULT = 2.0

# Regime enum
REGIME_TRENDING_UP = "TRENDING_UP"
REGIME_TRENDING_DOWN = "TRENDING_DOWN"
REGIME_RANGING = "RANGING"
REGIME_VOLATILE = "VOLATILE"

def is_weekend() -> bool:
    now = datetime.now(timezone.utc)
    return now.weekday() >= 5  # Saturday=5, Sunday=6
