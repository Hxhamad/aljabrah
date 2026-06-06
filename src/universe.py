"""Ticker universe construction."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

import pandas as pd

from .config import ProjectConfig


UNIVERSE_COLUMNS = ["ticker", "company", "sector", "notes"]


def normalize_tickers(tickers: Iterable[str]) -> list[str]:
    """Normalize, de-duplicate, and sort tickers while preserving first occurrence."""

    seen: set[str] = set()
    normalized: list[str] = []
    for raw in tickers:
        ticker = str(raw).strip().upper()
        if ticker and ticker not in seen:
            seen.add(ticker)
            normalized.append(ticker)
    return normalized


def load_manual_candidates(path: Path) -> pd.DataFrame:
    """Load the documented local universe CSV format."""

    if not path.exists():
        raise FileNotFoundError(f"Manual candidate CSV not found: {path}")
    frame = pd.read_csv(path, dtype=str).fillna("")
    missing = [column for column in UNIVERSE_COLUMNS if column not in frame.columns]
    if missing:
        raise ValueError(f"Manual candidate CSV missing columns: {', '.join(missing)}")
    frame = frame[UNIVERSE_COLUMNS].copy()
    frame["ticker"] = frame["ticker"].str.strip().str.upper()
    frame = frame[frame["ticker"] != ""].drop_duplicates("ticker", keep="first")
    return frame.reset_index(drop=True)


def build_universe(config: ProjectConfig, cli_tickers: list[str] | None = None) -> pd.DataFrame:
    """Build the research universe with CLI tickers taking precedence."""

    if cli_tickers:
        tickers = normalize_tickers(cli_tickers)
        return pd.DataFrame(
            {
                "ticker": tickers,
                "company": "",
                "sector": "",
                "notes": "CLI research candidate",
            }
        )

    mode = str(config.get("universe_mode", "config")).lower()
    if mode == "csv":
        return load_manual_candidates(config.path("manual_candidates_csv"))
    if mode != "config":
        raise ValueError("universe_mode must be either 'config' or 'csv'")

    tickers = normalize_tickers(config.get("tickers", []))
    if not tickers:
        raise ValueError("No tickers configured")
    return pd.DataFrame(
        {
            "ticker": tickers,
            "company": "",
            "sector": "",
            "notes": "Config example research candidate",
        }
    )
