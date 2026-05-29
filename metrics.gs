/* Deterministic fundamental and valuation metrics. */

const SA_METRIC_REQUIRED_FIELDS = [
  "Revenue", "Gross_Profit", "Operating_Income", "Net_Income", "EPS",
  "Operating_Cash_Flow", "Capital_Expenditure", "Free_Cash_Flow",
  "Total_Assets", "Total_Liabilities", "Cash_And_Equivalents", "Total_Debt",
  "Shareholders_Equity", "Shares_Outstanding", "Dividends_Paid", "Close",
  "FX_Rate_To_SAR", "Source_ID"
];

function recalculateMetrics() {
  const fundamentals = saReadRows("Raw_Fundamentals");
  const prices = saReadRows("Raw_Prices");
  const groupedFundamentals = saGroupBy(fundamentals, function(row) {
    return saTickerKey(row.Market, row.Ticker);
  });
  const groupedPrices = saGroupBy(prices, function(row) {
    return saTickerKey(row.Market, row.Ticker);
  });
  const output = [];

  Object.keys(groupedFundamentals).forEach(function(key) {
    output.push(calculateMetricsForTicker(groupedFundamentals[key], groupedPrices[key] || []));
  });

  saWriteRows("Metrics_Calculated", SA_SHEET_HEADERS.Metrics_Calculated, output);
  saMarkSuccessfulRefresh("Metrics recalculated");
  return output.length;
}

function calculateMetricsForTicker(fundamentalRows, priceRows) {
  const rows = fundamentalRows.slice().sort(function(a, b) {
    return saNumber(a.Fiscal_Year) - saNumber(b.Fiscal_Year);
  });
  const latest = rows[rows.length - 1] || {};
  const price = saLatestByDate(priceRows, "Date") || {};
  const currentPrice = saNumber(price.Close);
  const shares = saNumber(latest.Shares_Outstanding);
  const revenue = saNumber(latest.Revenue);
  const grossProfit = saNumber(latest.Gross_Profit);
  const operatingIncome = saNumber(latest.Operating_Income);
  const netIncome = saNumber(latest.Net_Income);
  const eps = saNumber(latest.EPS);
  const fcf = getFcf(latest);
  const assets = saNumber(latest.Total_Assets);
  const debt = saNumber(latest.Total_Debt);
  const cash = saNumber(latest.Cash_And_Equivalents);
  const equity = saNumber(latest.Shareholders_Equity);
  const dividendsPaid = saNumber(latest.Dividends_Paid);
  const marketCap = currentPrice !== null && shares !== null ? currentPrice * shares : null;

  const revenueByYear = rows.map(function(row) { return saNumber(row.Revenue); });
  const epsByYear = rows.map(function(row) { return saNumber(row.EPS); });
  const fcfByYear = rows.map(function(row) { return getFcf(row); });
  const sharesByYear = rows.map(function(row) { return saNumber(row.Shares_Outstanding); });

  const sources = rows.map(function(row) { return row.Source_ID; });
  if (!saIsMissing(price.Source_ID)) {
    sources.push(price.Source_ID);
  }

  const completenessRow = Object.assign({}, latest, {
    Close: currentPrice,
    Free_Cash_Flow: fcf,
    FX_Rate_To_SAR: price.FX_Rate_To_SAR || latest.FX_Rate_To_SAR
  });

  return {
    Market: latest.Market,
    Ticker: latest.Ticker,
    Revenue_CAGR_3Y: cagrFromSeries(revenueByYear, 3),
    Revenue_CAGR_5Y: cagrFromSeries(revenueByYear, 5),
    EPS_CAGR_3Y: cagrFromSeries(epsByYear, 3),
    EPS_CAGR_5Y: cagrFromSeries(epsByYear, 5),
    FCF_CAGR_3Y: cagrFromSeries(fcfByYear, 3),
    FCF_CAGR_5Y: cagrFromSeries(fcfByYear, 5),
    Gross_Margin: saSafeDivide(grossProfit, revenue),
    Operating_Margin: saSafeDivide(operatingIncome, revenue),
    Net_Margin: saSafeDivide(netIncome, revenue),
    FCF_Margin: saSafeDivide(fcf, revenue),
    ROE: saSafeDivide(netIncome, equity),
    ROIC_Proxy: calculateRoicProxy(operatingIncome, debt, equity, cash),
    Debt_To_Equity: saSafeDivide(debt, equity),
    Net_Debt: debt !== null && cash !== null ? debt - cash : SA_NA,
    Net_Debt_To_EBITDA_Proxy: calculateNetDebtToEbitdaProxy(debt, cash, operatingIncome),
    Interest_Coverage_Proxy: SA_NA,
    Shares_Outstanding_Change_5Y: percentChangeFromSeries(sharesByYear, 5),
    Dividend_Yield: calculateDividendYield(dividendsPaid, shares, currentPrice),
    Payout_Ratio: saSafeDivide(dividendsPaid, netIncome),
    Price_To_Earnings: eps !== null && eps > 0 && currentPrice !== null ? currentPrice / eps : SA_NA,
    Price_To_Sales: marketCap !== null && revenue !== null && revenue > 0 ? marketCap / revenue : SA_NA,
    Price_To_Book: marketCap !== null && equity !== null && equity > 0 ? marketCap / equity : SA_NA,
    Price_To_FCF: marketCap !== null && fcf !== null && fcf > 0 ? marketCap / fcf : SA_NA,
    FCF_Yield: marketCap !== null && marketCap > 0 && fcf !== null ? fcf / marketCap : SA_NA,
    Current_PE_vs_5Y_Average: SA_NA,
    Valuation_Percentile_5Y: SA_NA,
    Data_Completeness_Score: saCompleteness(completenessRow, SA_METRIC_REQUIRED_FIELDS),
    Source_Quality_Weighted_Score: saWeightedSourceQuality(sources)
  };
}

function getFcf(row) {
  const direct = saNumber(row.Free_Cash_Flow);
  if (direct !== null) {
    return direct;
  }
  const ocf = saNumber(row.Operating_Cash_Flow);
  const capex = saNumber(row.Capital_Expenditure);
  if (ocf === null || capex === null) {
    return null;
  }
  return ocf - capex;
}

function cagrFromSeries(values, years) {
  const numeric = values.map(saNumber);
  if (numeric.length < years + 1) {
    return SA_NA;
  }
  const start = numeric[numeric.length - years - 1];
  const end = numeric[numeric.length - 1];
  return saCagr(start, end, years);
}

function percentChangeFromSeries(values, years) {
  const numeric = values.map(saNumber);
  if (numeric.length < years + 1) {
    return SA_NA;
  }
  const start = numeric[numeric.length - years - 1];
  const end = numeric[numeric.length - 1];
  if (start === null || end === null || start === 0) {
    return SA_NA;
  }
  return (end / start) - 1;
}

function calculateRoicProxy(operatingIncome, debt, equity, cash) {
  const op = saNumber(operatingIncome);
  const d = saNumber(debt);
  const e = saNumber(equity);
  const c = saNumber(cash) || 0;
  if (op === null || d === null || e === null) {
    return SA_NA;
  }
  const investedCapital = d + e - c;
  if (investedCapital <= 0) {
    return SA_NA;
  }
  return op / investedCapital;
}

function calculateNetDebtToEbitdaProxy(debt, cash, operatingIncome) {
  const d = saNumber(debt);
  const c = saNumber(cash);
  const ebitdaProxy = saNumber(operatingIncome);
  if (d === null || c === null || ebitdaProxy === null) {
    return SA_NA;
  }
  if (ebitdaProxy <= 0) {
    return "Negative EBITDA";
  }
  return (d - c) / ebitdaProxy;
}

function calculateDividendYield(dividendsPaid, shares, price) {
  const divs = saNumber(dividendsPaid);
  const sh = saNumber(shares);
  const p = saNumber(price);
  if (divs === null || sh === null || p === null || sh <= 0 || p <= 0) {
    return SA_NA;
  }
  return (divs / sh) / p;
}

function marginSeries(fundamentalRows, numeratorField) {
  return fundamentalRows.map(function(row) {
    const numerator = numeratorField === "Free_Cash_Flow" ? getFcf(row) : saNumber(row[numeratorField]);
    return saSafeDivide(numerator, row.Revenue);
  }).filter(function(value) {
    return value !== SA_NA;
  });
}
