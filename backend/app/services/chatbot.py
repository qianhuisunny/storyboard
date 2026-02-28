"""
Chat Assistant Service — Direct OpenAI calls for sidebar refinement.

Uses the same OpenAI client pattern as the agent pipeline (see agents/base.py).
"""

import os
from typing import List, Optional

from openai import OpenAI
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    conversation_history: Optional[List[ChatMessage]] = []


class ChatResponse(BaseModel):
    message: str
    success: bool


CHAT_SYSTEM_PROMPT = """You are Plotline's storyboard assistant. You help users refine and improve their video storyboards.

You can help with:
- Editing voiceover text for clarity and impact
- Suggesting visual directions for screens
- Adjusting screen pacing and duration
- Improving calls-to-action
- Refining tone and messaging

Keep responses concise and actionable. When suggesting edits, be specific about which screen and field to change."""


class StoryboardChatbot:
    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError(
                "OPENAI_API_KEY environment variable not found. "
                "Please set your API key in the environment variables."
            )
        self.client = OpenAI(api_key=api_key)

    def generate_response(
        self,
        user_message: str,
        conversation_history: List[ChatMessage] = None,
        project_id: str = None,
    ) -> str:
        """Generate AI response for storyboard editing assistance."""
        try:
            messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]

            # Add conversation history for context
            if conversation_history:
                for msg in conversation_history[-5:]:  # Keep last 5 for context
                    messages.append({"role": msg.role, "content": msg.content})

            messages.append({"role": "user", "content": user_message})

            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                temperature=0.7,
                max_tokens=2000,
            )

            return response.choices[0].message.content or ""

        except Exception as e:
            return f"I'm having trouble processing your request right now. Please try again later. Error: {str(e)}"
