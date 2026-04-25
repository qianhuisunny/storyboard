"""
Seedance 2.0 prompt builder for each panel type.

Prompt structure follows Seedance best practices:
  Action + Scene + Style + Camera + --params
"""

CHARACTER_ANCHOR = (
    "A professional woman in her late 30s with shoulder-length black hair, "
    "wearing a navy blazer over a cream blouse"
)

OFFICE_SETTING = "in a modern minimalist office with soft natural lighting, shallow depth of field"

CORPORATE_STYLE = (
    "cinematic corporate footage, natural lighting, shallow depth of field, "
    "film grain, professional color grading"
)


def build_talking_head_prompt(
    visual_direction: list[str],
    clip_index: int = 0,
    total_clips: int = 1,
) -> str:
    """Build a reference-to-video prompt for talking_head panels.

    Uses @Image1 for character reference and @Audio1 for lip sync.
    """
    direction = " ".join(visual_direction[:2])
    framing = "medium close-up" if clip_index == 0 else "close-up"

    if total_clips > 1 and clip_index > 0:
        camera = "subtle slow push-in, locked on subject"
    else:
        camera = "static camera, locked on subject"

    return (
        f"@Image1 is speaking directly to camera, {framing} shot. "
        f"{direction}. {OFFICE_SETTING}. "
        f"{camera}. "
        f"Lip sync to @Audio1. "
        f"Cinematic, professional corporate video"
    )


def build_stock_video_prompt(visual_direction_bullet: str) -> str:
    """Build a text-to-video prompt for a single stock_video shot."""
    return (
        f"{visual_direction_bullet}. "
        f"{CORPORATE_STYLE}. "
        f"Handheld subtle camera movement, "
        f"real-world documentary style"
    )


WHITEBOARD_PROMPTS = {
    2: (
        "Hand-drawn whiteboard animation on clean white background. "
        "A large circle is slowly drawn in black ink, then the characters '38%' "
        "appear inside it being written stroke by stroke. A short underline "
        "is sketched beneath. Minimalist Excalidraw style, thin black ink strokes, "
        "clean white background, no clutter."
    ),
    3: (
        "Hand-drawn whiteboard animation on clean white background. "
        "A simple pyramid shape is drawn from bottom to top, five horizontal lines "
        "divide it into layers. The pyramid narrows as it goes up, each layer "
        "getting visibly smaller. Minimalist sketch style, thin black ink strokes "
        "on white, like an Excalidraw diagram being drawn in real time."
    ),
    8: (
        "Hand-drawn whiteboard animation on clean white background. "
        "Two tall rectangles are drawn side by side with a gap between them. "
        "Inside each rectangle, three short horizontal lines appear one by one "
        "like list items. A wide bracket is drawn underneath connecting both "
        "rectangles. Minimalist Excalidraw style, thin black ink strokes, clean."
    ),
    9: (
        "Hand-drawn whiteboard animation on clean white background. "
        "A simple flowchart: one box at top, an arrow splits into three paths "
        "going down to three separate boxes. Each box gets a small checkmark "
        "drawn inside. Minimalist sketch style, thin black ink strokes on white, "
        "like an Excalidraw diagram being drawn in real time."
    ),
    10: (
        "Hand-drawn whiteboard animation on clean white background. "
        "Left side: five small circles scattered randomly, no connections. "
        "Right side: five small circles connected by lines forming a network. "
        "An arrow is drawn from the scattered side to the connected side. "
        "Minimalist Excalidraw style, thin black ink strokes, clean white background."
    ),
    12: (
        "Hand-drawn whiteboard animation on clean white background. "
        "Four small circles appear at the corners, then arrows from each "
        "converge toward one larger circle in the center. The center circle "
        "gets drawn last. Minimalist sketch style, thin black ink strokes "
        "on white, like an Excalidraw diagram being drawn in real time."
    ),
    13: (
        "Hand-drawn whiteboard animation on clean white background. "
        "Three rows of paired boxes: left box has an X through it, right box "
        "has a checkmark. An arrow points from each left box to the "
        "corresponding right box. Below, two lines start from the same point, "
        "one going down and one going up, slowly diverging. Minimalist "
        "Excalidraw style, thin black ink strokes, clean."
    ),
    14: (
        "Hand-drawn whiteboard animation on clean white background. "
        "Two simple lines starting from the same point on the left, "
        "one rising steeply upward and one rising gradually, slowly "
        "being drawn from left to right. Minimalist sketch style, "
        "thin black ink strokes, like an Excalidraw diagram being "
        "drawn in real time. Clean, simple, no clutter."
    ),
    16: (
        "Hand-drawn whiteboard animation on clean white background. "
        "Three tall rectangles are drawn side by side with even spacing. "
        "Inside each rectangle, a single line of text-like scribble appears. "
        "Below all three, a long horizontal line is drawn, then a small "
        "arrow pointing right. Minimalist Excalidraw style, thin black ink "
        "strokes on white, clean and simple."
    ),
}

SLIDE_TEXT_OVERLAYS = {
    2: [
        {"text": "~38%", "x": "(w-text_w)/2", "y": "(h-text_h)/2-40", "size": 72, "bold": True},
        {"text": "of senior women report being Onlys", "x": "(w-text_w)/2", "y": "(h-text_h)/2+50", "size": 28},
        {"text": "LeanIn / McKinsey 2024", "x": "(w-text_w)/2", "y": "h-60", "size": 18, "color": "0x666666"},
    ],
    3: [
        {"text": "C-suite 29%", "x": "(w-text_w)/2", "y": "h*0.20", "size": 24, "bold": True},
        {"text": "VP 35%", "x": "(w-text_w)/2", "y": "h*0.33", "size": 24},
        {"text": "Sr Manager 39%", "x": "(w-text_w)/2", "y": "h*0.46", "size": 24},
        {"text": "Manager 42%", "x": "(w-text_w)/2", "y": "h*0.59", "size": 24},
        {"text": "Entry 49%", "x": "(w-text_w)/2", "y": "h*0.72", "size": 24},
    ],
    8: [
        {"text": "Individual Capability", "x": "w*0.22-text_w/2", "y": "h*0.12", "size": 26, "bold": True},
        {"text": "Institutional Access", "x": "w*0.78-text_w/2", "y": "h*0.12", "size": 26, "bold": True},
        {"text": "navigate, negotiate, build", "x": "w*0.22-text_w/2", "y": "h*0.50", "size": 20},
        {"text": "nomination, criteria, conversations", "x": "w*0.78-text_w/2", "y": "h*0.50", "size": 20},
        {"text": "Load-bearing for each other", "x": "(w-text_w)/2", "y": "h*0.88", "size": 24, "bold": True},
    ],
    9: [
        {"text": "Nominations", "x": "w*0.18-text_w/2", "y": "h*0.65", "size": 22, "bold": True},
        {"text": "Criteria Visibility", "x": "(w-text_w)/2", "y": "h*0.65", "size": 22, "bold": True},
        {"text": "Post-meeting Conversations", "x": "w*0.82-text_w/2", "y": "h*0.65", "size": 22, "bold": True},
        {"text": "Decision Points", "x": "(w-text_w)/2", "y": "h*0.15", "size": 28, "bold": True},
    ],
    10: [
        {"text": "Isolated", "x": "w*0.25-text_w/2", "y": "h*0.85", "size": 24},
        {"text": "Networked", "x": "w*0.75-text_w/2", "y": "h*0.85", "size": 24, "bold": True},
        {"text": "Knowledge compounds when connected", "x": "(w-text_w)/2", "y": "h*0.12", "size": 22},
    ],
    12: [
        {"text": "naming this creates division", "x": "(w-text_w)/2", "y": "(h-text_h)/2", "size": 24, "bold": True},
        {"text": "One root anxiety, four outfits", "x": "(w-text_w)/2", "y": "h*0.12", "size": 22},
    ],
    13: [
        {"text": "Sponsorship -> Pipeline dev", "x": "(w-text_w)/2", "y": "h*0.18", "size": 22},
        {"text": "Networks -> Knowledge infra", "x": "(w-text_w)/2", "y": "h*0.32", "size": 22},
        {"text": "Track outcomes, not effort", "x": "(w-text_w)/2", "y": "h*0.46", "size": 22},
        {"text": "Both tracks -> improvement", "x": "(w-text_w)/2", "y": "h*0.85", "size": 20, "bold": True},
    ],
    14: [
        {"text": "1.7x", "x": "(w-text_w)/2", "y": "(h-text_h)/2-20", "size": 72, "bold": True},
        {"text": "With sponsor", "x": "w*0.70", "y": "h*0.22", "size": 22},
        {"text": "Without", "x": "w*0.70", "y": "h*0.55", "size": 22},
        {"text": "Tech / Finance / Legal / Healthcare", "x": "(w-text_w)/2", "y": "h-55", "size": 20, "color": "0x666666"},
    ],
    16: [
        {"text": "Women in Leadership", "x": "w*0.17-text_w/2", "y": "h*0.12", "size": 22, "bold": True},
        {"text": "Senior Leaders", "x": "(w-text_w)/2", "y": "h*0.12", "size": 22, "bold": True},
        {"text": "HR & L&D", "x": "w*0.83-text_w/2", "y": "h*0.12", "size": 22, "bold": True},
        {"text": "The path is there.", "x": "(w-text_w)/2", "y": "h*0.88", "size": 26, "bold": True},
    ],
}


def build_slide_whiteboard_prompt(panel_number: int) -> str:
    """Build a text-to-video prompt for whiteboard-style slide animation."""
    return WHITEBOARD_PROMPTS.get(panel_number, (
        "Hand-drawn whiteboard animation on clean white background. "
        "Simple abstract shapes and lines being drawn in real time. "
        "Minimalist Excalidraw style, thin black ink strokes, clean."
    ))


def get_slide_text_overlays(panel_number: int) -> list[dict]:
    """Get ffmpeg text overlay specs for a slide panel."""
    return SLIDE_TEXT_OVERLAYS.get(panel_number, [])
