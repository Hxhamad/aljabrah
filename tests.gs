/* Workbook validation and deterministic scoring tests. */

function validateWorkbook() {
  const findings = [];
  validateRequiredTabs(findings);
  validateRequiredColumns(findings);
  validateMarketLabels(findings);
  validateUniqueIds(findings);
  validatePortfolioWeights(findings);
  validateSourcesAndFx(findings);
  validateSharesAndPrices(findings);
  validateDataConfidence(findings);
  findings.push.apply(findings, validateSourceControl());

  if (findings.length === 0) {
    findings.push({
      Timestamp: saNowIso(), Check: "Workbook validation", Status: "Pass",
      Sheet: "", Row: "", Message: "No validation issues found.", Severity: "Info"
    });
  }

  saWriteRows("Validation_Report", SA_SHEET_HEADERS.Validation_Report, findings);
  saSetActiveSheet("Validation_Report");
  return findings;
}

function validateRequiredTabs(findings) {
  const ss = saSpreadsheet();
  Object.keys(SA_SHEET_HEADERS).forEach(function(sheetName) {
    if (!ss.getSheetByName(sheetName)) {
      addFinding(findings, "Required tabs exist", "Fail", sheetName, "", "Missing required sheet: " + sheetName, "High");
    }
  });
}

function validateRequiredColumns(findings) {
  Object.keys(SA_SHEET_HEADERS).forEach(function(sheetName) {
    const sheet = saGetSheet(sheetName);
    if (!sheet) {
      return;
    }
    const existing = saHeaderMap(sheet);
    SA_SHEET_HEADERS[sheetName].forEach(function(header) {
      if (!Object.prototype.hasOwnProperty.call(existing, header)) {
        addFinding(findings, "Required columns exist", "Fail", sheetName, 1, "Missing required column: " + header, "High");
      }
    });
  });
}

function validateMarketLabels(findings) {
  ["Portfolio", "Transactions", "Raw_Prices", "Raw_Fundamentals", "Metrics_Calculated", "Technical_Short_Term"].forEach(function(sheetName) {
    saReadRows(sheetName).forEach(function(row) {
      if (SA_VALID_MARKETS.indexOf(row.Market) < 0) {
        addFinding(findings, "Valid market labels", "Fail", sheetName, row._rowNumber, "Invalid or missing market label.", "High");
      }
      if (!saIsMissing(row.Ticker) && String(row.Ticker).indexOf(":") >= 0) {
        addFinding(findings, "Ticker format", "Warn", sheetName, row._rowNumber, "Ticker contains an exchange prefix. Keep market in Market and ticker in Ticker.", "Medium");
      }
    });
  });
}

function validateUniqueIds(findings) {
  validateUniqueColumn(findings, "Portfolio", "Holding_ID");
  validateUniqueColumn(findings, "Transactions", "Transaction_ID");
}

function validateUniqueColumn(findings, sheetName, columnName) {
  const seen = {};
  saReadRows(sheetName).forEach(function(row) {
    const value = row[columnName];
    if (saIsMissing(value)) {
      addFinding(findings, "Unique " + columnName, "Fail", sheetName, row._rowNumber, columnName + " is missing.", "High");
      return;
    }
    if (seen[value]) {
      addFinding(findings, "Unique " + columnName, "Fail", sheetName, row._rowNumber, "Duplicate " + columnName + ": " + value, "High");
    }
    seen[value] = true;
  });
}

function validatePortfolioWeights(findings) {
  const rows = saReadRows("Portfolio");
  if (rows.length === 0) {
    return;
  }
  const sum = rows.reduce(function(total, row) {
    return total + (saNumber(row.Portfolio_Weight) || 0);
  }, 0);
  if (Math.abs(sum - 1) > 0.005) {
    addFinding(findings, "Portfolio weights sum close to 100%", "Warn", "Portfolio", "", "Portfolio weights sum to " + saRound(sum, 4) + ", expected about 1.00.", "Medium");
  }
}

function validateSourcesAndFx(findings) {
  ["Raw_Prices", "Raw_Fundamentals"].forEach(function(sheetName) {
    saReadRows(sheetName).forEach(function(row) {
      if (saIsMissing(row.Source_ID)) {
        addFinding(findings, "Missing source IDs", "Fail", sheetName, row._rowNumber, "Source_ID is missing.", "High");
      } else if (saGetSourceQualityScore(row.Source_ID) === 0) {
        addFinding(findings, "Approved source IDs", "Warn", sheetName, row._rowNumber, "Source_ID is not listed in Source_Control: " + row.Source_ID, "Medium");
      }
      if (saNumber(row.FX_Rate_To_SAR) === null) {
        addFinding(findings, "Missing FX rates", "Fail", sheetName, row._rowNumber, "FX_Rate_To_SAR is missing or invalid.", "High");
      }
    });
  });
}

function validateSharesAndPrices(findings) {
  saReadRows("Portfolio").forEach(function(row) {
    const shares = saNumber(row.Shares);
    if (shares === null || shares < 0) {
      addFinding(findings, "Invalid negative shares", "Fail", "Portfolio", row._rowNumber, "Shares must be zero or positive.", "High");
    }
    if (saNumber(row.Current_Price) === null) {
      addFinding(findings, "Missing price data", "Warn", "Portfolio", row._rowNumber, "Current_Price is missing. Refresh prices or add Raw_Prices rows.", "Medium");
    }
  });
  saReadRows("Transactions").forEach(function(row) {
    const shares = saNumber(row.Shares);
    if (shares !== null && shares < 0) {
      addFinding(findings, "Invalid negative shares", "Fail", "Transactions", row._rowNumber, "Transaction shares must not be negative; use Transaction_Type for direction.", "High");
    }
  });
}

function validateDataConfidence(findings) {
  ["Metrics_Calculated", "Long_Term_Score", "Short_Term_Score", "AI_Input"].forEach(function(sheetName) {
    saReadRows(sheetName).forEach(function(row) {
      const completeness = saAsRatio(row.Data_Completeness_Score);
      if (completeness !== null && completeness < 0.60) {
        addFinding(findings, "Low data completeness warnings", "Warn", sheetName, row._rowNumber, "Data completeness below 60%.", "Medium");
      }
      const quality = saAsRatio(row.Source_Quality_Weighted_Score);
      if (quality !== null && quality < 0.70) {
        addFinding(findings, "Low source quality warnings", "Warn", sheetName, row._rowNumber, "Source quality below 70%.", "Medium");
      }
    });
  });
}

function addFinding(findings, check, status, sheet, row, message, severity) {
  findings.push({
    Timestamp: saNowIso(),
    Check: check,
    Status: status,
    Sheet: sheet,
    Row: row,
    Message: message,
    Severity: severity
  });
}

function runStockAnalyticsTests() {
  const results = [];
  assertEqual(results, "scoreRevenueGrowth >15%", 10, scoreRevenueGrowth(0.151));
  assertEqual(results, "scoreRevenueGrowth 10-15%", 8, scoreRevenueGrowth(0.10));
  assertEqual(results, "scoreRevenueGrowth negative", 1, scoreRevenueGrowth(-0.01));
  assertEqual(results, "scoreRevenueGrowth missing", SA_MISSING, scoreRevenueGrowth(""));
  assertEqual(results, "scoreFCFMargin >20%", 10, scoreFCFMargin(0.21));
  assertEqual(results, "scoreFCFMargin negative", 0, scoreFCFMargin(-0.01));
  assertEqual(results, "scoreDebtSafety net cash", 10, scoreDebtSafety(-0.5));
  assertEqual(results, "scoreDebtSafety 2x to 3x", 5, scoreDebtSafety(2.5));
  assertEqual(results, "scoreDebtSafety negative EBITDA", 0, scoreDebtSafety("Negative EBITDA"));
  assertEqual(results, "scoreValuationPercentile cheapest", 10, scoreValuationPercentile(0.20));
  assertEqual(results, "scoreValuationPercentile expensive", 2, scoreValuationPercentile(0.90));
  assertEqual(results, "scoreTrend strong", 10, scoreTrend(110, 100, 90));
  assertEqual(results, "scoreTrend weak", 6, scoreTrend(95, 100, 90));
  assertEqual(results, "scoreTrend down", 3, scoreTrend(80, 90, 100));
  assertEqual(results, "scoreMomentum positive", 8, scoreMomentum(0.05, 0.10));
  assertEqual(results, "scoreVolume high", 10, scoreVolume(1.5));
  assertEqual(results, "scoreLiquidity high", 10, scoreLiquidity(50000000));

  if (results.some(function(row) { return row.Status === "Fail"; })) {
    saWriteRows("Validation_Report", SA_SHEET_HEADERS.Validation_Report, results.map(function(row) {
      return {
        Timestamp: saNowIso(), Check: "Scoring tests", Status: row.Status,
        Sheet: "tests.gs", Row: "", Message: row.Name + " expected " + row.Expected + " got " + row.Actual,
        Severity: row.Status === "Fail" ? "High" : "Info"
      };
    }));
    throw new Error("One or more scoring tests failed. See Validation_Report.");
  }
  Logger.log(JSON.stringify(results));
  return results;
}

function assertEqual(results, name, expected, actual) {
  results.push({
    Name: name,
    Expected: expected,
    Actual: actual,
    Status: expected === actual ? "Pass" : "Fail"
  });
}
