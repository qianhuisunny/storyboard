"""
Document processor — extracts text from PDFs and web URLs.
"""

import re
from pathlib import Path
from typing import Optional


def process_pdf(file_path: str | Path) -> dict:
    """Extract text from a PDF file.

    Returns:
        {"source": filename, "source_type": "pdf", "text": full_text, "page_count": int}
    """
    from PyPDF2 import PdfReader

    path = Path(file_path)
    reader = PdfReader(str(path))
    pages = []
    for page in reader.pages:
        text = page.extract_text() or ""
        pages.append(text)

    full_text = "\n\n".join(pages)
    # Clean up common PDF artifacts
    full_text = re.sub(r"\n{3,}", "\n\n", full_text)
    full_text = re.sub(r" {2,}", " ", full_text)

    return {
        "source": path.name,
        "source_type": "pdf",
        "text": full_text.strip(),
        "page_count": len(reader.pages),
    }


def process_url(url: str, timeout: int = 15) -> dict:
    """Fetch and extract text from a web URL.

    Returns:
        {"source": url, "source_type": "url", "text": extracted_text, "title": page_title}
    """
    import requests
    from bs4 import BeautifulSoup

    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; PlotlineBot/1.0)"
    }
    resp = requests.get(url, headers=headers, timeout=timeout)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    # Remove script, style, nav, footer elements
    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()

    title = soup.title.string if soup.title else ""

    # Extract main content — prefer article or main tags
    main = soup.find("article") or soup.find("main") or soup.find("body")
    if not main:
        text = soup.get_text(separator="\n", strip=True)
    else:
        text = main.get_text(separator="\n", strip=True)

    # Clean up
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {2,}", " ", text)

    return {
        "source": url,
        "source_type": "url",
        "text": text.strip(),
        "title": title or "",
    }
