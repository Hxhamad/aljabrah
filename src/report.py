"""Research chart, HTML, and PDF report generation."""

from __future__ import annotations

from html import escape
import logging
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from jinja2 import Template


LOGGER = logging.getLogger(__name__)


def _safe_name(ticker: str) -> str:
    return "".join(character for character in ticker if character.isalnum() or character in "-_")


def create_ticker_charts(
    ticker: str,
    returns: pd.DataFrame,
    output_dir: Path,
) -> list[Path]:
    """Create the four required deterministic evidence charts."""

    output_dir.mkdir(parents=True, exist_ok=True)
    safe = _safe_name(ticker)
    paths: list[Path] = []
    plot_frame = returns.dropna(
        subset=["overnight_return", "intraday_return", "close_to_close_return"]
    ).copy()
    if plot_frame.empty:
        return paths

    fig, axis = plt.subplots(figsize=(10, 5.5))
    for column, label in (
        ("overnight_return", "Cumulative overnight"),
        ("intraday_return", "Cumulative intraday"),
        ("close_to_close_return", "Buy and hold"),
    ):
        curve = (1.0 + plot_frame[column]).cumprod() - 1.0
        axis.plot(plot_frame["Date"], curve, label=label, linewidth=1.4)
    axis.axhline(0, color="#555", linewidth=0.7)
    axis.set_title(f"{ticker}: cumulative return components")
    axis.set_ylabel("Cumulative return")
    axis.legend()
    axis.grid(alpha=0.2)
    fig.tight_layout()
    path = output_dir / f"{safe}_cumulative.png"
    fig.savefig(path, dpi=150)
    plt.close(fig)
    paths.append(path)

    fig, axis = plt.subplots(figsize=(10, 4.5))
    rolling = plot_frame["edge_return"].rolling(126, min_periods=126).mean()
    axis.plot(plot_frame["Date"], rolling, color="#5b3cc4", linewidth=1.3)
    axis.axhline(0, color="#555", linewidth=0.8)
    axis.set_title(f"{ticker}: rolling 6-month mean overnight edge")
    axis.set_ylabel("Mean daily edge")
    axis.grid(alpha=0.2)
    fig.tight_layout()
    path = output_dir / f"{safe}_rolling_6m_edge.png"
    fig.savefig(path, dpi=150)
    plt.close(fig)
    paths.append(path)

    fig, axis = plt.subplots(figsize=(8, 4.5))
    values = plot_frame["overnight_return"].replace([np.inf, -np.inf], np.nan).dropna()
    lower, upper = values.quantile([0.01, 0.99])
    clipped = values.clip(lower, upper)
    axis.hist(clipped, bins=50, color="#147d92", alpha=0.85)
    axis.axvline(values.mean(), color="#9c2f2f", linewidth=1.2, label="Mean")
    axis.set_title(f"{ticker}: overnight return distribution (1%-99% clipped)")
    axis.set_xlabel("Overnight return")
    axis.legend()
    axis.grid(alpha=0.15)
    fig.tight_layout()
    path = output_dir / f"{safe}_overnight_histogram.png"
    fig.savefig(path, dpi=150)
    plt.close(fig)
    paths.append(path)

    top = plot_frame.nlargest(20, "overnight_return").sort_values("overnight_return")
    fig, axis = plt.subplots(figsize=(9, 6.5))
    labels = top["Date"].dt.strftime("%Y-%m-%d")
    positions = np.arange(len(top))
    axis.barh(positions, top["overnight_return"], color="#b56b1f")
    axis.set_yticks(positions, labels)
    axis.set_title(f"{ticker}: top 20 overnight gaps")
    axis.set_xlabel("Overnight return")
    axis.grid(axis="x", alpha=0.2)
    fig.tight_layout()
    path = output_dir / f"{safe}_top20_gaps.png"
    fig.savefig(path, dpi=150)
    plt.close(fig)
    paths.append(path)
    return paths


def _format_table(frame: pd.DataFrame, max_rows: int = 100) -> str:
    if frame.empty:
        return "<p class='empty'>No rows.</p>"
    display = frame.head(max_rows).copy()
    for column in display.columns:
        if pd.api.types.is_float_dtype(display[column]):
            display[column] = display[column].map(
                lambda value: "" if pd.isna(value) else f"{value:,.6g}"
            )
    return display.to_html(index=False, border=0, classes="data-table", escape=True)


HTML_TEMPLATE = Template(
    """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Overnight Penny-Stock Research Lab</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; color: #1e2630; background: #f4f6f8; }
    header { background: #152238; color: white; padding: 28px 5vw; }
    main { max-width: 1450px; margin: 0 auto; padding: 24px 4vw 60px; }
    section { background: white; padding: 22px; margin: 18px 0; border-radius: 8px; box-shadow: 0 1px 4px #ccd2d8; }
    h1, h2, h3 { margin-top: 0; }
    .warning { border-left: 6px solid #b94141; background: #fff2f2; padding: 14px; font-weight: bold; }
    .summary { display: flex; flex-wrap: wrap; gap: 14px; }
    .metric { padding: 14px 18px; background: #eef3f8; border-radius: 6px; min-width: 150px; }
    .metric strong { display: block; font-size: 1.5rem; }
    .table-wrap { overflow-x: auto; }
    .data-table { border-collapse: collapse; width: 100%; font-size: 0.82rem; }
    .data-table th, .data-table td { border-bottom: 1px solid #dfe4e8; padding: 7px; text-align: right; white-space: nowrap; }
    .data-table th:first-child, .data-table td:first-child { text-align: left; }
    .data-table th { background: #e9eef3; position: sticky; top: 0; }
    .chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(440px, 1fr)); gap: 14px; }
    .chart-grid img { width: 100%; border: 1px solid #e0e4e8; }
    code, pre { background: #f0f2f4; }
    pre { padding: 14px; overflow-x: auto; }
    .muted { color: #69737e; }
  </style>
</head>
<body>
<header>
  <h1>Overnight Penny-Stock Research Lab</h1>
  <p>Deterministic historical overnight-versus-intraday evidence</p>
</header>
<main>
  <div class="warning">This is research, not investment advice.</div>
  <section>
    <h2>Executive Summary</h2>
    <div class="summary">
      <div class="metric"><strong>{{ universe_count }}</strong>Tickers requested</div>
      <div class="metric"><strong>{{ ranked_count }}</strong>Passed hard screen</div>
      <div class="metric"><strong>{{ rejected_count }}</strong>Rejected or failed</div>
      <div class="metric"><strong>{{ evidence_count }}</strong>SEC evidence matches</div>
    </div>
    <p>{{ outcome_text }}</p>
    <p class="muted">Generated {{ generated_at }}. Ratings are research labels, not recommendations.</p>
  </section>
  <section>
    <h2>Methodology</h2>
    <pre>overnight_return[t] = open[t] / close[t-1] - 1
intraday_return[t] = close[t] / open[t] - 1
close_to_close_return[t] = close[t] / close[t-1] - 1
overnight_edge = mean(overnight_return) - mean(intraday_return)</pre>
    <p>Raw and adjusted OHLC modes are calculated. Adjusted OHLC drives the ranking. Costs are subtracted once per overnight observation. Rolling pass rates are the share of complete windows with a positive mean overnight edge.</p>
  </section>
  <section>
    <h2>Top 20 Ranked Research Candidates</h2>
    <div class="table-wrap">{{ ranked_table }}</div>
  </section>
  <section>
    <h2>Rejected Tickers</h2>
    <div class="table-wrap">{{ rejected_table }}</div>
  </section>
  <section>
    <h2>SEC Risk Evidence</h2>
    <p>Keyword matches identify filings requiring manual review. Absence of a match is not evidence of safety.</p>
    <div class="table-wrap">{{ evidence_table }}</div>
  </section>
  <section>
    <h2>Top Candidate Charts</h2>
    {% for ticker, images in chart_groups.items() %}
      <h3>{{ ticker }}</h3>
      <div class="chart-grid">
      {% for image in images %}<img src="{{ image }}" alt="{{ ticker }} research chart">{% endfor %}
      </div>
    {% endfor %}
    {% if not chart_groups %}<p class="empty">No eligible ticker charts were generated.</p>{% endif %}
  </section>
  <section>
    <h2>Data Limitations</h2>
    <ul>
      <li>yfinance and Stooq are public research sources, not proof-grade market data.</li>
      <li>Low-priced equities are especially vulnerable to reverse splits, ticker changes, sparse prints, bad opens, halts, and outliers.</li>
      <li>The configured universe has survivorship bias and does not reconstruct delisted securities.</li>
      <li>Adjusted-close factors are an imperfect corporate-action reconstruction.</li>
      <li>Free market-cap and company metadata may be missing or stale.</li>
      <li>SEC keyword evidence is not legal, accounting, or investment analysis.</li>
      <li>The simplified cost model excludes spreads, slippage, impact, auction access, and execution constraints.</li>
    </ul>
  </section>
</main>
</body>
</html>"""
)


def render_html_report(
    ranked: pd.DataFrame,
    rejected: pd.DataFrame,
    evidence: pd.DataFrame,
    chart_paths: dict[str, list[Path]],
    output_path: Path,
    universe_count: int,
    generated_at: str,
) -> Path:
    """Render the complete standalone research report."""

    output_path.parent.mkdir(parents=True, exist_ok=True)
    chart_groups = {
        ticker: [f"../charts/{path.name}" for path in paths]
        for ticker, paths in chart_paths.items()
    }
    outcome = (
        f"{len(ranked)} ticker(s) passed all configured eligibility gates."
        if len(ranked)
        else "No ticker passed all configured eligibility gates. Rejection evidence is preserved below."
    )
    html = HTML_TEMPLATE.render(
        universe_count=universe_count,
        ranked_count=len(ranked),
        rejected_count=len(rejected),
        evidence_count=len(evidence),
        generated_at=escape(generated_at),
        outcome_text=escape(outcome),
        ranked_table=_format_table(ranked.head(20)),
        rejected_table=_format_table(rejected),
        evidence_table=_format_table(evidence),
        chart_groups=chart_groups,
    )
    output_path.write_text(html, encoding="utf-8")
    return output_path


def render_pdf_report(
    ranked: pd.DataFrame,
    rejected: pd.DataFrame,
    evidence: pd.DataFrame,
    output_path: Path,
    generated_at: str,
) -> tuple[Path | None, str]:
    """Create a compact PDF summary with ReportLab when available."""

    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import landscape, letter
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError:
        return None, "ReportLab is not installed; open the HTML report and print to PDF."

    output_path.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    story: list[Any] = [
        Paragraph("Overnight Penny-Stock Research Lab", styles["Title"]),
        Paragraph("<b>This is research, not investment advice.</b>", styles["Heading2"]),
        Paragraph(f"Generated {escape(generated_at)}", styles["Normal"]),
        Spacer(1, 0.15 * inch),
        Paragraph(
            f"{len(ranked)} candidate(s) passed the hard screen; "
            f"{len(rejected)} ticker(s) were rejected or failed; "
            f"{len(evidence)} SEC keyword match row(s) were recorded.",
            styles["Normal"],
        ),
        Spacer(1, 0.2 * inch),
        Paragraph("Top Ranked Research Candidates", styles["Heading2"]),
    ]
    columns = [
        "ticker",
        "overnight_theme_score",
        "rating",
        "current_price",
        "overnight_mean",
        "intraday_mean",
        "overnight_edge",
        "edge_after_cost_25bps",
    ]
    available = [column for column in columns if column in ranked.columns]
    table_data = [available] + ranked[available].head(20).fillna("").astype(str).values.tolist()
    table = Table(table_data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dce5ef")),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("FONTSIZE", (0, 0), (-1, -1), 7),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(table)
    story.extend(
        [
            Spacer(1, 0.2 * inch),
            Paragraph("Limitations", styles["Heading2"]),
            Paragraph(
                "Public-source prices and metadata may be missing, stale, or revised. "
                "Penny-stock histories contain survivorship and corporate-action risks. "
                "SEC keyword matching requires manual interpretation. Results are not trading recommendations.",
                styles["Normal"],
            ),
        ]
    )
    document = SimpleDocTemplate(
        str(output_path),
        pagesize=landscape(letter),
        rightMargin=24,
        leftMargin=24,
        topMargin=24,
        bottomMargin=24,
    )
    document.build(story)
    return output_path, "created"
