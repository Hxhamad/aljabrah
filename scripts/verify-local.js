const fs = require("fs");

class Range {
  constructor(sheet, row, col, numRows = 1, numCols = 1) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows;
    this.numCols = numCols;
  }

  _ensure(row, col) {
    this.sheet._ensure(row, col);
  }

  getValues() {
    const output = [];
    for (let r = 0; r < this.numRows; r++) {
      const values = [];
      for (let c = 0; c < this.numCols; c++) {
        const row = this.row + r;
        const col = this.col + c;
        values.push((this.sheet.data[row - 1] && this.sheet.data[row - 1][col - 1]) || "");
      }
      output.push(values);
    }
    return output;
  }

  setValues(values) {
    for (let r = 0; r < values.length; r++) {
      for (let c = 0; c < values[r].length; c++) {
        const row = this.row + r;
        const col = this.col + c;
        this._ensure(row, col);
        this.sheet.data[row - 1][col - 1] = values[r][c];
      }
    }
    return this;
  }

  setValue(value) {
    return this.setValues([[value]]);
  }

  clearContent() {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) {
        const row = this.row + r;
        const col = this.col + c;
        this._ensure(row, col);
        this.sheet.data[row - 1][col - 1] = "";
      }
    }
    return this;
  }

  createFilter() { this.sheet.filter = true; return {}; }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
  setWrap() { return this; }
  setFontFamily() { return this; }
  setFontSize() { return this; }
  setHorizontalAlignment() { return this; }
  setNumberFormat() { return this; }
  setDataValidation() { return this; }
  setFormula() { return this; }
  copyTo() { return this; }
  getFormulas() {
    return Array.from({ length: this.numRows }, () => Array.from({ length: this.numCols }, () => ""));
  }
}

class Protection {
  constructor() {
    this.description = "";
  }

  getDescription() { return this.description; }
  setDescription(value) { this.description = value; return this; }
  setWarningOnly() { return this; }
}

class Sheet {
  constructor(name) {
    this.name = name;
    this.data = [];
    this.filter = false;
    this.protections = [];
    this.maxRows = 1000;
    this.maxCols = 64;
  }

  _ensure(row, col) {
    while (this.data.length < row) this.data.push([]);
    while (this.data[row - 1].length < col) this.data[row - 1].push("");
    this.maxRows = Math.max(this.maxRows, row);
    this.maxCols = Math.max(this.maxCols, col);
  }

  getRange(row, col, numRows = 1, numCols = 1) {
    return new Range(this, row, col, numRows, numCols);
  }

  getLastRow() {
    for (let row = this.data.length; row >= 1; row--) {
      if ((this.data[row - 1] || []).some((value) => value !== "" && value !== undefined)) return row;
    }
    return 0;
  }

  getLastColumn() {
    let max = 0;
    for (const row of this.data) {
      for (let col = row.length; col >= 1; col--) {
        if (row[col - 1] !== "" && row[col - 1] !== undefined) {
          max = Math.max(max, col);
          break;
        }
      }
    }
    return max;
  }

  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  setFrozenRows() { return this; }
  autoResizeColumns() { return this; }
  getFilter() { return this.filter ? {} : null; }
  appendRow(values) { this.getRange(this.getLastRow() + 1, 1, 1, values.length).setValues([values]); }
  setConditionalFormatRules() { return this; }
  getProtections() { return this.protections; }
  protect() {
    const protection = new Protection();
    this.protections.push(protection);
    return protection;
  }
  getDataRange() {
    return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  }
}

class Spreadsheet {
  constructor() {
    this.sheets = {};
    this.active = null;
  }

  getSheetByName(name) { return this.sheets[name] || null; }
  insertSheet(name) {
    const sheet = new Sheet(name);
    this.sheets[name] = sheet;
    return sheet;
  }
  deleteSheet(sheet) { delete this.sheets[sheet.name]; }
  setActiveSheet(sheet) { this.active = sheet; }
}

const spreadsheet = new Spreadsheet();
const SpreadsheetApp = {
  getActive: () => spreadsheet,
  flush: () => {},
  ProtectionType: { SHEET: "SHEET" },
  newDataValidation: () => ({
    requireValueInList() { return this; },
    setAllowInvalid() { return this; },
    build() { return {}; }
  }),
  newConditionalFormatRule: () => ({
    whenTextContains() { return this; },
    setBackground() { return this; },
    setRanges() { return this; },
    build() { return {}; }
  })
};
const Session = { getScriptTimeZone: () => "UTC" };
const Utilities = {
  formatDate: (date) => new Date(date).toISOString().slice(0, 19).replace("T", " ")
};
const props = new Map();
const PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (key) => props.get(key) || null,
    setProperty: (key, value) => props.set(key, String(value))
  })
};
const Logger = { log: () => {} };
const UrlFetchApp = {
  fetch: () => {
    throw new Error("Network fetch disabled in local verification harness.");
  }
};

const files = fs.readdirSync(".").filter((file) => /\.gs(\.js)?$/.test(file)).sort();
const source = files.map((file) => `\n// ${file}\n${fs.readFileSync(file, "utf8")}`).join("\n");
const run = new Function(
  "SpreadsheetApp",
  "Session",
  "Utilities",
  "PropertiesService",
  "Logger",
  "UrlFetchApp",
  `${source}
    const tests = runStockAnalyticsTests();
    const seedResult = seedSampleData();
    return {
      appsScriptFiles: ${JSON.stringify(files)},
      testAssertions: tests.length,
      seedResult,
      validationRows: saReadRows("Validation_Report").length,
      errorRows: saReadRows("Error_Log").length
    };
  `
);

const result = run(SpreadsheetApp, Session, Utilities, PropertiesService, Logger, UrlFetchApp);
console.log(JSON.stringify(result, null, 2));
