import json
import re
import logging
from typing import List, Dict, Any, Optional, Union, Tuple
from pydantic import BaseModel, ValidationError, Field

logger = logging.getLogger(__name__)


class StoryboardScreen(BaseModel):
    """Pydantic model for validating storyboard screen data"""
    screen_number: int
    voiceover_text: str
    duration: Union[int, float]
    screen_type: str
    on_screen_visual_keywords: Optional[str] = None
    action_notes: Optional[str] = None

    class Config:
        # Allow extra fields that might be present
        extra = "allow"


class ExtractionResult(BaseModel):
    """Result of JSON extraction"""
    success: bool
    data: Optional[List[Dict[str, Any]]] = None
    validated_data: Optional[List[StoryboardScreen]] = None
    error: Optional[str] = None
    raw_json_strings: Optional[List[str]] = None


def clean_json_string(json_str: str) -> str:
    """Clean and prepare JSON string for parsing"""
    # Remove leading/trailing whitespace
    json_str = json_str.strip()

    # Remove markdown code block markers
    json_str = re.sub(r'^```json\s*\n?', '', json_str, flags=re.MULTILINE)
    json_str = re.sub(r'\n?```\s*$', '', json_str, flags=re.MULTILINE)

    # Keep exactly the first complete top-level JSON value. JSONDecoder handles
    # nested arrays/objects and brackets inside strings correctly.
    try:
        _value, end = json.JSONDecoder().raw_decode(json_str)
        json_str = json_str[:end]
    except json.JSONDecodeError:
        pass

    return json_str


def extract_json_blocks(text: str) -> List[str]:
    """Extract JSON blocks from text, handling both code blocks and plain JSON"""
    json_blocks = []

    # Pattern for markdown code blocks
    code_block_pattern = r'```(?:json)?\s*\n?(.*?)\n?```'
    code_blocks = re.findall(code_block_pattern, text, re.DOTALL | re.IGNORECASE)

    for block in code_blocks:
        cleaned = clean_json_string(block)
        if cleaned.strip().startswith('[') or cleaned.strip().startswith('{'):
            json_blocks.append(cleaned)

    # If no code blocks found, try to find JSON arrays in plain text
    if not json_blocks:
        # Look for JSON arrays that start with [ and end with ]
        array_pattern = r'\[\s*\{.*?\}\s*\]'
        arrays = re.findall(array_pattern, text, re.DOTALL)

        for array in arrays:
            cleaned = clean_json_string(array)
            json_blocks.append(cleaned)

    # If still no blocks, try to extract from the entire text
    if not json_blocks:
        cleaned = clean_json_string(text)
        if cleaned.strip().startswith('[') or cleaned.strip().startswith('{'):
            json_blocks.append(cleaned)

    return json_blocks


def parse_json_safely(json_str: str) -> Tuple[bool, Optional[Union[List, Dict]], Optional[str]]:
    """Safely parse JSON string"""
    try:
        parsed = json.loads(json_str)
        return True, parsed, None
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse JSON: {e}")
        return False, None, str(e)


def validate_storyboard_data(data: List[Dict[str, Any]]) -> Tuple[bool, Optional[List[StoryboardScreen]], Optional[str]]:
    """Validate storyboard data against Pydantic model"""
    try:
        validated_screens = []
        for item in data:
            # Convert screen_type variations to standard format
            if "screen_type" in item:
                screen_type = item["screen_type"].lower()
                if "slide" in screen_type or "text" in screen_type:
                    item["screen_type"] = "text-overlay"
                elif "stock" in screen_type:
                    item["screen_type"] = "stock-video"
                elif "talking" in screen_type:
                    item["screen_type"] = "talking-head"
                elif "screen" in screen_type:
                    item["screen_type"] = "screencast"
                elif "cta" in screen_type:
                    item["screen_type"] = "cta"

            screen = StoryboardScreen(**item)
            validated_screens.append(screen)

        return True, validated_screens, None
    except ValidationError as e:
        logger.error(f"Validation error: {e}")
        return False, None, str(e)
    except Exception as e:
        logger.error(f"Unexpected error during validation: {e}")
        return False, None, str(e)


def extract_json_from_text(text: str, validate: bool = True) -> ExtractionResult:
    """
    Main function to extract and validate JSON from AI output text

    Args:
        text: The text containing JSON data
        validate: Whether to validate against StoryboardScreen model

    Returns:
        ExtractionResult with success status, data, and any errors
    """
    try:
        # Extract JSON blocks
        json_blocks = extract_json_blocks(text)

        if not json_blocks:
            return ExtractionResult(
                success=False,
                error="No JSON blocks found in the text"
            )

        # Try to parse each JSON block
        parsed_data = []
        successful_blocks = []

        for block in json_blocks:
            success, data, error = parse_json_safely(block)
            if success and data:
                if isinstance(data, list):
                    parsed_data.extend(data)
                    successful_blocks.append(block)
                elif isinstance(data, dict):
                    parsed_data.append(data)
                    successful_blocks.append(block)

        if not parsed_data:
            return ExtractionResult(
                success=False,
                error="Failed to parse any JSON blocks",
                raw_json_strings=json_blocks
            )

        # Validate if requested
        validated_data = None
        if validate and parsed_data:
            validation_success, validated_data, validation_error = validate_storyboard_data(parsed_data)
            if not validation_success:
                logger.warning(f"Validation failed: {validation_error}")
                # Still return the raw data even if validation fails

        return ExtractionResult(
            success=True,
            data=parsed_data,
            validated_data=validated_data,
            raw_json_strings=successful_blocks
        )

    except Exception as e:
        logger.error(f"Unexpected error in extract_json_from_text: {e}")
        return ExtractionResult(
            success=False,
            error=f"Unexpected error: {str(e)}"
        )


def convert_to_story_format(validated_data: List[StoryboardScreen]) -> List[Dict[str, Any]]:
    """Convert validated storyboard data to the format expected by frontend Story interface"""
    stories = []

    for screen in validated_data:
        story = {
            "screen_name": f"screen_{screen.screen_number}",
            "Screen_title": screen.voiceover_text[:50] + "..." if len(screen.voiceover_text) > 50 else screen.voiceover_text,
            "Type": screen.screen_type,
            "Description": screen.voiceover_text,
            "Duration": screen.duration,
            "Notes": screen.action_notes or "",
            "ImageUrl": None,  # Will be populated by frontend or other service
            # Keep original fields as well
            "screen_number": screen.screen_number,
            "voiceover_text": screen.voiceover_text,
            "duration": screen.duration,
            "on_screen_visual_keywords": screen.on_screen_visual_keywords,
            "action_notes": screen.action_notes
        }
        stories.append(story)

    return stories


if __name__ == "__main__":
    # Test with the provided example
    sample_text = """
    Here's your storyboard:

    ```json
    [
      {
        "screen_number": 1,
        "voiceover_text": "The messaging industry is buzzing—brands just got a powerful new tool to boost engagement and expand brand equity.",
        "duration": 8,
        "screen_type": "slides/text overlay",
        "on_screen_visual_keywords": "animated buzzwords, brand logos, dynamic background",
        "action_notes": "Fast-paced intro animation, bold text overlays"
      },
      {
        "screen_number": 2,
        "voiceover_text": "In a world where every business is fighting for attention, traditional SMS just isn't enough to build trust.",
        "duration": 8,
        "screen_type": "stock video",
        "on_screen_visual_keywords": "busy city, people on phones, generic SMS notifications",
        "action_notes": "Quick cuts, muted color palette"
      }
    ]
    ```

    **Total screens:** 2
    **Total duration:** ~16 seconds
    """

    result = extract_json_from_text(sample_text)
    print(f"Success: {result.success}")
    if result.success:
        print(f"Extracted {len(result.data)} items")
        if result.validated_data:
            print(f"Validated {len(result.validated_data)} screens")
            stories = convert_to_story_format(result.validated_data)
            print(f"Converted to {len(stories)} story items")
    else:
        print(f"Error: {result.error}")
