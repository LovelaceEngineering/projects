# DCA Trading Bot

A pure-Python DCA (Dollar-Cost Averaging) trading bot for Coinbase Advanced Trade API. Deterministic rules, no LLM — designed to replace 3Commas subscription bots.

## Setup

```bash
pip install -r requirements.txt
```

Requires Python 3.9+.

## Usage

```bash
# Dry-run mode (default — no real trades)
python bot.py

# Live trading (places real orders)
python bot.py --live

# Check current deal status
python bot.py --status

# Use custom config
python bot.py --config /path/to/config.json
```

## How It Works

The bot runs one iteration per invocation. Schedule it with launchd or cron to run every 60 seconds:

```
* * * * * cd /path/to/trading-bot && python bot.py >> bot.log 2>&1
```

### DCA Strategy

1. **Entry**: RSI drops below threshold → market buy (base order)
2. **Safety Orders**: Price drops further → buy more at scaled levels
3. **Take Profit**: Average price + TP% → limit sell
4. **Cooldown**: After TP fills, wait before opening next deal

### Default Bots

| Bot | Pair | Base Order | Safety Orders | Take Profit |
|-----|------|-----------|---------------|-------------|
| btc-dca | BTC-EUR | €50 | 5 × €50 (1.5× scale) | 3% |
| eth-dca | ETH-EUR | €50 | 5 × €50 (1.5× scale) | 3% |
| sol-dca | SOL-EUR | €25 | 5 × €25 (1.5× scale) | 3% |

## Files

- `bot.py` — Main entry point (run this)
- `config.json` — Bot configurations
- `state.json` — Runtime state (auto-created)
- `trade_log.json` — Append-only trade execution log
- `coinbase_api.py` — Coinbase API client with Ed25519 JWT auth
- `strategy.py` — DCA strategy engine
- `indicators.py` — Technical indicators (RSI)
- `notify.py` — Notification output

## Safety

- **Default dry-run**: Must pass `--live` explicitly to trade
- **Idempotent**: Uses `client_order_id` (UUID5) to prevent duplicate orders
- **Crash-safe**: State saved after every action
- **Logged**: Every decision written to `trade_log.json`
