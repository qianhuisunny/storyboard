"""
Web Search utility using Google Custom Search API.
Returns web page results (not images).
"""

import os
from typing import List, Dict

import requests
from dotenv import load_dotenv

load_dotenv()


def search_web(query: str, num_results: int = 5) -> List[Dict[str, str]]:
    """
    Search the web using Google Custom Search API.

    Args:
        query: Search query string
        num_results: Number of results (max 10)

    Returns:
        List of {title, snippet, link, displayLink}
    """
    api_key = os.getenv("GOOGLE_CSE_API_KEY")
    search_engine_id = os.getenv("SEARCH_ENGINE_ID")

    if not api_key or not search_engine_id:
        print("[web_search] Missing GOOGLE_CSE_API_KEY or SEARCH_ENGINE_ID")
        return []

    if num_results > 10:
        num_results = 10

    params = {
        "key": api_key,
        "cx": search_engine_id,
        "q": query,
        "num": num_results,
    }

    try:
        response = requests.get(
            "https://www.googleapis.com/customsearch/v1",
            params=params,
            timeout=10,
        )

        if response.status_code in (403, 429):
            print(f"[web_search] API error {response.status_code} for query: {query}")
            return []

        response.raise_for_status()
        data = response.json()

        results = []
        for item in data.get("items", []):
            results.append({
                "title": item.get("title", ""),
                "snippet": item.get("snippet", ""),
                "link": item.get("link", ""),
                "displayLink": item.get("displayLink", ""),
            })

        return results

    except requests.exceptions.RequestException as e:
        print(f"[web_search] Request error: {e}")
        return []
