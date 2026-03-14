"""
RAG (Retrieval-Augmented Generation) pipeline for user-uploaded documents.

Supports PDF files and web URLs. Chunks documents, embeds with OpenAI,
and retrieves relevant chunks for evidence research.
"""

from .store import RAGStore
from .document_processor import process_pdf, process_url

__all__ = ["RAGStore", "process_pdf", "process_url"]
