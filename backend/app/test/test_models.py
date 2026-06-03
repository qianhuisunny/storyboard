#!/usr/bin/env python3
"""
Test script for project requirements models
"""

import sys
import json
from pathlib import Path

from app.models.project import Project, ProjectRequirements, VideoType

# Add the app directory to Python path
sys.path.append(str(Path(__file__).parent / 'app'))


def test_load_example_projects():
    """Test loading example project files"""
    example_files = [
        "../data/example/project.json",
        "../data/example/project_type2.json",
        "../data/example/project_type3.json"
    ]

    for file_path in example_files:
        print(f"\n🔍 Testing {file_path}")
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)

            # Create project instance
            project = Project.from_dict(data)
            print(f"✅ Project loaded: {project.name}")
            print(f"   Type: {project.requirements.type.name}")
            print(f"   Audience: {project.requirements.audience}")
            print(f"   Duration: {project.requirements.duration}s")

            # Test system prompt generation
            if project.requirements:
                prompt = project.requirements.get_system_prompt()
                print(f"   System prompt length: {len(prompt)} characters")

        except Exception as e:
            print(f"❌ Error loading {file_path}: {e}")


def test_model_validation():
    """Test model validation"""
    print("\n🧪 Testing model validation...")

    # Test invalid data
    try:
        ProjectRequirements(
            audience="Test audience",
            duration=-10,  # Invalid negative duration
            type=VideoType.PRODUCT_RELEASE
        )
        print("❌ Should have failed validation for negative duration")
    except Exception as e:
        print(f"✅ Correctly caught validation error: {e}")

def test_model_validation_without_type_requirement():
    """Test model validation"""
    print("\n🧪 Testing model validation...")

    # Test invalid data
    try:
        ProjectRequirements(
            audience="Test audience",
            duration=10, 
            type=VideoType.PRODUCT_RELEASE
        )
        print("❌ Should have failed validation for type requirement")
    except Exception as e:
        print(f"✅ Correctly caught validation error: {e}")


if __name__ == "__main__":
    print("🔑 Testing Project Requirements Models...")
    print("=" * 50)

    test_load_example_projects()
    test_model_validation_without_type_requirement()
    test_model_validation()

    print("\n✨ Model testing completed!")
