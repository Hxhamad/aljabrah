"""Overnight-theme score and rating rules."""

from __future__ import annotations

from typing import Any

import math


def _number(stats: dict[str, Any], key: str, default: float = 0.0) -> float:
    value = stats.get(key, default)
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


def calculate_score(stats: dict[str, Any], thresholds: dict[str, float]) -> float:
    """Calculate the deterministic 0-100 OvernightThemeScore."""

    score = 0.0
    if _number(stats, "overnight_mean") > 0:
        score += 25
    if _number(stats, "intraday_mean") < 0:
        score += 20
    score += max(0.0, min(20.0, _number(stats, "overnight_edge") / 0.01 * 20.0))
    if _number(stats, "overnight_median") > 0:
        score += 10
    if _number(stats, "intraday_median") < 0:
        score += 10
    if _number(stats, "rolling_6m_pass_rate") > 0.60:
        score += 10
    if _number(stats, "rolling_12m_pass_rate") > 0.60:
        score += 5

    concentration = _number(stats, "top_10_overnight_gap_contribution", default=1.0)
    if concentration > float(thresholds["max_top10_contribution"]):
        score -= 20
    if _number(stats, "edge_after_cost_25bps") <= 0:
        score -= 15
    if _number(stats, "avg_dollar_volume_60d") < float(thresholds["min_dollar_volume"]):
        score -= 15
    if _number(stats, "missing_open_close_ratio", default=1.0) > float(
        thresholds["max_missing_ratio"]
    ):
        score -= 10
    if bool(stats.get("corporate_action_sensitive", False)):
        score -= 10

    count_180 = int(_number(stats, "sec_recent_risk_count_180d"))
    count_365 = int(_number(stats, "sec_recent_risk_count_365d"))
    if count_180 > 0:
        score -= 20
    elif count_365 > 0:
        score -= 10
    return round(max(0.0, min(100.0, score)), 4)


def rating_for_score(score: float, usable: bool = True) -> str:
    """Map an evidence score to the documented research-only label."""

    if not usable:
        return "F"
    if score >= 80:
        return "A"
    if score >= 65:
        return "B"
    if score >= 50:
        return "C"
    return "D"


def rating_description(rating: str) -> str:
    return {
        "A": "Strong statistical overnight theme, but still research-only",
        "B": "Moderate overnight theme",
        "C": "Weak or unstable theme",
        "D": "Fails key tests",
        "F": "Bad data / insufficient evidence",
    }[rating]


def is_corporate_action_sensitive(
    raw_stats: dict[str, Any],
    adjusted_stats: dict[str, Any],
    edge_diff_bps: float = 25,
    cumulative_diff: float = 0.25,
    score_diff: float = 10,
    raw_score: float | None = None,
    adjusted_score: float | None = None,
) -> bool:
    """Flag material raw-versus-adjusted divergence."""

    edge_diff = abs(
        _number(raw_stats, "overnight_edge") - _number(adjusted_stats, "overnight_edge")
    )
    cumulative = abs(
        _number(raw_stats, "cumulative_overnight")
        - _number(adjusted_stats, "cumulative_overnight")
    )
    score_delta = (
        abs(float(raw_score) - float(adjusted_score))
        if raw_score is not None and adjusted_score is not None
        else 0.0
    )
    return bool(
        edge_diff >= float(edge_diff_bps) / 10_000.0
        or cumulative >= float(cumulative_diff)
        or score_delta >= float(score_diff)
    )
