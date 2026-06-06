from __future__ import annotations

from pathlib import Path

from src.config import ProjectConfig
from src.ranking import (
    calculate_score,
    is_corporate_action_sensitive,
    rating_for_score,
)
from src.risk_filters import screen_ticker
from src.sec_edgar import risk_category_for_keyword


THRESHOLDS = {
    "max_top10_contribution": 0.70,
    "min_dollar_volume": 1_000_000,
    "max_missing_ratio": 0.05,
}


def strong_stats() -> dict:
    return {
        "overnight_mean": 0.006,
        "intraday_mean": -0.004,
        "overnight_edge": 0.010,
        "overnight_median": 0.001,
        "intraday_median": -0.001,
        "rolling_6m_pass_rate": 0.9,
        "rolling_12m_pass_rate": 0.8,
        "top_10_overnight_gap_contribution": 0.4,
        "edge_after_cost_25bps": 0.0075,
        "avg_dollar_volume_60d": 5_000_000,
        "missing_open_close_ratio": 0,
        "corporate_action_sensitive": False,
        "sec_recent_risk_count_180d": 0,
        "sec_recent_risk_count_365d": 0,
    }


def test_strong_pattern_scores_high() -> None:
    score = calculate_score(strong_stats(), THRESHOLDS)
    assert score >= 80
    assert rating_for_score(score) == "A"


def test_concentration_penalty_is_applied() -> None:
    base = strong_stats()
    concentrated = {**base, "top_10_overnight_gap_contribution": 0.9}
    assert calculate_score(base, THRESHOLDS) - calculate_score(
        concentrated, THRESHOLDS
    ) == 20


def test_sec_penalties_do_not_stack() -> None:
    recent = {**strong_stats(), "sec_recent_risk_count_180d": 1, "sec_recent_risk_count_365d": 2}
    older = {**strong_stats(), "sec_recent_risk_count_180d": 0, "sec_recent_risk_count_365d": 2}
    assert calculate_score(older, THRESHOLDS) - calculate_score(recent, THRESHOLDS) == 10


def test_corporate_action_sensitivity_thresholds() -> None:
    raw = {"overnight_edge": 0.001, "cumulative_overnight": 0.10}
    adjusted = {"overnight_edge": 0.004, "cumulative_overnight": 0.10}
    assert is_corporate_action_sensitive(raw, adjusted)


def test_risk_keyword_categories() -> None:
    assert risk_category_for_keyword("reverse split") == "reverse_split"
    assert risk_category_for_keyword("registered direct offering") == "dilution"
    assert risk_category_for_keyword("convertible note") == "warrants_convertibles"
    assert risk_category_for_keyword("going concern") == "going_concern"


def test_hard_screen_reasons() -> None:
    values = {
        "min_days_required": 252,
        "reject_if_missing_open_close_ratio_above": 0.05,
        "price_min": 0.10,
        "price_max": 5.00,
        "market_cap_max": 1_000_000_000,
        "min_avg_volume_60d": 500_000,
        "min_avg_dollar_volume_60d": 1_000_000,
        "reject_if_top10_gap_contribution_above": 0.70,
    }
    config = ProjectConfig(values, Path("."), Path("config.yaml"))
    stats = {
        "days_tested": 100,
        "missing_open_close_ratio": 0.1,
        "current_price": 8,
        "market_cap": 2_000_000_000,
        "avg_volume_60d": 100,
        "avg_dollar_volume_60d": 100,
        "top_10_overnight_gap_contribution": 0.9,
    }
    reasons = screen_ticker(stats, config)
    assert {
        "insufficient_days",
        "missing_data",
        "price_filter",
        "market_cap_filter",
        "volume_filter",
        "concentration_filter",
    }.issubset(reasons)
