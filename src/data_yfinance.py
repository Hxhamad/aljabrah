"""Yahoo Finance acquisition through the free yfinance library."""

from __future__ import annotations

from datetime import date, datetime, timedelta
import json
import logging
from pathlib import Path
from typing import Any

import pandas as pd

from .config import ProjectConfig


LOGGER = logging.getLogger(__name__)


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    try:
        return float(value)
    except (TypeError, ValueError):
        return str(value)


def _flatten_download(frame: pd.DataFrame, ticker: str) -> pd.DataFrame:
    if isinstance(frame.columns, pd.MultiIndex):
        if ticker in frame.columns.get_level_values(-1):
            frame = frame.xs(ticker, axis=1, level=-1, drop_level=True)
        else:
            frame.columns = [
                " ".join(str(part) for part in column if str(part)).strip()
                for column in frame.columns
            ]
    frame = frame.reset_index()
    if "Datetime" in frame.columns and "Date" not in frame.columns:
        frame = frame.rename(columns={"Datetime": "Date"})
    return frame


def _metadata_from_ticker(ticker_object: Any) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "company_name": "",
        "sector": "",
        "market_cap": None,
        "metadata_status": "not found",
    }
    try:
        info = ticker_object.get_info() or {}
        metadata.update(
            {
                "company_name": info.get("longName") or info.get("shortName") or "",
                "sector": info.get("sector") or "",
                "market_cap": info.get("marketCap"),
                "exchange": info.get("exchange") or "",
                "currency": info.get("currency") or "",
                "metadata_status": "checked",
            }
        )
    except Exception as exc:  # yfinance metadata is less reliable than price history
        LOGGER.warning("Ticker metadata lookup failed: %s", exc)
    if metadata["market_cap"] is None:
        try:
            fast = ticker_object.fast_info
            metadata["market_cap"] = fast.get("market_cap")
        except Exception:
            pass
    return {key: _json_safe(value) for key, value in metadata.items()}


def load_yfinance(
    ticker: str,
    config: ProjectConfig,
    refresh: bool = False,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Load one ticker from cache or yfinance, preserving downloaded values."""

    raw_path = config.project_root / "data" / "raw_prices" / f"{ticker}.csv"
    metadata_path = config.project_root / "data" / "raw_prices" / f"{ticker}_metadata.json"
    cached_metadata = {}
    if metadata_path.exists():
        cached_metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if raw_path.exists() and not refresh and cached_metadata.get("source") == "yfinance":
        frame = pd.read_csv(raw_path)
        metadata = cached_metadata
        metadata.update({"source": "yfinance", "cache_used": True})
        return frame, metadata

    try:
        import yfinance as yf
    except ImportError as exc:
        raise RuntimeError("yfinance is not installed; run pip install -r requirements.txt") from exc

    start = str(config.get("start_date"))
    configured_end = pd.Timestamp(config.end_date)
    inclusive_end = (configured_end + timedelta(days=1)).date().isoformat()
    LOGGER.info("Downloading %s from yfinance (%s to %s inclusive)", ticker, start, config.end_date)
    frame = yf.download(
        ticker,
        start=start,
        end=inclusive_end,
        interval="1d",
        auto_adjust=False,
        actions=True,
        progress=False,
        threads=False,
        timeout=float(config.get("request_timeout_seconds", 30)),
        multi_level_index=False,
    )
    if frame is None or frame.empty:
        raise ValueError(f"{ticker}: yfinance returned no price rows")
    frame = _flatten_download(frame, ticker)

    raw_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = raw_path.with_suffix(".tmp")
    frame.to_csv(temp_path, index=False)
    temp_path.replace(raw_path)

    metadata = _metadata_from_ticker(yf.Ticker(ticker))
    metadata.update(
        {
            "ticker": ticker,
            "source": "yfinance",
            "cache_used": False,
            "downloaded_at_utc": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
            "rows": len(frame),
        }
    )
    metadata_path.write_text(json.dumps(metadata, indent=2, sort_keys=True), encoding="utf-8")
    return frame, metadata
