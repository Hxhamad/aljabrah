# Changelog

## 2026-05-29 - Deterministic Saudi/U.S. analytics architecture

- Added modular Google Apps Script files for configuration, menu, sources, portfolio valuation, prices, fundamentals, metrics, long-term scoring, short-term scoring, risk, AI export placeholder, utilities, and tests.
- Added `clasp` setup files for installing the project into the live Google Sheet.
- Added required workbook tabs: `Setup`, `Portfolio`, `Transactions`, `Source_Control`, `Raw_Prices`, `Raw_Fundamentals`, `Metrics_Calculated`, `Technical_Short_Term`, `Long_Term_Score`, `Short_Term_Score`, `Portfolio_Risk`, `AI_Input`, and `Dashboard`.
- Added support structure for Saudi and U.S. holdings with SAR as the base currency and USD as the secondary currency.
- Added `Error_Log` and `Validation_Report` audit tabs.
- Added source tier scoring and default approved-source registry.
- Added provider abstraction functions for U.S. prices, Saudi prices, U.S. fundamentals, Saudi fundamentals, FX rates, and raw data normalization.
- Added deterministic metrics, technical signals, long-term scores, short-term scores, and portfolio concentration risk calculations.
- Added structured `AI_Input` export without any AI-generated text or API calls.
- Added sample seed data for Saudi ticker `2222` and U.S. ticker `AAPL`.
- Added scoring test functions for the core deterministic helper thresholds.
- Renamed the original template `onOpen()` to `onOpenLegacyInvestPortfolio()` so the new `Stock Analytics` menu is the single active menu entry point.

## Original upstream

- Single-file `performance.gs.js` portfolio performance generator.
- USD-focused Google Sheets stock portfolio tracker.
- Manual dividends and split handling.
- Open and closed position tracking.
