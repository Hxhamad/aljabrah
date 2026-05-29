Invest Portfolio Template - Saudi/U.S. Deterministic Analytics
==============================================================

This fork extends `petrnohejl/invest-portfolio-template` into a strict Google Sheets and Google Apps Script portfolio analytics workbook for Saudi and U.S. listed stocks.

This phase is **not** an AI stock recommendation tool. The workbook separates manual inputs, approved sources, raw data, calculated metrics, deterministic scores, portfolio risk, AI-ready export data, and a human dashboard. Missing data stays visible.

Architecture
------------

Workbook layers:

- Manual input: `Setup`, `Portfolio`, `Transactions`, `Manual_Signals`
- Source control: `Source_Control`
- Raw data: `Raw_Prices`, `Raw_Fundamentals`
- Calculations: `Metrics_Calculated`, `Technical_Short_Term`
- Scoring: `Long_Term_Score`, `Short_Term_Score`
- Risk: `Portfolio_Risk`
- Future AI export: `AI_Input`
- Human view: `Dashboard`
- Audit support: `Error_Log`, `Validation_Report`

Apps Script files:

- `config.gs` - workbook schema, setup defaults, formatting, dropdowns, sample seeding
- `menu.gs` - `Stock Analytics` custom menu
- `sources.gs` - source tiers, source quality, provider API-key helpers
- `portfolio.gs` - SAR-based portfolio valuation and transaction audit helpers
- `prices.gs` - price provider abstraction, raw price normalization, technical metrics
- `fundamentals.gs` - fundamentals provider abstraction and raw fundamentals normalization
- `metrics.gs` - deterministic CAGR, margin, balance sheet, and valuation metrics
- `scoring_long_term.gs` - long-term deterministic scoring rules
- `scoring_short_term.gs` - short-term deterministic scoring rules
- `risk.gs` - concentration, exposure, and portfolio-level risk dashboard data
- `ai_export_placeholder.gs` - structured AI-ready export, with no AI calls
- `utils.gs` - shared sheet, math, source, setup, and error helpers
- `tests.gs` - workbook validation and scoring helper tests
- `performance.gs.js` - original legacy performance sheet generator, still available

Setup
-----

Recommended `clasp` setup for the live Sheet is documented in [CLASP_SETUP.md](CLASP_SETUP.md).

Manual setup is also possible:

1. Make a copy of the original Google Sheet template or create a blank Google Sheet.
2. Open `Extensions -> Apps Script`.
3. Add the Apps Script files in this repository.
4. Reload the spreadsheet.
5. Use `Stock Analytics -> Initialize Workbook Structure`.
6. Optional: use `Stock Analytics -> Seed Sample Data` to create example rows for:
   - Saudi: `2222` on Tadawul
   - U.S.: `AAPL` on NASDAQ

API keys must not be stored in visible sheet cells. Store them in Apps Script PropertiesService:

```javascript
setProviderApiKey("FMP", "YOUR_FMP_KEY");
setProviderApiKey("EODHD", "YOUR_EODHD_KEY");
setProviderApiKey("SAHMK", "YOUR_SAHMK_KEY");
```

Refresh Workflow
----------------

Use the `Stock Analytics` menu:

- `Refresh Prices`
- `Refresh Fundamentals`
- `Recalculate Metrics`
- `Recalculate Scores`
- `Generate AI Input`
- `Validate Workbook`
- `Show Error Log`

Provider adapters are intentionally conservative. If an approved API key or endpoint is missing, the system logs the issue in `Error_Log` and leaves the affected value missing instead of guessing.

Source Quality
--------------

`Source_Control` assigns deterministic quality scores:

- Tier 1 = `1.00`: exchange data, SEC filings, Tadawul/company filings, audited annual reports
- Tier 2 = `0.85`: SAHMK, FMP, EODHD, Polygon/Massive, structured APIs
- Tier 3 = `0.70`: reputable news, investor relations, analyst estimate APIs
- Tier 4 = `0.25`: blogs, social media, forums, unverified commentary
- Missing source = `0.00`

Low-tier sources are never treated as confirmed fundamental facts.

Scoring
-------

Scores are deterministic. Same inputs produce same outputs.

Long-term scoring weights:

- Business durability 10%
- Moat proxy 10%
- Revenue growth 10%
- Earnings growth 8%
- Free cash flow strength 12%
- Profitability 12%
- Balance sheet 10%
- Shareholder treatment 8%
- Valuation 10%
- Risk penalty 10%

Short-term scoring weights:

- Price trend 15%
- Momentum 12%
- Volume confirmation 10%
- Earnings setup 15%
- Sector strength 10%
- Valuation pressure 8%
- Volatility risk 8%
- News catalyst 10%
- Market direction 7%
- Liquidity 5%

Missing data contributes zero to weighted scores and lowers `Data_Completeness_Score`. It is not replaced with zero, a neutral score, or market averages.

Validation
----------

`validateWorkbook()` writes `Validation_Report` and checks:

- Required tabs and columns
- Valid market labels
- Duplicate or missing `Holding_ID`
- Duplicate or missing `Transaction_ID`
- Portfolio weights close to 100%
- Missing source IDs
- Missing FX rates
- Negative shares
- Missing price data
- Low data completeness
- Source tier score consistency

Tests
-----

Run `runStockAnalyticsTests()` from Apps Script to test the core scoring thresholds.

Current Limitations
-------------------

- Saudi provider adapters are placeholders until an approved SAHMK/Tadawul/company filing endpoint is configured.
- FMP U.S. adapters are implemented for basic price and annual statements, but material facts should be verified against Tier 1 filings.
- Five-year valuation percentile remains `NA` until enough audited historical valuation data is available.
- No buy/sell recommendations are generated.
- No trading execution, scraping, autonomous agent, or OpenAI API call is included.

Future AI Layer
---------------

`AI_Input` is the only AI-facing tab in this phase. A future model should consume that structured data and produce neutral explanations covering data quality, bullish evidence, bearish evidence, missing data, what would change the view, and confidence level.

Original Project
----------------

This work is based on [Petr Nohejl's Invest Portfolio Template](https://github.com/petrnohejl/invest-portfolio-template), including the original Google Sheets template and `performance.gs.js` performance generator.

License
-------

    Copyright 2022 Petr Nohejl

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

        http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
