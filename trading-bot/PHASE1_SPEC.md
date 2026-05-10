# Phase 1: Multi-Pair Scanner + Signal Engine

## Overview
Evolve the existing DCA bot into a full trading system that scans multiple pairs,
detects momentum, and executes trades autonomously. Pure Python, no LLM in the hot path.

## Existing Code to Preserve/Evolve
- `coinbase_api.py` — working Coinbase Advanced Trade API client with Ed25519 JWT auth. Keep and extend.
- `indicators.py` — RSI calculation works. Extend with EMA, Bollinger Bands, ATR, volume analysis.
- `config.json` — evolve to support multi-pair scanning + tiered position sizing
- `strategy.py` — rewrite for the new signal/execution model
- `bot.py` — rewrite as the main loop (1-min tick for signals, 5-min tick for scanner)
- `notify.py` — evolve to format Discord notifications

## Architecture

```
bot.py                  # Main loop: 1-min signal tick, 5-min scanner tick
├── scanner.py          # Market scanner: discovers top pairs by momentum
├── signals.py          # Signal generator: RSI/EMA/BB on watchlist pairs  
├── executor.py         # Order executor: DCA entries, trailing stops, take-profits
├── indicators.py       # Technical indicators (RSI, EMA, BB, ATR, volume)
├── coinbase_api.py     # Coinbase API client (existing, extend with order helpers)
├── risk.py             # Risk manager: position limits, drawdown circuit breakers
├── config.py           # Configuration constants + mutable parameters
├── state.py            # State persistence (JSON-based, crash-safe)
├── notify.py           # Discord notification formatting
└── trade_log.json      # Append-only trade log
```

## Trading Pairs

### Primary (EUR pairs — lower fees, native currency)
These have good liquidity on Coinbase with EUR:
- BTC-EUR, ETH-EUR, SOL-EUR, DOGE-EUR, XRP-EUR, ADA-EUR, LINK-EUR, AVAX-EUR, DOT-EUR, MATIC-EUR (POL-EUR)

### Secondary (USDC pairs — for altcoins without EUR pairs)  
Only if they pass the liquidity filter ($200K+ daily volume):
- NEAR-USDC, ARB-USDC, OP-USDC, UNI-USDC, AAVE-USDC

### Pair Tiers (position sizing)
- **Tier 1**: BTC-EUR, ETH-EUR → max 7% portfolio per position
- **Tier 2**: SOL-EUR, XRP-EUR, DOGE-EUR, LINK-EUR, AVAX-EUR → max 5% per position
- **Tier 3**: Everything else that passes liquidity filter → max 3% per position

## Market Scanner (every 5 minutes)

1. Fetch 24h volume + current price for all candidate pairs
2. **Liquidity filter**: reject pairs with 24h volume < €200,000 or spread > 0.3%
3. **Momentum score** per pair:
   ```
   score = (
     0.35 * price_change_1h_percentile +    # 1h price change, ranked 0-100
     0.25 * volume_surge_ratio +             # current_vol / 7d_avg_vol, normalized  
     0.20 * rsi_15m_proximity_to_oversold +  # how close to RSI < 30
     0.20 * volatility_expansion             # ATR(14) vs 24h avg
   )
   ```
4. Top 10 pairs → **Active Watchlist**
5. Pair must be on watchlist for 2 consecutive cycles (10 min) before becoming trade-eligible

## Signal Generation (every 60 seconds, on watchlist pairs only)

**BUY signal** (ALL must be true):
- RSI(14) on 1m candles < 30
- RSI(14) on 15m candles < 40  
- EMA(9) crossing above EMA(21) on 15m candles
- Volume > 1.3x 7-day average
- Price near or below lower Bollinger Band (20, 2σ)
- Pair eligible (on watchlist ≥ 2 cycles)
- Spread < 0.2% at time of entry

**SELL signal** (ANY triggers):
- RSI(1m) > 70 AND RSI(15m) > 60
- Trailing stop-loss triggered
- Take-profit target hit
- Stale position timeout (>4h with <0.3% gain after fees)

## Position Entry (DCA-style)
- Split into 3 limit orders: 33% at signal price, 33% at -0.5%, 33% at -1.0%
- Order expiry: 15 minutes (cancel unfilled)
- Max 4 concurrent positions total
- Max 1 position per pair

## Position Management
- **Trailing stop-loss** (ratchets up, never down):
  - Tier 1: 2.0% from highest price since entry
  - Tier 2: 2.5%
  - Tier 3: 3.0%
- **Take-profit targets**:
  - TP1 at +1.5% → close 40%
  - TP2 at +3.0% → close 30%  
  - TP3 at +5.0% → close remaining 30%
- **Stale position**: >4h with <0.3% gain after fees → exit via limit
- **Liquidity evaporation**: if 24h volume drops below €100K while holding → exit immediately

## Risk Management (HARD RULES)
- Max per-position: tier-based (7% / 5% / 3%)
- Max total exposure: 25% of portfolio
- Min dry powder: 50% in EUR/USDC
- Single trade loss > 3% → blacklist pair for 60 min
- 24h drawdown > 5% → halt new trades for 2h, Tier 1 only
- 24h drawdown > 10% → halt all trading for 24h, alert on Discord
- 3 consecutive losses → pause 30 min
- Never chase pumps: if price moved >5% in last 15 min → no entry
- Never market orders except emergency stop-loss
- Weekend: reduce position sizes by 50%
- Correlation guard: don't hold BTC + ETH + another Tier 1/2 simultaneously

## Fee Awareness
- Maker: 0.60%, Taker: 0.80% (at <$10K monthly volume)
- Round-trip taker cost: 1.40% — this is the minimum a trade must clear
- Exclusively use limit orders for entry and exit
- Minimum expected gain per trade after fees: 0.5%
- Track fees as % of gross P&L; if fees > 40% of gross → reduce trade frequency

## Market Regime Detection (every hour, based on BTC-EUR)
- **TRENDING UP**: EMA(9) > EMA(21) on 1h for 3+ hours → normal trading
- **TRENDING DOWN**: EMA(9) < EMA(21) on 1h for 3+ hours → Tier 1 only, 50% size, prefer cash
- **RANGING**: BTC within 1.5% band for 4+ hours → 50% position sizes, tighter TP
- **VOLATILE**: ATR(14) on 1h > 2x 7d average → widen stops, reduce sizes, Tier 1 only

## CLI Interface
```
python bot.py                    # Dry-run (default)
python bot.py --live             # Live trading (requires explicit flag)
python bot.py --status           # Show current positions + watchlist
python bot.py --scan             # Run scanner once and show results
python bot.py --backtest N       # Backtest on last N hours of candle data
```

## Notifications (Discord #trading)
Post to Discord only on:
- 🟢 New deal opened (pair, entry, size, tier)
- 📥 Safety order / DCA fill
- 🎯 Take-profit hit (profit, duration)
- 🛑 Stop-loss triggered (loss, duration)
- ⚠️ Circuit breaker activated
- 📊 Hourly summary (portfolio value, open positions, closed trades, P&L)

## State Persistence
- `state.json` — current positions, watchlist, parameters (saved after every action)
- `trade_log.json` — append-only trade history
- Both crash-safe: write to temp file, then atomic rename

## Dependencies
- requests, PyJWT, cryptography (existing)
- No new deps needed — all indicators are pure Python math
