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

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                self.api_url,
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": "flux-schnell",
                    "prompt": full_prompt,
                    "width": 1024,
                    "height": 576,
                },
            )
            response.raise_for_status()
            result = response.json()["data"][0]
            if "b64_json" in result:
                return base64.b64decode(result["b64_json"])
            # IonRouter returns a relative path — prepend base
            url = result["url"]
            if url.startswith("/"):
                url = "https://api.ionrouter.io" + url
            img_response = await client.get(url)
            img_response.raise_for_status()
            return img_response.content
