"""State persistence — crash-safe JSON state management."""
from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
STATE_FILE = SCRIPT_DIR / "state.json"
TRADE_LOG_FILE = SCRIPT_DIR / "trade_log.json"

DEFAULT_STATE = {
    "positions": {},        # pair -> position dict
    "watchlist": [],        # current active watchlist pairs
    "watchlist_history": {},# pair -> consecutive_cycles count
    "blacklist": {},        # pair -> expires_at ISO string
    "parameters": {},       # mutable parameter overrides
    "stats": {
        "consecutive_losses": 0,
        "halt_until": None,
        "daily_start_value": None,
        "daily_start_time": None,
    },
    "regime": "UNKNOWN",
    "last_scan": None,
    "last_signal_check": None,
    "last_regime_check": None,
    "last_run": None,
}


def _atomic_write(path: Path, data: dict) -> None:
    """Write JSON atomically: write to temp, then rename."""
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, indent=2, default=str)
            f.write("\n")
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def load_state() -> dict:
    """Load state from disk, returning defaults if missing/corrupt."""
    if STATE_FILE.exists():
        try:
            with open(STATE_FILE) as f:
                state = json.load(f)
            # Merge any missing keys from defaults
            for k, v in DEFAULT_STATE.items():
                if k not in state:
                    state[k] = v
            return state
        except (json.JSONDecodeError, OSError):
            pass
    return dict(DEFAULT_STATE)


def save_state(state: dict) -> None:
    """Save state to disk atomically."""
    state["last_run"] = datetime.now(timezone.utc).isoformat()
    _atomic_write(STATE_FILE, state)


def append_trade_log(entry: dict) -> None:
    """Append a trade log entry."""
    logs = []
    if TRADE_LOG_FILE.exists():
        try:
            with open(TRADE_LOG_FILE) as f:
                logs = json.load(f)
        except (json.JSONDecodeError, OSError):
            logs = []
    entry.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
    logs.append(entry)
    _atomic_write(TRADE_LOG_FILE, logs)


def load_trade_log() -> list[dict]:
    """Load trade log."""
    if TRADE_LOG_FILE.exists():
        try:
            with open(TRADE_LOG_FILE) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    return []


if __name__ == "__main__":
    s = load_state()
    print(f"State loaded: {len(s)} keys")
    print(f"Positions: {len(s.get('positions', {}))}")
    print(f"Watchlist: {s.get('watchlist', [])}")
