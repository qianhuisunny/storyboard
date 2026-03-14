"""
Text chunker — splits documents into overlapping chunks for embedding.
"""


def chunk_text(
    text: str,
    chunk_size: int = 500,
    overlap: int = 50,
) -> list[dict]:
    """Split text into chunks by word count with overlap.

    Args:
        text: Full document text
        chunk_size: Target words per chunk
        overlap: Words of overlap between consecutive chunks

    Returns:
        List of {"text": str, "index": int, "word_count": int}
    """
    if not text or not text.strip():
        return []

    words = text.split()
    if len(words) <= chunk_size:
        return [{"text": text.strip(), "index": 0, "word_count": len(words)}]

    chunks = []
    start = 0
    idx = 0

    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunk_words = words[start:end]
        chunk_text = " ".join(chunk_words)

        chunks.append({
            "text": chunk_text,
            "index": idx,
            "word_count": len(chunk_words),
        })

        idx += 1
        start += chunk_size - overlap
        if start >= len(words):
            break

    return chunks
