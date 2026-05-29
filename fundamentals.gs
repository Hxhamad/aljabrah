/* Raw fundamentals refresh and normalization. */

function refreshFundamentals() {
  setupStockAnalyticsWorkbook();
  const tickers = getPortfolioTickersByMarket();
  const rows = [];

  try {
    rows.push.apply(rows, normalizeFundamentalData(fetchUSFundamentals(tickers.US), "FMP"));
    rows.push.apply(rows, normalizeFundamentalData(fetchSaudiFundamentals(tickers.Saudi), "SAHMK"));
  } catch (error) {
    logError("refreshFundamentals", "", "", "RefreshError", error.message, "High", "Check provider settings and Error_Log details.");
  }

  if (rows.length > 0) {
    saAppendRows("Raw_Fundamentals", SA_SHEET_HEADERS.Raw_Fundamentals, rows);
    recalculateMetrics();
    saMarkSuccessfulRefresh("Fundamentals refreshed");
  } else {
    logError("refreshFundamentals", "", "", "NoFundamentalRows", "No provider fundamental rows were imported.", "Medium", "Configure API keys or add reviewed manual rows to Raw_Fundamentals.");
  }
  return rows.length;
}

function fetchUSFundamentals(tickers) {
  if (!tickers || tickers.length === 0) {
    return [];
  }
  const provider = getProviderConfig("FMP");
  if (!requireProviderKey(provider, "fetchUSFundamentals", "US", tickers.join(","))) {
    return [];
  }

  const output = [];
  tickers.forEach(function(ticker) {
    try {
      const income = fetchFmpStatement(provider.incomeBaseUrl, ticker, provider.apiKey);
      const balance = fetchFmpStatement(provider.balanceBaseUrl, ticker, provider.apiKey);
      const cashflow = fetchFmpStatement(provider.cashflowBaseUrl, ticker, provider.apiKey);
      output.push({
        ticker: ticker,
        market: "US",
        currency: "USD",
        income: income,
        balance: balance,
        cashflow: cashflow,
        _provider: "FMP"
      });
    } catch (error) {
      logError("fetchUSFundamentals", "US", ticker, "ProviderError", error.message, "High", "Review provider response and API plan limits.");
    }
  });
  return output;
}

function fetchFmpStatement(baseUrl, ticker, apiKey) {
  const url = baseUrl + "/" + encodeURIComponent(ticker) + "?period=annual&limit=6&apikey=" + encodeURIComponent(apiKey);
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() >= 400) {
    throw new Error("FMP statement request failed with HTTP " + response.getResponseCode());
  }
  return JSON.parse(response.getContentText());
}

function fetchSaudiFundamentals(tickers) {
  if (!tickers || tickers.length === 0) {
    return [];
  }
  const provider = getProviderConfig("SAHMK");
  if (!requireProviderKey(provider, "fetchSaudiFundamentals", "Saudi", tickers.join(","))) {
    return [];
  }
  logError(
    "fetchSaudiFundamentals",
    "Saudi",
    tickers.join(","),
    "ProviderPlaceholder",
    "Saudi fundamentals endpoint is intentionally left as a provider adapter placeholder.",
    "Medium",
    "Implement an approved Tadawul/SAHMK/company filing adapter or import reviewed manual rows."
  );
  return [];
}

function normalizeFundamentalData(raw, providerName) {
  const provider = getProviderConfig(providerName);
  const importedAt = saNowIso();
  const output = [];

  (raw || []).forEach(function(item) {
    if (provider.name === "FMP" && item.income) {
      const years = {};
      item.income.forEach(function(row) {
        years[row.calendarYear || row.date] = years[row.calendarYear || row.date] || {};
        years[row.calendarYear || row.date].income = row;
      });
      item.balance.forEach(function(row) {
        years[row.calendarYear || row.date] = years[row.calendarYear || row.date] || {};
        years[row.calendarYear || row.date].balance = row;
      });
      item.cashflow.forEach(function(row) {
        years[row.calendarYear || row.date] = years[row.calendarYear || row.date] || {};
        years[row.calendarYear || row.date].cashflow = row;
      });

      Object.keys(years).forEach(function(yearKey) {
        const bundle = years[yearKey];
        const income = bundle.income || {};
        const balance = bundle.balance || {};
        const cashflow = bundle.cashflow || {};
        const fcf = !saIsMissing(cashflow.freeCashFlow)
          ? cashflow.freeCashFlow
          : saNumber(cashflow.operatingCashFlow) !== null && saNumber(cashflow.capitalExpenditure) !== null
            ? saNumber(cashflow.operatingCashFlow) - saNumber(cashflow.capitalExpenditure)
            : SA_NA;
        output.push({
          Fiscal_Period: "FY",
          Fiscal_Year: saNumber(income.calendarYear || balance.calendarYear || cashflow.calendarYear || yearKey),
          Market: item.market || "US",
          Ticker: String(item.ticker || income.symbol || "").toUpperCase(),
          Revenue: income.revenue,
          Gross_Profit: income.grossProfit,
          Operating_Income: income.operatingIncome,
          Net_Income: income.netIncome,
          EPS: income.eps,
          Operating_Cash_Flow: cashflow.operatingCashFlow,
          Capital_Expenditure: cashflow.capitalExpenditure,
          Free_Cash_Flow: fcf,
          Total_Assets: balance.totalAssets,
          Total_Liabilities: balance.totalLiabilities,
          Cash_And_Equivalents: balance.cashAndCashEquivalents,
          Total_Debt: balance.totalDebt,
          Shareholders_Equity: balance.totalStockholdersEquity,
          Shares_Outstanding: income.weightedAverageShsOutDil,
          Dividends_Paid: Math.abs(saNumber(cashflow.dividendsPaid) || 0),
          Currency: item.currency || "USD",
          FX_Rate_To_SAR: fetchFXRates().USD,
          Source_ID: provider.sourceId,
          Imported_At: importedAt,
          Data_Status: "OK"
        });
      });
      return;
    }

    const ocf = saNumber(saFirstAvailable([item.Operating_Cash_Flow, item.operatingCashFlow]));
    const capex = saNumber(saFirstAvailable([item.Capital_Expenditure, item.capitalExpenditure]));
    const directFcf = saFirstAvailable([item.Free_Cash_Flow, item.freeCashFlow]);
    output.push({
      Fiscal_Period: saFirstAvailable([item.Fiscal_Period, item.fiscalPeriod, "FY"]),
      Fiscal_Year: saFirstAvailable([item.Fiscal_Year, item.fiscalYear]),
      Market: saFirstAvailable([item.Market, item.market]),
      Ticker: String(item.Ticker || item.ticker || "").toUpperCase(),
      Revenue: saFirstAvailable([item.Revenue, item.revenue]),
      Gross_Profit: saFirstAvailable([item.Gross_Profit, item.grossProfit]),
      Operating_Income: saFirstAvailable([item.Operating_Income, item.operatingIncome]),
      Net_Income: saFirstAvailable([item.Net_Income, item.netIncome]),
      EPS: saFirstAvailable([item.EPS, item.eps]),
      Operating_Cash_Flow: saFirstAvailable([item.Operating_Cash_Flow, item.operatingCashFlow]),
      Capital_Expenditure: saFirstAvailable([item.Capital_Expenditure, item.capitalExpenditure]),
      Free_Cash_Flow: !saIsMissing(directFcf) ? directFcf : (ocf !== null && capex !== null ? ocf - capex : SA_NA),
      Total_Assets: saFirstAvailable([item.Total_Assets, item.totalAssets]),
      Total_Liabilities: saFirstAvailable([item.Total_Liabilities, item.totalLiabilities]),
      Cash_And_Equivalents: saFirstAvailable([item.Cash_And_Equivalents, item.cashAndEquivalents]),
      Total_Debt: saFirstAvailable([item.Total_Debt, item.totalDebt]),
      Shareholders_Equity: saFirstAvailable([item.Shareholders_Equity, item.shareholdersEquity]),
      Shares_Outstanding: saFirstAvailable([item.Shares_Outstanding, item.sharesOutstanding]),
      Dividends_Paid: saFirstAvailable([item.Dividends_Paid, item.dividendsPaid]),
      Currency: saFirstAvailable([item.Currency, item.currency]),
      FX_Rate_To_SAR: saFirstAvailable([item.FX_Rate_To_SAR, item.fxRateToSar]),
      Source_ID: item.Source_ID || provider.sourceId,
      Imported_At: importedAt,
      Data_Status: item.Data_Status || "OK"
    });
  });

  return output;
}
