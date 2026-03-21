"""
File and content extraction utilities.

Extracts text from PDF, DOCX, and HTML content.
"""

import re
import html as html_module
from pathlib import Path


def extract_text_from_pdf(file_path: Path) -> str:
    """Extract text content from a PDF file."""
    try:
        import PyPDF2
        text = ""
        with open(file_path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                text += page.extract_text() or ""
        return text.strip()
    except ImportError:
        return f"[PDF file: {file_path.name} - install PyPDF2 for text extraction]"
    except Exception as e:
        return f"[Error extracting PDF: {str(e)}]"


def extract_text_from_docx(file_path: Path) -> str:
    """Extract text content from a DOCX file."""
    try:
        from docx import Document
        doc = Document(file_path)
        text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
        return text.strip()
    except ImportError:
        return f"[DOCX file: {file_path.name} - install python-docx for text extraction]"
    except Exception as e:
        return f"[Error extracting DOCX: {str(e)}]"


def extract_text_from_html(html_content: str) -> tuple:
    """
    Extract title and text from HTML content.

    Returns:
        (title, text_content) tuple
    """
    # Remove script, style, nav, footer, header elements
    cleaned = re.sub(r'<script[^>]*>.*?</script>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r'<style[^>]*>.*?</style>', '', cleaned, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r'<nav[^>]*>.*?</nav>', '', cleaned, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r'<footer[^>]*>.*?</footer>', '', cleaned, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r'<header[^>]*>.*?</header>', '', cleaned, flags=re.DOTALL | re.IGNORECASE)

    # Extract title
    title_match = re.search(r'<title[^>]*>(.*?)</title>', cleaned, re.IGNORECASE | re.DOTALL)
    title = title_match.group(1).strip() if title_match else ""

    # Remove HTML tags
    text_content = re.sub(r'<[^>]+>', ' ', cleaned)
    # Normalize whitespace
    text_content = re.sub(r'\s+', ' ', text_content).strip()
    # Decode HTML entities
    text_content = html_module.unescape(text_content)

    return title, text_content
