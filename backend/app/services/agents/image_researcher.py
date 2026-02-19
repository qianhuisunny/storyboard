"""
Image Researcher Sub-Agent - Finds visual assets for screens.
Called by StoryboardWriter for each screen.
"""

import os
from typing import Optional

from app.utils.image_search import GoogleImageSearch


class ImageResearcher:
    """
    Finds appropriate visual assets for storyboard screens.

    Returns asset references based on screen type:
    - stock video: URL or STOCK: description
    - screencast: SCREENCAST: identifier
    - talking head: TALENT: identifier
    - slides/text overlay: GRAPHIC: identifier
    - CTA: CTA-TEMPLATE: identifier
    """

    def __init__(self):
        """Initialize with image search capability."""
        try:
            self.searcher = GoogleImageSearch()
            self.search_enabled = True
        except Exception:
            self.searcher = None
            self.search_enabled = False

    def find(
        self,
        screen_type: str,
        visual_direction: str,
        purpose: str,
        search_images: bool = True
    ) -> dict:
        """
        Find visual asset reference for a screen.

        Args:
            screen_type: Type of screen
            visual_direction: Description of desired visuals
            purpose: What the screen accomplishes
            search_images: Whether to actually search for images

        Returns:
            dict with asset_reference, search_terms, asset_type, fallback_reference
        """
        screen_type_lower = screen_type.lower()

        # Generate search terms from visual direction
        search_terms = self._extract_search_terms(visual_direction, purpose)

        # Generate asset reference based on screen type
        if screen_type_lower == "stock video":
            return self._find_stock_asset(visual_direction, search_terms, search_images)

        elif screen_type_lower == "screencast":
            return self._create_screencast_reference(visual_direction, purpose)

        elif screen_type_lower == "talking head":
            return self._create_talent_reference(visual_direction, purpose)

        elif screen_type_lower in ["slides/text overlay", "slides", "text overlay"]:
            return self._create_graphic_reference(visual_direction, purpose)

        elif screen_type_lower == "cta":
            return self._create_cta_reference(visual_direction, purpose)

        else:
            # Default to stock
            return self._find_stock_asset(visual_direction, search_terms, search_images)

    def _extract_search_terms(self, visual_direction: str, purpose: str) -> list:
        """Extract searchable keywords from visual direction."""
        # Combine visual direction and purpose
        text = f"{visual_direction} {purpose}".lower()

        # Remove common filler words
        stopwords = {
            "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
            "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
            "be", "have", "has", "had", "do", "does", "did", "will", "would",
            "could", "should", "may", "might", "must", "shall", "can", "need",
            "showing", "shown", "displayed", "visible", "prominently", "clearly"
        }

        words = text.split()
        keywords = [w.strip(".,!?;:\"'()[]{}") for w in words if w not in stopwords and len(w) > 2]

        # Group into phrases (take first 5-7 keywords)
        return keywords[:7]

    def _find_stock_asset(
        self,
        visual_direction: str,
        search_terms: list,
        search_images: bool
    ) -> dict:
        """Find a stock video/image asset."""
        search_query = " ".join(search_terms[:5])
        fallback = f"STOCK: {visual_direction[:100]}"

        # Try to actually search if enabled
        image_url = None
        if search_images and self.search_enabled and self.searcher:
            try:
                image_url = self.searcher.get_longest_title_jpeg_link(search_query, num_results=3)
            except Exception:
                pass

        return {
            "asset_reference": image_url or fallback,
            "search_terms": search_terms,
            "asset_type": "stock video",
            "fallback_reference": fallback
        }

    def _create_screencast_reference(self, visual_direction: str, purpose: str) -> dict:
        """Create a screencast asset reference."""
        # Extract key UI elements from visual direction
        identifier = self._create_identifier(visual_direction, "Dashboard")

        return {
            "asset_reference": f"SCREENCAST: {identifier}",
            "search_terms": self._extract_search_terms(visual_direction, purpose),
            "asset_type": "screencast",
            "fallback_reference": f"SCREENCAST: Main-View"
        }

    def _create_talent_reference(self, visual_direction: str, purpose: str) -> dict:
        """Create a talking head asset reference."""
        # Extract person/setting from visual direction
        identifier = self._create_identifier(visual_direction, "Professional-Office")

        return {
            "asset_reference": f"TALENT: {identifier}",
            "search_terms": self._extract_search_terms(visual_direction, purpose),
            "asset_type": "talking head",
            "fallback_reference": f"TALENT: Executive-Professional-Setting"
        }

    def _create_graphic_reference(self, visual_direction: str, purpose: str) -> dict:
        """Create a graphic/slide asset reference."""
        # Determine graphic type from visual direction
        graphic_type = "Info-Graphic"

        if "chart" in visual_direction.lower() or "graph" in visual_direction.lower():
            graphic_type = "Chart"
        elif "comparison" in visual_direction.lower() or "vs" in visual_direction.lower():
            graphic_type = "Comparison"
        elif "icon" in visual_direction.lower():
            graphic_type = "Icons"
        elif "split" in visual_direction.lower():
            graphic_type = "Split-Screen"

        identifier = self._create_identifier(visual_direction, graphic_type)

        return {
            "asset_reference": f"GRAPHIC: {identifier}",
            "search_terms": self._extract_search_terms(visual_direction, purpose),
            "asset_type": "graphic overlay",
            "fallback_reference": f"GRAPHIC: {graphic_type}-Standard"
        }

    def _create_cta_reference(self, visual_direction: str, purpose: str) -> dict:
        """Create a CTA template reference."""
        # Determine CTA type
        cta_type = "Standard"

        if "demo" in visual_direction.lower() or "demo" in purpose.lower():
            cta_type = "Demo-Booking"
        elif "website" in visual_direction.lower() or "url" in visual_direction.lower():
            cta_type = "Website-URL"
        elif "contact" in visual_direction.lower():
            cta_type = "Contact"

        return {
            "asset_reference": f"CTA-TEMPLATE: {cta_type}",
            "search_terms": self._extract_search_terms(visual_direction, purpose),
            "asset_type": "CTA template",
            "fallback_reference": f"CTA-TEMPLATE: Standard-Branded"
        }

    def _create_identifier(self, text: str, default: str) -> str:
        """Create a kebab-case identifier from text."""
        # Take first few significant words
        words = text.split()[:4]
        # Clean and join with hyphens
        clean_words = [w.strip(".,!?;:\"'()[]{}").capitalize() for w in words if len(w) > 2]

        if not clean_words:
            return default

        return "-".join(clean_words[:3])
