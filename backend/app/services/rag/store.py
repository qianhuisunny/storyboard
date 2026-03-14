"""
RAG Store — manages document chunks + embeddings for a project.
Persists to JSON files in data/project_{id}/rag/.
"""

import json
from pathlib import Path
from typing import Optional

from .chunker import chunk_text
from .document_processor import process_pdf, process_url
from .embeddings import embed_texts, find_similar


# Resolve data directory
REPO_ROOT = Path(__file__).parent.parent.parent.parent.parent
DATA_DIR = REPO_ROOT / "data"


class RAGStore:
    """Per-project document store with embedding-based retrieval."""

    def __init__(self, project_id: str):
        self.project_id = project_id
        self.store_dir = DATA_DIR / f"project_{project_id}" / "rag"
        self.store_dir.mkdir(parents=True, exist_ok=True)
        self._index_path = self.store_dir / "index.json"
        self._index = self._load_index()

    def _load_index(self) -> dict:
        """Load or create the document index."""
        if self._index_path.exists():
            return json.loads(self._index_path.read_text())
        return {"documents": [], "chunks": [], "embeddings": []}

    def _save_index(self):
        """Persist the index to disk."""
        self._index_path.write_text(
            json.dumps(self._index, ensure_ascii=False)
        )

    @property
    def document_count(self) -> int:
        return len(self._index["documents"])

    @property
    def chunk_count(self) -> int:
        return len(self._index["chunks"])

    def list_documents(self) -> list[dict]:
        """List all ingested documents (without chunk/embedding data)."""
        return [
            {"source": d["source"], "source_type": d["source_type"],
             "chunk_count": d["chunk_count"]}
            for d in self._index["documents"]
        ]

    def add_pdf(self, file_path: str | Path) -> dict:
        """Process and ingest a PDF file.

        Returns:
            {"source": filename, "chunks_added": int}
        """
        doc = process_pdf(file_path)
        return self._ingest_document(doc)

    def add_url(self, url: str) -> dict:
        """Fetch, process, and ingest a web URL.

        Returns:
            {"source": url, "chunks_added": int}
        """
        doc = process_url(url)
        return self._ingest_document(doc)

    def _ingest_document(self, doc: dict) -> dict:
        """Chunk, embed, and store a processed document."""
        text = doc["text"]
        source = doc["source"]
        source_type = doc["source_type"]

        # Check for duplicate
        for existing in self._index["documents"]:
            if existing["source"] == source:
                return {"source": source, "chunks_added": 0,
                        "message": "Already ingested"}

        # Chunk
        chunks = chunk_text(text, chunk_size=500, overlap=50)
        if not chunks:
            return {"source": source, "chunks_added": 0,
                    "message": "No text extracted"}

        # Embed
        chunk_texts = [c["text"] for c in chunks]
        embeddings = embed_texts(chunk_texts)

        # Store
        base_idx = len(self._index["chunks"])
        for i, chunk in enumerate(chunks):
            chunk["source"] = source
            chunk["global_index"] = base_idx + i

        self._index["documents"].append({
            "source": source,
            "source_type": source_type,
            "chunk_count": len(chunks),
            "chunk_start": base_idx,
        })
        self._index["chunks"].extend(chunks)
        self._index["embeddings"].extend(embeddings)

        self._save_index()

        return {"source": source, "chunks_added": len(chunks)}

    def query(self, question: str, top_k: int = 5) -> list[dict]:
        """Retrieve chunks most relevant to a question.

        Args:
            question: The query text
            top_k: Number of chunks to return

        Returns:
            List of {"text": str, "source": str, "score": float}
        """
        if not self._index["chunks"] or not self._index["embeddings"]:
            return []

        # Embed the query
        query_emb = embed_texts([question])[0]

        # Find similar
        results = find_similar(query_emb, self._index["embeddings"], top_k=top_k)

        return [
            {
                "text": self._index["chunks"][idx]["text"],
                "source": self._index["chunks"][idx].get("source", ""),
                "score": round(score, 4),
            }
            for idx, score in results
            if score > 0.3  # Minimum relevance threshold
        ]

    def clear(self):
        """Remove all documents and embeddings."""
        self._index = {"documents": [], "chunks": [], "embeddings": []}
        self._save_index()
