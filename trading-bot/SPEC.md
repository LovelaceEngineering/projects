# Trading Bot Specification

## Overview
A pure-Python DCA (Dollar-Cost Averaging) trading bot that executes trades on Coinbase Advanced Trade API. No LLM needed — deterministic rules only. Designed to replace 3Commas subscription bots.

## Architecture

```
trading-bot/
├── bot.py              # Main bot entry point — run every minute via launchd
├── config.json         # Bot configurations (pairs, sizing, strategy params)
├── state.json          # Runtime state (open deals, entries, SO levels) — auto-created
├── coinbase_api.py     # Coinbase Advanced Trade API client (auth, orders, prices)
├── strategy.py         # DCA strategy engine (signals, SO logic, TP logic)
├── indicators.py       # Technical indicators (RSI, price change, etc.)
├── notify.py           # Discord notification helper (posts to #trading)
├── trade_log.json      # Append-only trade execution log
├── README.md           # Documentation
└── requirements.txt    # Dependencies
```

## Coinbase API Authentication

Use the existing Ed25519 JWT auth from coinbase_analyze.py:
- Key ID: `c00ed8ed-ebf5-4637-b632-20850956cd4f`
- Key bytes: `KedOBMXnTOy7x1S+RCz7S8PI+dMfdu8tpak9gk7TaZdIM4cxdynCA1EdHQCGPfIB5A7mBQhFPrlqLE2cR44mlg==`
- Auth: EdDSA JWT with `sub`, `iss`, `nbf`, `exp`, `uri` claims
- The key currently has READ-ONLY permissions. Alessandro will provide a new key with TRADE permissions.
- For now, build with a `--dry-run` flag that simulates trades without placing real orders.

## Coinbase Advanced Trade API Endpoints

### Market Data (already working in coinbase_analyze.py)
- `GET /api/v3/brokerage/best_bid_ask` — current prices
- `GET /api/v3/brokerage/products/{product_id}/candles` — OHLCV candles
- `GET /api/v3/brokerage/accounts` — portfolio balances

### Trading (needs trade-enabled API key)
- `POST /api/v3/brokerage/orders` — place order
  ```json
  {
    "client_order_id": "<uuid>",
    "product_id": "BTC-EUR",
    "side": "BUY" | "SELL",
    "order_configuration": {
      "market_market_ioc": { "quote_size": "50.00" }    // market buy €50 worth
      // OR
      "limit_limit_gtc": { "base_size": "0.001", "limit_price": "65000", "post_only": false }
    }
  }
  ```
- `GET /api/v3/brokerage/orders/historical/{order_id}` — check order status
- `POST /api/v3/brokerage/orders/batch_cancel` — cancel orders

## DCA Strategy (matching 3Commas behavior)

### Per-Bot Config (in config.json)
```json
{
  "bots": [
    {
      "id": "btc-dca",
      "enabled": true,
      "pair": "BTC-EUR",
      "base_order_size_eur": 50,
      "safety_order_size_eur": 50,
      "max_safety_orders": 5,
      "safety_order_step_pct": 2.0,
      "safety_order_volume_scale": 1.5,
      "safety_order_step_scale": 1.2,
      "take_profit_pct": 3.0,
      "max_active_deals": 1,
      "cooldown_seconds": 3600,
      "entry_condition": {
        "type": "rsi",
        "timeframe": "ONE_HOUR",
        "period": 14,
        "threshold": 35
      }
    }
  ]
}
```

### Deal Lifecycle
1. **Entry Signal**: RSI drops below threshold → place market BUY (base order)
2. **Safety Orders**: Price drops further → buy more at each SO level
   - SO1 at -2.0% from entry, SO2 at -2.0% × 1.2 = -2.4% further, etc.
   - SO sizes scale: SO1=€50, SO2=€75, SO3=€112.50, etc. (× 1.5 each)
3. **Take Profit**: Average entry price + TP% → place limit SELL
   - Recalculate TP after each SO fill (new average price)
4. **Deal Close**: TP order fills → deal complete, log profit, cooldown

### State Tracking (state.json)
```json
{
  "deals": {
    "btc-dca": {
      "status": "active",           // "idle" | "active" | "cooldown"
      "opened_at": "2026-04-05T10:00:00Z",
      "base_order_id": "cb-order-123",
      "avg_entry_price": 65000.00,
      "total_quantity": 0.00077,
      "total_cost_eur": 50.00,
      "safety_orders_filled": 0,
      "pending_safety_order_id": null,
      "take_profit_order_id": "cb-order-456",
      "take_profit_price": 66950.00,
      "cooldown_until": null
    }
  },
  "last_run": "2026-04-05T10:01:00Z"
}
```

### Each Run (every 60 seconds):
1. Load config + state
2. For each enabled bot:
   a. If idle + no cooldown → check entry signal → if triggered, place base order
   b. If active → check pending order fills (base or SO)
   c. If active → check if next SO level is hit → place SO order
   d. If active → check TP order status → if filled, close deal + log
   e. If cooldown → check if expired → set idle
3. Save state
4. If any trade executed → post to Discord #trading

## Notifications

Post to Discord only on meaningful events:
- 🟢 New deal opened (entry price, size)
- 📥 Safety order filled (SO #, new avg price)
- 🎯 Take profit hit (profit amount, duration)
- ⚠️ Error (API failure, insufficient funds)
- 📊 Every 3 hours: summary report (replaces old 3commas report)

Use a simple HTTP POST to Discord webhook, OR write to stdout and let the cron job handle posting.
For now, just print events to stdout — the cron wrapper will handle Discord posting.

## CLI Flags
- `--dry-run` — simulate everything, don't place real orders (DEFAULT for safety)
- `--live` — actually place orders (requires explicit flag)
- `--status` — print current deal status and exit
- `--config path` — custom config file path

## Safety Rules
1. **Default to dry-run** — must explicitly pass `--live` to trade
2. **Max position size** — never invest more than config allows per bot
3. **Rate limiting** — respect Coinbase API limits (10 req/sec)
4. **Idempotent** — safe to run multiple times; uses client_order_id to prevent dupes
5. **Crash-safe** — state saved after every action; can resume after restart
6. **Logging** — every decision logged to trade_log.json with timestamp and rationale

## Dependencies
- requests
- PyJWT
- cryptography (for Ed25519 key handling)
(All already installed on this system from coinbase_analyze.py)

## Default Config
Start with the same 3 bots Alessandro had on 3Commas:
- BTC-EUR: base €50, 5 SOs, 3% TP
- ETH-EUR: base €50, 5 SOs, 3% TP  
- SOL-EUR: base €25, 5 SOs, 3% TP (smaller position)
