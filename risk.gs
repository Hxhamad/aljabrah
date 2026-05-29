/* Portfolio-level risk and dashboard output. */

function recalculatePortfolioRisk() {
  recalculatePortfolioValues();
  const holdings = saReadRows("Portfolio");
  const longScores = saReadRows("Long_Term_Score").reduce(function(map, row) {
    map[saTickerKey(row.Market, row.Ticker)] = row;
    return map;
  }, {});
  const shortScores = saReadRows("Short_Term_Score").reduce(function(map, row) {
    map[saTickerKey(row.Market, row.Ticker)] = row;
    return map;
  }, {});

  const total = holdings.reduce(function(sum, row) {
    const value = saNumber(row.Market_Value_SAR);
    return sum + (value || 0);
  }, 0);
  const cash = saNumber(saGetSetupValue("Cash_SAR")) || 0;
  const riskRow = buildPortfolioRiskRow(holdings, longScores, shortScores, total, cash);
  saWriteRows("Portfolio_Risk", SA_SHEET_HEADERS.Portfolio_Risk, [riskRow]);
  generateDashboard();
  saMarkSuccessfulRefresh("Portfolio risk recalculated");
  return riskRow;
}

function buildPortfolioRiskRow(holdings, longScores, shortScores, total, cash) {
  const warnings = [];
  const sortedWeights = holdings.map(function(row) {
    return saNumber(row.Portfolio_Weight) || 0;
  }).sort(function(a, b) { return b - a; });
  const top1 = sortedWeights[0] || 0;
  const top3 = sortedWeights.slice(0, 3).reduce(function(sum, value) { return sum + value; }, 0);
  const top5 = sortedWeights.slice(0, 5).reduce(function(sum, value) { return sum + value; }, 0);

  if (top1 > 0.20) warnings.push("Warning: single stock exceeds 20%");
  if (top3 > 0.50) warnings.push("Warning: top 3 positions exceed 50%");

  const saudiValue = marketValueByField(holdings, "Market", "Saudi");
  const usValue = marketValueByField(holdings, "Market", "US");
  const sarValue = marketValueByField(holdings, "Currency", "SAR");
  const usdValue = marketValueByField(holdings, "Currency", "USD");
  const sectorConcentration = calculateSectorConcentration(holdings, total);
  const highRiskPositions = holdings.filter(function(row) {
    const key = saTickerKey(row.Market, row.Ticker);
    const longLabel = longScores[key] ? String(longScores[key].Long_Term_Label) : "";
    const shortLabel = shortScores[key] ? String(shortScores[key].Short_Term_Label) : "";
    return longLabel.indexOf("Weak") >= 0 || shortLabel.indexOf("Weak") >= 0;
  }).length;
  const lowDataConfidence = holdings.filter(function(row) {
    const key = saTickerKey(row.Market, row.Ticker);
    const longScore = longScores[key] || {};
    const shortScore = shortScores[key] || {};
    const weight = saNumber(row.Portfolio_Weight) || 0;
    const lowLong = saAsRatio(longScore.Data_Completeness_Score) !== null && saAsRatio(longScore.Data_Completeness_Score) < 0.60;
    const lowShort = saAsRatio(shortScore.Data_Completeness_Score) !== null && saAsRatio(shortScore.Data_Completeness_Score) < 0.60;
    if ((lowLong || lowShort) && weight > 0.10) {
      warnings.push("Warning: " + row.Ticker + " has low data confidence and weight above 10%");
    }
    return lowLong || lowShort;
  }).length;

  const longWeighted = weightedPortfolioScore(holdings, longScores, "Long_Term_Total_Score");
  const shortWeighted = weightedPortfolioScore(holdings, shortScores, "Short_Term_Total_Score");

  return {
    Total_Portfolio_Value_SAR: total,
    Cash_SAR: cash,
    Saudi_Exposure_Percent: total > 0 ? saudiValue / total : SA_NA,
    US_Exposure_Percent: total > 0 ? usValue / total : SA_NA,
    USD_Exposure_Percent: total > 0 ? usdValue / total : SA_NA,
    SAR_Exposure_Percent: total > 0 ? sarValue / total : SA_NA,
    Sector_Concentration: sectorConcentration,
    Top_1_Position_Weight: top1,
    Top_3_Position_Weight: top3,
    Top_5_Position_Weight: top5,
    High_Risk_Positions_Count: highRiskPositions,
    Low_Data_Confidence_Positions_Count: lowDataConfidence,
    Long_Term_Weighted_Score: longWeighted,
    Short_Term_Weighted_Score: shortWeighted,
    Portfolio_Quality_Label: portfolioQualityLabel(longWeighted, shortWeighted, warnings),
    Risk_Warnings: warnings.length > 0 ? warnings.join("; ") : "No concentration warnings"
  };
}

function marketValueByField(holdings, field, expectedValue) {
  return holdings.reduce(function(sum, row) {
    if (row[field] !== expectedValue) {
      return sum;
    }
    const value = saNumber(row.Market_Value_SAR);
    return sum + (value || 0);
  }, 0);
}

function calculateSectorConcentration(holdings, total) {
  if (total <= 0) {
    return SA_NA;
  }
  const sectors = {};
  holdings.forEach(function(row) {
    const sector = row.Sector || "Unclassified";
    sectors[sector] = (sectors[sector] || 0) + (saNumber(row.Market_Value_SAR) || 0);
  });
  let topSector = "";
  let topValue = 0;
  Object.keys(sectors).forEach(function(sector) {
    if (sectors[sector] > topValue) {
      topSector = sector;
      topValue = sectors[sector];
    }
  });
  return topSector + " " + saRound(topValue / total, 4);
}

function weightedPortfolioScore(holdings, scoreMap, scoreField) {
  let weighted = 0;
  let totalWeight = 0;
  holdings.forEach(function(row) {
    const key = saTickerKey(row.Market, row.Ticker);
    const score = scoreMap[key] ? saNumber(scoreMap[key][scoreField]) : null;
    const weight = saNumber(row.Portfolio_Weight);
    if (score !== null && weight !== null) {
      weighted += score * weight;
      totalWeight += weight;
    }
  });
  if (totalWeight === 0) {
    return SA_NA;
  }
  return weighted / totalWeight;
}

function portfolioQualityLabel(longScore, shortScore, warnings) {
  const lt = saNumber(longScore);
  const st = saNumber(shortScore);
  if (warnings && warnings.length > 0) {
    return "Review Required";
  }
  if (lt !== null && lt >= 7 && st !== null && st >= 6) {
    return "Healthy";
  }
  if (lt !== null && lt >= 5) {
    return "Monitor";
  }
  return "Review Required";
}

function generateDashboard() {
  const risk = saReadRows("Portfolio_Risk")[0] || {};
  const holdings = saReadRows("Portfolio");
  const longScores = saReadRows("Long_Term_Score");
  const shortScores = saReadRows("Short_Term_Score");
  const dashboardRows = [];

  dashboardRows.push({ Section: "Portfolio value", Metric: "Total SAR", Value: risk.Total_Portfolio_Value_SAR || SA_NA, Status: "", Notes: "Base currency SAR" });
  dashboardRows.push({ Section: "Portfolio value", Metric: "Cash SAR", Value: risk.Cash_SAR || 0, Status: "", Notes: "Manual Setup field" });
  dashboardRows.push({ Section: "Market exposure", Metric: "Saudi", Value: risk.Saudi_Exposure_Percent || SA_NA, Status: "", Notes: "" });
  dashboardRows.push({ Section: "Market exposure", Metric: "US", Value: risk.US_Exposure_Percent || SA_NA, Status: "", Notes: "" });
  dashboardRows.push({ Section: "Currency exposure", Metric: "SAR", Value: risk.SAR_Exposure_Percent || SA_NA, Status: "", Notes: "" });
  dashboardRows.push({ Section: "Currency exposure", Metric: "USD", Value: risk.USD_Exposure_Percent || SA_NA, Status: "", Notes: "" });

  topByValue(holdings, "Market_Value_SAR", 5).forEach(function(row, index) {
    dashboardRows.push({ Section: "Top holdings", Metric: String(index + 1), Value: row.Ticker, Status: row.Portfolio_Weight, Notes: row.Company_Name });
  });
  topByScore(longScores, "Long_Term_Total_Score", 5, true).forEach(function(row) {
    dashboardRows.push({ Section: "Best long-term scores", Metric: row.Ticker, Value: row.Long_Term_Total_Score, Status: row.Long_Term_Label, Notes: row.Score_Explanation_Code });
  });
  topByScore(longScores, "Long_Term_Total_Score", 5, false).forEach(function(row) {
    dashboardRows.push({ Section: "Weakest long-term scores", Metric: row.Ticker, Value: row.Long_Term_Total_Score, Status: row.Long_Term_Label, Notes: row.Score_Explanation_Code });
  });
  topByScore(shortScores, "Short_Term_Total_Score", 5, true).forEach(function(row) {
    dashboardRows.push({ Section: "Best short-term setups", Metric: row.Ticker, Value: row.Short_Term_Total_Score, Status: row.Short_Term_Label, Notes: row.Score_Explanation_Code });
  });
  shortScores.filter(function(row) {
    return String(row.Short_Term_Label).indexOf("Weak") >= 0 || String(row.Score_Explanation_Code).indexOf("MISSING") >= 0;
  }).forEach(function(row) {
    dashboardRows.push({ Section: "Short-term risk warnings", Metric: row.Ticker, Value: row.Short_Term_Total_Score, Status: row.Short_Term_Label, Notes: row.Score_Explanation_Code });
  });

  dashboardRows.push({ Section: "Concentration warnings", Metric: "Top 1", Value: risk.Top_1_Position_Weight || SA_NA, Status: risk.Portfolio_Quality_Label || "", Notes: risk.Risk_Warnings || "" });
  dashboardRows.push({ Section: "Concentration warnings", Metric: "Top 3", Value: risk.Top_3_Position_Weight || SA_NA, Status: risk.Portfolio_Quality_Label || "", Notes: risk.Risk_Warnings || "" });
  dashboardRows.push({ Section: "Low data confidence warnings", Metric: "Count", Value: risk.Low_Data_Confidence_Positions_Count || 0, Status: "", Notes: "" });
  dashboardRows.push({ Section: "Source quality summary", Metric: "Portfolio source quality", Value: averageSourceQuality(), Status: "", Notes: "Weighted source confidence uses Source_Control tier scores." });
  dashboardRows.push({ Section: "Last refresh status", Metric: "Last successful", Value: saGetSetupValue("Last successful refresh"), Status: "", Notes: "See Error_Log for failed refreshes." });

  saWriteRows("Dashboard", SA_SHEET_HEADERS.Dashboard, dashboardRows);
}

function topByValue(rows, field, count) {
  return rows.slice().sort(function(a, b) {
    return (saNumber(b[field]) || 0) - (saNumber(a[field]) || 0);
  }).slice(0, count);
}

function topByScore(rows, field, count, descending) {
  return rows.slice().sort(function(a, b) {
    const diff = (saNumber(a[field]) || 0) - (saNumber(b[field]) || 0);
    return descending ? -diff : diff;
  }).slice(0, count);
}

function averageSourceQuality() {
  const scores = sourceIdsUsedForPortfolio().map(saGetSourceQualityScore);
  return scores.length === 0 ? SA_NA : saMean(scores);
}

function sourceIdsUsedForPortfolio() {
  const ids = {};
  saReadRows("Portfolio").forEach(function(row) {
    sourceIdsUsedForTicker(row.Market, row.Ticker).forEach(function(sourceId) {
      ids[sourceId] = true;
    });
  });
  return Object.keys(ids);
}
