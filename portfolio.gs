/* Portfolio valuation and transaction-derived audit helpers. */

function recalculatePortfolioValues() {
  const sheet = saEnsureHeaders("Portfolio", SA_SHEET_HEADERS.Portfolio);
  const rows = saReadRows("Portfolio");
  if (rows.length === 0) {
    return 0;
  }

  const latestPrices = saLatestPricesByTicker();
  const calculated = rows.map(function(row) {
    const key = saTickerKey(row.Market, row.Ticker);
    const latestPrice = latestPrices[key];
    const shares = saNumber(row.Shares);
    const averageCost = saNumber(row.Average_Cost);
    const fx = latestPrice ? saNumber(latestPrice.FX_Rate_To_SAR) : null;
    const price = latestPrice ? saNumber(latestPrice.Close) : null;
    const marketValueLocal = shares !== null && price !== null ? shares * price : SA_NA;
    const marketValueSar = marketValueLocal !== SA_NA && fx !== null ? marketValueLocal * fx : SA_NA;
    const gainLocal = shares !== null && price !== null && averageCost !== null ? (price - averageCost) * shares : SA_NA;
    const gainPercent = price !== null && averageCost !== null && averageCost !== 0 ? (price / averageCost) - 1 : SA_NA;

    return {
      rowNumber: row._rowNumber,
      currentPrice: price === null ? SA_NA : price,
      marketValueLocal: marketValueLocal,
      marketValueSar: marketValueSar,
      unrealizedGainLocal: gainLocal,
      unrealizedGainPercent: gainPercent,
      lastUpdate: latestPrice ? latestPrice.Imported_At || latestPrice.Date : "",
      status: latestPrice && price !== null && fx !== null ? "OK" : "Missing price or FX"
    };
  });

  const totalSar = calculated.reduce(function(sum, row) {
    const value = saNumber(row.marketValueSar);
    return sum + (value || 0);
  }, 0);

  const map = saHeaderMap(sheet);
  calculated.forEach(function(row) {
    const weight = totalSar > 0 && saNumber(row.marketValueSar) !== null ? row.marketValueSar / totalSar : SA_NA;
    sheet.getRange(row.rowNumber, map.Current_Price + 1).setValue(row.currentPrice);
    sheet.getRange(row.rowNumber, map.Market_Value_Local + 1).setValue(row.marketValueLocal);
    sheet.getRange(row.rowNumber, map.Market_Value_SAR + 1).setValue(row.marketValueSar);
    sheet.getRange(row.rowNumber, map.Unrealized_Gain_Loss_Local + 1).setValue(row.unrealizedGainLocal);
    sheet.getRange(row.rowNumber, map.Unrealized_Gain_Loss_Percent + 1).setValue(row.unrealizedGainPercent);
    sheet.getRange(row.rowNumber, map.Portfolio_Weight + 1).setValue(weight);
    sheet.getRange(row.rowNumber, map.Last_Data_Update + 1).setValue(row.lastUpdate);
    sheet.getRange(row.rowNumber, map.Data_Status + 1).setValue(row.status);
  });

  saApplyNumberFormats("Portfolio", {
    Unrealized_Gain_Loss_Percent: "0.00%",
    Portfolio_Weight: "0.00%"
  });
  saMarkSuccessfulRefresh("Portfolio values recalculated");
  return rows.length;
}

function deriveHoldingsFromTransactions() {
  const rows = saReadRows("Transactions");
  const holdings = {};
  rows.forEach(function(tx) {
    const market = tx.Market;
    const ticker = String(tx.Ticker || "").toUpperCase();
    if (SA_VALID_MARKETS.indexOf(market) < 0 || saIsMissing(ticker)) {
      return;
    }
    const key = saTickerKey(market, ticker);
    holdings[key] = holdings[key] || {
      Market: market,
      Ticker: ticker,
      Shares: 0,
      Cost_SAR: 0,
      Dividends_SAR: 0,
      Fees_SAR: 0
    };
    const shares = saNumber(tx.Shares) || 0;
    const netSar = saNumber(tx.Net_Amount_SAR) || 0;
    const type = tx.Transaction_Type;
    if (type === "Buy") {
      holdings[key].Shares += shares;
      holdings[key].Cost_SAR += netSar;
    } else if (type === "Sell") {
      holdings[key].Shares -= shares;
      holdings[key].Cost_SAR -= Math.abs(netSar);
    } else if (type === "Dividend") {
      holdings[key].Dividends_SAR += netSar;
    } else if (type === "Fee" || type === "Tax") {
      holdings[key].Fees_SAR += Math.abs(netSar);
    } else if (type === "Split") {
      holdings[key].Shares += shares;
    }
  });
  return holdings;
}

function getPortfolioRowsByTicker() {
  const map = {};
  saReadRows("Portfolio").forEach(function(row) {
    map[saTickerKey(row.Market, row.Ticker)] = row;
  });
  return map;
}
