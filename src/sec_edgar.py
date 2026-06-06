"""Free SEC EDGAR submissions and filing-text evidence retrieval."""

from __future__ import annotations

from datetime import date, timedelta
import json
import logging
from pathlib import Path
import time
from typing import Any
import warnings

from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning
import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .config import ProjectConfig


LOGGER = logging.getLogger(__name__)
SEC_BASE = "https://www.sec.gov"
SEC_DATA = "https://data.sec.gov"

EVIDENCE_COLUMNS = [
    "ticker",
    "filing_date",
    "form",
    "accession_number",
    "primary_document",
    "matched_keyword",
    "filing_url",
    "risk_category",
]


def risk_category_for_keyword(keyword: str) -> str:
    """Map configured evidence phrases to conservative research categories."""

    key = keyword.lower()
    if "reverse split" in key or "stock split" in key:
        return "reverse_split"
    if any(token in key for token in ("offering", "at-the-market", "atm offering", "dilution")):
        return "dilution"
    if any(token in key for token in ("nasdaq deficiency", "delisting", "compliance")):
        return "delisting_compliance"
    if "going concern" in key:
        return "going_concern"
    if "warrant" in key or "convertible" in key:
        return "warrants_convertibles"
    return "other"


class SecClient:
    """Rate-conscious SEC HTTP client with retry and local caching."""

    def __init__(self, config: ProjectConfig, refresh: bool = False) -> None:
        self.config = config
        self.refresh = refresh
        self.cache_dir = config.project_root / "data" / "sec_filings"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.delay = float(config.get("sec_request_delay_seconds", 0.12))
        self.session = requests.Session()
        retry = Retry(
            total=int(config.get("request_retries", 3)),
            backoff_factor=0.8,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=("GET",),
        )
        self.session.mount("https://", HTTPAdapter(max_retries=retry))
        self.session.headers.update(
            {
                "User-Agent": str(config.get("user_agent")),
                "Accept-Encoding": "gzip, deflate",
            }
        )

    def _get(self, url: str) -> requests.Response:
        time.sleep(self.delay)
        response = self.session.get(
            url, timeout=float(self.config.get("request_timeout_seconds", 30))
        )
        response.raise_for_status()
        return response

    def ticker_map(self) -> dict[str, dict[str, Any]]:
        path = self.cache_dir / "company_tickers.json"
        if not path.exists() or self.refresh:
            payload = self._get(f"{SEC_BASE}/files/company_tickers.json").content
            temp = path.with_suffix(".tmp")
            temp.write_bytes(payload)
            temp.replace(path)
        raw = json.loads(path.read_text(encoding="utf-8"))
        return {
            str(item["ticker"]).upper(): item
            for item in raw.values()
            if item.get("ticker") and item.get("cik_str")
        }

    def submissions(self, ticker: str, cik: int) -> dict[str, Any]:
        path = self.cache_dir / f"{ticker}_submissions.json"
        if not path.exists() or self.refresh:
            url = f"{SEC_DATA}/submissions/CIK{int(cik):010d}.json"
            payload = self._get(url).content
            temp = path.with_suffix(".tmp")
            temp.write_bytes(payload)
            temp.replace(path)
        return json.loads(path.read_text(encoding="utf-8"))

    def filing_text(self, ticker: str, url: str, accession: str) -> str:
        document_dir = self.cache_dir / "documents" / ticker
        document_dir.mkdir(parents=True, exist_ok=True)
        path = document_dir / f"{accession.replace('-', '')}.txt"
        if not path.exists() or self.refresh:
            content = self._get(url).content
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", XMLParsedAsHTMLWarning)
                soup = BeautifulSoup(content, "lxml")
            text = soup.get_text(" ", strip=True)
            temp = path.with_suffix(".tmp")
            temp.write_text(text, encoding="utf-8", errors="ignore")
            temp.replace(path)
        return path.read_text(encoding="utf-8", errors="ignore")


def _recent_filings(submissions: dict[str, Any]) -> pd.DataFrame:
    recent = submissions.get("filings", {}).get("recent", {})
    if not recent:
        return pd.DataFrame()
    lengths = [len(value) for value in recent.values() if isinstance(value, list)]
    if not lengths:
        return pd.DataFrame()
    row_count = min(lengths)
    return pd.DataFrame({key: value[:row_count] for key, value in recent.items() if isinstance(value, list)})


def collect_sec_evidence(
    ticker: str,
    config: ProjectConfig,
    client: SecClient,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Collect recent filing metadata and filing-level keyword matches."""

    ticker_map = client.ticker_map()
    mapping = ticker_map.get(ticker)
    if not mapping:
        return pd.DataFrame(columns=EVIDENCE_COLUMNS), {
            "sec_status": "not found",
            "sec_recent_risk_count_180d": 0,
            "sec_recent_risk_count_365d": 0,
        }

    cik = int(mapping["cik_str"])
    submissions = client.submissions(ticker, cik)
    filings = _recent_filings(submissions)
    if filings.empty:
        return pd.DataFrame(columns=EVIDENCE_COLUMNS), {
            "sec_status": "not found",
            "sec_recent_risk_count_180d": 0,
            "sec_recent_risk_count_365d": 0,
        }

    filings["filingDate"] = pd.to_datetime(filings["filingDate"], errors="coerce")
    cutoff_365 = pd.Timestamp(date.today() - timedelta(days=365))
    forms = set(str(value).upper() for value in config.get("sec_forms_to_check"))
    selected = filings[
        filings["form"].astype(str).str.upper().isin(forms)
        & (filings["filingDate"] >= cutoff_365)
    ].copy()
    selected = selected.sort_values("filingDate", ascending=False)

    metadata_path = config.project_root / "data" / "sec_filings" / f"{ticker}_filings.csv"
    selected.to_csv(metadata_path, index=False, date_format="%Y-%m-%d")
    keywords = [str(value) for value in config.get("sec_keywords")]
    evidence: list[dict[str, Any]] = []
    document_limit = int(config.get("sec_max_documents_per_ticker", 20))

    for position, (_, row) in enumerate(selected.iterrows()):
        accession = str(row.get("accessionNumber", ""))
        primary_document = str(row.get("primaryDocument", ""))
        accession_compact = accession.replace("-", "")
        filing_url = (
            f"{SEC_BASE}/Archives/edgar/data/{cik}/{accession_compact}/{primary_document}"
            if accession and primary_document
            else ""
        )
        metadata_text = " ".join(
            str(row.get(column, ""))
            for column in ("form", "primaryDocDescription", "items", "primaryDocument")
        ).lower()
        searchable_text = metadata_text
        if position < document_limit and filing_url:
            try:
                searchable_text += " " + client.filing_text(
                    ticker, filing_url, accession
                ).lower()
            except Exception as exc:
                LOGGER.warning("%s: filing text unavailable for %s: %s", ticker, accession, exc)

        for keyword in keywords:
            if keyword.lower() in searchable_text:
                evidence.append(
                    {
                        "ticker": ticker,
                        "filing_date": row["filingDate"].date().isoformat(),
                        "form": row.get("form", ""),
                        "accession_number": accession,
                        "primary_document": primary_document,
                        "matched_keyword": keyword,
                        "filing_url": filing_url,
                        "risk_category": risk_category_for_keyword(keyword),
                    }
                )

    evidence_frame = pd.DataFrame(evidence, columns=EVIDENCE_COLUMNS).drop_duplicates()
    cutoff_180 = date.today() - timedelta(days=180)
    if evidence_frame.empty:
        count_180 = count_365 = 0
    else:
        evidence_dates = pd.to_datetime(evidence_frame["filing_date"]).dt.date
        count_365 = int(evidence_frame["accession_number"].nunique())
        count_180 = int(
            evidence_frame.loc[evidence_dates >= cutoff_180, "accession_number"].nunique()
        )
    return evidence_frame, {
        "sec_status": "checked" if len(selected) else "not found",
        "sec_recent_risk_count_180d": count_180,
        "sec_recent_risk_count_365d": count_365,
        "cik": cik,
        "sec_forms_checked": int(len(selected)),
    }
