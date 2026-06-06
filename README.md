# Overnight Penny-Stock Research Lab

Deterministic historical research for identifying small-cap or low-priced equities whose historical overnight returns dominate their intraday returns.

This is research, not investment advice. The project never emits buy, sell, hold, target-price, or recommendation language.

## Install

Python 3.11 is recommended.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run

Run the example universe from `config.yaml`:

```powershell
python -m src.main --config config.yaml
```

Run an explicit universe:

```powershell
python -m src.main --config config.yaml --tickers CXAI BBAI PLUG SOUN KULR
```

Useful options:

```text
--refresh   Ignore cached price and SEC files.
--skip-sec  Skip SEC requests and mark SEC evidence as not checked.
--no-pdf    Generate HTML but skip PDF output.
```

## Add Tickers

Use one of three input styles:

1. Pass symbols after `--tickers`.
2. Edit the `tickers` list in `config.yaml`.
3. Set `universe_mode: csv` and edit `data/universe/manual_candidates.csv`.

The example symbols are research candidates only. Their inclusion is not an assessment of quality or suitability.

## Outputs

- `data/outputs/ranked_candidates.csv`: eligible candidates ranked using adjusted OHLC evidence.
- `data/outputs/ticker_detail_stats.csv`: raw and adjusted statistics for every analyzable ticker.
- `data/outputs/sec_event_evidence.csv`: keyword matches with filing-level evidence.
- `data/outputs/rejected_tickers.csv`: hard-screen and data failures.
- `data/outputs/run_manifest.json`: inputs, versions, data sources, and failures.
- `reports/html/final_report.html`: complete audit report.
- `reports/pdf/final_report.pdf`: PDF report when ReportLab is available.
- `reports/charts/`: top-candidate evidence charts.

## Methodology

For trading day `t`:

```text
overnight_return[t] = open[t] / close[t-1] - 1
intraday_return[t] = close[t] / open[t] - 1
close_to_close_return[t] = close[t] / close[t-1] - 1
```

Both raw and split-adjusted OHLC modes are calculated. Adjusted OHLC is derived from:

```text
adjustment_factor[t] = adjusted_close[t] / close[t]
adjusted_open[t] = open[t] * adjustment_factor[t]
adjusted_close[t] = close[t] * adjustment_factor[t]
```

The adjusted mode drives eligibility and ranking. Raw results remain in the audit output, and material disagreement is flagged as corporate-action sensitivity.

## Data Limitations

- yfinance is a convenient public-data wrapper, not a proof-grade market-data source. Data can be revised, omitted, delayed, rate-limited, or affected by Yahoo schema changes.
- Stooq coverage and symbol conventions are incomplete, especially for delisted or newly listed U.S. securities.
- Free metadata such as market capitalization and sector can be missing or stale.
- Penny-stock history is unusually exposed to reverse splits, offerings, ticker changes, delistings, sparse prints, bad opens, and extreme outliers.
- A present-day ticker list introduces survivorship bias. Delisted securities are not automatically reconstructed.
- Adjusted-close factors may incorporate distributions as well as splits. Raw-versus-adjusted comparison is therefore evidence for manual review, not a perfect corporate-action reconstruction.
- SEC keyword matching is evidence retrieval, not legal or accounting interpretation. Missing evidence means not checked or not found, never safe.
- Statistical significance does not establish causality, persistence, or tradability.
- The cost model is deterministic and simplified. It does not model spread, borrow, slippage, halts, order size, auction access, or market impact.

Results are historical research rankings, not trading recommendations.
