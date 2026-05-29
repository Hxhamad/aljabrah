/* AI-ready export only. This file does not call any AI model. */

function generateAIInput() {
  const portfolio = saReadRows("Portfolio");
  const metrics = saReadRows("Metrics_Calculated").reduce(function(map, row) {
    map[saTickerKey(row.Market, row.Ticker)] = row;
    return map;
  }, {});
  const longScores = saReadRows("Long_Term_Score").reduce(function(map, row) {
    map[saTickerKey(row.Market, row.Ticker)] = row;
    return map;
  }, {});
  const shortScores = saReadRows("Short_Term_Score").reduce(function(map, row) {
    map[saTickerKey(row.Market, row.Ticker)] = row;
    return map;
  }, {});

  const rows = portfolio.map(function(position) {
    const key = saTickerKey(position.Market, position.Ticker);
    const metric = metrics[key] || {};
    const longScore = longScores[key] || {};
    const shortScore = shortScores[key] || {};
    return {
      Market: position.Market,
      Ticker: position.Ticker,
      Company_Name: position.Company_Name,
      Portfolio_Weight: position.Portfolio_Weight,
      Long_Term_Total_Score: longScore.Long_Term_Total_Score || SA_MISSING,
      Long_Term_Label: longScore.Long_Term_Label || SA_MISSING,
      Short_Term_Total_Score: shortScore.Short_Term_Total_Score || SA_MISSING,
      Short_Term_Label: shortScore.Short_Term_Label || SA_MISSING,
      Data_Completeness_Score: mergedCompleteness(longScore, shortScore, metric),
      Source_Quality_Weighted_Score: mergedSourceQuality(longScore, shortScore, metric),
      Key_Positive_Metrics: structuredMetricList(keyPositiveMetrics(metric, longScore, shortScore)),
      Key_Negative_Metrics: structuredMetricList(keyNegativeMetrics(metric, longScore, shortScore)),
      Missing_Data: structuredMissingList(missingDataFields(metric, longScore, shortScore)),
      Source_IDs_Used: sourceIdsUsedForTicker(position.Market, position.Ticker).join(","),
      Last_Updated: saNowIso()
    };
  });

  saWriteRows("AI_Input", SA_SHEET_HEADERS.AI_Input, rows);
  saMarkSuccessfulRefresh("AI input generated");
  return rows.length;
}

function mergedCompleteness(longScore, shortScore, metric) {
  const values = [
    longScore.Data_Completeness_Score,
    shortScore.Data_Completeness_Score,
    metric.Data_Completeness_Score
  ].map(saNumber).filter(function(value) { return value !== null; });
  return values.length === 0 ? SA_MISSING : saMean(values);
}

function mergedSourceQuality(longScore, shortScore, metric) {
  const values = [
    longScore.Source_Quality_Weighted_Score,
    shortScore.Source_Quality_Weighted_Score,
    metric.Source_Quality_Weighted_Score
  ].map(saNumber).filter(function(value) { return value !== null; });
  return values.length === 0 ? SA_MISSING : saMean(values);
}

function keyPositiveMetrics(metric, longScore, shortScore) {
  const output = [];
  pushMetricIf(output, "Revenue_CAGR_5Y", metric.Revenue_CAGR_5Y, saAsRatio(metric.Revenue_CAGR_5Y) !== null && saAsRatio(metric.Revenue_CAGR_5Y) >= 0.10);
  pushMetricIf(output, "FCF_Margin", metric.FCF_Margin, saAsRatio(metric.FCF_Margin) !== null && saAsRatio(metric.FCF_Margin) >= 0.15);
  pushMetricIf(output, "ROE", metric.ROE, saAsRatio(metric.ROE) !== null && saAsRatio(metric.ROE) >= 0.15);
  pushMetricIf(output, "Long_Term_Total_Score", longScore.Long_Term_Total_Score, saNumber(longScore.Long_Term_Total_Score) !== null && saNumber(longScore.Long_Term_Total_Score) >= 7);
  pushMetricIf(output, "Short_Term_Total_Score", shortScore.Short_Term_Total_Score, saNumber(shortScore.Short_Term_Total_Score) !== null && saNumber(shortScore.Short_Term_Total_Score) >= 7);
  return output;
}

function keyNegativeMetrics(metric, longScore, shortScore) {
  const output = [];
  pushMetricIf(output, "Net_Debt_To_EBITDA_Proxy", metric.Net_Debt_To_EBITDA_Proxy, scoreValue(scoreDebtSafety(metric.Net_Debt_To_EBITDA_Proxy)) <= 3);
  pushMetricIf(output, "FCF_Margin", metric.FCF_Margin, saAsRatio(metric.FCF_Margin) !== null && saAsRatio(metric.FCF_Margin) < 0);
  pushMetricIf(output, "Data_Completeness_Score", metric.Data_Completeness_Score, saAsRatio(metric.Data_Completeness_Score) !== null && saAsRatio(metric.Data_Completeness_Score) < 0.60);
  pushMetricIf(output, "Long_Term_Total_Score", longScore.Long_Term_Total_Score, saNumber(longScore.Long_Term_Total_Score) !== null && saNumber(longScore.Long_Term_Total_Score) < 5);
  pushMetricIf(output, "Short_Term_Total_Score", shortScore.Short_Term_Total_Score, saNumber(shortScore.Short_Term_Total_Score) !== null && saNumber(shortScore.Short_Term_Total_Score) < 5);
  return output;
}

function missingDataFields(metric, longScore, shortScore) {
  const fields = [];
  [
    "Revenue_CAGR_5Y", "EPS_CAGR_5Y", "FCF_CAGR_5Y", "ROIC_Proxy",
    "Net_Debt_To_EBITDA_Proxy", "Valuation_Percentile_5Y"
  ].forEach(function(field) {
    if (saIsMissing(metric[field])) {
      fields.push(field);
    }
  });
  if (String(longScore.Score_Explanation_Code || "").indexOf("LOW_DATA") >= 0) {
    fields.push("Long_Term_Low_Data_Confidence");
  }
  if (String(shortScore.Score_Explanation_Code || "").indexOf("NEWS_MISSING") >= 0) {
    fields.push("News_Catalyst_Source");
  }
  if (String(shortScore.Score_Explanation_Code || "").indexOf("EARNINGS_MISSING") >= 0) {
    fields.push("Earnings_Setup_Source");
  }
  return fields;
}

function pushMetricIf(output, name, value, condition) {
  if (condition) {
    output.push(name + "=" + value);
  }
}

function structuredMetricList(items) {
  return items.length === 0 ? "" : items.join(";");
}

function structuredMissingList(items) {
  const unique = {};
  items.forEach(function(item) {
    unique[item] = true;
  });
  return Object.keys(unique).sort().join(";");
}
