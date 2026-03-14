"""
Embeddings — OpenAI text-embedding-3-small + pure Python cosine similarity.
No numpy dependency.
"""

import math
import os
from typing import Optional

from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return _client


def embed_texts(texts: list[str], model: str = "text-embedding-3-small") -> list[list[float]]:
    """Embed a batch of texts using OpenAI embeddings API.

    Args:
        texts: List of text strings to embed
        model: Embedding model to use

    Returns:
        List of embedding vectors (list of floats)
    """
    if not texts:
        return []

    client = _get_client()

    # OpenAI allows up to 2048 inputs per batch
    all_embeddings = []
    batch_size = 512
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        response = client.embeddings.create(input=batch, model=model)
        for item in response.data:
            all_embeddings.append(item.embedding)

    return all_embeddings


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors. Pure Python, no numpy."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def find_similar(
    query_embedding: list[float],
    embeddings: list[list[float]],
    top_k: int = 5,
) -> list[tuple[int, float]]:
    """Find top-k most similar embeddings to a query.

    Args:
        query_embedding: Query vector
        embeddings: List of document chunk embeddings
        top_k: Number of results to return

    Returns:
        List of (index, similarity_score) tuples, sorted by score descending
    """
    scores = []
    for i, emb in enumerate(embeddings):
        sim = cosine_similarity(query_embedding, emb)
        scores.append((i, sim))

    scores.sort(key=lambda x: x[1], reverse=True)
    return scores[:top_k]
