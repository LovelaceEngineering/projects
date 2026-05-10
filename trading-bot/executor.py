"""Order executor — DCA entries, trailing stops, take-profits."""
from __future__ import annotations

import uuid
import time
from datetime import datetime, timezone, timedelta

import coinbase_api
import config
import risk
from state import append_trade_log


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _client_id(pair: str, label: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"trading-bot:{pair}:{label}:{int(time.time())}"))


def open_position(pair: str, state: dict, dry_run: bool) -> dict | None:
    """Open a DCA position for a pair. Returns position dict or None."""
    now = _now()
    current_price = coinbase_api.get_price(pair)
    tier = config.get_tier(pair)

    # Get position size
    if dry_run:
        total_eur = 20000  # assume €20K for dry-run
    else:
        total_eur, _ = risk.get_portfolio_value()

    total_size = risk.get_position_size_eur(pair, total_eur)

    # DCA split: 3 orders at different levels
    orders = []
    total_qty = 0
    total_cost = 0

    for offset, weight in zip(config.DCA_SPLITS, config.DCA_WEIGHTS):
        limit_price = round(current_price * (1 + offset), 2)
        order_eur = round(total_size * weight, 2)

        if order_eur < 1:
            continue

        cid = _client_id(pair, f"dca-{offset}")

        if dry_run:
            qty = order_eur / limit_price
            orders.append({
                "order_id": f"dry-{cid[:8]}",
                "client_order_id": cid,
                "limit_price": limit_price,
                "size_eur": order_eur,
                "quantity": qty,
                "filled": True,  # simulate immediate fill in dry-run
            })
            total_qty += qty
            total_cost += order_eur
        else:
            try:
                # Place limit buy
                qty = order_eur / limit_price
                resp = coinbase_api.place_order(
                    client_order_id=cid,
                    product_id=pair,
                    side="BUY",
                    order_config={
                        "limit_limit_gtc": {
                            "base_size": f"{qty:.8f}",
                            "limit_price": f"{limit_price:.2f}",
                            "post_only": True,
                        }
                    },
                )
                oid = resp.get("success_response", {}).get("order_id", "unknown")
                orders.append({
                    "order_id": oid,
                    "client_order_id": cid,
                    "limit_price": limit_price,
                    "size_eur": order_eur,
                    "quantity": qty,
                    "filled": False,
                })
            except Exception as e:
                append_trade_log({"action": "order_error", "pair": pair, "error": str(e), "dry_run": dry_run})

    if not orders:
        return None

    # For dry-run, assume all filled immediately
    if dry_run:
        avg_price = total_cost / total_qty if total_qty else current_price
    else:
        avg_price = current_price  # will be updated as fills come in

    position = {
        "pair": pair,
        "tier": tier,
        "status": "active",
        "opened_at": now,
        "entry_price": round(current_price, 6),
        "avg_price": round(avg_price, 6),
        "total_quantity": total_qty,
        "total_cost_eur": round(total_cost, 2),
        "highest_price": round(current_price, 6),  # for trailing stop
        "safety_orders_filled": 0,
        "tp_levels_hit": 0,
        "orders": orders,
        "dry_run": dry_run,
    }

    # Calculate take-profit and stop-loss prices
    stop_pct = config.TRAILING_STOP_PCT[tier]
    position["stop_price"] = round(avg_price * (1 - stop_pct), 6)

    tp_prices = []
    for pct, _ in config.TAKE_PROFIT_LEVELS:
        tp_prices.append(round(avg_price * (1 + pct), 6))
    position["tp_prices"] = tp_prices

    append_trade_log({
        "action": "open_position",
        "pair": pair,
        "tier": tier,
        "entry_price": current_price,
        "avg_price": avg_price,
        "total_eur": round(total_cost, 2),
        "total_qty": total_qty,
        "orders": len(orders),
        "dry_run": dry_run,
    })

    return position


def manage_position(pair: str, position: dict, state: dict, dry_run: bool) -> tuple[dict | None, list[str]]:
    """Manage an existing position. Returns (updated_position_or_None, events).

    Returns None if position should be closed.
    """
    events = []
    now = datetime.now(timezone.utc)
    tier = position.get("tier", 3)

    try:
        current_price = coinbase_api.get_price(pair)
    except Exception:
        return position, ["Price fetch failed"]

    avg_price = position.get("avg_price", position["entry_price"])
    pnl_pct = (current_price - avg_price) / avg_price if avg_price else 0

    # Update highest price (for trailing stop)
    if current_price > position.get("highest_price", 0):
        position["highest_price"] = current_price
        # Ratchet stop-loss up
        stop_pct = config.TRAILING_STOP_PCT[tier]
        position["stop_price"] = round(current_price * (1 - stop_pct), 6)

    # ── Check trailing stop-loss ──
    if current_price <= position.get("stop_price", 0):
        events.append(f"🛑 STOP-LOSS triggered for {pair}: price {current_price:.2f} <= stop {position['stop_price']:.2f}")
        _close_position(pair, position, current_price, "stop_loss", dry_run)
        # Update stats
        state.setdefault("stats", {})
        if pnl_pct < 0:
            state["stats"]["consecutive_losses"] = state["stats"].get("consecutive_losses", 0) + 1
        if pnl_pct < -config.MAX_SINGLE_LOSS_PCT:
            # Blacklist pair
            until = (now + timedelta(seconds=config.BLACKLIST_DURATION_SEC)).isoformat()
            state.setdefault("blacklist", {})[pair] = until
            events.append(f"⛔ {pair} blacklisted for 60 min (loss {pnl_pct*100:.1f}%)")
        return None, events

    # ── Check take-profit levels ──
    tp_hit = position.get("tp_levels_hit", 0)
    tp_prices = position.get("tp_prices", [])

    if tp_hit < len(tp_prices) and tp_hit < len(config.TAKE_PROFIT_LEVELS):
        tp_price = tp_prices[tp_hit]
        if current_price >= tp_price:
            _, close_frac = config.TAKE_PROFIT_LEVELS[tp_hit]
            sell_qty = position["total_quantity"] * close_frac

            events.append(f"🎯 TP{tp_hit+1} hit for {pair}: +{pnl_pct*100:.1f}% @ {current_price:.2f}")

            if not dry_run:
                try:
                    cid = _client_id(pair, f"tp{tp_hit+1}")
                    coinbase_api.place_limit_sell(
                        client_order_id=cid,
                        product_id=pair,
                        base_size=sell_qty,
                        limit_price=current_price,
                    )
                except Exception as e:
                    events.append(f"⚠️ TP sell failed: {e}")

            position["total_quantity"] -= sell_qty
            position["tp_levels_hit"] = tp_hit + 1

            append_trade_log({
                "action": f"take_profit_{tp_hit+1}",
                "pair": pair,
                "price": current_price,
                "qty_sold": sell_qty,
                "pnl_pct": round(pnl_pct, 4),
                "dry_run": dry_run,
            })

            # If all TP levels hit, close position
            if position["tp_levels_hit"] >= len(config.TAKE_PROFIT_LEVELS):
                events.append(f"✅ All TP levels hit for {pair} — position closed")
                state.setdefault("stats", {})["consecutive_losses"] = 0
                return None, events

    # ── Stale position check ──
    opened = datetime.fromisoformat(position["opened_at"])
    hours_open = (now - opened).total_seconds() / 3600
    if hours_open > config.STALE_POSITION_HOURS:
        net_pnl = pnl_pct - config.ROUND_TRIP_FEE
        if net_pnl < config.STALE_MIN_GAIN_PCT:
            events.append(f"⏰ Stale position {pair}: {hours_open:.1f}h, net P&L {net_pnl*100:.2f}% — closing")
            _close_position(pair, position, current_price, "stale", dry_run)
            return None, events

    position["current_price"] = current_price
    position["unrealized_pnl_pct"] = round(pnl_pct, 4)
    return position, events


def _close_position(pair: str, position: dict, price: float, reason: str, dry_run: bool) -> None:
    """Close a position fully."""
    qty = position.get("total_quantity", 0)
    if qty <= 0:
        return

    if not dry_run and reason == "stop_loss":
        # Emergency: use market order for stop-loss
        try:
            cid = _client_id(pair, f"close-{reason}")
            coinbase_api.place_order(
                client_order_id=cid,
                product_id=pair,
                side="SELL",
                order_config={"market_market_ioc": {"base_size": f"{qty:.8f}"}},
            )
        except Exception:
            pass
    elif not dry_run:
        try:
            cid = _client_id(pair, f"close-{reason}")
            coinbase_api.place_limit_sell(
                client_order_id=cid,
                product_id=pair,
                base_size=qty,
                limit_price=price,
            )
        except Exception:
            pass

    avg = position.get("avg_price", position["entry_price"])
    pnl = (price - avg) / avg if avg else 0
    cost = position.get("total_cost_eur", 0)
    gross_pnl = cost * pnl
    fees = cost * config.ROUND_TRIP_FEE
    net_pnl = gross_pnl - fees

    opened = datetime.fromisoformat(position["opened_at"])
    duration = datetime.now(timezone.utc) - opened
    hours = duration.total_seconds() / 3600

    append_trade_log({
        "action": "close_position",
        "pair": pair,
        "reason": reason,
        "entry_price": avg,
        "exit_price": price,
        "pnl_pct": round(pnl, 4),
        "gross_pnl_eur": round(gross_pnl, 2),
        "fees_eur": round(fees, 2),
        "net_pnl_eur": round(net_pnl, 2),
        "duration_hours": round(hours, 2),
        "dry_run": position.get("dry_run", True),
    })
