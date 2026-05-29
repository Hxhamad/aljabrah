/* Workbook schema, setup defaults, validation lists, and initializers. */

const SA_SCORING_VERSION = "1.0.0";
const SA_BASE_CURRENCY = "SAR";
const SA_SECONDARY_CURRENCY = "USD";
const SA_VALID_MARKETS = ["Saudi", "US"];

const SA_SHEET_HEADERS = {
  Setup: ["Field", "Value", "Notes"],
  Portfolio: [
    "Holding_ID", "Market", "Ticker", "Exchange", "Company_Name", "Sector", "Industry",
    "Currency", "Shares", "Average_Cost", "Current_Price", "Market_Value_Local",
    "Market_Value_SAR", "Unrealized_Gain_Loss_Local", "Unrealized_Gain_Loss_Percent",
    "Portfolio_Weight", "Position_Type", "User_Notes", "Last_Data_Update", "Data_Status"
  ],
  Transactions: [
    "Transaction_ID", "Date", "Market", "Ticker", "Transaction_Type", "Shares", "Price",
    "Gross_Amount", "Fees", "Tax", "Currency", "FX_Rate_To_SAR", "Net_Amount_SAR",
    "Broker", "Notes", "Override"
  ],
  Source_Control: [
    "Source_ID", "Source_Name", "Source_Type", "Market_Coverage", "Data_Type", "Tier",
    "Source_Quality_Score", "URL_or_Document_Reference", "Refresh_Frequency", "Notes"
  ],
  Raw_Prices: [
    "Date", "Market", "Ticker", "Open", "High", "Low", "Close", "Adjusted_Close",
    "Volume", "Currency", "FX_Rate_To_SAR", "Source_ID", "Imported_At", "Data_Status"
  ],
  Raw_Fundamentals: [
    "Fiscal_Period", "Fiscal_Year", "Market", "Ticker", "Revenue", "Gross_Profit",
    "Operating_Income", "Net_Income", "EPS", "Operating_Cash_Flow",
    "Capital_Expenditure", "Free_Cash_Flow", "Total_Assets", "Total_Liabilities",
    "Cash_And_Equivalents", "Total_Debt", "Shareholders_Equity", "Shares_Outstanding",
    "Dividends_Paid", "Currency", "FX_Rate_To_SAR", "Source_ID", "Imported_At",
    "Data_Status"
  ],
  Metrics_Calculated: [
    "Market", "Ticker", "Revenue_CAGR_3Y", "Revenue_CAGR_5Y", "EPS_CAGR_3Y",
    "EPS_CAGR_5Y", "FCF_CAGR_3Y", "FCF_CAGR_5Y", "Gross_Margin",
    "Operating_Margin", "Net_Margin", "FCF_Margin", "ROE", "ROIC_Proxy",
    "Debt_To_Equity", "Net_Debt", "Net_Debt_To_EBITDA_Proxy",
    "Interest_Coverage_Proxy", "Shares_Outstanding_Change_5Y", "Dividend_Yield",
    "Payout_Ratio", "Price_To_Earnings", "Price_To_Sales", "Price_To_Book",
    "Price_To_FCF", "FCF_Yield", "Current_PE_vs_5Y_Average",
    "Valuation_Percentile_5Y", "Data_Completeness_Score",
    "Source_Quality_Weighted_Score"
  ],
  Technical_Short_Term: [
    "Market", "Ticker", "Price", "Return_1D", "Return_1W", "Return_1M",
    "Return_3M", "Return_6M", "Return_1Y", "High_52W", "Low_52W",
    "Drawdown_From_52W_High", "Moving_Average_50D", "Moving_Average_200D",
    "Price_vs_50DMA", "Price_vs_200DMA", "Average_Volume_20D",
    "Relative_Volume", "Volatility_20D", "ATR_14D_Proxy", "Trend_Status",
    "Momentum_Status", "Liquidity_Status"
  ],
  Long_Term_Score: [
    "Market", "Ticker", "Business_Durability_Score", "Moat_Proxy_Score",
    "Revenue_Growth_Score", "Earnings_Growth_Score", "FCF_Strength_Score",
    "Profitability_Score", "Balance_Sheet_Score", "Shareholder_Treatment_Score",
    "Valuation_Score", "Risk_Penalty", "Long_Term_Total_Score", "Long_Term_Label",
    "Score_Explanation_Code", "Data_Completeness_Score",
    "Source_Quality_Weighted_Score"
  ],
  Short_Term_Score: [
    "Market", "Ticker", "Price_Trend_Score", "Momentum_Score",
    "Volume_Confirmation_Score", "Earnings_Setup_Score", "Sector_Strength_Score",
    "Valuation_Pressure_Score", "Volatility_Risk_Score", "News_Catalyst_Score",
    "Market_Direction_Score", "Liquidity_Score", "Short_Term_Total_Score",
    "Short_Term_Label", "Score_Explanation_Code", "Data_Completeness_Score",
    "Source_Quality_Weighted_Score"
  ],
  Portfolio_Risk: [
    "Total_Portfolio_Value_SAR", "Cash_SAR", "Saudi_Exposure_Percent",
    "US_Exposure_Percent", "USD_Exposure_Percent", "SAR_Exposure_Percent",
    "Sector_Concentration", "Top_1_Position_Weight", "Top_3_Position_Weight",
    "Top_5_Position_Weight", "High_Risk_Positions_Count",
    "Low_Data_Confidence_Positions_Count", "Long_Term_Weighted_Score",
    "Short_Term_Weighted_Score", "Portfolio_Quality_Label", "Risk_Warnings"
  ],
  AI_Input: [
    "Market", "Ticker", "Company_Name", "Portfolio_Weight", "Long_Term_Total_Score",
    "Long_Term_Label", "Short_Term_Total_Score", "Short_Term_Label",
    "Data_Completeness_Score", "Source_Quality_Weighted_Score",
    "Key_Positive_Metrics", "Key_Negative_Metrics", "Missing_Data",
    "Source_IDs_Used", "Last_Updated"
  ],
  Dashboard: ["Section", "Metric", "Value", "Status", "Notes"],
  Error_Log: [
    "Timestamp", "Function", "Market", "Ticker", "Error_Type", "Error_Message",
    "Severity", "Suggested_Action"
  ],
  Validation_Report: [
    "Timestamp", "Check", "Status", "Sheet", "Row", "Message", "Severity"
  ],
  Manual_Signals: [
    "Market", "Ticker", "Earnings_Setup_Score", "Sector_Strength_Score",
    "News_Catalyst_Score", "Market_Direction_Score", "Source_ID", "Notes",
    "Data_Status"
  ]
};

const SA_SETUP_DEFAULTS = [
  ["Base currency", "SAR", "All portfolio weights and risk metrics use SAR."],
  ["Secondary currency", "USD", "Used for U.S. holdings and USD exposure."],
  ["USD/SAR FX rate source", "Manual peg / approved API", "Use fetchFXRates or a reviewed manual value."],
  ["Manual USD/SAR FX Rate", 3.75, "Fallback only when no approved FX API is configured."],
  ["Default benchmark Saudi", "TASI", "Saudi benchmark placeholder."],
  ["Default benchmark U.S.", "S&P 500", "Use selected ETF/index such as IVV, SPY, VOO, or ^GSPC."],
  ["Refresh timestamp", "", "Updated by refresh/recalculate functions."],
  ["API provider names", "FMP,EODHD,SAHMK,Tadawul,Manual", "API keys are stored in Script Properties only."],
  ["API key placeholders", "Stored in PropertiesService", "Set FMP_API_KEY, EODHD_API_KEY, SAHMK_API_KEY as needed."],
  ["Scoring version", SA_SCORING_VERSION, "Deterministic scoring rules version."],
  ["Last successful refresh", "", "Updated after successful refresh/recalculate."],
  ["Last failed refresh", "", "Updated by logError."],
  ["Error log link/reference", "Error_Log", "Open the Error_Log tab from the menu."],
  ["Cash_SAR", 0, "Optional manual cash balance used by Portfolio_Risk."]
];

const SA_DROPDOWNS = {
  Market: SA_VALID_MARKETS,
  Transaction_Type: ["Buy", "Sell", "Dividend", "Fee", "Tax", "Split", "Deposit", "Withdrawal", "FX"],
  Position_Type: ["Core", "Watch", "Speculative", "Income", "Trading"],
  Source_Type: ["Exchange", "Filing", "API", "News", "Manual", "Estimate"],
  Market_Coverage: ["Saudi", "US", "Global"],
  Data_Type: ["Price", "Fundamentals", "Filing", "News", "FX", "Benchmark"],
  Tier: [1, 2, 3, 4],
  Currency: ["SAR", "USD"],
  Data_Status: ["OK", "Manual", "Missing Data", "Insufficient Data", "Provider Missing", "Error"],
  Override: ["", "Override"]
};

function setupStockAnalyticsWorkbook() {
  Object.keys(SA_SHEET_HEADERS).forEach(function(sheetName) {
    saEnsureHeaders(sheetName, SA_SHEET_HEADERS[sheetName]);
  });
  seedSetupDefaults();
  seedDefaultSources();
  applyWorkbookFormatting();
  saMarkSuccessfulRefresh("Workbook structure initialized");
  return "Workbook structure initialized.";
}

function seedSetupDefaults() {
  const sheet = saEnsureHeaders("Setup", SA_SHEET_HEADERS.Setup);
  const existing = saReadRows("Setup").reduce(function(map, row) {
    map[row.Field] = true;
    return map;
  }, {});
  const toAppend = SA_SETUP_DEFAULTS
    .filter(function(row) { return !existing[row[0]]; })
    .map(function(row) {
      return { Field: row[0], Value: row[1], Notes: row[2] };
    });
  if (toAppend.length > 0) {
    saAppendRows("Setup", SA_SHEET_HEADERS.Setup, toAppend);
  }
  sheet.autoResizeColumns(1, 3);
}

function applyWorkbookFormatting() {
  Object.keys(SA_SHEET_HEADERS).forEach(function(sheetName) {
    const sheet = saGetSheet(sheetName);
    if (!sheet) {
      return;
    }
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, SA_SHEET_HEADERS[sheetName].length).setWrap(true);
    sheet.autoResizeColumns(1, SA_SHEET_HEADERS[sheetName].length);
  });

  applyDropdown("Portfolio", "Market", SA_DROPDOWNS.Market);
  applyDropdown("Portfolio", "Position_Type", SA_DROPDOWNS.Position_Type);
  applyDropdown("Portfolio", "Currency", SA_DROPDOWNS.Currency);
  applyDropdown("Transactions", "Market", SA_DROPDOWNS.Market);
  applyDropdown("Transactions", "Transaction_Type", SA_DROPDOWNS.Transaction_Type);
  applyDropdown("Transactions", "Currency", SA_DROPDOWNS.Currency);
  applyDropdown("Transactions", "Override", SA_DROPDOWNS.Override);
  applyDropdown("Source_Control", "Source_Type", SA_DROPDOWNS.Source_Type);
  applyDropdown("Source_Control", "Market_Coverage", SA_DROPDOWNS.Market_Coverage);
  applyDropdown("Source_Control", "Data_Type", SA_DROPDOWNS.Data_Type);
  applyDropdown("Source_Control", "Tier", SA_DROPDOWNS.Tier);
  applyDropdown("Raw_Prices", "Market", SA_DROPDOWNS.Market);
  applyDropdown("Raw_Prices", "Currency", SA_DROPDOWNS.Currency);
  applyDropdown("Raw_Prices", "Data_Status", SA_DROPDOWNS.Data_Status);
  applyDropdown("Raw_Fundamentals", "Market", SA_DROPDOWNS.Market);
  applyDropdown("Raw_Fundamentals", "Currency", SA_DROPDOWNS.Currency);
  applyDropdown("Raw_Fundamentals", "Data_Status", SA_DROPDOWNS.Data_Status);
  applyDropdown("Manual_Signals", "Market", SA_DROPDOWNS.Market);
  applyDropdown("Manual_Signals", "Data_Status", SA_DROPDOWNS.Data_Status);

  applyConditionalFormatting();
  applyNumberFormats();
  protectCalculatedSheets();
}

function applyDropdown(sheetName, headerName, values) {
  const sheet = saGetSheet(sheetName);
  if (!sheet) {
    return;
  }
  const col = saGetColumnIndex(sheet, headerName);
  if (col < 1) {
    return;
  }
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, col, sheet.getMaxRows() - 1, 1).setDataValidation(rule);
}

function applyConditionalFormatting() {
  const red = "#f4cccc";
  const yellow = "#fff2cc";
  const green = "#d9ead3";
  ["Long_Term_Score", "Short_Term_Score", "AI_Input", "Validation_Report", "Error_Log"].forEach(function(sheetName) {
    const sheet = saGetSheet(sheetName);
    if (!sheet) {
      return;
    }
    const range = sheet.getRange(2, 1, Math.max(1, sheet.getMaxRows() - 1), sheet.getMaxColumns());
    const rules = [
      SpreadsheetApp.newConditionalFormatRule().whenTextContains("Weak").setBackground(red).setRanges([range]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextContains("Missing").setBackground(yellow).setRanges([range]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextContains("Low Data Confidence").setBackground(yellow).setRanges([range]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextContains("Strong").setBackground(green).setRanges([range]).build()
    ];
    sheet.setConditionalFormatRules(rules);
  });

  const riskSheet = saGetSheet("Portfolio_Risk");
  if (riskSheet) {
    const range = riskSheet.getRange(2, 1, Math.max(1, riskSheet.getMaxRows() - 1), riskSheet.getMaxColumns());
    riskSheet.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenTextContains("Warning").setBackground(red).setRanges([range]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextContains("Review").setBackground(yellow).setRanges([range]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextContains("Healthy").setBackground(green).setRanges([range]).build()
    ]);
  }
}

function applyNumberFormats() {
  const percentHeaders = [
    "Unrealized_Gain_Loss_Percent", "Portfolio_Weight", "Revenue_CAGR_3Y",
    "Revenue_CAGR_5Y", "EPS_CAGR_3Y", "EPS_CAGR_5Y", "FCF_CAGR_3Y",
    "FCF_CAGR_5Y", "Gross_Margin", "Operating_Margin", "Net_Margin",
    "FCF_Margin", "ROE", "ROIC_Proxy", "Dividend_Yield", "Payout_Ratio",
    "FCF_Yield", "Data_Completeness_Score", "Source_Quality_Weighted_Score",
    "Return_1D", "Return_1W", "Return_1M", "Return_3M", "Return_6M",
    "Return_1Y", "Drawdown_From_52W_High", "Price_vs_50DMA",
    "Price_vs_200DMA", "Volatility_20D", "Saudi_Exposure_Percent",
    "US_Exposure_Percent", "USD_Exposure_Percent", "SAR_Exposure_Percent",
    "Top_1_Position_Weight", "Top_3_Position_Weight", "Top_5_Position_Weight"
  ];

  Object.keys(SA_SHEET_HEADERS).forEach(function(sheetName) {
    const formats = {};
    SA_SHEET_HEADERS[sheetName].forEach(function(header) {
      if (percentHeaders.indexOf(header) >= 0) {
        formats[header] = "0.00%";
      }
    });
    saApplyNumberFormats(sheetName, formats);
  });
}

function protectCalculatedSheets() {
  const calculatedSheets = [
    "Metrics_Calculated", "Technical_Short_Term", "Long_Term_Score",
    "Short_Term_Score", "Portfolio_Risk", "AI_Input", "Dashboard"
  ];
  calculatedSheets.forEach(function(sheetName) {
    const sheet = saGetSheet(sheetName);
    if (!sheet) {
      return;
    }
    const existing = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)
      .filter(function(protection) {
        return protection.getDescription() === "Stock Analytics calculated output";
      });
    if (existing.length > 0) {
      return;
    }
    try {
      const protection = sheet.protect().setDescription("Stock Analytics calculated output");
      protection.setWarningOnly(true);
    } catch (error) {
      logError("protectCalculatedSheets", "", "", "ProtectionError", error.message, "Low", "Sheet protection is optional; continue using workbook.");
    }
  });
}

function seedSampleData() {
  setupStockAnalyticsWorkbook();
  seedSamplePortfolio();
  seedSampleTransactions();
  seedSampleRawPrices();
  seedSampleFundamentals();
  seedSampleManualSignals();
  recalculatePortfolioValues();
  recalculateMetrics();
  recalculateTechnicalShortTerm();
  recalculateScores();
  recalculatePortfolioRisk();
  generateAIInput();
  validateWorkbook();
  saMarkSuccessfulRefresh("Sample data seeded and calculated");
  return "Sample data seeded for Saudi ticker 2222 and U.S. ticker AAPL.";
}

function seedSamplePortfolio() {
  if (saReadRows("Portfolio").length > 0) {
    return;
  }
  saWriteRows("Portfolio", SA_SHEET_HEADERS.Portfolio, [
    {
      Holding_ID: "H-SAU-2222-001", Market: "Saudi", Ticker: "2222", Exchange: "Tadawul",
      Company_Name: "Saudi Arabian Oil Co.", Sector: "Energy", Industry: "Integrated Oil",
      Currency: "SAR", Shares: 100, Average_Cost: 31.5, Position_Type: "Core",
      User_Notes: "Sample Saudi holding"
    },
    {
      Holding_ID: "H-US-AAPL-001", Market: "US", Ticker: "AAPL", Exchange: "NASDAQ",
      Company_Name: "Apple Inc.", Sector: "Technology", Industry: "Consumer Electronics",
      Currency: "USD", Shares: 10, Average_Cost: 180, Position_Type: "Core",
      User_Notes: "Sample U.S. holding"
    }
  ]);
}

function seedSampleTransactions() {
  if (saReadRows("Transactions").length > 0) {
    return;
  }
  saWriteRows("Transactions", SA_SHEET_HEADERS.Transactions, [
    {
      Transaction_ID: "T-SAU-2222-001", Date: new Date("2025-01-15"), Market: "Saudi",
      Ticker: "2222", Transaction_Type: "Buy", Shares: 100, Price: 31.5,
      Gross_Amount: 3150, Fees: 5, Tax: 0, Currency: "SAR", FX_Rate_To_SAR: 1,
      Net_Amount_SAR: 3155, Broker: "Sahm", Notes: "Sample buy"
    },
    {
      Transaction_ID: "T-US-AAPL-001", Date: new Date("2025-02-10"), Market: "US",
      Ticker: "AAPL", Transaction_Type: "Buy", Shares: 10, Price: 180,
      Gross_Amount: 1800, Fees: 1, Tax: 0, Currency: "USD", FX_Rate_To_SAR: 3.75,
      Net_Amount_SAR: 6753.75, Broker: "Sahm", Notes: "Sample buy"
    }
  ]);
}

function seedSampleRawPrices() {
  if (saReadRows("Raw_Prices").length > 0) {
    return;
  }
  const rows = [];
  rows.push.apply(rows, buildSamplePriceSeries("Saudi", "2222", "SAR", 1, "SRC_TADAWUL", 30.1, 0.012, 9000000));
  rows.push.apply(rows, buildSamplePriceSeries("US", "AAPL", "USD", 3.75, "SRC_FMP", 185, 0.018, 52000000));
  saWriteRows("Raw_Prices", SA_SHEET_HEADERS.Raw_Prices, rows);
}

function buildSamplePriceSeries(market, ticker, currency, fx, sourceId, startPrice, volatility, baseVolume) {
  const rows = [];
  const importedAt = saNowIso();
  const start = new Date("2025-05-01");
  for (let i = 0; i < 260; i++) {
    const date = new Date(start.getTime());
    date.setDate(start.getDate() + i);
    const drift = i * 0.0008;
    const wave = Math.sin(i / 13) * volatility + Math.cos(i / 29) * volatility / 2;
    const close = startPrice * (1 + drift + wave);
    const open = close * (1 - 0.002);
    const high = close * (1 + 0.008);
    const low = close * (1 - 0.009);
    rows.push({
      Date: date, Market: market, Ticker: ticker, Open: saRound(open, 4), High: saRound(high, 4),
      Low: saRound(low, 4), Close: saRound(close, 4), Adjusted_Close: saRound(close, 4),
      Volume: Math.round(baseVolume * (1 + Math.sin(i / 7) * 0.12)), Currency: currency,
      FX_Rate_To_SAR: fx, Source_ID: sourceId, Imported_At: importedAt, Data_Status: "OK"
    });
  }
  return rows;
}

function seedSampleFundamentals() {
  if (saReadRows("Raw_Fundamentals").length > 0) {
    return;
  }
  const rows = [];
  rows.push.apply(rows, buildSampleFundamentalSeries("Saudi", "2222", "SAR", 1, "SRC_TADAWUL", 2020, 230000, 50000, 700000));
  rows.push.apply(rows, buildSampleFundamentalSeries("US", "AAPL", "USD", 3.75, "SRC_SEC", 2020, 274515, 57411, 323888));
  saWriteRows("Raw_Fundamentals", SA_SHEET_HEADERS.Raw_Fundamentals, rows);
}

function buildSampleFundamentalSeries(market, ticker, currency, fx, sourceId, startYear, revenue, netIncome, assets) {
  const rows = [];
  for (let i = 0; i < 6; i++) {
    const growth = Math.pow(1.07, i);
    const rev = revenue * growth;
    const ni = netIncome * Math.pow(1.06, i);
    const ocf = ni * 1.18;
    const capex = ni * 0.22;
    const equity = assets * 0.28 * Math.pow(1.04, i);
    const debt = assets * 0.18 * Math.pow(1.02, i);
    const cash = assets * 0.10 * Math.pow(1.03, i);
    const shares = market === "US" ? 15800 - i * 180 : 242000;
    rows.push({
      Fiscal_Period: "FY", Fiscal_Year: startYear + i, Market: market, Ticker: ticker,
      Revenue: saRound(rev, 2), Gross_Profit: saRound(rev * 0.43, 2),
      Operating_Income: saRound(rev * 0.27, 2), Net_Income: saRound(ni, 2),
      EPS: saRound(ni / shares, 4), Operating_Cash_Flow: saRound(ocf, 2),
      Capital_Expenditure: saRound(capex, 2), Free_Cash_Flow: saRound(ocf - capex, 2),
      Total_Assets: saRound(assets * Math.pow(1.05, i), 2),
      Total_Liabilities: saRound(assets * 0.62 * Math.pow(1.04, i), 2),
      Cash_And_Equivalents: saRound(cash, 2), Total_Debt: saRound(debt, 2),
      Shareholders_Equity: saRound(equity, 2), Shares_Outstanding: shares,
      Dividends_Paid: saRound(ni * 0.24, 2), Currency: currency, FX_Rate_To_SAR: fx,
      Source_ID: sourceId, Imported_At: saNowIso(), Data_Status: "OK"
    });
  }
  return rows;
}

function seedSampleManualSignals() {
  if (saReadRows("Manual_Signals").length > 0) {
    return;
  }
  saWriteRows("Manual_Signals", SA_SHEET_HEADERS.Manual_Signals, [
    {
      Market: "Saudi", Ticker: "2222", Earnings_Setup_Score: 6,
      Sector_Strength_Score: 5, News_Catalyst_Score: SA_MISSING,
      Market_Direction_Score: 6, Source_ID: "SRC_MANUAL", Notes: "Sample manual signal",
      Data_Status: "Manual"
    },
    {
      Market: "US", Ticker: "AAPL", Earnings_Setup_Score: 7,
      Sector_Strength_Score: 7, News_Catalyst_Score: SA_MISSING,
      Market_Direction_Score: 6, Source_ID: "SRC_MANUAL", Notes: "Sample manual signal",
      Data_Status: "Manual"
    }
  ]);
}
