"""Overnight, intraday, and close-to-close return analytics."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from scipy import stats

from .cost_model import cost_metrics


def cumulative_return(returns: pd.Series) -> float:
    """Geometrically compound a return series."""

    clean = pd.to_numeric(returns, errors="coerce").dropna()
    if clean.empty:
        return float("nan")
    return float((1.0 + clean).prod() - 1.0)


def max_drawdown(returns: pd.Series) -> float:
    """Return the most negative peak-to-trough drawdown."""

    clean = pd.to_numeric(returns, errors="coerce").dropna()
    if clean.empty:
        return float("nan")
    wealth = (1.0 + clean).cumprod()
    return float((wealth / wealth.cummax() - 1.0).min())


def top_positive_contribution(returns: pd.Series, count: int) -> float:
    """Measure how much positive-return mass comes from the largest gaps."""

    positive = pd.to_numeric(returns, errors="coerce").dropna()
    positive = positive[positive > 0]
    denominator = float(positive.sum())
    if denominator <= 0:
        return float("nan")
    return float(positive.nlargest(count).sum() / denominator)


def _distribution_stats(series: pd.Series, prefix: str) -> dict[str, float]:
    clean = pd.to_numeric(series, errors="coerce").dropna()
    count = len(clean)
    if count == 0:
        return {
            f"{prefix}_mean": np.nan,
            f"{prefix}_median": np.nan,
            f"{prefix}_std": np.nan,
            f"{prefix}_win_rate": np.nan,
            f"{prefix}_skew": np.nan,
            f"{prefix}_kurtosis": np.nan,
            f"{prefix}_t_stat": np.nan,
            f"{prefix}_p_value": np.nan,
        }
    if count >= 2 and float(clean.std(ddof=1)) > 0:
        test = stats.ttest_1samp(clean, popmean=0.0, nan_policy="omit")
        t_stat, p_value = float(test.statistic), float(test.pvalue)
    else:
        t_stat, p_value = np.nan, np.nan
    return {
        f"{prefix}_mean": float(clean.mean()),
        f"{prefix}_median": float(clean.median()),
        f"{prefix}_std": float(clean.std(ddof=1)) if count >= 2 else np.nan,
        f"{prefix}_win_rate": float((clean > 0).mean()),
        f"{prefix}_skew": float(stats.skew(clean, bias=False)) if count >= 3 else np.nan,
        f"{prefix}_kurtosis": (
            float(stats.kurtosis(clean, fisher=True, bias=False)) if count >= 4 else np.nan
        ),
        f"{prefix}_t_stat": t_stat,
        f"{prefix}_p_value": p_value,
    }


def calculate_returns(frame: pd.DataFrame, mode: str) -> pd.DataFrame:
    """Calculate all daily return legs for one OHLC mode."""

    if mode == "raw_ohlc":
        open_col, close_col = "Open", "Close"
    elif mode == "split_adjusted_ohlc":
        open_col, close_col = "adj_open", "adj_close"
    else:
        raise ValueError(f"Unsupported calculation mode: {mode}")

    result = frame[["Date", open_col, close_col]].copy()
    result = result.rename(columns={open_col: "mode_open", close_col: "mode_close"})
    previous_close = result["mode_close"].shift(1)
    result["overnight_return"] = result["mode_open"] / previous_close - 1.0
    result["intraday_return"] = result["mode_close"] / result["mode_open"] - 1.0
    result["close_to_close_return"] = result["mode_close"] / previous_close - 1.0
    result["edge_return"] = result["overnight_return"] - result["intraday_return"]
    return result.iloc[1:].reset_index(drop=True)


def _return_shares(overnight: pd.Series, intraday: pd.Series) -> tuple[float, float]:
    aligned = pd.concat([overnight, intraday], axis=1).dropna()
    aligned = aligned[(aligned.iloc[:, 0] > -1) & (aligned.iloc[:, 1] > -1)]
    if aligned.empty:
        return np.nan, np.nan
    overnight_log = float(np.log1p(aligned.iloc[:, 0]).sum())
    intraday_log = float(np.log1p(aligned.iloc[:, 1]).sum())
    total = overnight_log + intraday_log
    if abs(total) < 1e-12:
        return np.nan, np.nan
    return overnight_log / total, intraday_log / total


def rolling_edge_metrics(
    returns: pd.DataFrame, rolling_windows: list[int]
) -> dict[str, float]:
    """Calculate latest rolling means and historical positive-window pass rates."""

    metrics: dict[str, float] = {}
    labels = {63: "3m", 126: "6m", 252: "12m"}
    for window in rolling_windows:
        label = labels.get(int(window), f"{int(window)}d")
        rolling = returns["edge_return"].rolling(int(window), min_periods=int(window)).mean().dropna()
        metrics[f"rolling_{label}_edge_mean"] = float(rolling.iloc[-1]) if len(rolling) else np.nan
        metrics[f"rolling_{label}_pass_rate"] = float((rolling > 0).mean()) if len(rolling) else np.nan
    for label in ("3m", "6m", "12m"):
        metrics.setdefault(f"rolling_{label}_edge_mean", np.nan)
        metrics.setdefault(f"rolling_{label}_pass_rate", np.nan)
    return metrics


def analyze_mode(
    frame: pd.DataFrame,
    mode: str,
    rolling_windows: list[int],
    cost_bps_list: list[float],
) -> tuple[dict[str, Any], pd.DataFrame]:
    """Produce one auditable statistics row and its daily return evidence."""

    returns = calculate_returns(frame, mode)
    valid = returns.dropna(
        subset=["overnight_return", "intraday_return", "close_to_close_return"]
    ).copy()
    stats_row: dict[str, Any] = {
        "mode": mode,
        "days_tested": int(len(valid)),
        "first_date": valid["Date"].min().date().isoformat() if len(valid) else "",
        "last_date": valid["Date"].max().date().isoformat() if len(valid) else "",
    }
    stats_row.update(_distribution_stats(valid["overnight_return"], "overnight"))
    stats_row.update(_distribution_stats(valid["intraday_return"], "intraday"))
    stats_row["overnight_edge"] = stats_row["overnight_mean"] - stats_row["intraday_mean"]
    stats_row["median_edge"] = stats_row["overnight_median"] - stats_row["intraday_median"]
    stats_row["cumulative_overnight"] = cumulative_return(valid["overnight_return"])
    stats_row["cumulative_intraday"] = cumulative_return(valid["intraday_return"])
    stats_row["cumulative_buy_hold"] = cumulative_return(valid["close_to_close_return"])
    overnight_share, intraday_share = _return_shares(
        valid["overnight_return"], valid["intraday_return"]
    )
    stats_row["overnight_share_of_total_return"] = overnight_share
    stats_row["intraday_share_of_total_return"] = intraday_share
    stats_row["max_drawdown_overnight_curve"] = max_drawdown(valid["overnight_return"])
    stats_row["max_drawdown_intraday_curve"] = max_drawdown(valid["intraday_return"])
    stats_row.update(rolling_edge_metrics(valid, rolling_windows))
    stats_row["top_5_overnight_gap_contribution"] = top_positive_contribution(
        valid["overnight_return"], 5
    )
    stats_row["top_10_overnight_gap_contribution"] = top_positive_contribution(
        valid["overnight_return"], 10
    )
    stats_row["top_20_overnight_gap_contribution"] = top_positive_contribution(
        valid["overnight_return"], 20
    )
    stats_row.update(cost_metrics(stats_row["overnight_edge"], cost_bps_list))
    return stats_row, valid
