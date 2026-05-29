/* Deterministic long-term scoring. No recommendations and no AI text. */

const SA_LONG_TERM_WEIGHTS = {
  Business_Durability_Score: 0.10,
  Moat_Proxy_Score: 0.10,
  Revenue_Growth_Score: 0.10,
  Earnings_Growth_Score: 0.08,
  FCF_Strength_Score: 0.12,
  Profitability_Score: 0.12,
  Balance_Sheet_Score: 0.10,
  Shareholder_Treatment_Score: 0.08,
  Valuation_Score: 0.10,
  Risk_Penalty: 0.10
};

function recalculateScores() {
  const longCount = recalculateLongTermScores();
  const shortCount = recalculateShortTermScores();
  recalculatePortfolioRisk();
  generateAIInput();
  saMarkSuccessfulRefresh("Scores recalculated");
  return { longTermRows: longCount, shortTermRows: shortCount };
}

function recalculateLongTermScores() {
  const metricRows = saReadRows("Metrics_Calculated");
  const fundamentals = saGroupBy(saReadRows("Raw_Fundamentals"), function(row) {
    return saTickerKey(row.Market, row.Ticker);
  });
  const output = metricRows.map(function(row) {
    return calculateLongTermScore(row, fundamentals[saTickerKey(row.Market, row.Ticker)] || []);
  });
  saWriteRows("Long_Term_Score", SA_SHEET_HEADERS.Long_Term_Score, output);
  return output.length;
}

function calculateLongTermScore(row, fundamentalRows) {
  const sortedFundamentals = (fundamentalRows || []).slice().sort(function(a, b) {
    return saNumber(a.Fiscal_Year) - saNumber(b.Fiscal_Year);
  });
  const revenueGrowthScore = scoreRevenueGrowth(preferFiveYear(row.Revenue_CAGR_5Y, row.Revenue_CAGR_3Y));
  const earningsGrowthScore = scoreRevenueGrowth(preferFiveYear(row.EPS_CAGR_5Y, row.EPS_CAGR_3Y));
  const fcfGrowthScore = scoreRevenueGrowth(preferFiveYear(row.FCF_CAGR_5Y, row.FCF_CAGR_3Y));
  const fcfMarginScore = scoreFCFMargin(row.FCF_Margin);
  const fcfStrengthScore = saAverageScores([fcfGrowthScore, fcfMarginScore, scoreFCFYield(row.FCF_Yield)]);
  const profitabilityScore = saAverageScores([
    scoreMarginLevel(row.Operating_Margin),
    scoreMarginLevel(row.Net_Margin),
    scoreReturnOnCapital(row.ROE),
    scoreReturnOnCapital(row.ROIC_Proxy)
  ]);
  const balanceSheetScore = saAverageScores([
    scoreDebtSafety(row.Net_Debt_To_EBITDA_Proxy),
    scoreDebtToEquity(row.Debt_To_Equity)
  ]);
  const shareholderScore = saAverageScores([
    scorePayoutRatio(row.Payout_Ratio),
    scoreShareCountChange(row.Shares_Outstanding_Change_5Y)
  ]);
  const valuationScore = saAverageScores([
    scoreValuationPercentile(row.Valuation_Percentile_5Y),
    scorePERatio(row.Price_To_Earnings),
    scorePriceToFcf(row.Price_To_FCF),
    scoreFCFYield(row.FCF_Yield)
  ]);
  const moatScore = calculateMoatProxyScore(row, sortedFundamentals);
  const durabilityScore = calculateBusinessDurabilityScore(row, sortedFundamentals, profitabilityScore);
  const riskPenalty = calculateRiskPenalty(row);

  const total = calculateWeightedLongTermTotal({
    Business_Durability_Score: durabilityScore,
    Moat_Proxy_Score: moatScore,
    Revenue_Growth_Score: revenueGrowthScore,
    Earnings_Growth_Score: earningsGrowthScore,
    FCF_Strength_Score: fcfStrengthScore,
    Profitability_Score: profitabilityScore,
    Balance_Sheet_Score: balanceSheetScore,
    Shareholder_Treatment_Score: shareholderScore,
    Valuation_Score: valuationScore,
    Risk_Penalty: riskPenalty
  });
  const dataCompleteness = saNumber(row.Data_Completeness_Score);
  const sourceQuality = saNumber(row.Source_Quality_Weighted_Score);

  return {
    Market: row.Market,
    Ticker: row.Ticker,
    Business_Durability_Score: saRound(durabilityScore, 2),
    Moat_Proxy_Score: saRound(moatScore, 2),
    Revenue_Growth_Score: revenueGrowthScore,
    Earnings_Growth_Score: earningsGrowthScore,
    FCF_Strength_Score: saRound(fcfStrengthScore, 2),
    Profitability_Score: saRound(profitabilityScore, 2),
    Balance_Sheet_Score: saRound(balanceSheetScore, 2),
    Shareholder_Treatment_Score: saRound(shareholderScore, 2),
    Valuation_Score: saRound(valuationScore, 2),
    Risk_Penalty: saRound(riskPenalty, 2),
    Long_Term_Total_Score: saRound(total, 2),
    Long_Term_Label: longTermLabel(total, dataCompleteness),
    Score_Explanation_Code: longTermExplanationCode(row, total, dataCompleteness, sourceQuality),
    Data_Completeness_Score: row.Data_Completeness_Score,
    Source_Quality_Weighted_Score: row.Source_Quality_Weighted_Score
  };
}

function calculateWeightedLongTermTotal(scores) {
  let total = 0;
  Object.keys(SA_LONG_TERM_WEIGHTS).forEach(function(key) {
    const weight = SA_LONG_TERM_WEIGHTS[key];
    if (key === "Risk_Penalty") {
      const penalty = saNumber(scores[key]);
      total += (10 - (penalty === null ? 10 : penalty)) * weight;
    } else {
      total += scoreValue(scores[key]) * weight;
    }
  });
  return Math.max(0, Math.min(10, total));
}

function scoreRevenueGrowth(cagr) {
  const ratio = saAsRatio(cagr);
  if (ratio === null) return SA_MISSING;
  if (ratio > 0.15) return 10;
  if (ratio >= 0.10) return 8;
  if (ratio >= 0.05) return 6;
  if (ratio >= 0) return 4;
  return 1;
}

function scoreFCFMargin(fcfMargin) {
  const ratio = saAsRatio(fcfMargin);
  if (ratio === null) return SA_MISSING;
  if (ratio > 0.20) return 10;
  if (ratio >= 0.15) return 8;
  if (ratio >= 0.10) return 6;
  if (ratio >= 0.05) return 4;
  if (ratio >= 0) return 2;
  return 0;
}

function scoreDebtSafety(netDebtToEbitda) {
  if (netDebtToEbitda === "Negative EBITDA") return 0;
  const ratio = saNumber(netDebtToEbitda);
  if (ratio === null) return SA_MISSING;
  if (ratio < 0) return 10;
  if (ratio <= 1) return 9;
  if (ratio <= 2) return 7;
  if (ratio <= 3) return 5;
  if (ratio <= 4) return 3;
  return 1;
}

function scoreValuationPercentile(percentile) {
  const ratio = saAsRatio(percentile);
  if (ratio === null) return SA_MISSING;
  if (ratio <= 0.20) return 10;
  if (ratio <= 0.40) return 8;
  if (ratio <= 0.60) return 6;
  if (ratio <= 0.80) return 4;
  return 2;
}

function scoreTrend(price, ma50, ma200) {
  const p = saNumber(price);
  const m50 = saNumber(ma50);
  const m200 = saNumber(ma200);
  if (p === null || m50 === null || m200 === null) return SA_MISSING;
  if (p > m50 && m50 > m200) return 10;
  if (p > m200 && p < m50) return 6;
  if (p < m200) return 3;
  return 5;
}

function scoreMomentum(return1m, return3m) {
  const r1 = saAsRatio(return1m);
  const r3 = saAsRatio(return3m);
  if (r1 === null || r3 === null) return SA_MISSING;
  const combined = (r1 * 0.4) + (r3 * 0.6);
  if (combined >= 0.15) return 10;
  if (combined >= 0.08) return 8;
  if (combined >= 0.03) return 6;
  if (combined >= 0) return 4;
  if (combined >= -0.08) return 2;
  return 0;
}

function scoreVolume(relativeVolume) {
  const rv = saNumber(relativeVolume);
  if (rv === null) return SA_MISSING;
  if (rv >= 1.5) return 10;
  if (rv >= 1.2) return 8;
  if (rv >= 1.0) return 6;
  if (rv >= 0.7) return 4;
  return 2;
}

function scoreLiquidity(avgDailyValueTraded) {
  const value = saNumber(avgDailyValueTraded);
  if (value === null) return SA_MISSING;
  if (value >= 50000000) return 10;
  if (value >= 20000000) return 8;
  if (value >= 5000000) return 6;
  if (value >= 1000000) return 4;
  return 1;
}

function preferFiveYear(fiveYear, threeYear) {
  return !saIsMissing(fiveYear) ? fiveYear : threeYear;
}

function scoreValue(score) {
  const n = saNumber(score);
  return n === null ? 0 : Math.max(0, Math.min(10, n));
}

function scoreMarginLevel(margin) {
  const ratio = saAsRatio(margin);
  if (ratio === null) return SA_MISSING;
  if (ratio >= 0.25) return 10;
  if (ratio >= 0.18) return 8;
  if (ratio >= 0.10) return 6;
  if (ratio >= 0.05) return 4;
  if (ratio >= 0) return 2;
  return 0;
}

function scoreReturnOnCapital(returnOnCapital) {
  const ratio = saAsRatio(returnOnCapital);
  if (ratio === null) return SA_MISSING;
  if (ratio >= 0.25) return 10;
  if (ratio >= 0.18) return 8;
  if (ratio >= 0.12) return 6;
  if (ratio >= 0.06) return 4;
  if (ratio >= 0) return 2;
  return 0;
}

function scoreDebtToEquity(debtToEquity) {
  const ratio = saNumber(debtToEquity);
  if (ratio === null) return SA_MISSING;
  if (ratio <= 0) return 10;
  if (ratio <= 0.5) return 9;
  if (ratio <= 1) return 7;
  if (ratio <= 2) return 5;
  if (ratio <= 3) return 3;
  return 1;
}

function scorePayoutRatio(payoutRatio) {
  const ratio = saAsRatio(payoutRatio);
  if (ratio === null) return SA_MISSING;
  if (ratio < 0) return 0;
  if (ratio <= 0.35) return 10;
  if (ratio <= 0.55) return 8;
  if (ratio <= 0.75) return 6;
  if (ratio <= 1.0) return 4;
  return 1;
}

function scoreShareCountChange(change) {
  const ratio = saAsRatio(change);
  if (ratio === null) return SA_MISSING;
  if (ratio <= -0.10) return 10;
  if (ratio <= -0.02) return 8;
  if (ratio <= 0.02) return 6;
  if (ratio <= 0.10) return 3;
  return 1;
}

function scorePERatio(pe) {
  const ratio = saNumber(pe);
  if (ratio === null || ratio <= 0) return SA_MISSING;
  if (ratio <= 12) return 10;
  if (ratio <= 18) return 8;
  if (ratio <= 25) return 6;
  if (ratio <= 35) return 4;
  return 2;
}

function scorePriceToFcf(priceToFcf) {
  const ratio = saNumber(priceToFcf);
  if (ratio === null || ratio <= 0) return SA_MISSING;
  if (ratio <= 12) return 10;
  if (ratio <= 18) return 8;
  if (ratio <= 25) return 6;
  if (ratio <= 35) return 4;
  return 2;
}

function scoreFCFYield(fcfYield) {
  const ratio = saAsRatio(fcfYield);
  if (ratio === null) return SA_MISSING;
  if (ratio >= 0.08) return 10;
  if (ratio >= 0.06) return 8;
  if (ratio >= 0.04) return 6;
  if (ratio >= 0.02) return 4;
  if (ratio >= 0) return 2;
  return 0;
}

function calculateMoatProxyScore(metricRow, fundamentalRows) {
  const grossStability = scoreMarginStability(marginSeries(fundamentalRows, "Gross_Profit"));
  const operatingStability = scoreMarginStability(marginSeries(fundamentalRows, "Operating_Income"));
  const capitalReturn = saAverageScores([
    scoreReturnOnCapital(metricRow.ROE),
    scoreReturnOnCapital(metricRow.ROIC_Proxy)
  ]);
  const revenueConsistency = scoreRevenueConsistency(fundamentalRows);
  return saAverageScores([grossStability, operatingStability, capitalReturn, revenueConsistency]);
}

function calculateBusinessDurabilityScore(metricRow, fundamentalRows, profitabilityScore) {
  return saAverageScores([
    scoreRevenueConsistency(fundamentalRows),
    scoreRevenueGrowth(preferFiveYear(metricRow.Revenue_CAGR_5Y, metricRow.Revenue_CAGR_3Y)),
    profitabilityScore,
    scoreCompleteness(metricRow.Data_Completeness_Score),
    scoreSourceQuality(metricRow.Source_Quality_Weighted_Score)
  ]);
}

function scoreMarginStability(margins) {
  const sd = saStdDev(margins || []);
  const value = saNumber(sd);
  if (value === null) return SA_MISSING;
  if (value <= 0.03) return 10;
  if (value <= 0.05) return 8;
  if (value <= 0.08) return 6;
  if (value <= 0.12) return 4;
  return 2;
}

function scoreRevenueConsistency(fundamentalRows) {
  if (!fundamentalRows || fundamentalRows.length < 4) {
    return SA_MISSING;
  }
  const rows = fundamentalRows.slice().sort(function(a, b) {
    return saNumber(a.Fiscal_Year) - saNumber(b.Fiscal_Year);
  });
  let comparisons = 0;
  let positive = 0;
  for (let i = 1; i < rows.length; i++) {
    const prev = saNumber(rows[i - 1].Revenue);
    const current = saNumber(rows[i].Revenue);
    if (prev !== null && current !== null && prev !== 0) {
      comparisons++;
      if (current >= prev) {
        positive++;
      }
    }
  }
  if (comparisons === 0) return SA_MISSING;
  const ratio = positive / comparisons;
  if (ratio >= 0.90) return 10;
  if (ratio >= 0.75) return 8;
  if (ratio >= 0.60) return 6;
  if (ratio >= 0.40) return 4;
  return 2;
}

function scoreCompleteness(completeness) {
  const ratio = saAsRatio(completeness);
  if (ratio === null) return SA_MISSING;
  if (ratio >= 0.95) return 10;
  if (ratio >= 0.85) return 8;
  if (ratio >= 0.70) return 6;
  if (ratio >= 0.60) return 4;
  return 1;
}

function scoreSourceQuality(sourceQuality) {
  const ratio = saAsRatio(sourceQuality);
  if (ratio === null) return SA_MISSING;
  if (ratio >= 0.95) return 10;
  if (ratio >= 0.85) return 8;
  if (ratio >= 0.70) return 6;
  if (ratio >= 0.50) return 4;
  return 1;
}

function calculateRiskPenalty(metricRow) {
  let penalty = 0;
  const completeness = saAsRatio(metricRow.Data_Completeness_Score);
  const sourceQuality = saAsRatio(metricRow.Source_Quality_Weighted_Score);
  const debtScore = scoreDebtSafety(metricRow.Net_Debt_To_EBITDA_Proxy);
  const fcfMargin = saAsRatio(metricRow.FCF_Margin);
  const netMargin = saAsRatio(metricRow.Net_Margin);

  if (completeness === null || completeness < 0.60) penalty += 3;
  else if (completeness < 0.75) penalty += 1.5;

  if (sourceQuality === null || sourceQuality < 0.70) penalty += 2;
  else if (sourceQuality < 0.85) penalty += 1;

  if (scoreValue(debtScore) <= 3) penalty += 2;
  if (fcfMargin !== null && fcfMargin < 0) penalty += 1.5;
  if (netMargin !== null && netMargin < 0) penalty += 1.5;

  return Math.max(0, Math.min(10, penalty));
}

function longTermLabel(score, dataCompleteness) {
  const n = saNumber(score);
  const dc = saAsRatio(dataCompleteness);
  let label;
  if (n === null) {
    label = "Weak Long-Term Candidate";
  } else if (n >= 8.0) {
    label = "Strong Long-Term Candidate";
  } else if (n >= 6.5) {
    label = "Good but Monitor";
  } else if (n >= 5.0) {
    label = "Average / Caution";
  } else {
    label = "Weak Long-Term Candidate";
  }
  if (dc !== null && dc < 0.60) {
    label += " - Low Data Confidence";
  }
  return label;
}

function longTermExplanationCode(row, total, dataCompleteness, sourceQuality) {
  const codes = ["LT_V" + SA_SCORING_VERSION];
  if (saAsRatio(dataCompleteness) !== null && saAsRatio(dataCompleteness) < 0.60) codes.push("LOW_DATA");
  if (saAsRatio(sourceQuality) !== null && saAsRatio(sourceQuality) < 0.70) codes.push("LOW_SOURCE_QUALITY");
  if (scoreValue(scoreDebtSafety(row.Net_Debt_To_EBITDA_Proxy)) <= 3) codes.push("DEBT_RISK");
  if (saNumber(total) !== null && saNumber(total) >= 8) codes.push("HIGH_SCORE");
  return codes.join("|");
}
