"""Hard eligibility screens and auditable rejection reasons."""

from __future__ import annotations

from typing import Any

import math

from .config import ProjectConfig


def _finite(value: Any) -> bool:
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


def screen_ticker(stats: dict[str, Any], config: ProjectConfig) -> list[str]:
    """Return all applicable hard-screen rejection reasons."""

    reasons: list[str] = []
    if int(stats.get("days_tested", 0)) < int(config.get("min_days_required")):
        reasons.append("insufficient_days")

    missing_ratio = stats.get("missing_open_close_ratio")
    if not _finite(missing_ratio):
        reasons.append("missing_data")
    elif float(missing_ratio) > float(config.get("reject_if_missing_open_close_ratio_above")):
        reasons.append("missing_data")

    current_price = stats.get("current_price")
    if not _finite(current_price):
        reasons.append("missing_data")
    elif not float(config.get("price_min")) <= float(current_price) <= float(
        config.get("price_max")
    ):
        reasons.append("price_filter")

    market_cap = stats.get("market_cap")
    if _finite(market_cap) and float(market_cap) > float(config.get("market_cap_max")):
        reasons.append("market_cap_filter")

    avg_volume = stats.get("avg_volume_60d")
    avg_dollar_volume = stats.get("avg_dollar_volume_60d")
    if (
        not _finite(avg_volume)
        or not _finite(avg_dollar_volume)
        or float(avg_volume) < float(config.get("min_avg_volume_60d"))
        or float(avg_dollar_volume) < float(config.get("min_avg_dollar_volume_60d"))
    ):
        reasons.append("volume_filter")

    concentration = stats.get("top_10_overnight_gap_contribution")
    if not _finite(concentration):
        reasons.append("bad_data")
    elif float(concentration) > float(config.get("reject_if_top10_gap_contribution_above")):
        reasons.append("concentration_filter")

    return list(dict.fromkeys(reasons))
