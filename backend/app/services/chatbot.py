import os
import requests
import json
import time
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional

from app.utils.image_search import search_image


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    conversation_history: Optional[List[ChatMessage]] = []


class ChatResponse(BaseModel):
    message: str
    success: bool


class StoryboardChatbot:
    def __init__(self):
        self.api_key = os.getenv("LANGFLOW_API_KEY")
        if not self.api_key:
            raise ValueError(
                "LANGFLOW_API_KEY environment variable not found. Please set your API key in the environment variables."
            )

        # Langflow configuration - make URL and flow ID configurable
        langflow_host = os.getenv("LANGFLOW_HOST", "localhost:7860")
        flow_id = os.getenv("LANGFLOW_FLOW_ID", "6bc20709-5eac-463b-b5e7-28388dd6e560")
        self.url = f"http://{langflow_host}/api/v1/run/{flow_id}"

        self.headers = {"Content-Type": "application/json", "x-api-key": self.api_key}

    def generate_response(
        self,
        user_message: str,
        conversation_history: List[ChatMessage] = None,
        project_id: str = None,
    ) -> str:
        """Generate AI response for storyboard editing assistance using Langflow"""
        print("!!!!!")
        # Build context from conversation history
        context = ""
        if conversation_history:
            for msg in conversation_history[-5:]:  # Keep last 5 messages for context
                context += f"{msg.role}: {msg.content}\n"

        # Combine context with current message
        full_message = f"{context}user: {user_message}" if context else user_message

        # Langflow API payload
        payload = {
            "output_type": "chat",
            "input_type": "chat",
            "input_value": full_message,
        }

        try:
            # Increase timeout to 6 minutes for Langflow processing
            response = requests.post(
                self.url, json=payload, headers=self.headers, timeout=360
            )
            response.raise_for_status()  # Raise exception for bad status codes

            # Parse Langflow response
            response_data = response.json()

            # Debug: Print response structure (remove in production)
            print(f"Langflow response: {response_data}")

            # Extract the AI response text
            ai_response = self._extract_response_text(response_data)

            # Check if message contains "json" and project_id is provided
            if user_message.find("json") and project_id:
                print("FIND JSON IN RESPONSE!!!!!!!")
                try:
                    self._extract_and_save_json(ai_response, project_id)
                except Exception as e:
                    print(f"Error extracting/saving JSON: {e}")
                    # Continue with response even if JSON extraction fails

            return ai_response

        except requests.exceptions.Timeout:
            return "The AI service is taking too long to respond. Please try again with a shorter message."
        except requests.exceptions.RequestException as e:
            return f"I'm having trouble connecting to the AI service right now. Please try again later. Error: {str(e)}"
        except ValueError as e:
            return f"I received an unexpected response format. Please try again later. Error: {str(e)}"
        except Exception as e:
            return f"I'm having trouble processing your request right now. Please try again later. Error: {str(e)}"

    def _extract_response_text(self, response_data: dict) -> str:
        """Extract text from Langflow response data"""
        # Try multiple extraction paths for different Langflow response formats

        # Method 1: Direct text field
        if "text" in response_data:
            return response_data["text"]

        # Method 2: outputs array with text
        if "outputs" in response_data:
            outputs = response_data["outputs"]
            if isinstance(outputs, list) and len(outputs) > 0:
                first_output = outputs[0]

                # Try direct text in first output
                if isinstance(first_output, dict) and "text" in first_output:
                    return first_output["text"]

                # Try nested outputs structure
                if isinstance(first_output, dict) and "outputs" in first_output:
                    nested_outputs = first_output["outputs"]
                    if isinstance(nested_outputs, list) and len(nested_outputs) > 0:
                        nested_output = nested_outputs[0]
                        if isinstance(nested_output, dict):
                            # Try various text fields
                            for text_field in ["text", "content", "message", "result"]:
                                if text_field in nested_output:
                                    return str(nested_output[text_field])

                            # Try results structure
                            if "results" in nested_output:
                                results = nested_output["results"]
                                if isinstance(results, dict):
                                    # Try message.text structure
                                    if "message" in results and isinstance(
                                        results["message"], dict
                                    ):
                                        if "text" in results["message"]:
                                            return results["message"]["text"]
                                    # Try direct text in results
                                    for text_field in ["text", "content", "message"]:
                                        if text_field in results:
                                            return str(results[text_field])

        # Method 3: session_id structure (common in Langflow)
        if "session_id" in response_data:
            # Look for outputs in session structure
            for key in ["outputs", "messages", "response"]:
                if key in response_data and response_data[key]:
                    data = response_data[key]
                    if isinstance(data, list) and len(data) > 0:
                        item = data[0]
                        if isinstance(item, dict) and "text" in item:
                            return item["text"]

        # Fallback: return the entire response as string for debugging
        return f"Response received but couldn't extract text. Full response: {str(response_data)}"

    def _extract_and_save_json(self, ai_response: str, project_id: str):
        """Extract JSON from AI response and save to project folder"""
        from app.utils.json_extractor import extract_json_from_text

        # Extract JSON from the AI response
        result = extract_json_from_text(ai_response, validate=False)

        if not result.success or not result.data:
            print(f"No JSON found in AI response for project {project_id}")
            return

        # Find project directory
        project_dir = (
            Path(__file__).parent.parent.parent.parent
            / "data"
            / f"project_{project_id}"
        )
        if not project_dir.exists():
            print(f"Project directory not found: {project_dir}")
            return

        # Generate story IDs and save individual story files
        story_files = []
        timestamp = int(time.time())

        for i, story_data in enumerate(result.data):
            story_id = f"{timestamp + i}"
            story_filename = f"story_{story_id}"
            story_file = project_dir / f"{story_filename}.json"
            story_data["image_url"] = search_image(
                story_data.get("on_screen_visual_keywords", "")
            )

            # Save individual story file
            with open(story_file, "w") as f:
                json.dump(story_data, f, indent=2)

            story_files.append(story_filename)
            print(f"Saved story file: {story_filename}.json")

        # Update project file with story references
        project_files = list(project_dir.glob("project_type*.json"))
        if project_files:
            with open(project_files[0], "r") as f:
                project_data = json.load(f)

            # Add or update stories field
            if "stories" not in project_data:
                project_data["stories"] = []

            # Append new story files to existing ones
            project_data["stories"].extend(story_files)
            project_data["lastUpdated"] = time.time()

            # Save updated project file
            with open(project_files[0], "w") as f:
                json.dump(project_data, f, indent=2)

            print(f"Updated project file with {len(story_files)} new stories")
        else:
            print("No project file found to update")
