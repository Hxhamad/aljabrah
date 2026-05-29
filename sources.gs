/* Approved source registry and provider configuration helpers. */

const SA_SOURCE_TIER_SCORES = {
  1: 1.00,
  2: 0.85,
  3: 0.70,
  4: 0.25
};

const SA_DEFAULT_SOURCES = [
  {
    Source_ID: "SRC_TADAWUL", Source_Name: "Tadawul / Saudi Exchange",
    Source_Type: "Exchange", Market_Coverage: "Saudi", Data_Type: "Price",
    Tier: 1, Source_Quality_Score: 1.00,
    URL_or_Document_Reference: "https://www.saudiexchange.sa",
    Refresh_Frequency: "Daily", Notes: "Tier 1 exchange source for Saudi listed securities."
  },
  {
    Source_ID: "SRC_TADAWUL_FILINGS", Source_Name: "Tadawul/company filings",
    Source_Type: "Filing", Market_Coverage: "Saudi", Data_Type: "Filing",
    Tier: 1, Source_Quality_Score: 1.00,
    URL_or_Document_Reference: "https://www.saudiexchange.sa",
    Refresh_Frequency: "Quarterly/Annual", Notes: "Confirmed fundamental facts only."
  },
  {
    Source_ID: "SRC_SEC", Source_Name: "SEC filings",
    Source_Type: "Filing", Market_Coverage: "US", Data_Type: "Filing",
    Tier: 1, Source_Quality_Score: 1.00,
    URL_or_Document_Reference: "https://www.sec.gov/edgar",
    Refresh_Frequency: "Quarterly/Annual", Notes: "Tier 1 U.S. filings."
  },
  {
    Source_ID: "SRC_FMP", Source_Name: "Financial Modeling Prep",
    Source_Type: "API", Market_Coverage: "US", Data_Type: "Fundamentals",
    Tier: 2, Source_Quality_Score: 0.85,
    URL_or_Document_Reference: "https://financialmodelingprep.com",
    Refresh_Frequency: "Daily/Quarterly", Notes: "Structured API, verify against filings when material."
  },
  {
    Source_ID: "SRC_EODHD", Source_Name: "EODHD",
    Source_Type: "API", Market_Coverage: "Global", Data_Type: "Price",
    Tier: 2, Source_Quality_Score: 0.85,
    URL_or_Document_Reference: "https://eodhd.com",
    Refresh_Frequency: "Daily", Notes: "Structured market data API."
  },
  {
    Source_ID: "SRC_SAHMK", Source_Name: "SAHMK API",
    Source_Type: "API", Market_Coverage: "Saudi", Data_Type: "Price",
    Tier: 2, Source_Quality_Score: 0.85,
    URL_or_Document_Reference: "SAHMK provider configuration",
    Refresh_Frequency: "Daily", Notes: "Placeholder until a verified endpoint is configured."
  },
  {
    Source_ID: "SRC_POLYGON", Source_Name: "Polygon / Massive",
    Source_Type: "API", Market_Coverage: "US", Data_Type: "Price",
    Tier: 2, Source_Quality_Score: 0.85,
    URL_or_Document_Reference: "https://polygon.io",
    Refresh_Frequency: "Daily", Notes: "Structured price API."
  },
  {
    Source_ID: "SRC_MANUAL", Source_Name: "Reviewed manual entry",
    Source_Type: "Manual", Market_Coverage: "Global", Data_Type: "Price",
    Tier: 3, Source_Quality_Score: 0.70,
    URL_or_Document_Reference: "User maintained workbook entry",
    Refresh_Frequency: "Manual", Notes: "Use when no trusted API is configured; retain notes."
  },
  {
    Source_ID: "SRC_NEWS_REPUTABLE", Source_Name: "Reputable news source",
    Source_Type: "News", Market_Coverage: "Global", Data_Type: "News",
    Tier: 3, Source_Quality_Score: 0.70,
    URL_or_Document_Reference: "Source-specific URL required",
    Refresh_Frequency: "Manual/API", Notes: "May support catalyst fields, not confirmed facts."
  },
  {
    Source_ID: "SRC_UNVERIFIED", Source_Name: "Unverified commentary",
    Source_Type: "Estimate", Market_Coverage: "Global", Data_Type: "News",
    Tier: 4, Source_Quality_Score: 0.25,
    URL_or_Document_Reference: "Do not use for confirmed facts",
    Refresh_Frequency: "Never for facts", Notes: "Blogs, forums, social media, or unverified commentary."
  },
  {
    Source_ID: "SRC_FX_MANUAL", Source_Name: "Manual USD/SAR FX rate",
    Source_Type: "Manual", Market_Coverage: "Global", Data_Type: "FX",
    Tier: 3, Source_Quality_Score: 0.70,
    URL_or_Document_Reference: "Setup!Manual USD/SAR FX Rate",
    Refresh_Frequency: "Manual", Notes: "Fallback only; replace with approved FX API when available."
  }
];

function seedDefaultSources() {
  const existing = saReadRows("Source_Control").reduce(function(map, row) {
    map[row.Source_ID] = true;
    return map;
  }, {});
  const missing = SA_DEFAULT_SOURCES.filter(function(row) {
    return !existing[row.Source_ID];
  });
  if (missing.length > 0) {
    saAppendRows("Source_Control", SA_SHEET_HEADERS.Source_Control, missing);
  }
}

function normalizeSourceTierScore(tier) {
  const key = String(tier);
  return Object.prototype.hasOwnProperty.call(SA_SOURCE_TIER_SCORES, key)
    ? SA_SOURCE_TIER_SCORES[key]
    : 0;
}

function getApprovedSources(dataType, market) {
  return saReadRows("Source_Control").filter(function(source) {
    const typeMatch = !dataType || source.Data_Type === dataType;
    const marketMatch = !market || source.Market_Coverage === market || source.Market_Coverage === "Global";
    const tier = saNumber(source.Tier);
    return typeMatch && marketMatch && tier !== null && tier <= 3;
  });
}

function validateSourceControl() {
  const rows = saReadRows("Source_Control");
  const findings = [];
  rows.forEach(function(row) {
    const expected = normalizeSourceTierScore(row.Tier);
    const actual = saNumber(row.Source_Quality_Score);
    if (actual === null || Math.abs(actual - expected) > 0.0001) {
      findings.push({
        Timestamp: saNowIso(), Check: "Source quality tier mapping", Status: "Fail",
        Sheet: "Source_Control", Row: row._rowNumber,
        Message: "Source " + row.Source_ID + " tier " + row.Tier + " should score " + expected + ".",
        Severity: "High"
      });
    }
  });
  return findings;
}

function setProviderApiKey(providerName, apiKey) {
  const key = providerNameToPropertyKey(providerName);
  saSetScriptProperty(key, apiKey);
  return "Stored " + key + " in Apps Script PropertiesService.";
}

function getProviderApiKey(providerName) {
  return saGetScriptProperty(providerNameToPropertyKey(providerName));
}

function providerNameToPropertyKey(providerName) {
  return String(providerName || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_") + "_API_KEY";
}

function getProviderConfig(providerName) {
  const normalized = String(providerName || "").trim().toUpperCase();
  const apiKey = getProviderApiKey(normalized);
  if (normalized === "FMP") {
    return {
      name: "FMP",
      apiKey: apiKey,
      sourceId: "SRC_FMP",
      priceBaseUrl: "https://financialmodelingprep.com/api/v3/quote",
      incomeBaseUrl: "https://financialmodelingprep.com/api/v3/income-statement",
      balanceBaseUrl: "https://financialmodelingprep.com/api/v3/balance-sheet-statement",
      cashflowBaseUrl: "https://financialmodelingprep.com/api/v3/cash-flow-statement"
    };
  }
  if (normalized === "EODHD") {
    return {
      name: "EODHD",
      apiKey: apiKey,
      sourceId: "SRC_EODHD",
      priceBaseUrl: "https://eodhd.com/api/real-time"
    };
  }
  if (normalized === "SAHMK") {
    return {
      name: "SAHMK",
      apiKey: apiKey,
      sourceId: "SRC_SAHMK",
      priceBaseUrl: ""
    };
  }
  return {
    name: "Manual",
    apiKey: "",
    sourceId: "SRC_MANUAL",
    priceBaseUrl: ""
  };
}

function requireProviderKey(providerConfig, functionName, market, ticker) {
  if (!providerConfig.apiKey) {
    logError(
      functionName,
      market || "",
      ticker || "",
      "MissingApiKey",
      providerConfig.name + " API key is not configured in Apps Script PropertiesService.",
      "Medium",
      "Run setProviderApiKey('" + providerConfig.name + "', 'YOUR_KEY') or use reviewed manual import rows."
    );
    return false;
  }
  return true;
}

function sourceIdsUsedForTicker(market, ticker) {
  const key = saTickerKey(market, ticker);
  const ids = {};
  saReadRows("Raw_Prices").forEach(function(row) {
    if (saTickerKey(row.Market, row.Ticker) === key && !saIsMissing(row.Source_ID)) {
      ids[row.Source_ID] = true;
    }
  });
  saReadRows("Raw_Fundamentals").forEach(function(row) {
    if (saTickerKey(row.Market, row.Ticker) === key && !saIsMissing(row.Source_ID)) {
      ids[row.Source_ID] = true;
    }
  });
  saReadRows("Manual_Signals").forEach(function(row) {
    if (saTickerKey(row.Market, row.Ticker) === key && !saIsMissing(row.Source_ID)) {
      ids[row.Source_ID] = true;
    }
  });
  return Object.keys(ids).sort();
}
