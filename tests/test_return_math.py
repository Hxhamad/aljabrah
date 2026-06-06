from __future__ import annotations

import numpy as np
import pandas as pd

from src.clean_prices import clean_price_data
from src.cost_model import edge_after_cost
from src.overnight_intraday import (
    analyze_mode,
    calculate_returns,
    cumulative_return,
    rolling_edge_metrics,
)


def artificial_prices() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "Date": pd.date_range("2024-01-02", periods=4, freq="B"),
            "Open": [10.0, 11.0, 10.0, 12.0],
            "High": [11.0, 12.0, 12.0, 13.0],
            "Low": [9.0, 9.0, 9.5, 11.0],
            "Close": [10.0, 10.0, 11.0, 12.0],
            "Adj Close": [10.0, 10.0, 11.0, 12.0],
            "Volume": [1000, 1200, 1400, 1600],
        }
    )


def test_return_formulas() -> None:
    cleaned, _ = clean_price_data(artificial_prices(), "TEST", "yfinance")
    returns = calculate_returns(cleaned, "raw_ohlc")
    assert np.isclose(returns.loc[0, "overnight_return"], 0.10)
    assert np.isclose(returns.loc[0, "intraday_return"], 10.0 / 11.0 - 1.0)
    assert np.isclose(returns.loc[1, "close_to_close_return"], 0.10)


def test_cumulative_and_cost_formulas() -> None:
    returns = pd.Series([0.10, -0.05])
    assert np.isclose(cumulative_return(returns), 1.10 * 0.95 - 1.0)
    assert np.isclose(edge_after_cost(0.004, 25), 0.0015)


def test_split_adjustment_changes_overnight_not_intraday() -> None:
    frame = artificial_prices()
    frame.loc[1:, "Adj Close"] = frame.loc[1:, "Close"] * 0.5
    cleaned, _ = clean_price_data(frame, "TEST", "yfinance")
    raw = calculate_returns(cleaned, "raw_ohlc")
    adjusted = calculate_returns(cleaned, "split_adjusted_ohlc")
    assert not np.isclose(raw.loc[0, "overnight_return"], adjusted.loc[0, "overnight_return"])
    assert np.isclose(raw.loc[1, "intraday_return"], adjusted.loc[1, "intraday_return"])


def test_cleaner_records_malformed_rows() -> None:
    frame = artificial_prices()
    frame.loc[1, "Open"] = 0
    frame = pd.concat([frame, frame.iloc[[2]]], ignore_index=True)
    _, quality = clean_price_data(frame, "TEST", "yfinance")
    assert quality["duplicate_dates_removed"] == 1
    assert quality["invalid_rows_removed"] == 1
    assert quality["missing_open_close_ratio"] > 0


def test_rolling_metrics_and_complete_analysis() -> None:
    frame = artificial_prices()
    cleaned, _ = clean_price_data(frame, "TEST", "yfinance")
    stats, daily = analyze_mode(cleaned, "raw_ohlc", [2], [5, 10, 25, 50])
    rolling = rolling_edge_metrics(daily, [2])
    assert stats["days_tested"] == 3
    assert "rolling_2d_pass_rate" in rolling
    assert "edge_after_cost_25bps" in stats
