/* Shared helpers for the deterministic stock analytics workbook. */

const SA_NA = "NA";
const SA_MISSING = "Missing";
const SA_STATUS_OK = "OK";
const SA_STATUS_MISSING = "Missing Data";

function saSpreadsheet() {
  return SpreadsheetApp.getActive();
}

function saNow() {
  return new Date();
}

function saNowIso() {
  return Utilities.formatDate(saNow(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
}

function saGetOrCreateSheet(sheetName) {
  const ss = saSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

function saGetSheet(sheetName) {
  return saSpreadsheet().getSheetByName(sheetName);
}

function saEnsureHeaders(sheetName, headers) {
  const sheet = saGetOrCreateSheet(sheetName);
  const currentLastColumn = Math.max(sheet.getLastColumn(), headers.length);
  const currentHeaders = sheet.getRange(1, 1, 1, currentLastColumn).getValues()[0];

  for (let i = 0; i < headers.length; i++) {
    if (currentHeaders[i] !== headers[i]) {
      sheet.getRange(1, i + 1).setValue(headers[i]);
    }
  }

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#1f4e79")
    .setFontColor("#ffffff");

  if (!sheet.getFilter() && sheet.getMaxRows() > 1) {
    sheet.getRange(1, 1, Math.max(2, sheet.getMaxRows()), headers.length).createFilter();
  }

  return sheet;
}

function saHeaderMap(sheetOrHeaders) {
  const headers = Array.isArray(sheetOrHeaders)
    ? sheetOrHeaders
    : sheetOrHeaders.getRange(1, 1, 1, sheetOrHeaders.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach(function(header, index) {
    if (header !== "") {
      map[String(header)] = index;
    }
  });
  return map;
}

function saReadRows(sheetName) {
  const sheet = saGetSheet(sheetName);
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }
  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headers = values[0];
  return values.slice(1)
    .filter(function(row) {
      return row.some(function(value) { return value !== ""; });
    })
    .map(function(row, index) {
      const obj = { _rowNumber: index + 2 };
      headers.forEach(function(header, col) {
        if (header !== "") {
          obj[String(header)] = row[col];
        }
      });
      return obj;
    });
}

function saWriteRows(sheetName, headers, rows) {
  const sheet = saEnsureHeaders(sheetName, headers);
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  if (!rows || rows.length === 0) {
    return sheet;
  }
  const values = rows.map(function(row) {
    return headers.map(function(header) {
      return Object.prototype.hasOwnProperty.call(row, header) ? row[header] : "";
    });
  });
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  return sheet;
}

function saAppendRows(sheetName, headers, rows) {
  if (!rows || rows.length === 0) {
    return;
  }
  const sheet = saEnsureHeaders(sheetName, headers);
  const values = rows.map(function(row) {
    return headers.map(function(header) {
      return Object.prototype.hasOwnProperty.call(row, header) ? row[header] : "";
    });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
}

function saGetColumnIndex(sheet, headerName) {
  const map = saHeaderMap(sheet);
  if (!Object.prototype.hasOwnProperty.call(map, headerName)) {
    return -1;
  }
  return map[headerName] + 1;
}

function saColumnToLetter(column) {
  let temp;
  let letter = "";
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

function saIsMissing(value) {
  return value === null ||
    value === undefined ||
    value === "" ||
    value === SA_NA ||
    value === SA_MISSING ||
    String(value).toLowerCase() === "nan";
}

function saFirstAvailable(values) {
  for (let i = 0; i < values.length; i++) {
    if (!saIsMissing(values[i])) {
      return values[i];
    }
  }
  return "";
}

function saNumber(value) {
  if (saIsMissing(value)) {
    return null;
  }
  if (typeof value === "number") {
    return isNaN(value) ? null : value;
  }
  const cleaned = String(value).replace(/,/g, "").replace(/%/g, "").trim();
  if (cleaned === "") {
    return null;
  }
  const parsed = Number(cleaned);
  return isNaN(parsed) ? null : parsed;
}

function saAsRatio(value) {
  const n = saNumber(value);
  if (n === null) {
    return null;
  }
  return Math.abs(n) > 1 ? n / 100 : n;
}

function saRound(value, digits) {
  const n = saNumber(value);
  if (n === null) {
    return SA_NA;
  }
  const factor = Math.pow(10, digits || 4);
  return Math.round(n * factor) / factor;
}

function saSafeDivide(numerator, denominator) {
  const n = saNumber(numerator);
  const d = saNumber(denominator);
  if (n === null || d === null || d === 0) {
    return SA_NA;
  }
  return n / d;
}

function saCagr(startValue, endValue, years) {
  const start = saNumber(startValue);
  const end = saNumber(endValue);
  const y = saNumber(years);
  if (start === null || end === null || y === null || y <= 0 || start <= 0 || end < 0) {
    return SA_NA;
  }
  return Math.pow(end / start, 1 / y) - 1;
}

function saMean(values) {
  const numeric = values.map(saNumber).filter(function(value) { return value !== null; });
  if (numeric.length === 0) {
    return SA_NA;
  }
  return numeric.reduce(function(sum, value) { return sum + value; }, 0) / numeric.length;
}

function saStdDev(values) {
  const numeric = values.map(saNumber).filter(function(value) { return value !== null; });
  if (numeric.length < 2) {
    return SA_NA;
  }
  const mean = saMean(numeric);
  const variance = numeric.reduce(function(sum, value) {
    return sum + Math.pow(value - mean, 2);
  }, 0) / (numeric.length - 1);
  return Math.sqrt(variance);
}

function saPercentileRank(values, currentValue) {
  const current = saNumber(currentValue);
  const numeric = values.map(saNumber).filter(function(value) { return value !== null; });
  if (current === null || numeric.length === 0) {
    return SA_NA;
  }
  const belowOrEqual = numeric.filter(function(value) { return value <= current; }).length;
  return belowOrEqual / numeric.length;
}

function saAverageScores(scores) {
  const numeric = scores.map(saNumber).filter(function(score) { return score !== null; });
  if (numeric.length === 0) {
    return SA_MISSING;
  }
  return numeric.reduce(function(sum, score) { return sum + score; }, 0) / numeric.length;
}

function saCompleteness(row, requiredFields) {
  if (!requiredFields || requiredFields.length === 0) {
    return SA_NA;
  }
  const available = requiredFields.filter(function(field) {
    return !saIsMissing(row[field]);
  }).length;
  return available / requiredFields.length;
}

function saGroupBy(rows, keyFn) {
  const grouped = {};
  rows.forEach(function(row) {
    const key = keyFn(row);
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(row);
  });
  return grouped;
}

function saTickerKey(market, ticker) {
  return String(market || "").trim() + "|" + String(ticker || "").trim().toUpperCase();
}

function saSortByDateAscending(rows, dateField) {
  return rows.slice().sort(function(a, b) {
    return new Date(a[dateField]).getTime() - new Date(b[dateField]).getTime();
  });
}

function saLatestByDate(rows, dateField) {
  if (!rows || rows.length === 0) {
    return null;
  }
  return saSortByDateAscending(rows, dateField)[rows.length - 1];
}

function saLatestPricesByTicker() {
  const grouped = saGroupBy(saReadRows("Raw_Prices"), function(row) {
    return saTickerKey(row.Market, row.Ticker);
  });
  const latest = {};
  Object.keys(grouped).forEach(function(key) {
    latest[key] = saLatestByDate(grouped[key], "Date");
  });
  return latest;
}

function saGetSetupValue(fieldName) {
  const rows = saReadRows("Setup");
  const found = rows.find(function(row) {
    return row.Field === fieldName;
  });
  return found ? found.Value : "";
}

function saUpdateSetupField(fieldName, value) {
  const sheet = saGetOrCreateSheet("Setup");
  const headers = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, Math.max(3, sheet.getLastColumn())).getValues()[0]
    : ["Field", "Value", "Notes"];
  const map = saHeaderMap(headers);
  if (sheet.getLastRow() < 1 || headers[0] !== "Field") {
    sheet.getRange(1, 1, 1, 3).setValues([["Field", "Value", "Notes"]]);
  }
  const rows = sheet.getLastRow() >= 2 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues() : [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === fieldName) {
      sheet.getRange(i + 2, (map.Value || 1) + 1).setValue(value);
      return;
    }
  }
  sheet.appendRow([fieldName, value, ""]);
}

function saGetScriptProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function saSetScriptProperty(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

function saGetSourceQualityScore(sourceId) {
  if (saIsMissing(sourceId)) {
    return 0;
  }
  const rows = saReadRows("Source_Control");
  const found = rows.find(function(row) {
    return row.Source_ID === sourceId;
  });
  if (!found) {
    return 0;
  }
  const score = saNumber(found.Source_Quality_Score);
  return score === null ? 0 : score;
}

function saWeightedSourceQuality(sourceIds) {
  const ids = (sourceIds || []).filter(function(sourceId) {
    return !saIsMissing(sourceId);
  });
  if (ids.length === 0) {
    return 0;
  }
  const total = ids.reduce(function(sum, sourceId) {
    return sum + saGetSourceQualityScore(sourceId);
  }, 0);
  return total / ids.length;
}

function logError(functionName, market, ticker, errorType, errorMessage, severity, suggestedAction) {
  const headers = SA_SHEET_HEADERS.Error_Log || [
    "Timestamp", "Function", "Market", "Ticker", "Error_Type",
    "Error_Message", "Severity", "Suggested_Action"
  ];
  saAppendRows("Error_Log", headers, [{
    Timestamp: saNowIso(),
    Function: functionName || "",
    Market: market || "",
    Ticker: ticker || "",
    Error_Type: errorType || "Error",
    Error_Message: errorMessage || "",
    Severity: severity || "Medium",
    Suggested_Action: suggestedAction || ""
  }]);
  saUpdateSetupField("Last failed refresh", saNowIso());
}

function saMarkSuccessfulRefresh(label) {
  const stamp = saNowIso();
  saUpdateSetupField("Refresh timestamp", stamp);
  saUpdateSetupField("Last successful refresh", label ? stamp + " - " + label : stamp);
}

function saApplyNumberFormats(sheetName, formatsByHeader) {
  const sheet = saGetSheet(sheetName);
  if (!sheet || sheet.getLastRow() < 2) {
    return;
  }
  Object.keys(formatsByHeader).forEach(function(header) {
    const col = saGetColumnIndex(sheet, header);
    if (col > 0) {
      sheet.getRange(2, col, sheet.getMaxRows() - 1, 1).setNumberFormat(formatsByHeader[header]);
    }
  });
}

function saSetActiveSheet(sheetName) {
  const sheet = saGetSheet(sheetName);
  if (sheet) {
    saSpreadsheet().setActiveSheet(sheet);
  }
}
