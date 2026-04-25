"""
Static slide image renderer using Pillow.

Generates 1920x1080 PNG images from storyboard panel data.
Each slide is a clean typographic layout suitable for Seedance image-to-video animation.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
BG_COLOR = (15, 15, 20)
TEXT_COLOR = (240, 240, 245)
ACCENT_COLOR = (100, 140, 255)
MUTED_COLOR = (140, 140, 155)
DIVIDER_COLOR = (50, 50, 60)

FONT_CACHE: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    key = (str(bold), size)
    if key not in FONT_CACHE:
        try:
            name = "Helvetica-Bold" if bold else "Helvetica"
            FONT_CACHE[key] = ImageFont.truetype(name, size)
        except OSError:
            try:
                name = "/System/Library/Fonts/Helvetica.ttc"
                FONT_CACHE[key] = ImageFont.truetype(name, size, index=1 if bold else 0)
            except OSError:
                FONT_CACHE[key] = ImageFont.load_default()
    return FONT_CACHE[key]


def _draw_centered_text(draw: ImageDraw.ImageDraw, y: int, text: str, font: ImageFont.FreeTypeFont, fill=TEXT_COLOR) -> int:
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    x = (W - tw) // 2
    draw.text((x, y), text, font=font, fill=fill)
    return bbox[3] - bbox[1]


def _draw_left_text(draw: ImageDraw.ImageDraw, x: int, y: int, text: str, font: ImageFont.FreeTypeFont, fill=TEXT_COLOR, max_width: int = 0) -> int:
    if max_width > 0:
        lines = _wrap_text(text, font, max_width)
        total_h = 0
        for line in lines:
            draw.text((x, y + total_h), line, font=font, fill=fill)
            bbox = draw.textbbox((0, 0), line, font=font)
            total_h += (bbox[3] - bbox[1]) + 8
        return total_h
    draw.text((x, y), text, font=font, fill=fill)
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[3] - bbox[1]


def _wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = text.split()
    lines, current = [], ""
    for word in words:
        test = f"{current} {word}".strip()
        bbox = font.getbbox(test)
        if bbox[2] - bbox[0] <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [text]


def render_stat_slide(
    stat: str,
    subtitle: str,
    source: str = "",
    output_path: str = "slide.png",
) -> str:
    """Large centered stat + subtitle + source line."""
    img = Image.new("RGB", (W, H), BG_COLOR)
    draw = ImageDraw.Draw(img)

    y = H // 2 - 120
    h = _draw_centered_text(draw, y, stat, _font(180, bold=True), ACCENT_COLOR)
    y += h + 30
    h = _draw_centered_text(draw, y, subtitle, _font(36), MUTED_COLOR)
    if source:
        y += h + 40
        _draw_centered_text(draw, y, source, _font(24), (90, 90, 100))

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path)
    return output_path


def render_columns_slide(
    columns: list[dict],
    title: str = "",
    footer: str = "",
    output_path: str = "slide.png",
) -> str:
    """Multi-column layout. Each column: {header, body}."""
    img = Image.new("RGB", (W, H), BG_COLOR)
    draw = ImageDraw.Draw(img)

    y_start = 120
    if title:
        _draw_centered_text(draw, 60, title, _font(42, bold=True))
        y_start = 160

    n = len(columns)
    col_w = (W - 200) // n
    margin = 100

    for i, col in enumerate(columns):
        x = margin + i * col_w
        cx = x + col_w // 2

        bbox = draw.textbbox((0, 0), col.get("header", ""), font=_font(32, bold=True))
        tw = bbox[2] - bbox[0]
        draw.text((cx - tw // 2, y_start), col["header"], font=_font(32, bold=True), fill=ACCENT_COLOR)

        body_y = y_start + 60
        body_text = col.get("body", "")
        _draw_left_text(draw, x + 10, body_y, body_text, _font(26), MUTED_COLOR, max_width=col_w - 20)

        if i < n - 1:
            dx = x + col_w
            draw.line([(dx, y_start - 10), (dx, H - 120)], fill=DIVIDER_COLOR, width=1)

    if footer:
        draw.rectangle([(80, H - 100), (W - 80, H - 40)], fill=(25, 25, 35))
        _draw_centered_text(draw, H - 90, footer, _font(28), TEXT_COLOR)

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path)
    return output_path


def render_pyramid_slide(
    levels: list[dict],
    title: str = "",
    output_path: str = "slide.png",
) -> str:
    """Pyramid/funnel diagram. Each level: {label, value, color?}."""
    img = Image.new("RGB", (W, H), BG_COLOR)
    draw = ImageDraw.Draw(img)

    y_start = 100
    if title:
        _draw_centered_text(draw, 50, title, _font(38, bold=True))
        y_start = 130

    n = len(levels)
    row_h = min(80, (H - y_start - 60) // n)
    max_bar_w = W - 400

    for i, level in enumerate(levels):
        y = y_start + i * (row_h + 12)
        frac = 1.0 - (i * 0.12)
        bar_w = int(max_bar_w * frac)
        x = (W - bar_w) // 2

        r = min(255, 80 + i * 30)
        g = min(255, 120 + i * 15)
        b = 255
        draw.rounded_rectangle([(x, y), (x + bar_w, y + row_h)], radius=8, fill=(r, g, b, 200))

        label = level.get("label", "")
        value = level.get("value", "")
        text = f"{label}  {value}" if value else label
        bbox = draw.textbbox((0, 0), text, font=_font(28, bold=True))
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        draw.text(((W - tw) // 2, y + (row_h - th) // 2), text, font=_font(28, bold=True), fill=BG_COLOR)

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path)
    return output_path


def render_list_slide(
    items: list[str],
    title: str = "",
    output_path: str = "slide.png",
) -> str:
    """Bulleted list or convergence diagram."""
    img = Image.new("RGB", (W, H), BG_COLOR)
    draw = ImageDraw.Draw(img)

    y = 100
    if title:
        _draw_centered_text(draw, 50, title, _font(38, bold=True))
        y = 140

    for item in items:
        bullet = "\u2022  "
        h = _draw_left_text(draw, 200, y, f"{bullet}{item}", _font(30), MUTED_COLOR, max_width=W - 400)
        y += h + 20

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path)
    return output_path


def render_panel_slide(panel_number: int, visual_direction: list[str], output_path: str) -> str:
    """Route to the appropriate slide renderer based on panel content."""

    if panel_number == 2:
        return render_stat_slide(
            stat="~38%",
            subtitle="senior-level and technical women report being Onlys",
            source="LeanIn / McKinsey — Women in the Workplace 2024",
            output_path=output_path,
        )

    elif panel_number == 3:
        return render_pyramid_slide(
            levels=[
                {"label": "Entry Level", "value": "49%"},
                {"label": "Manager", "value": "42%"},
                {"label": "Senior Manager", "value": "39%"},
                {"label": "VP", "value": "35%"},
                {"label": "C-Suite", "value": "29%"},
            ],
            title="Women's Representation by Level",
            output_path=output_path,
        )

    elif panel_number == 8:
        return render_columns_slide(
            columns=[
                {"header": "Individual Capability", "body": "Navigate\nNegotiate\nBuild"},
                {"header": "Institutional Access", "body": "Nomination\nCriteria visibility\nPost-meeting conversations"},
            ],
            footer="Load-bearing for each other",
            output_path=output_path,
        )

    elif panel_number == 9:
        return render_list_slide(
            items=[
                "Nominations: Who gets named for high-visibility work before a role is posted",
                "Criteria visibility: How advancement criteria are defined and whether they're visible",
                "Post-meeting conversations: Which names come up after the meeting ends",
            ],
            title="Three Decision Points",
            output_path=output_path,
        )

    elif panel_number == 10:
        return render_columns_slide(
            columns=[
                {"header": "Isolated Knowledge", "body": "Figured out individually\nAt real cost\nStays in one person's head"},
                {"header": "Networked Knowledge", "body": "Transferable\nCompounds over time\nNegotiation framing\nCredibility rebuilding\nReading the room"},
            ],
            output_path=output_path,
        )

    elif panel_number == 12:
        return render_list_slide(
            items=[
                "Skill-building debate",
                "Backlash fear",
                "Exclusion worry",
                "'Only works in tech'",
            ],
            title="Four concerns — one root: 'naming this creates division'",
            output_path=output_path,
        )

    elif panel_number == 13:
        return render_columns_slide(
            columns=[
                {"header": "Reframe From", "body": "Gender initiative\nAffinity groups\nTrack effort"},
                {"header": "Reframe To", "body": "Pipeline development\nKnowledge infrastructure\nTrack outcomes"},
            ],
            footer="Consistent year-over-year improvement vs. same gap",
            output_path=output_path,
        )

    elif panel_number == 14:
        return render_stat_slide(
            stat="1.7x",
            subtitle="Women with sponsors get promoted at 1.7x the rate",
            source="Across industries: Tech / Finance / Legal / Healthcare",
            output_path=output_path,
        )

    elif panel_number == 16:
        return render_columns_slide(
            columns=[
                {"header": "Women in Leadership", "body": "Find a network where knowledge transfers.\nGive one person with access something specific to act on."},
                {"header": "Senior Leaders", "body": "One sponsorship action this quarter.\nPut a name in a room it wasn't in before."},
                {"header": "HR & L&D", "body": "Pull network data next to promotion outcomes.\nIf the line doesn't move together, you know what to fix."},
            ],
            footer="The path is there. The question is whether you take it.",
            output_path=output_path,
        )

    else:
        return render_list_slide(
            items=visual_direction,
            title=f"Panel {panel_number}",
            output_path=output_path,
        )
