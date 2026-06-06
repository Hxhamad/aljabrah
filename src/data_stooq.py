"""Optional Stooq CSV fallback for U.S. daily price history."""

from __future__ import annotations

from datetime import datetime
import json
import logging
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import pandas as pd
import requests

from .config import ProjectConfig


LOGGER = logging.getLogger(__name__)


def load_stooq(
    ticker: str,
    config: ProjectConfig,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Attempt Stooq without allowing coverage failures to terminate the run."""

    parameters = {
        "s": f"{ticker.lower()}.us",
        "d1": str(config.get("start_date")).replace("-", ""),
        "d2": config.end_date.replace("-", ""),
        "i": "d",
    }
    url = "https://stooq.com/q/d/l/?" + urlencode(parameters)
    LOGGER.info("Trying Stooq fallback for %s", ticker)
    response = requests.get(
        url,
        timeout=float(config.get("request_timeout_seconds", 30)),
        headers={"User-Agent": "overnight-penny-stock-research-lab/1.0"},
    )
    response.raise_for_status()
    text = response.text.strip()
    if not text or "No data" in text or text.lower().startswith("get"):
        raise ValueError(f"{ticker}: Stooq has no usable data")

    from io import StringIO

    frame = pd.read_csv(StringIO(text))
    required = {"Date", "Open", "High", "Low", "Close", "Volume"}
    if frame.empty or not required.issubset(frame.columns):
        raise ValueError(f"{ticker}: Stooq response is not a valid daily OHLCV CSV")
    frame["Adj Close"] = frame["Close"]
    frame["Dividends"] = 0.0
    frame["Stock Splits"] = 0.0

    raw_path = config.project_root / "data" / "raw_prices" / f"{ticker}.csv"
    metadata_path = config.project_root / "data" / "raw_prices" / f"{ticker}_metadata.json"
    temp_path = raw_path.with_suffix(".tmp")
    frame.to_csv(temp_path, index=False)
    temp_path.replace(raw_path)
    metadata = {
        "ticker": ticker,
        "source": "stooq",
        "cache_used": False,
        "downloaded_at_utc": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "rows": len(frame),
        "company_name": "",
        "sector": "",
        "market_cap": None,
        "metadata_status": "not found",
        "adjustment_note": "Stooq fallback has no separate adjusted-close factor",
        "url": url,
    }
    metadata_path.write_text(json.dumps(metadata, indent=2, sort_keys=True), encoding="utf-8")
    return frame, metadata
