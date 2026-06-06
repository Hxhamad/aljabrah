"""Command-line orchestration for the overnight research pipeline."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import importlib.metadata
import json
import logging
from pathlib import Path
import sys
from typing import Any

import numpy as np
import pandas as pd
from tqdm import tqdm

from .clean_prices import clean_price_data, recent_liquidity
from .config import ProjectConfig, load_config
from .data_stooq import load_stooq
from .data_yfinance import load_yfinance
from .overnight_intraday import analyze_mode
from .ranking import (
    calculate_score,
    is_corporate_action_sensitive,
    rating_description,
    rating_for_score,
)
from .report import create_ticker_charts, render_html_report, render_pdf_report
from .risk_filters import screen_ticker
from .sec_edgar import EVIDENCE_COLUMNS, SecClient, collect_sec_evidence
from .universe import build_universe


LOGGER = logging.getLogger(__name__)

RANKED_COLUMNS = [
    "ticker",
    "company_name",
    "sector",
    "source",
    "first_date",
    "last_date",
    "days_tested",
    "current_price",
    "market_cap",
    "avg_volume_60d",
    "avg_dollar_volume_60d",
    "overnight_mean",
    "intraday_mean",
    "overnight_median",
    "intraday_median",
    "overnight_std",
    "intraday_std",
    "overnight_win_rate",
    "intraday_win_rate",
    "overnight_edge",
    "median_edge",
    "cumulative_overnight",
    "cumulative_intraday",
    "cumulative_buy_hold",
    "edge_after_cost_5bps",
    "edge_after_cost_10bps",
    "edge_after_cost_25bps",
    "edge_after_cost_50bps",
    "rolling_3m_pass_rate",
    "rolling_6m_pass_rate",
    "rolling_12m_pass_rate",
    "top_10_overnight_gap_contribution",
    "corporate_action_sensitive",
    "sec_recent_risk_count_180d",
    "sec_recent_risk_count_365d",
    "overnight_theme_score",
    "rating",
    "notes",
]

REJECTED_COLUMNS = [
    "ticker",
    "company_name",
    "source",
    "rejection_reason",
    "details",
    "days_tested",
    "current_price",
    "market_cap",
    "avg_volume_60d",
    "avg_dollar_volume_60d",
    "missing_open_close_ratio",
    "top_10_overnight_gap_contribution",
]


def _setup_logging(project_root: Path) -> Path:
    log_path = project_root / "logs" / "research_run.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(logging.INFO)
    console = logging.StreamHandler()
    console.setFormatter(formatter)
    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setFormatter(formatter)
    root.addHandler(console)
    root.addHandler(file_handler)
    return log_path


def _thresholds(config: ProjectConfig) -> dict[str, float]:
    return {
        "max_top10_contribution": float(config.get("reject_if_top10_gap_contribution_above")),
        "min_dollar_volume": float(config.get("min_avg_dollar_volume_60d")),
        "max_missing_ratio": float(config.get("reject_if_missing_open_close_ratio_above")),
    }


def _package_versions() -> dict[str, str]:
    packages = [
        "pandas",
        "numpy",
        "scipy",
        "statsmodels",
        "yfinance",
        "requests",
        "beautifulsoup4",
        "lxml",
        "matplotlib",
        "jinja2",
        "reportlab",
        "tqdm",
        "pyarrow",
        "PyYAML",
        "pytest",
        "nbformat",
    ]
    versions: dict[str, str] = {}
    for package in packages:
        try:
            versions[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            versions[package] = "not installed"
    return versions


def _load_price_source(
    ticker: str,
    config: ProjectConfig,
    refresh: bool,
) -> tuple[pd.DataFrame, dict[str, Any], dict[str, Any]]:
    """Use yfinance first and Stooq when Yahoo fails or lacks required history."""

    yfinance_error = ""
    try:
        raw, metadata = load_yfinance(ticker, config, refresh=refresh)
        cleaned, quality = clean_price_data(raw, ticker, "yfinance")
        if len(cleaned) - 1 >= int(config.get("min_days_required")):
            return raw, metadata, quality
        yfinance_error = (
            f"yfinance returned only {max(len(cleaned) - 1, 0)} valid return observations"
        )
        LOGGER.warning("%s: %s; trying Stooq", ticker, yfinance_error)
    except Exception as exc:
        yfinance_error = str(exc)
        LOGGER.warning("%s: yfinance failed (%s); trying Stooq", ticker, exc)

    try:
        raw, metadata = load_stooq(ticker, config)
        _, quality = clean_price_data(raw, ticker, "stooq")
        metadata["yfinance_error"] = yfinance_error
        return raw, metadata, quality
    except Exception as stooq_exc:
        raise RuntimeError(
            f"yfinance failed or was insufficient: {yfinance_error}; "
            f"Stooq fallback failed: {stooq_exc}"
        ) from stooq_exc


def _notes(stats: dict[str, Any]) -> str:
    notes = [rating_description(str(stats["rating"]))]
    if pd.isna(stats.get("market_cap")):
        notes.append("market cap missing; requires manual review")
    if stats.get("corporate_action_sensitive"):
        notes.append("raw and adjusted modes materially diverge")
    notes.append(f"SEC evidence: {stats.get('sec_status', 'not checked')}")
    return "; ".join(notes)


def _rejected_row(
    ticker: str,
    company_name: str,
    source: str,
    reasons: list[str],
    details: str,
    stats: dict[str, Any] | None = None,
) -> dict[str, Any]:
    stats = stats or {}
    return {
        "ticker": ticker,
        "company_name": company_name,
        "source": source,
        "rejection_reason": ";".join(reasons),
        "details": details,
        "days_tested": stats.get("days_tested", 0),
        "current_price": stats.get("current_price", np.nan),
        "market_cap": stats.get("market_cap", np.nan),
        "avg_volume_60d": stats.get("avg_volume_60d", np.nan),
        "avg_dollar_volume_60d": stats.get("avg_dollar_volume_60d", np.nan),
        "missing_open_close_ratio": stats.get("missing_open_close_ratio", np.nan),
        "top_10_overnight_gap_contribution": stats.get(
            "top_10_overnight_gap_contribution", np.nan
        ),
    }


def run_pipeline(
    config: ProjectConfig,
    cli_tickers: list[str] | None = None,
    refresh: bool = False,
    skip_sec: bool = False,
    no_pdf: bool = False,
) -> dict[str, Any]:
    """Run the complete deterministic pipeline and return output paths."""

    project_root = config.project_root
    log_path = _setup_logging(project_root)
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    universe = build_universe(config, cli_tickers)
    LOGGER.info("Starting research run for %d ticker(s)", len(universe))

    output_dir = project_root / "data" / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)
    cleaned_dir = project_root / "data" / "cleaned_prices"
    chart_dir = project_root / "reports" / "charts"

    ranked_rows: list[dict[str, Any]] = []
    detail_rows: list[dict[str, Any]] = []
    rejected_rows: list[dict[str, Any]] = []
    evidence_frames: list[pd.DataFrame] = []
    adjusted_returns: dict[str, pd.DataFrame] = {}
    sources: dict[str, str] = {}
    failures: dict[str, str] = {}
    sec_client = None if skip_sec else SecClient(config, refresh=refresh)
    thresholds = _thresholds(config)

    progress_enabled = bool(getattr(sys.stderr, "isatty", lambda: False)())
    for candidate in tqdm(
        universe.to_dict("records"),
        desc="Researching tickers",
        disable=not progress_enabled,
    ):
        ticker = str(candidate["ticker"])
        company_hint = str(candidate.get("company", ""))
        try:
            raw, source_metadata, _ = _load_price_source(ticker, config, refresh)
            source = str(source_metadata["source"])
            sources[ticker] = source
            cleaned, quality = clean_price_data(
                raw,
                ticker,
                source,
                cleaned_dir / f"{ticker}.csv",
            )
            liquidity = recent_liquidity(cleaned)
            common = {
                "ticker": ticker,
                "company_name": source_metadata.get("company_name") or company_hint,
                "sector": source_metadata.get("sector") or candidate.get("sector", ""),
                "source": source,
                "market_cap": pd.to_numeric(source_metadata.get("market_cap"), errors="coerce"),
                **liquidity,
                **quality,
            }

            raw_stats, raw_returns = analyze_mode(
                cleaned,
                "raw_ohlc",
                list(config.get("rolling_windows")),
                list(config.get("cost_bps_list")),
            )
            adjusted_stats, adjusted_daily = analyze_mode(
                cleaned,
                "split_adjusted_ohlc",
                list(config.get("rolling_windows")),
                list(config.get("cost_bps_list")),
            )
            raw_stats.update(common)
            adjusted_stats.update(common)

            preliminary_raw = calculate_score(raw_stats, thresholds)
            preliminary_adjusted = calculate_score(adjusted_stats, thresholds)
            sensitive = is_corporate_action_sensitive(
                raw_stats,
                adjusted_stats,
                edge_diff_bps=float(config.get("corporate_action_edge_diff_bps")),
                cumulative_diff=float(config.get("corporate_action_cumulative_diff")),
                score_diff=float(config.get("corporate_action_score_diff")),
                raw_score=preliminary_raw,
                adjusted_score=preliminary_adjusted,
            )
            raw_stats["corporate_action_sensitive"] = sensitive
            adjusted_stats["corporate_action_sensitive"] = sensitive

            sec_summary = {
                "sec_status": "not checked",
                "sec_recent_risk_count_180d": 0,
                "sec_recent_risk_count_365d": 0,
            }
            if sec_client is not None:
                try:
                    evidence, sec_summary = collect_sec_evidence(
                        ticker, config, sec_client
                    )
                    if not evidence.empty:
                        evidence_frames.append(evidence)
                except Exception as exc:
                    sec_summary["sec_status"] = "not checked"
                    sec_summary["sec_error"] = str(exc)
                    LOGGER.warning("%s: SEC evidence unavailable: %s", ticker, exc)

            for stats in (raw_stats, adjusted_stats):
                stats.update(sec_summary)
                stats["overnight_theme_score"] = calculate_score(stats, thresholds)
                stats["rating"] = rating_for_score(stats["overnight_theme_score"])
                detail_rows.append(stats.copy())

            adjusted_stats["notes"] = _notes(adjusted_stats)
            reasons = screen_ticker(adjusted_stats, config)
            if reasons:
                rejected_rows.append(
                    _rejected_row(
                        ticker,
                        str(adjusted_stats["company_name"]),
                        source,
                        reasons,
                        "Hard eligibility gate failed; statistics remain in ticker_detail_stats.csv",
                        adjusted_stats,
                    )
                )
            else:
                ranked_rows.append(adjusted_stats.copy())
                adjusted_returns[ticker] = adjusted_daily
        except Exception as exc:
            message = str(exc)
            failures[ticker] = message
            LOGGER.exception("%s: ticker pipeline failed", ticker)
            rejected_rows.append(
                _rejected_row(
                    ticker,
                    company_hint,
                    sources.get(ticker, ""),
                    ["download_failed"],
                    message,
                )
            )

    ranked = pd.DataFrame(ranked_rows)
    if ranked.empty:
        ranked = pd.DataFrame(columns=RANKED_COLUMNS)
    else:
        for column in RANKED_COLUMNS:
            if column not in ranked.columns:
                ranked[column] = np.nan
        ranked = ranked.sort_values(
            ["overnight_theme_score", "overnight_edge", "days_tested", "ticker"],
            ascending=[False, False, False, True],
        )[RANKED_COLUMNS]

    details = pd.DataFrame(detail_rows)
    if not details.empty:
        leading = ["ticker", "mode", "source", "company_name", "sector"]
        details = details[leading + [column for column in details.columns if column not in leading]]
        details = details.sort_values(["ticker", "mode"])

    rejected = pd.DataFrame(rejected_rows, columns=REJECTED_COLUMNS)
    rejected = rejected.sort_values("ticker") if not rejected.empty else rejected
    evidence = (
        pd.concat(evidence_frames, ignore_index=True).drop_duplicates()
        if evidence_frames
        else pd.DataFrame(columns=EVIDENCE_COLUMNS)
    )
    if not evidence.empty:
        evidence = evidence.sort_values(["filing_date", "ticker"], ascending=[False, True])

    ranked_path = output_dir / "ranked_candidates.csv"
    detail_path = output_dir / "ticker_detail_stats.csv"
    evidence_path = output_dir / "sec_event_evidence.csv"
    rejected_path = output_dir / "rejected_tickers.csv"
    ranked.to_csv(ranked_path, index=False)
    details.to_csv(detail_path, index=False)
    evidence.to_csv(evidence_path, index=False)
    rejected.to_csv(rejected_path, index=False)

    chart_paths: dict[str, list[Path]] = {}
    for ticker in ranked.head(10)["ticker"].tolist():
        chart_paths[ticker] = create_ticker_charts(
            ticker, adjusted_returns[ticker], chart_dir
        )

    html_path = render_html_report(
        ranked,
        rejected,
        evidence,
        chart_paths,
        project_root / "reports" / "html" / "final_report.html",
        universe_count=len(universe),
        generated_at=generated_at,
    )
    pdf_path = None
    pdf_status = "skipped by --no-pdf"
    if not no_pdf:
        pdf_path, pdf_status = render_pdf_report(
            ranked,
            rejected,
            evidence,
            project_root / "reports" / "pdf" / "final_report.pdf",
            generated_at,
        )
    if pdf_path is None:
        LOGGER.warning("PDF not created: %s", pdf_status)

    manifest = {
        "generated_at_utc": generated_at,
        "status": "completed",
        "config_path": str(config.config_path),
        "configuration": config.values,
        "universe": universe["ticker"].tolist(),
        "sources": sources,
        "failures": failures,
        "package_versions": _package_versions(),
        "outputs": {
            "ranked_candidates": str(ranked_path),
            "ticker_detail_stats": str(detail_path),
            "sec_event_evidence": str(evidence_path),
            "rejected_tickers": str(rejected_path),
            "html_report": str(html_path),
            "pdf_report": str(pdf_path) if pdf_path else None,
            "pdf_status": pdf_status,
            "log": str(log_path),
        },
        "counts": {
            "requested": len(universe),
            "ranked": len(ranked),
            "rejected": len(rejected),
            "sec_evidence_rows": len(evidence),
        },
    }
    manifest_path = output_dir / "run_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, default=str), encoding="utf-8")
    LOGGER.info(
        "Run completed: %d ranked, %d rejected, %d SEC evidence rows",
        len(ranked),
        len(rejected),
        len(evidence),
    )
    return {"manifest": manifest_path, **manifest["outputs"]}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Deterministic overnight-versus-intraday equity research"
    )
    parser.add_argument("--config", default="config.yaml", help="Path to config YAML")
    parser.add_argument("--tickers", nargs="+", help="Override the configured universe")
    parser.add_argument("--refresh", action="store_true", help="Refresh cached public data")
    parser.add_argument("--skip-sec", action="store_true", help="Skip SEC evidence retrieval")
    parser.add_argument("--no-pdf", action="store_true", help="Skip PDF generation")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        config = load_config(args.config)
        outputs = run_pipeline(
            config,
            cli_tickers=args.tickers,
            refresh=args.refresh,
            skip_sec=args.skip_sec,
            no_pdf=args.no_pdf,
        )
        print(json.dumps({key: str(value) for key, value in outputs.items()}, indent=2))
        return 0
    except Exception as exc:
        logging.basicConfig(level=logging.ERROR)
        LOGGER.exception("Fatal pipeline error")
        print(f"Fatal error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
