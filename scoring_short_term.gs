/* Deterministic 1-6 month setup scoring. Missing signals do not score as neutral. */

const SA_SHORT_TERM_WEIGHTS = {
  Price_Trend_Score: 0.15,
  Momentum_Score: 0.12,
  Volume_Confirmation_Score: 0.10,
  Earnings_Setup_Score: 0.15,
  Sector_Strength_Score: 0.10,
  Valuation_Pressure_Score: 0.08,
  Volatility_Risk_Score: 0.08,
  News_Catalyst_Score: 0.10,
  Market_Direction_Score: 0.07,
  Liquidity_Score: 0.05
};

function recalculateShortTermScores() {
  const technicalRows = saReadRows("Technical_Short_Term");
  const metricMap = saReadRows("Metrics_Calculated").reduce(function(map, row) {
    map[saTickerKey(row.Market, row.Ticker)] = row;
    return map;
  }, {});
  const manualMap = saReadRows("Manual_Signals").reduce(function(map, row) {
    map[saTickerKey(row.Market, row.Ticker)] = row;
    return map;
  }, {});

  const output = technicalRows.map(function(row) {
    return calculateShortTermScore(row, metricMap[saTickerKey(row.Market, row.Ticker)], manualMap[saTickerKey(row.Market, row.Ticker)]);
  });
  saWriteRows("Short_Term_Score", SA_SHEET_HEADERS.Short_Term_Score, output);
  return output.length;
}

function calculateShortTermScore(row, metrics, manualSignals) {
  const manual = manualSignals || {};
  const priceTrendScore = scoreTrend(row.Price, row.Moving_Average_50D, row.Moving_Average_200D);
  const momentumScore = scoreMomentum(row.Return_1M, row.Return_3M);
  const volumeScore = scoreVolume(row.Relative_Volume);
  const earningsScore = trustedManualScore(manual.Earnings_Setup_Score, manual.Source_ID);
  const sectorScore = trustedManualScore(manual.Sector_Strength_Score, manual.Source_ID);
  const valuationPressureScore = scoreValuationPressure(metrics ? metrics.Valuation_Percentile_5Y : SA_MISSING, metrics ? metrics.Price_To_Earnings : SA_MISSING);
  const volatilityRiskScore = scoreVolatilityRisk(row.Volatility_20D);
  const newsScore = trustedManualScore(manual.News_Catalyst_Score, manual.Source_ID);
  const marketDirectionScore = trustedManualScore(manual.Market_Direction_Score, manual.Source_ID);
  const liquidityScore = scoreLiquidity(calculateAverageDailyValueSar(row));

  const scores = {
    Price_Trend_Score: priceTrendScore,
    Momentum_Score: momentumScore,
    Volume_Confirmation_Score: volumeScore,
    Earnings_Setup_Score: earningsScore,
    Sector_Strength_Score: sectorScore,
    Valuation_Pressure_Score: valuationPressureScore,
    Volatility_Risk_Score: volatilityRiskScore,
    News_Catalyst_Score: newsScore,
    Market_Direction_Score: marketDirectionScore,
    Liquidity_Score: liquidityScore
  };
  const total = calculateWeightedShortTermTotal(scores);
  const completeness = shortTermCompleteness(scores);
  const sourceQuality = calculateShortTermSourceQuality(row, metrics, manual);

  return {
    Market: row.Market,
    Ticker: row.Ticker,
    Price_Trend_Score: priceTrendScore,
    Momentum_Score: momentumScore,
    Volume_Confirmation_Score: volumeScore,
    Earnings_Setup_Score: earningsScore,
    Sector_Strength_Score: sectorScore,
    Valuation_Pressure_Score: valuationPressureScore,
    Volatility_Risk_Score: volatilityRiskScore,
    News_Catalyst_Score: newsScore,
    Market_Direction_Score: marketDirectionScore,
    Liquidity_Score: liquidityScore,
    Short_Term_Total_Score: saRound(total, 2),
    Short_Term_Label: shortTermLabel(total, completeness),
    Score_Explanation_Code: shortTermExplanationCode(scores, total, completeness, sourceQuality),
    Data_Completeness_Score: completeness,
    Source_Quality_Weighted_Score: sourceQuality
  };
}

function calculateWeightedShortTermTotal(scores) {
  let total = 0;
  Object.keys(SA_SHORT_TERM_WEIGHTS).forEach(function(key) {
    total += scoreValue(scores[key]) * SA_SHORT_TERM_WEIGHTS[key];
  });
  return Math.max(0, Math.min(10, total));
}

function trustedManualScore(value, sourceId) {
  const score = saNumber(value);
  if (score === null) {
    return SA_MISSING;
  }
  const quality = saGetSourceQualityScore(sourceId);
  if (quality < 0.70) {
    return SA_MISSING;
  }
  return Math.max(0, Math.min(10, score));
}

function scoreValuationPressure(percentile, pe) {
  const percentileScore = scoreValuationPercentile(percentile);
  if (percentileScore !== SA_MISSING) {
    return percentileScore;
  }
  return scorePERatio(pe);
}

function scoreVolatilityRisk(volatility20) {
  const vol = saAsRatio(volatility20);
  if (vol === null) return SA_MISSING;
  if (vol <= 0.15) return 10;
  if (vol <= 0.25) return 8;
  if (vol <= 0.35) return 6;
  if (vol <= 0.50) return 4;
  return 2;
}

function calculateAverageDailyValueSar(row) {
  const price = saNumber(row.Price);
  const avgVolume = saNumber(row.Average_Volume_20D);
  if (price === null || avgVolume === null) {
    return SA_MISSING;
  }
  const latestPrice = saLatestPricesByTicker()[saTickerKey(row.Market, row.Ticker)];
  const fx = latestPrice ? saNumber(latestPrice.FX_Rate_To_SAR) || 1 : 1;
  return price * avgVolume * fx;
}

function shortTermCompleteness(scores) {
  const keys = Object.keys(SA_SHORT_TERM_WEIGHTS);
  const available = keys.filter(function(key) {
    return saNumber(scores[key]) !== null;
  }).length;
  return available / keys.length;
}

function calculateShortTermSourceQuality(row, metrics, manual) {
  const ids = sourceIdsUsedForTicker(row.Market, row.Ticker);
  if (manual && !saIsMissing(manual.Source_ID)) {
    ids.push(manual.Source_ID);
  }
  return saWeightedSourceQuality(ids);
}

function shortTermLabel(score, dataCompleteness) {
  const n = saNumber(score);
  const dc = saAsRatio(dataCompleteness);
  let label;
  if (n === null) {
    label = "Weak Short-Term Setup";
  } else if (n >= 8.0) {
    label = "Strong Short-Term Setup";
  } else if (n >= 6.5) {
    label = "Constructive but Monitor";
  } else if (n >= 5.0) {
    label = "Mixed / Caution";
  } else {
    label = "Weak Short-Term Setup";
  }
  if (dc !== null && dc < 0.60) {
    label += " - Low Data Confidence";
  }
  return label;
}

function shortTermExplanationCode(scores, total, dataCompleteness, sourceQuality) {
  const codes = ["ST_V" + SA_SCORING_VERSION];
  if (saAsRatio(dataCompleteness) !== null && saAsRatio(dataCompleteness) < 0.60) codes.push("LOW_DATA");
  if (saAsRatio(sourceQuality) !== null && saAsRatio(sourceQuality) < 0.70) codes.push("LOW_SOURCE_QUALITY");
  if (scores.News_Catalyst_Score === SA_MISSING) codes.push("NEWS_MISSING");
  if (scores.Earnings_Setup_Score === SA_MISSING) codes.push("EARNINGS_MISSING");
  if (saNumber(total) !== null && saNumber(total) < 5) codes.push("WEAK_SETUP");
  return codes.join("|");
}
