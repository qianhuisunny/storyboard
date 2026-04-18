import base64
import os
import httpx

STYLE_SUFFIXES = {
    "stock_footage": "photorealistic photography style",
    "real_world": "photorealistic photography style",
    "whiteboard_animation": "hand-drawn whiteboard sketch, black and white line art",
    "whiteboard": "hand-drawn whiteboard sketch, black and white line art",
    "slides": "clean professional slide design, flat illustration style",
    "screen_recording": "screenshot of software interface, UI mockup style",
    "code_editor": "screenshot of software interface, UI mockup style",
    "talking_head": "person presenting to camera, professional studio setting",
    "talking_head_with_split_screens": "person presenting to camera, professional studio setting",
    "talking_head_left_with_notes": "person presenting to camera, professional studio setting",
}


class ImageGenerator:
    def __init__(self):
        self.api_key = os.getenv("IONROUTER_API_KEY")
        self.api_url = "https://api.ionrouter.io/v1/images/generations"

    async def generate(self, visual_direction: list[str], screen_type: str) -> bytes:
        prompt_parts = ". ".join(visual_direction)
        style = STYLE_SUFFIXES.get(screen_type, "digital illustration style")
        full_prompt = f"{prompt_parts}. {style}"

        print(f"[ImageGenerator] prompt: {full_prompt}")
        print(f"[ImageGenerator] screen_type: {screen_type}, visual_direction: {visual_direction}")

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                self.api_url,
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": "flux-schnell",
                    "prompt": full_prompt,
                    "width": 1024,
                    "height": 576,
                    "num_inference_steps": 20,
                    "guidance_scale": 7,
                    "n": 1,
                    "response_format": "b64_json",
                },
            )
            print(f"[ImageGenerator] status: {response.status_code}")
            response.raise_for_status()
            b64_data = response.json()["data"][0]["b64_json"]
            return base64.b64decode(b64_data)
