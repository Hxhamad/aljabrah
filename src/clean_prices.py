"""Price normalization, validation, and adjustment-factor construction."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


PRICE_COLUMNS = ["Open", "High", "Low", "Close", "Adj Close", "Volume"]


def _canonical_columns(frame: pd.DataFrame) -> pd.DataFrame:
    """Map common source column spellings to the canonical output schema."""

    aliases = {
        "date": "Date",
        "datetime": "Date",
        "open": "Open",
        "high": "High",
        "low": "Low",
        "close": "Close",
        "adj close": "Adj Close",
        "adj_close": "Adj Close",
        "adjclose": "Adj Close",
        "volume": "Volume",
        "dividends": "Dividends",
        "stock splits": "Stock Splits",
        "stock_splits": "Stock Splits",
    }
    renamed = {}
    for column in frame.columns:
        label = str(column).strip()
        renamed[column] = aliases.get(label.lower(), label)
    return frame.rename(columns=renamed)


def clean_price_data(
    raw: pd.DataFrame,
    ticker: str,
    source: str,
    output_path: Path | None = None,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Create deterministic daily data while retaining data-quality evidence."""

    frame = _canonical_columns(raw.copy())
    if "Date" not in frame.columns:
        if isinstance(frame.index, pd.DatetimeIndex):
            frame = frame.reset_index()
            frame = frame.rename(columns={frame.columns[0]: "Date"})
        else:
            raise ValueError(f"{ticker}: price data has no Date column")

    for column in ["Open", "High", "Low", "Close", "Volume"]:
        if column not in frame.columns:
            raise ValueError(f"{ticker}: missing required price column {column}")
    if "Adj Close" not in frame.columns:
        frame["Adj Close"] = frame["Close"]
    if "Dividends" not in frame.columns:
        frame["Dividends"] = 0.0
    if "Stock Splits" not in frame.columns:
        frame["Stock Splits"] = 0.0

    frame["Date"] = pd.to_datetime(frame["Date"], errors="coerce", utc=True).dt.tz_convert(None).dt.normalize()
    for column in PRICE_COLUMNS + ["Dividends", "Stock Splits"]:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")

    frame = frame.dropna(subset=["Date"]).sort_values("Date")
    duplicate_dates = int(frame.duplicated("Date", keep="last").sum())
    frame = frame.drop_duplicates("Date", keep="last").reset_index(drop=True)

    raw_rows = len(frame)
    missing_open_close = frame[["Open", "Close"]].isna().any(axis=1)
    nonpositive_open_close = (frame["Open"] <= 0) | (frame["Close"] <= 0)
    missing_ratio = (
        float((missing_open_close | nonpositive_open_close.fillna(False)).mean()) if raw_rows else 1.0
    )

    invalid_price = pd.Series(False, index=frame.index)
    for column in ["Open", "High", "Low", "Close", "Adj Close"]:
        invalid_price |= frame[column].isna() | (frame[column] <= 0)
    invalid_price |= frame["Volume"].isna() | (frame["Volume"] < 0)
    invalid_rows = int(invalid_price.sum())
    frame = frame.loc[~invalid_price].copy()

    frame["adj_factor"] = frame["Adj Close"] / frame["Close"]
    bad_factor = ~np.isfinite(frame["adj_factor"]) | (frame["adj_factor"] <= 0)
    frame.loc[bad_factor, "adj_factor"] = 1.0
    frame["adj_open"] = frame["Open"] * frame["adj_factor"]
    frame["adj_close"] = frame["Close"] * frame["adj_factor"]
    frame["ticker"] = ticker
    frame["source"] = source

    ordered = [
        "Date",
        "ticker",
        "source",
        "Open",
        "High",
        "Low",
        "Close",
        "Adj Close",
        "Volume",
        "Dividends",
        "Stock Splits",
        "adj_factor",
        "adj_open",
        "adj_close",
    ]
    frame = frame[ordered].sort_values("Date").reset_index(drop=True)

    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        frame.to_csv(output_path, index=False, date_format="%Y-%m-%d")

    metadata: dict[str, Any] = {
        "raw_rows": raw_rows,
        "clean_rows": len(frame),
        "duplicate_dates_removed": duplicate_dates,
        "invalid_rows_removed": invalid_rows,
        "missing_open_close_ratio": missing_ratio,
        "adjustment_available": bool(source == "yfinance"),
    }
    return frame, metadata


def recent_liquidity(frame: pd.DataFrame, sessions: int = 60) -> dict[str, float]:
    """Calculate current price and trailing-session volume evidence."""

    if frame.empty:
        return {
            "current_price": np.nan,
            "avg_volume_60d": np.nan,
            "avg_dollar_volume_60d": np.nan,
        }
    recent = frame.tail(sessions)
    return {
        "current_price": float(frame["Close"].iloc[-1]),
        "avg_volume_60d": float(recent["Volume"].mean()),
        "avg_dollar_volume_60d": float((recent["Close"] * recent["Volume"]).mean()),
    }
