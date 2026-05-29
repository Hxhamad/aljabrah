/* Custom Google Sheets menu. */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Stock Analytics")
    .addItem("Initialize Workbook Structure", "setupStockAnalyticsWorkbook")
    .addSeparator()
    .addItem("Refresh Prices", "refreshPrices")
    .addItem("Refresh Fundamentals", "refreshFundamentals")
    .addItem("Recalculate Metrics", "recalculateMetrics")
    .addItem("Recalculate Scores", "recalculateScores")
    .addItem("Generate AI Input", "generateAIInput")
    .addSeparator()
    .addItem("Validate Workbook", "validateWorkbook")
    .addItem("Show Error Log", "showErrorLog")
    .addSeparator()
    .addItem("Seed Sample Data", "seedSampleData")
    .addItem("Legacy Performance Sheet", "generatePerformanceSheet")
    .addToUi();
}

function showErrorLog() {
  setupStockAnalyticsWorkbook();
  saSetActiveSheet("Error_Log");
}
