"""Configuration loading and validation."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import yaml


REQUIRED_KEYS = {
    "start_date",
    "min_days_required",
    "price_min",
    "price_max",
    "market_cap_max",
    "min_avg_dollar_volume_60d",
    "min_avg_volume_60d",
    "cost_bps_list",
    "rolling_windows",
    "reject_if_top10_gap_contribution_above",
    "reject_if_missing_open_close_ratio_above",
    "sec_forms_to_check",
    "sec_keywords",
    "user_agent",
}


@dataclass(frozen=True)
class ProjectConfig:
    """Validated project configuration with resolved project-relative paths."""

    values: dict[str, Any]
    project_root: Path
    config_path: Path

    def get(self, key: str, default: Any = None) -> Any:
        return self.values.get(key, default)

    def path(self, key: str) -> Path:
        value = Path(str(self.values[key]))
        return value if value.is_absolute() else self.project_root / value

    @property
    def end_date(self) -> str:
        return str(self.get("end_date") or date.today().isoformat())


def load_config(path: str | Path) -> ProjectConfig:
    """Load YAML configuration and fail clearly on invalid research settings."""

    config_path = Path(path).resolve()
    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_path}")

    with config_path.open("r", encoding="utf-8") as handle:
        values = yaml.safe_load(handle) or {}
    if not isinstance(values, dict):
        raise ValueError("config.yaml must contain a top-level mapping")

    missing = sorted(REQUIRED_KEYS.difference(values))
    if missing:
        raise ValueError(f"Missing required configuration keys: {', '.join(missing)}")

    if float(values["price_min"]) >= float(values["price_max"]):
        raise ValueError("price_min must be less than price_max")
    if int(values["min_days_required"]) < 2:
        raise ValueError("min_days_required must be at least 2")
    if not values["rolling_windows"] or any(int(v) < 2 for v in values["rolling_windows"]):
        raise ValueError("rolling_windows must contain integers of at least 2")
    if not values["cost_bps_list"] or any(float(v) < 0 for v in values["cost_bps_list"]):
        raise ValueError("cost_bps_list must contain non-negative values")
    required_windows = {63, 126, 252}
    if not required_windows.issubset({int(value) for value in values["rolling_windows"]}):
        raise ValueError("rolling_windows must include 63, 126, and 252")
    required_costs = {5.0, 10.0, 25.0, 50.0}
    if not required_costs.issubset({float(value) for value in values["cost_bps_list"]}):
        raise ValueError("cost_bps_list must include 5, 10, 25, and 50")
    if "@" not in str(values["user_agent"]):
        raise ValueError("user_agent must identify a contact email for SEC access")

    values.setdefault("universe_mode", "config")
    values.setdefault("manual_candidates_csv", "data/universe/manual_candidates.csv")
    values.setdefault("corporate_action_edge_diff_bps", 25)
    values.setdefault("corporate_action_cumulative_diff", 0.25)
    values.setdefault("corporate_action_score_diff", 10)
    values.setdefault("sec_request_delay_seconds", 0.12)
    values.setdefault("sec_max_documents_per_ticker", 20)
    values.setdefault("request_timeout_seconds", 30)
    values.setdefault("request_retries", 3)

    return ProjectConfig(values=values, project_root=config_path.parent, config_path=config_path)
