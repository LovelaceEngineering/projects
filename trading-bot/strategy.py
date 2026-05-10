"""DCA strategy engine — entry signals, safety orders, take profit management."""

import uuid
from datetime import datetime, timezone

import coinbase_api
import indicators
import notify


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _generate_client_order_id(bot_id: str, deal_timestamp: str, label: str) -> str:
    """Generate a deterministic UUID5 for idempotent order placement."""
    namespace = uuid.NAMESPACE_DNS
    name = f"{bot_id}:{deal_timestamp}:{label}"
    return str(uuid.uuid5(namespace, name))


def _calculate_so_levels(bot_cfg: dict) -> list[dict]:
    """Pre-calculate all safety order levels (price drop % and size).

    Returns list of dicts: [{"drop_pct": cumulative_drop, "size_eur": order_size}, ...]
    """
    levels = []
    step = bot_cfg["safety_order_step_pct"]
    size = bot_cfg["safety_order_size_eur"]
    cumulative_drop = 0.0

    for i in range(bot_cfg["max_safety_orders"]):
        if i == 0:
            cumulative_drop = step
        else:
            step *= bot_cfg["safety_order_step_scale"]
            cumulative_drop += step
        levels.append({
            "drop_pct": round(cumulative_drop, 4),
            "size_eur": round(size, 2),
        })
        size *= bot_cfg["safety_order_volume_scale"]

    return levels


def check_entry_signal(bot_cfg: dict) -> bool:
    """Check if entry conditions are met for a bot."""
    cond = bot_cfg["entry_condition"]
    if cond["type"] == "rsi":
        candles = coinbase_api.get_candles(
            bot_cfg["pair"],
            granularity=cond["timeframe"],
            limit=cond["period"] + 10,  # extra buffer
        )
        rsi = indicators.compute_rsi(candles, period=cond["period"])
        if rsi is None:
            return False
        return rsi < cond["threshold"]
    return False


def open_deal(bot_cfg: dict, deal: dict, dry_run: bool, log_fn) -> dict:
    """Place base order and open a new deal."""
    pair = bot_cfg["pair"]
    now = _now_iso()
    deal_ts = now  # used for deterministic order IDs

    client_oid = _generate_client_order_id(bot_cfg["id"], deal_ts, "base")

    current_price = coinbase_api.get_price(pair)

    if dry_run:
        # Simulate fill at current price
        quantity = bot_cfg["base_order_size_eur"] / current_price
        order_id = f"dry-{client_oid[:8]}"
        fill_price = current_price
    else:
        resp = coinbase_api.place_market_buy(
            client_order_id=client_oid,
            product_id=pair,
            quote_size_eur=bot_cfg["base_order_size_eur"],
        )
        order_id = resp.get("success_response", {}).get("order_id", resp.get("order_id", "unknown"))
        # For market orders, approximate fill — will be corrected on next status check
        fill_price = current_price
        quantity = bot_cfg["base_order_size_eur"] / fill_price

    # Calculate take profit price
    tp_price = round(fill_price * (1 + bot_cfg["take_profit_pct"] / 100), 2)

    deal.update({
        "status": "active",
        "opened_at": deal_ts,
        "base_order_id": order_id,
        "avg_entry_price": round(fill_price, 2),
        "total_quantity": quantity,
        "total_cost_eur": bot_cfg["base_order_size_eur"],
        "safety_orders_filled": 0,
        "pending_safety_order_id": None,
        "take_profit_order_id": None,
        "take_profit_price": tp_price,
        "cooldown_until": None,
    })

    log_fn({
        "timestamp": now,
        "bot_id": bot_cfg["id"],
        "action": "open_deal",
        "pair": pair,
        "side": "BUY",
        "type": "market",
        "size_eur": bot_cfg["base_order_size_eur"],
        "price": fill_price,
        "quantity": quantity,
        "order_id": order_id,
        "client_order_id": client_oid,
        "dry_run": dry_run,
    })

    notify.deal_opened(bot_cfg["id"], pair, fill_price, bot_cfg["base_order_size_eur"], dry_run)

    # Place take profit order
    _place_take_profit(bot_cfg, deal, dry_run, log_fn)

    return deal


def _place_take_profit(bot_cfg: dict, deal: dict, dry_run: bool, log_fn) -> None:
    """Place or replace the take profit limit sell order."""
    pair = bot_cfg["pair"]
    tp_price = deal["take_profit_price"]
    quantity = deal["total_quantity"]
    client_oid = _generate_client_order_id(bot_cfg["id"], deal["opened_at"], f"tp-{deal['safety_orders_filled']}")

    # Cancel existing TP order if any
    if deal.get("take_profit_order_id") and not dry_run:
        try:
            coinbase_api.cancel_order([deal["take_profit_order_id"]])
        except Exception:
            pass  # May already be filled or cancelled

    if dry_run:
        order_id = f"dry-tp-{client_oid[:8]}"
    else:
        resp = coinbase_api.place_limit_sell(
            client_order_id=client_oid,
            product_id=pair,
            base_size=quantity,
            limit_price=tp_price,
        )
        order_id = resp.get("success_response", {}).get("order_id", resp.get("order_id", "unknown"))

    deal["take_profit_order_id"] = order_id

    log_fn({
        "timestamp": _now_iso(),
        "bot_id": bot_cfg["id"],
        "action": "place_take_profit",
        "pair": pair,
        "side": "SELL",
        "type": "limit",
        "price": tp_price,
        "quantity": quantity,
        "order_id": order_id,
        "client_order_id": client_oid,
        "dry_run": dry_run,
    })


def check_safety_orders(bot_cfg: dict, deal: dict, dry_run: bool, log_fn) -> dict:
    """Check if the next safety order level has been hit, and place it."""
    if deal["safety_orders_filled"] >= bot_cfg["max_safety_orders"]:
        return deal

    pair = bot_cfg["pair"]
    current_price = coinbase_api.get_price(pair)
    entry_price = deal["avg_entry_price"]

    so_levels = _calculate_so_levels(bot_cfg)
    next_so_idx = deal["safety_orders_filled"]
    so_level = so_levels[next_so_idx]

    # Check if price has dropped enough for the next SO
    target_price = entry_price * (1 - so_level["drop_pct"] / 100)
    price_drop = indicators.price_change_pct(current_price, entry_price)

    if current_price > target_price:
        return deal  # Price hasn't dropped enough

    # Place safety order
    so_size = so_level["size_eur"]
    client_oid = _generate_client_order_id(
        bot_cfg["id"], deal["opened_at"], f"so-{next_so_idx + 1}"
    )

    if dry_run:
        order_id = f"dry-so-{client_oid[:8]}"
        fill_price = current_price
        quantity = so_size / fill_price
    else:
        resp = coinbase_api.place_market_buy(
            client_order_id=client_oid,
            product_id=pair,
            quote_size_eur=so_size,
        )
        order_id = resp.get("success_response", {}).get("order_id", resp.get("order_id", "unknown"))
        fill_price = current_price
        quantity = so_size / fill_price

    # Update deal with new average
    old_cost = deal["total_cost_eur"]
    old_qty = deal["total_quantity"]
    new_cost = old_cost + so_size
    new_qty = old_qty + quantity
    new_avg = new_cost / new_qty

    deal["total_cost_eur"] = round(new_cost, 2)
    deal["total_quantity"] = new_qty
    deal["avg_entry_price"] = round(new_avg, 2)
    deal["safety_orders_filled"] = next_so_idx + 1

    # Recalculate take profit based on new average
    deal["take_profit_price"] = round(new_avg * (1 + bot_cfg["take_profit_pct"] / 100), 2)

    log_fn({
        "timestamp": _now_iso(),
        "bot_id": bot_cfg["id"],
        "action": "safety_order_filled",
        "pair": pair,
        "so_number": next_so_idx + 1,
        "side": "BUY",
        "type": "market",
        "size_eur": so_size,
        "price": fill_price,
        "quantity": quantity,
        "new_avg_price": new_avg,
        "order_id": order_id,
        "client_order_id": client_oid,
        "dry_run": dry_run,
    })

    notify.safety_order_filled(
        bot_cfg["id"], pair, next_so_idx + 1, fill_price, new_avg, dry_run
    )

    # Replace take profit order with updated price/quantity
    _place_take_profit(bot_cfg, deal, dry_run, log_fn)

    return deal


def check_take_profit(bot_cfg: dict, deal: dict, dry_run: bool, log_fn) -> dict:
    """Check if take profit has been hit."""
    pair = bot_cfg["pair"]
    current_price = coinbase_api.get_price(pair)

    if dry_run:
        # In dry-run, simulate TP fill when price reaches target
        if current_price < deal["take_profit_price"]:
            return deal
    else:
        # In live mode, check the actual TP order status
        if not deal.get("take_profit_order_id"):
            return deal
        try:
            order_data = coinbase_api.get_order_status(deal["take_profit_order_id"])
            order = order_data.get("order", order_data)
            if order.get("status") not in ("FILLED", "COMPLETED"):
                return deal
        except Exception:
            return deal

    # Take profit hit!
    sell_value = deal["total_quantity"] * deal["take_profit_price"]
    profit = sell_value - deal["total_cost_eur"]
    opened_at = datetime.fromisoformat(deal["opened_at"])
    duration = datetime.now(timezone.utc) - opened_at
    hours = int(duration.total_seconds() // 3600)
    minutes = int((duration.total_seconds() % 3600) // 60)
    duration_str = f"{hours}h {minutes}m"

    log_fn({
        "timestamp": _now_iso(),
        "bot_id": bot_cfg["id"],
        "action": "take_profit_hit",
        "pair": pair,
        "side": "SELL",
        "type": "limit",
        "price": deal["take_profit_price"],
        "quantity": deal["total_quantity"],
        "total_cost_eur": deal["total_cost_eur"],
        "sell_value_eur": round(sell_value, 2),
        "profit_eur": round(profit, 2),
        "duration": duration_str,
        "dry_run": dry_run,
    })

    notify.take_profit_hit(bot_cfg["id"], pair, profit, duration_str, dry_run)

    # Set cooldown
    cooldown_until = datetime.now(timezone.utc).timestamp() + bot_cfg["cooldown_seconds"]
    deal.update({
        "status": "cooldown",
        "cooldown_until": datetime.fromtimestamp(cooldown_until, tz=timezone.utc).isoformat(),
        "take_profit_order_id": None,
        "pending_safety_order_id": None,
    })

    return deal


def check_cooldown(deal: dict) -> dict:
    """Check if cooldown has expired and reset to idle."""
    if deal.get("status") != "cooldown":
        return deal

    cooldown_until = deal.get("cooldown_until")
    if not cooldown_until:
        deal["status"] = "idle"
        return deal

    until = datetime.fromisoformat(cooldown_until)
    if datetime.now(timezone.utc) >= until:
        deal.update({
            "status": "idle",
            "opened_at": None,
            "base_order_id": None,
            "avg_entry_price": 0,
            "total_quantity": 0,
            "total_cost_eur": 0,
            "safety_orders_filled": 0,
            "pending_safety_order_id": None,
            "take_profit_order_id": None,
            "take_profit_price": 0,
            "cooldown_until": None,
        })

    return deal


def run_bot(bot_cfg: dict, deal: dict, dry_run: bool, log_fn) -> dict:
    """Run one iteration of the strategy for a single bot.

    Args:
        bot_cfg: Bot configuration from config.json.
        deal: Current deal state (mutated in place and returned).
        dry_run: If True, simulate trades.
        log_fn: Callable to append a log entry.

    Returns:
        Updated deal state.
    """
    if not bot_cfg.get("enabled", True):
        return deal

    status = deal.get("status", "idle")

    try:
        if status == "cooldown":
            deal = check_cooldown(deal)

        elif status == "idle":
            if check_entry_signal(bot_cfg):
                deal = open_deal(bot_cfg, deal, dry_run, log_fn)

        elif status == "active":
            # Check if TP was hit
            deal = check_take_profit(bot_cfg, deal, dry_run, log_fn)

            # If still active, check safety orders
            if deal.get("status") == "active":
                deal = check_safety_orders(bot_cfg, deal, dry_run, log_fn)

    except Exception as e:
        notify.error(bot_cfg["id"], str(e))
        log_fn({
            "timestamp": _now_iso(),
            "bot_id": bot_cfg["id"],
            "action": "error",
            "error": str(e),
            "dry_run": dry_run,
        })

    return deal
