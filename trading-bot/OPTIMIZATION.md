# Trading Strategy Optimization Loop

## Schedule
- **Bot:** Running continuously in dry-run (`python3 -u bot.py --dry-run`, PID tracked in /tmp/trading-bot.pid)
- **Optimization check:** Every 36 hours — analyze trades, adjust parameters, restart bot
- **Discord reports:** Twice daily (09:00 and 21:00 CET) to #trading channel

## Strategy v2 Changes (2026-05-04)
1. RSI entry thresholds tightened: 1m 30→25, 15m 40→35
2. Volume surge ratio raised: 1.3→1.5
3. Max entry spread tightened: 0.2%→0.15%
4. Min signal confidence raised: 0.50→0.60 (0.70 in RANGING regime)
5. Stale position timeout extended: 4h→12h (biggest change — was losing to fees on premature closes)
6. Take-profit levels widened: TP1 1.5%→2.0%, TP2 3.0%→3.5%, TP3 5.0%→6.0%
7. Trailing stops widened: T1 2.0%→2.5%, T2 2.5%→3.0%, T3 3.0%→3.5%
8. Consecutive loss pause doubled: 30m→60m

## Optimization Logic
- If fees > 50% of gross → raise TP levels
- If stale closes > 60% → extend hold time
- If win rate < 35% → tighten entry signals
- If profit factor < 1.0 → widen stops
- If pair consistently loses → consider removing from candidates

## Goal
Find a configuration that achieves:
- Win rate > 45%
- Profit factor > 1.5
- Net positive P&L after fees
- Then switch from simulation to live with trade API key
