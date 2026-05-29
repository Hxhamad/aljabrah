/* Raw price refresh, normalization, and deterministic short-term technical metrics. */

function refreshPrices() {
  setupStockAnalyticsWorkbook();
  const tickers = getPortfolioTickersByMarket();
  const fxRates = fetchFXRates();
  const rows = [];

  try {
    rows.push.apply(rows, normalizePriceData(fetchUSPrices(tickers.US), "FMP", fxRates));
    rows.push.apply(rows, normalizePriceData(fetchSaudiPrices(tickers.Saudi), "SAHMK", fxRates));
  } catch (error) {
    logError("refreshPrices", "", "", "RefreshError", error.message, "High", "Check provider settings and Error_Log details.");
  }

  if (rows.length > 0) {
    saAppendRows("Raw_Prices", SA_SHEET_HEADERS.Raw_Prices, rows);
    recalculatePortfolioValues();
    recalculateTechnicalShortTerm();
    saMarkSuccessfulRefresh("Prices refreshed");
  } else {
    logError("refreshPrices", "", "", "NoPriceRows", "No provider price rows were imported.", "Medium", "Configure API keys or add reviewed manual rows to Raw_Prices.");
  }
  return rows.length;
}

function getPortfolioTickersByMarket() {
  const result = { Saudi: [], US: [] };
  const seen = {};
  saReadRows("Portfolio").forEach(function(row) {
    if (SA_VALID_MARKETS.indexOf(row.Market) < 0 || saIsMissing(row.Ticker)) {
      return;
    }
    const key = saTickerKey(row.Market, row.Ticker);
    if (!seen[key]) {
      result[row.Market].push(String(row.Ticker).trim().toUpperCase());
      seen[key] = true;
    }
  });
  return result;
}

function fetchUSPrices(tickers) {
  if (!tickers || tickers.length === 0) {
    return [];
  }
  const provider = getProviderConfig("FMP");
  if (!requireProviderKey(provider, "fetchUSPrices", "US", tickers.join(","))) {
    return [];
  }
  const url = provider.priceBaseUrl + "/" + encodeURIComponent(tickers.join(",")) + "?apikey=" + encodeURIComponent(provider.apiKey);
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() >= 400) {
    throw new Error("FMP price request failed with HTTP " + response.getResponseCode());
  }
  return JSON.parse(response.getContentText()).map(function(item) {
    item._provider = "FMP";
    return item;
  });
}

function fetchSaudiPrices(tickers) {
  if (!tickers || tickers.length === 0) {
    return [];
  }
  const provider = getProviderConfig("SAHMK");
  if (!requireProviderKey(provider, "fetchSaudiPrices", "Saudi", tickers.join(","))) {
    return [];
  }
  logError(
    "fetchSaudiPrices",
    "Saudi",
    tickers.join(","),
    "ProviderPlaceholder",
    "SAHMK/Tadawul price endpoint is intentionally left as a provider adapter placeholder.",
    "Medium",
    "Implement the approved endpoint adapter or import reviewed manual Saudi rows into Raw_Prices."
  );
  return [];
}

function fetchFXRates() {
  const manualUsdSar = saNumber(saGetSetupValue("Manual USD/SAR FX Rate"));
  return {
    SAR: 1,
    USD: manualUsdSar || 3.75,
    Source_ID: manualUsdSar ? "SRC_FX_MANUAL" : "SRC_MANUAL",
    Data_Status: manualUsdSar ? "Manual" : "Missing Data"
  };
}

function normalizePriceData(raw, providerName, fxRates) {
  const provider = getProviderConfig(providerName);
  const importedAt = saNowIso();
  return (raw || []).map(function(item) {
    if (provider.name === "FMP") {
      const ticker = String(item.symbol || item.ticker || "").toUpperCase();
      const close = saNumber(item.price);
      const currency = "USD";
      return {
        Date: new Date(),
        Market: "US",
        Ticker: ticker,
        Open: saNumber(item.open) || close,
        High: saNumber(item.dayHigh) || close,
        Low: saNumber(item.dayLow) || close,
        Close: close,
        Adjusted_Close: close,
        Volume: saNumber(item.volume),
        Currency: currency,
        FX_Rate_To_SAR: fxRates.USD,
        Source_ID: provider.sourceId,
        Imported_At: importedAt,
        Data_Status: close === null ? "Missing Data" : "OK"
      };
    }
    return {
      Date: saFirstAvailable([item.Date, item.date, new Date()]),
      Market: saFirstAvailable([item.Market, item.market]),
      Ticker: String(item.Ticker || item.ticker || "").toUpperCase(),
      Open: saFirstAvailable([item.Open, item.open]),
      High: saFirstAvailable([item.High, item.high]),
      Low: saFirstAvailable([item.Low, item.low]),
      Close: saFirstAvailable([item.Close, item.close]),
      Adjusted_Close: saFirstAvailable([item.Adjusted_Close, item.adjustedClose, item.close]),
      Volume: saFirstAvailable([item.Volume, item.volume]),
      Currency: saFirstAvailable([item.Currency, item.currency]),
      FX_Rate_To_SAR: saFirstAvailable([item.FX_Rate_To_SAR, item.fxRateToSar]),
      Source_ID: item.Source_ID || provider.sourceId,
      Imported_At: importedAt,
      Data_Status: item.Data_Status || "OK"
    };
  });
}

function recalculateTechnicalShortTerm() {
  const priceRows = saReadRows("Raw_Prices");
  const grouped = saGroupBy(priceRows, function(row) {
    return saTickerKey(row.Market, row.Ticker);
  });
  const output = [];

  Object.keys(grouped).forEach(function(key) {
    const rows = saSortByDateAscending(grouped[key], "Date");
    const latest = rows[rows.length - 1];
    if (!latest) {
      return;
    }
    output.push(calculateTechnicalForTicker(rows, latest));
  });

  saWriteRows("Technical_Short_Term", SA_SHEET_HEADERS.Technical_Short_Term, output);
  saMarkSuccessfulRefresh("Technical metrics recalculated");
  return output.length;
}

function calculateTechnicalForTicker(rows, latest) {
  const closes = rows.map(function(row) {
    const adjusted = saNumber(row.Adjusted_Close);
    return adjusted !== null ? adjusted : saNumber(row.Close);
  });
  const volumes = rows.map(function(row) { return saNumber(row.Volume); });
  const price = closes[closes.length - 1];
  const ma50 = movingAverage(closes, 50);
  const ma200 = movingAverage(closes, 200);
  const avgVol20 = movingAverage(volumes, 20);
  const high52 = maxLast(rows.map(function(row) { return saNumber(row.High) || saNumber(row.Close); }), 252);
  const low52 = minLast(rows.map(function(row) { return saNumber(row.Low) || saNumber(row.Close); }), 252);
  const relVol = price !== null && avgVol20 !== SA_NA && saNumber(latest.Volume) !== null
    ? saNumber(latest.Volume) / avgVol20
    : SA_NA;
  const returns20 = trailingReturns(closes, 20);
  const volatility20 = returns20.length >= 2 ? saStdDev(returns20) * Math.sqrt(252) : SA_NA;
  const atr14 = calculateAtrProxy(rows, 14);
  const avgDailyValue = price !== null && avgVol20 !== SA_NA ? price * avgVol20 * (saNumber(latest.FX_Rate_To_SAR) || 1) : SA_NA;

  return {
    Market: latest.Market,
    Ticker: latest.Ticker,
    Price: price === null ? SA_NA : price,
    Return_1D: priceReturn(closes, 1),
    Return_1W: priceReturn(closes, 5),
    Return_1M: priceReturn(closes, 21),
    Return_3M: priceReturn(closes, 63),
    Return_6M: priceReturn(closes, 126),
    Return_1Y: priceReturn(closes, 252),
    High_52W: high52,
    Low_52W: low52,
    Drawdown_From_52W_High: price !== null && high52 !== SA_NA && high52 !== 0 ? (price / high52) - 1 : SA_NA,
    Moving_Average_50D: ma50,
    Moving_Average_200D: ma200,
    Price_vs_50DMA: price !== null && ma50 !== SA_NA ? (price / ma50) - 1 : SA_NA,
    Price_vs_200DMA: price !== null && ma200 !== SA_NA ? (price / ma200) - 1 : SA_NA,
    Average_Volume_20D: avgVol20,
    Relative_Volume: relVol,
    Volatility_20D: volatility20,
    ATR_14D_Proxy: atr14,
    Trend_Status: trendStatus(price, ma50, ma200),
    Momentum_Status: momentumStatus(priceReturn(closes, 21), priceReturn(closes, 63)),
    Liquidity_Status: liquidityStatus(avgDailyValue)
  };
}

function movingAverage(values, length) {
  const numeric = values.map(saNumber).filter(function(value) { return value !== null; });
  if (numeric.length < length) {
    return SA_NA;
  }
  return saMean(numeric.slice(numeric.length - length));
}

function maxLast(values, length) {
  const numeric = values.map(saNumber).filter(function(value) { return value !== null; });
  if (numeric.length === 0) {
    return SA_NA;
  }
  return Math.max.apply(null, numeric.slice(Math.max(0, numeric.length - length)));
}

function minLast(values, length) {
  const numeric = values.map(saNumber).filter(function(value) { return value !== null; });
  if (numeric.length === 0) {
    return SA_NA;
  }
  return Math.min.apply(null, numeric.slice(Math.max(0, numeric.length - length)));
}

function priceReturn(values, periods) {
  const numeric = values.map(saNumber);
  const current = numeric[numeric.length - 1];
  const prior = numeric[numeric.length - periods - 1];
  if (current === null || prior === null || prior === 0 || numeric.length <= periods) {
    return SA_NA;
  }
  return (current / prior) - 1;
}

function trailingReturns(values, periods) {
  const returns = [];
  const numeric = values.map(saNumber).filter(function(value) { return value !== null; });
  const start = Math.max(1, numeric.length - periods);
  for (let i = start; i < numeric.length; i++) {
    if (numeric[i - 1] !== 0) {
      returns.push((numeric[i] / numeric[i - 1]) - 1);
    }
  }
  return returns;
}

function calculateAtrProxy(rows, periods) {
  if (rows.length < periods + 1) {
    return SA_NA;
  }
  const trueRanges = [];
  const slice = rows.slice(rows.length - periods);
  for (let i = 0; i < slice.length; i++) {
    const current = slice[i];
    const prev = rows[rows.length - periods + i - 1];
    const high = saNumber(current.High);
    const low = saNumber(current.Low);
    const prevClose = prev ? saNumber(prev.Close) : null;
    if (high === null || low === null) {
      continue;
    }
    const values = [high - low];
    if (prevClose !== null) {
      values.push(Math.abs(high - prevClose));
      values.push(Math.abs(low - prevClose));
    }
    trueRanges.push(Math.max.apply(null, values));
  }
  return trueRanges.length === 0 ? SA_NA : saMean(trueRanges);
}

function trendStatus(price, ma50, ma200) {
  const p = saNumber(price);
  const m50 = saNumber(ma50);
  const m200 = saNumber(ma200);
  if (p === null || m50 === null || m200 === null) {
    return "Insufficient Data";
  }
  if (p > m50 && m50 > m200) {
    return "Strong Uptrend";
  }
  if (p > m200 && p < m50) {
    return "Weak Uptrend";
  }
  if (p < m200) {
    return "Downtrend";
  }
  return "Range / Mixed";
}

function momentumStatus(return1m, return3m) {
  const r1 = saNumber(return1m);
  const r3 = saNumber(return3m);
  if (r1 === null || r3 === null) {
    return "Insufficient Data";
  }
  if (r1 > 0 && r3 > 0) {
    return "Positive";
  }
  if (r1 < 0 && r3 < 0) {
    return "Negative";
  }
  return "Mixed";
}

function liquidityStatus(avgDailyValueTradedSar) {
  const value = saNumber(avgDailyValueTradedSar);
  if (value === null) {
    return "Insufficient Data";
  }
  if (value >= 50000000) {
    return "High";
  }
  if (value >= 5000000) {
    return "Moderate";
  }
  return "Low";
}
