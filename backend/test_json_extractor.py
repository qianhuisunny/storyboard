"""
Test suite for JSON extractor utility
"""
import json
from app.utils.json_extractor import (
    extract_json_from_text,
    clean_json_string,
    extract_json_blocks,
    parse_json_safely,
    validate_storyboard_data,
    convert_to_story_format,
    StoryboardScreen,
    ExtractionResult
)

class TestExtractJsonBlocks:
    """Test the extract_json_blocks function"""

    def test_extract_from_markdown_code_block(self):
        """Test extracting JSON from markdown code blocks"""
        text = """Here's your data:

        ```json
        [{"screen_number": 1, "voiceover_text": "test"}]
        ```

        That's it!"""

        blocks = extract_json_blocks(text)
        assert len(blocks) == 1
        assert '{"screen_number": 1, "voiceover_text": "test"}' in blocks[0]

    def test_extract_from_plain_text(self):
        """Test extracting JSON from plain text"""
        text = 'Here is the data: [{"screen_number": 1, "voiceover_text": "test"}] - end'
        blocks = extract_json_blocks(text)
        assert len(blocks) == 1

    def test_extract_multiple_blocks(self):
        """Test extracting multiple JSON blocks"""
        text = """First block:
        ```json
        [{"screen_number": 1}]
        ```

        Second block:
        ```json
        [{"screen_number": 2}]
        ```"""

        blocks = extract_json_blocks(text)
        assert len(blocks) == 2

    def test_no_json_found(self):
        """Test when no JSON is found"""
        text = "This is just plain text with no JSON data."
        blocks = extract_json_blocks(text)
        assert len(blocks) == 0


class TestParseJsonSafely:
    """Test the parse_json_safely function"""

    def test_valid_json(self):
        """Test parsing valid JSON"""
        json_str = '[{"test": "value"}]'
        success, data, error = parse_json_safely(json_str)
        assert success is True
        assert data == [{"test": "value"}]
        assert error is None

    def test_invalid_json(self):
        """Test parsing invalid JSON"""
        json_str = '[{"test": "value"'  # Missing closing bracket
        success, data, error = parse_json_safely(json_str)
        assert success is False
        assert data is None
        assert error is not None


class TestValidateStoryboardData:
    """Test the validate_storyboard_data function"""

    def test_valid_storyboard_data(self):
        """Test validating valid storyboard data"""
        data = [
            {
                "screen_number": 1,
                "voiceover_text": "Test voiceover",
                "duration": 8,
                "screen_type": "stock-video",
                "on_screen_visual_keywords": "test keywords",
                "action_notes": "test notes"
            }
        ]

        success, validated_data, error = validate_storyboard_data(data)
        assert success is True
        assert len(validated_data) == 1
        assert isinstance(validated_data[0], StoryboardScreen)
        assert error is None

    def test_screen_type_conversion(self):
        """Test screen type conversion"""
        data = [
            {
                "screen_number": 1,
                "voiceover_text": "Test",
                "duration": 8,
                "screen_type": "slides/text overlay"  # Should convert to text-overlay
            }
        ]

        success, validated_data, error = validate_storyboard_data(data)
        assert success is True
        assert validated_data[0].screen_type == "text-overlay"

    def test_missing_required_fields(self):
        """Test validation with missing required fields"""
        data = [
            {
                "screen_number": 1,
                # Missing voiceover_text, duration, screen_type
            }
        ]

        success, validated_data, error = validate_storyboard_data(data)
        assert success is False
        assert validated_data is None
        assert error is not None


class TestExtractJsonFromText:
    """Test the main extract_json_from_text function"""

    def test_successful_extraction_with_validation(self):
        """Test successful extraction with validation"""
        text = """Here's your storyboard:

        ```json
        [
          {
            "screen_number": 1,
            "voiceover_text": "Test voiceover text",
            "duration": 8,
            "screen_type": "stock-video",
            "on_screen_visual_keywords": "test keywords",
            "action_notes": "test notes"
          }
        ]
        ```"""

        result = extract_json_from_text(text, validate=True)
        assert result.success is True
        assert len(result.data) == 1
        assert len(result.validated_data) == 1
        assert isinstance(result.validated_data[0], StoryboardScreen)

    def test_extraction_without_validation(self):
        """Test extraction without validation"""
        text = """```json
        [{"any_field": "any_value"}]
        ```"""

        result = extract_json_from_text(text, validate=False)
        assert result.success is True
        assert len(result.data) == 1
        assert result.validated_data is None

    def test_no_json_found(self):
        """Test when no JSON is found"""
        text = "This is just plain text with no JSON."
        result = extract_json_from_text(text)
        assert result.success is False
        assert "No JSON blocks found" in result.error

    def test_malformed_json(self):
        """Test with malformed JSON"""
        text = """```json
        [{"screen_number": 1, "voiceover_text": "test"
        ```"""

        result = extract_json_from_text(text)
        assert result.success is False
        assert "Failed to parse any JSON blocks" in result.error

    def test_complex_real_world_example(self):
        """Test with the real-world example from the user"""
        text = """Here's your storyboard:

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
        **Total duration:** ~16 seconds"""

        result = extract_json_from_text(text)
        assert result.success is True
        assert len(result.data) == 2
        assert len(result.validated_data) == 2
        assert result.validated_data[0].screen_type == "text-overlay"
        assert result.validated_data[1].screen_type == "stock-video"


class TestConvertToStoryFormat:
    """Test the convert_to_story_format function"""

    def test_conversion_to_story_format(self):
        """Test converting validated data to story format"""
        validated_data = [
            StoryboardScreen(
                screen_number=1,
                voiceover_text="Test voiceover text for the first screen",
                duration=8,
                screen_type="stock-video",
                on_screen_visual_keywords="test keywords",
                action_notes="test notes"
            )
        ]

        stories = convert_to_story_format(validated_data)

        assert len(stories) == 1
        story = stories[0]

        # Check required frontend fields
        assert story["screen_name"] == "screen_1"
        assert story["Screen_title"] == "Test voiceover text for the first screen"
        assert story["Type"] == "stock-video"
        assert story["Description"] == "Test voiceover text for the first screen"
        assert story["Duration"] == 8
        assert story["Notes"] == "test notes"

        # Check original fields are preserved
        assert story["screen_number"] == 1
        assert story["voiceover_text"] == "Test voiceover text for the first screen"

    def test_title_truncation(self):
        """Test that long titles are truncated"""
        long_text = "This is a very long voiceover text that should definitely be truncated when used as a title"
        validated_data = [
            StoryboardScreen(
                screen_number=1,
                voiceover_text=long_text,
                duration=8,
                screen_type="stock-video"
            )
        ]

        stories = convert_to_story_format(validated_data)
        title = stories[0]["Screen_title"]

        assert len(title) <= 53  # 50 chars + "..."
        assert title.endswith("...")


def run_all_tests():
    """Run all tests manually"""
    print("Running JSON Extractor Tests...")

    test_classes = [
        TestCleanJsonString,
        TestExtractJsonBlocks,
        TestParseJsonSafely,
        TestValidateStoryboardData,
        TestExtractJsonFromText,
        TestConvertToStoryFormat
    ]

    total_tests = 0
    passed_tests = 0

    for test_class in test_classes:
        print(f"\n=== {test_class.__name__} ===")
        instance = test_class()

        for method_name in dir(instance):
            if method_name.startswith('test_'):
                total_tests += 1
                try:
                    method = getattr(instance, method_name)
                    method()
                    print(f"✅ {method_name}")
                    passed_tests += 1
                except Exception as e:
                    print(f"❌ {method_name}: {e}")

    print(f"\n=== Test Results ===")
    print(f"Total tests: {total_tests}")
    print(f"Passed: {passed_tests}")
    print(f"Failed: {total_tests - passed_tests}")
    print(f"Success rate: {(passed_tests/total_tests)*100:.1f}%")


if __name__ == "__main__":
    run_all_tests()