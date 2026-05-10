"""Coinbase Advanced Trade API client with Ed25519 JWT authentication."""

from __future__ import annotations

import json
import os
import secrets
import time
import uuid
from urllib.parse import urlparse

import jwt
import requests
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

_SECRET_PATH = os.path.expanduser("~/.openclaw/secrets/coinbase")
with open(_SECRET_PATH) as _f:
    _SECRET = json.load(_f)
API_KEY_ID = _SECRET["id"]
API_KEY_SECRET = _SECRET["privateKey"]
BASE_URL = "https://api.coinbase.com"


def _build_jwt(method: str, path: str) -> str:
    """Build an EdDSA JWT for Coinbase Advanced Trade API."""
    import base64

    key_bytes = base64.b64decode(API_KEY_SECRET)
    private_key_bytes = key_bytes[:32]
    private_key = Ed25519PrivateKey.from_private_bytes(private_key_bytes)

    # Coinbase requires the raw 32-byte public key encoded as hex for verification,
    # but for PyJWT we need the full PEM/DER key object.
    public_key = private_key.public_key()
    public_key_bytes = public_key.public_bytes(Encoding.Raw, PublicFormat.Raw)

    uri = f"{method} api.coinbase.com{path}"
    now = int(time.time())

    payload = {
        "sub": API_KEY_ID,
        "iss": "coinbase-cloud",
        "nbf": now,
        "exp": now + 120,
        "uri": uri,
    }
    headers = {
        "kid": API_KEY_ID,
        "nonce": secrets.token_hex(16),
        "typ": "JWT",
    }

    token = jwt.encode(
        payload,
        private_key,
        algorithm="EdDSA",
        headers=headers,
    )
    return token


def _request(method: str, path: str, params: dict | None = None, body: dict | None = None) -> dict:
    """Make an authenticated request to Coinbase Advanced Trade API.
    
    JWT is signed against the base path only. Query params are passed
    separately to requests.
    """
    # Sign JWT against base path (no query string)
    base_path = path.split("?")[0]
    token = _build_jwt(method, base_path)
    url = BASE_URL + base_path
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    # Merge any query params from the path string + explicit params dict
    merged_params = {}
    if "?" in path:
        from urllib.parse import parse_qs
        qs = path.split("?", 1)[1]
        merged_params = {k: v[0] for k, v in parse_qs(qs).items()}
    if params:
        merged_params.update(params)

    resp = requests.request(
        method,
        url,
        headers=headers,
        params=merged_params if merged_params else None,
        json=body,
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def get_price(product_id: str) -> float:
    """Get current best bid price for a product (e.g. 'BTC-EUR')."""
    data = _request("GET", f"/api/v3/brokerage/best_bid_ask?product_ids={product_id}")
    for pricebook in data.get("pricebooks", []):
        if pricebook.get("product_id") == product_id:
            return float(pricebook["bids"][0]["price"])
    raise ValueError(f"No price found for {product_id}")


def get_candles(
    product_id: str,
    granularity: str = "ONE_HOUR",
    limit: int = 300,
) -> list[dict]:
    """Get OHLCV candles for a product.

    Returns list of dicts with keys: start, low, high, open, close, volume.
    Sorted oldest-first.
    """
    end = int(time.time())
    # Map granularity to seconds for start calculation
    granularity_seconds = {
        "ONE_MINUTE": 60,
        "FIVE_MINUTE": 300,
        "FIFTEEN_MINUTE": 900,
        "ONE_HOUR": 3600,
        "SIX_HOUR": 21600,
        "ONE_DAY": 86400,
    }
    seconds = granularity_seconds.get(granularity, 3600)
    start = end - (limit * seconds)

    path = (
        f"/api/v3/brokerage/products/{product_id}/candles"
        f"?start={start}&end={end}&granularity={granularity}"
    )
    data = _request("GET", path)
    candles = data.get("candles", [])
    # API returns newest-first; reverse to oldest-first
    candles.sort(key=lambda c: int(c["start"]))
    return candles


def get_accounts() -> list[dict]:
    """Get all accounts/balances."""
    data = _request("GET", "/api/v3/brokerage/accounts")
    return data.get("accounts", [])


def place_order(
    client_order_id: str,
    product_id: str,
    side: str,
    order_config: dict,
) -> dict:
    """Place an order on Coinbase.

    Args:
        client_order_id: Unique UUID string to prevent duplicate orders.
        product_id: e.g. 'BTC-EUR'
        side: 'BUY' or 'SELL'
        order_config: One of:
            {"market_market_ioc": {"quote_size": "50.00"}}
            {"limit_limit_gtc": {"base_size": "0.001", "limit_price": "65000", "post_only": false}}

    Returns:
        API response dict with order details.
    """
    body = {
        "client_order_id": client_order_id,
        "product_id": product_id,
        "side": side,
        "order_configuration": order_config,
    }
    return _request("POST", "/api/v3/brokerage/orders", body=body)


def place_market_buy(client_order_id: str, product_id: str, quote_size_eur: float) -> dict:
    """Place a market buy order for a given EUR amount."""
    return place_order(
        client_order_id=client_order_id,
        product_id=product_id,
        side="BUY",
        order_config={
            "market_market_ioc": {"quote_size": f"{quote_size_eur:.2f}"}
        },
    )


def place_limit_sell(
    client_order_id: str,
    product_id: str,
    base_size: float,
    limit_price: float,
) -> dict:
    """Place a limit sell (take profit) order."""
    return place_order(
        client_order_id=client_order_id,
        product_id=product_id,
        side="SELL",
        order_config={
            "limit_limit_gtc": {
                "base_size": f"{base_size:.8f}",
                "limit_price": f"{limit_price:.2f}",
                "post_only": False,
            }
        },
    )


def get_order_status(order_id: str) -> dict:
    """Get the status of an order by its order ID."""
    return _request("GET", f"/api/v3/brokerage/orders/historical/{order_id}")


def cancel_order(order_ids: list[str]) -> dict:
    """Cancel one or more orders by their order IDs."""
    return _request(
        "POST",
        "/api/v3/brokerage/orders/batch_cancel",
        body={"order_ids": order_ids},
    )
