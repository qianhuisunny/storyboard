"""
Animated diagram renderer for slide panels.

Renders frame-by-frame Pillow animations with a hand-drawn/sketch feel,
then encodes to video via ffmpeg. Each panel has a custom render function.
"""
import math
import random
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FPS = 25
WIDTH = 1280
HEIGHT = 720

random.seed(42)


def _load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype("/System/Library/Fonts/MarkerFelt.ttc", size, index=0)
    except OSError:
        try:
            idx = 1 if bold else 0
            return ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size, index=idx)
        except OSError:
            return ImageFont.load_default()


def _jitter_line(points: list[tuple], amplitude: float = 2.0) -> list[tuple]:
    """Add hand-drawn jitter to a polyline."""
    return [(x + random.uniform(-amplitude, amplitude),
             y + random.uniform(-amplitude, amplitude)) for x, y in points]


def _draw_progressive_line(draw, start, end, progress: float, color=(40, 40, 40), width=3, jitter=2.0):
    """Draw a line from start to end, only up to `progress` (0-1)."""
    if progress <= 0:
        return
    n_segments = 30
    points = []
    for i in range(n_segments + 1):
        t = i / n_segments
        if t > progress:
            break
        x = start[0] + (end[0] - start[0]) * t
        y = start[1] + (end[1] - start[1]) * t
        points.append((x, y))
    if len(points) < 2:
        return
    points = _jitter_line(points, jitter)
    for i in range(len(points) - 1):
        draw.line([points[i], points[i + 1]], fill=color, width=width)


def _draw_progressive_curve(draw, points_fn, progress: float, color=(40, 40, 40), width=3, jitter=1.5):
    """Draw a curve defined by points_fn(t) for t in [0, progress]."""
    if progress <= 0:
        return
    n = 60
    pts = []
    for i in range(n + 1):
        t = i / n
        if t > progress:
            break
        pts.append(points_fn(t))
    if len(pts) < 2:
        return
    pts = _jitter_line(pts, jitter)
    for i in range(len(pts) - 1):
        draw.line([pts[i], pts[i + 1]], fill=color, width=width)


def _fade_alpha(t: float, start: float, duration: float = 1.0) -> int:
    """Compute alpha (0-255) for fade-in starting at `start` seconds."""
    if t < start:
        return 0
    return min(255, int(255 * (t - start) / duration))


def _draw_text_fade(draw, text, xy, font, t, appear_at, color=(40, 40, 40)):
    """Draw text that fades in at a given time."""
    alpha = _fade_alpha(t, appear_at, 0.8)
    if alpha <= 0:
        return
    draw.text(xy, text, fill=(*color, alpha), font=font)


def _draw_icon_circle(draw, cx, cy, radius, label, font, t, appear_at, color=(30, 100, 200)):
    """Draw a simple circle icon with a label below it."""
    alpha = _fade_alpha(t, appear_at, 0.6)
    if alpha <= 0:
        return
    r = radius
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(*color, alpha), width=3)
    # Small inner symbol (just a dot for now)
    ir = 4
    draw.ellipse([cx - ir, cy - ir, cx + ir, cy + ir], fill=(*color, alpha))
    # Label below
    bbox = draw.textbbox((0, 0), label, font=font)
    tw = bbox[2] - bbox[0]
    draw.text((cx - tw // 2, cy + r + 12), label, fill=(60, 60, 60, alpha), font=font)


def render_panel_14(duration: float, output_path: str):
    """P14: Two diverging lines with labels → scroll-up to industry icons."""
    total_frames = int(duration * FPS)

    font_big = _load_font(64, bold=True)
    font_label = _load_font(22)
    font_icon_label = _load_font(18)
    font_same = _load_font(20, bold=True)

    # Chart scene occupies first 65% of duration
    # Industry scene scrolls up for remaining 35%
    chart_end_pct = 0.62
    scroll_start_pct = 0.60
    scroll_dur_pct = 0.08

    margin_x, margin_y = 140, 80
    chart_left = margin_x
    chart_right = WIDTH - margin_x - 120  # leave room for labels on right
    chart_top = margin_y + 40
    chart_bottom = HEIGHT - margin_y - 30
    origin = (chart_left, chart_bottom)

    def steep_curve(t):
        x = chart_left + (chart_right - chart_left) * t
        y = chart_bottom - (chart_bottom - chart_top) * 0.88 * (t ** 0.7)
        return (x, y)

    def gradual_curve(t):
        x = chart_left + (chart_right - chart_left) * t
        y = chart_bottom - (chart_bottom - chart_top) * 0.35 * (t ** 0.9)
        return (x, y)

    frames_dir = Path(tempfile.mkdtemp())

    for frame_idx in range(total_frames):
        t = frame_idx / FPS
        p = frame_idx / total_frames

        # Compute scroll offset (chart scene slides up, industry scene slides in)
        if p > scroll_start_pct:
            scroll_frac = min(1.0, (p - scroll_start_pct) / scroll_dur_pct)
            scroll_offset = int(scroll_frac * HEIGHT)
        else:
            scroll_offset = 0

        img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # === SCENE 1: Chart (shifted up by scroll_offset) ===
        if scroll_offset < HEIGHT:
            y_shift = -scroll_offset

            # Axes — draw immediately (0-5%)
            axis_p = min(1.0, p / 0.05)
            ox, oy = origin[0], origin[1] + y_shift
            if axis_p > 0:
                _draw_progressive_line(draw, (ox, oy), (chart_right, oy), axis_p, width=2, jitter=1.0)
                _draw_progressive_line(draw, (ox, oy), (ox, chart_top + y_shift), axis_p, width=2, jitter=1.0)

            # Curves — start drawing at 3%, done by 45%
            curve_p = max(0, min(1.0, (p - 0.03) / 0.42))
            def steep_shifted(ct):
                x, y = steep_curve(ct)
                return (x, y + y_shift)
            def gradual_shifted(ct):
                x, y = gradual_curve(ct)
                return (x, y + y_shift)
            _draw_progressive_curve(draw, steep_shifted, curve_p, color=(30, 100, 200), width=4, jitter=2.0)
            _draw_progressive_curve(draw, gradual_shifted, curve_p, color=(160, 160, 160), width=3, jitter=1.5)

            # Line labels — appear as soon as lines are 30% drawn (~0.15 of total)
            if curve_p > 0.30:
                label_pos = min(curve_p, 0.85)
                steep_pt = steep_curve(label_pos)
                gradual_pt = gradual_curve(label_pos)
                label_appear = duration * 0.12
                _draw_text_fade(draw, "With sponsor",
                    (int(steep_pt[0]) + 8, int(steep_pt[1]) + y_shift - 28),
                    font_label, t, label_appear, color=(30, 100, 200))
                _draw_text_fade(draw, "Without",
                    (int(gradual_pt[0]) + 8, int(gradual_pt[1]) + y_shift - 28),
                    font_label, t, label_appear, color=(140, 140, 140))

            # "1.7x" — appears at 30%
            stat_appear = duration * 0.30
            stat_text = "1.7x"
            bbox = draw.textbbox((0, 0), stat_text, font=font_big)
            tw = bbox[2] - bbox[0]
            _draw_text_fade(draw, stat_text,
                (WIDTH // 2 - tw // 2, HEIGHT // 2 - 60 + y_shift),
                font_big, t, stat_appear, color=(30, 100, 200))

        # === SCENE 2: Industry icons (slides up from below) ===
        if scroll_offset > 0:
            scene2_y = HEIGHT - scroll_offset

            # Four industry icons in a row
            industries = ["Tech", "Finance", "Legal", "Healthcare"]
            icon_colors = [(60, 130, 220), (50, 160, 100), (160, 120, 40), (180, 60, 80)]
            n_icons = len(industries)
            spacing = WIDTH // (n_icons + 1)

            for i, (ind, col) in enumerate(zip(industries, icon_colors)):
                cx = spacing * (i + 1)
                cy = scene2_y + HEIGHT // 2 - 30
                icon_appear = duration * scroll_start_pct + i * 0.4
                _draw_icon_circle(draw, cx, cy, 35, ind, font_icon_label, t, icon_appear, color=col)

            # "Same pattern" text below icons
            same_text = "Same pattern"
            bbox3 = draw.textbbox((0, 0), same_text, font=font_same)
            tw3 = bbox3[2] - bbox3[0]
            same_appear = duration * scroll_start_pct + 1.8
            _draw_text_fade(draw, same_text,
                (WIDTH // 2 - tw3 // 2, scene2_y + HEIGHT // 2 + 80),
                font_same, t, same_appear, color=(60, 60, 60))

        frame_path = frames_dir / f"frame_{frame_idx:05d}.png"
        img.save(str(frame_path))

    # Encode frames to video with alpha (using png pipe for transparency)
    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(FPS),
        "-i", str(frames_dir / "frame_%05d.png"),
        "-c:v", "png",
        "-pix_fmt", "rgba",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

    # Clean up frames
    for f in frames_dir.glob("*.png"):
        f.unlink()
    frames_dir.rmdir()

    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg frame encode failed: {result.stderr[-500:]}")
    return output_path


def render_panel_2(duration: float, output_path: str):
    """P2: Large '~38%' stat being drawn/written."""
    total_frames = int(duration * FPS)
    font_stat = _load_font(80, bold=True)
    font_sub = _load_font(22)
    font_src = _load_font(16)

    frames_dir = Path(tempfile.mkdtemp())

    for frame_idx in range(total_frames):
        t = frame_idx / FPS
        p = frame_idx / total_frames
        img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Circle drawn around stat (15-35%)
        circle_p = max(0, min(1.0, (p - 0.15) / 0.20))
        if circle_p > 0:
            cx, cy, r = WIDTH // 2, HEIGHT // 2 - 30, 120
            n_pts = int(circle_p * 50)
            for i in range(max(1, n_pts)):
                a1 = -math.pi / 2 + (2 * math.pi) * (i / 50)
                a2 = -math.pi / 2 + (2 * math.pi) * ((i + 1) / 50)
                x1 = cx + r * math.cos(a1) + random.uniform(-2, 2)
                y1 = cy + r * math.sin(a1) + random.uniform(-2, 2)
                x2 = cx + r * math.cos(a2) + random.uniform(-2, 2)
                y2 = cy + r * math.sin(a2) + random.uniform(-2, 2)
                draw.line([(x1, y1), (x2, y2)], fill=(40, 40, 40, 220), width=3)

        # "~38%" appears (25%+)
        stat_appear = duration * 0.25
        bbox = draw.textbbox((0, 0), "~38%", font=font_stat)
        tw = bbox[2] - bbox[0]
        _draw_text_fade(draw, "~38%", (WIDTH // 2 - tw // 2, HEIGHT // 2 - 70), font_stat, t, stat_appear, color=(40, 40, 40))

        # Subtitle (50%+)
        sub_text = "of senior women report being 'Onlys'"
        bbox2 = draw.textbbox((0, 0), sub_text, font=font_sub)
        tw2 = bbox2[2] - bbox2[0]
        _draw_text_fade(draw, sub_text, (WIDTH // 2 - tw2 // 2, HEIGHT // 2 + 80), font_sub, t, duration * 0.50, color=(80, 80, 80))

        # Source (70%+)
        src_text = "LeanIn / McKinsey — Women in the Workplace 2024"
        bbox3 = draw.textbbox((0, 0), src_text, font=font_src)
        tw3 = bbox3[2] - bbox3[0]
        _draw_text_fade(draw, src_text, (WIDTH // 2 - tw3 // 2, HEIGHT - 60), font_src, t, duration * 0.70, color=(140, 140, 140))

        frame_path = frames_dir / f"frame_{frame_idx:05d}.png"
        img.save(str(frame_path))

    cmd = [
        "ffmpeg", "-y", "-framerate", str(FPS),
        "-i", str(frames_dir / "frame_%05d.png"),
        "-c:v", "png", "-pix_fmt", "rgba", str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    for f in frames_dir.glob("*.png"):
        f.unlink()
    frames_dir.rmdir()
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg encode failed: {result.stderr[-500:]}")
    return output_path


def render_panel_3(duration: float, output_path: str):
    """P3: Pyramid/funnel — leadership levels narrowing upward."""
    total_frames = int(duration * FPS)
    font_label = _load_font(20)
    font_title = _load_font(24, bold=True)

    levels = [
        ("Entry level — 49%", 0.95),
        ("Manager — 42%", 0.78),
        ("Sr Manager — 39%", 0.62),
        ("VP — 35%", 0.45),
        ("C-suite — 29%", 0.30),
    ]

    frames_dir = Path(tempfile.mkdtemp())

    for frame_idx in range(total_frames):
        t = frame_idx / FPS
        p = frame_idx / total_frames
        img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        cx = WIDTH // 2
        base_y = HEIGHT - 100
        level_h = 90

        for i, (label, w_frac) in enumerate(levels):
            level_appear = 0.10 + i * 0.12
            level_p = max(0, min(1.0, (p - level_appear) / 0.10))
            if level_p <= 0:
                continue

            y_top = base_y - (i + 1) * level_h
            y_bot = base_y - i * level_h
            half_w = int(WIDTH * w_frac * 0.4)

            alpha = min(255, int(level_p * 255))
            shade = 180 - i * 25
            pts = [
                (cx - half_w + random.uniform(-2, 2), y_bot + random.uniform(-1, 1)),
                (cx + half_w + random.uniform(-2, 2), y_bot + random.uniform(-1, 1)),
                (cx + int(half_w * 0.85) + random.uniform(-2, 2), y_top + random.uniform(-1, 1)),
                (cx - int(half_w * 0.85) + random.uniform(-2, 2), y_top + random.uniform(-1, 1)),
            ]
            draw.polygon(pts, fill=(shade, shade, shade + 20, alpha // 3), outline=(60, 60, 60, alpha), width=2)

            bbox = draw.textbbox((0, 0), label, font=font_label)
            tw = bbox[2] - bbox[0]
            _draw_text_fade(draw, label, (cx - tw // 2, (y_top + y_bot) // 2 - 10), font_label, t, duration * level_appear + 0.5, color=(50, 50, 50))

        # Title
        _draw_text_fade(draw, "Increasing Isolation ↑", (cx - 100, 40), font_title, t, duration * 0.65, color=(40, 40, 40))

        frame_path = frames_dir / f"frame_{frame_idx:05d}.png"
        img.save(str(frame_path))

    cmd = [
        "ffmpeg", "-y", "-framerate", str(FPS),
        "-i", str(frames_dir / "frame_%05d.png"),
        "-c:v", "png", "-pix_fmt", "rgba", str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    for f in frames_dir.glob("*.png"):
        f.unlink()
    frames_dir.rmdir()
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg encode failed: {result.stderr[-500:]}")
    return output_path


def render_panel_10(duration: float, output_path: str):
    """P10: Scattered nodes → networked nodes (knowledge transfer)."""
    total_frames = int(duration * FPS)
    font_label = _load_font(20)
    font_title = _load_font(22)

    # Scattered positions (left side)
    scattered = [(200, 200), (280, 380), (150, 500), (320, 280), (250, 450)]
    # Networked positions (right side) — same relative but with connections
    networked = [(840, 200), (960, 350), (800, 480), (1000, 230), (920, 520)]
    edges = [(0, 1), (1, 2), (0, 3), (3, 4), (1, 4), (2, 4), (0, 4)]

    frames_dir = Path(tempfile.mkdtemp())

    for frame_idx in range(total_frames):
        t = frame_idx / FPS
        p = frame_idx / total_frames
        img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Scattered nodes (10-30%)
        scat_p = max(0, min(1.0, (p - 0.10) / 0.20))
        for i, (x, y) in enumerate(scattered):
            node_p = max(0, min(1.0, (scat_p - i * 0.15)))
            if node_p > 0:
                r = 15
                alpha = min(255, int(node_p * 255))
                draw.ellipse([x - r, y - r, x + r, y + r], fill=(120, 120, 120, alpha), outline=(60, 60, 60, alpha), width=2)

        # Arrow in middle (35-45%)
        arrow_p = max(0, min(1.0, (p - 0.35) / 0.10))
        if arrow_p > 0:
            ax1 = 420
            ax2 = 420 + int(200 * arrow_p)
            alpha = min(255, int(arrow_p * 255))
            draw.line([(ax1, 360), (ax2, 360)], fill=(40, 40, 40, alpha), width=3)
            if arrow_p > 0.8:
                draw.polygon([(ax2, 350), (ax2 + 15, 360), (ax2, 370)], fill=(40, 40, 40, alpha))

        # Networked nodes + edges (45-75%)
        net_p = max(0, min(1.0, (p - 0.45) / 0.30))
        # Draw edges first
        for i, (a, b) in enumerate(edges):
            edge_p = max(0, min(1.0, (net_p - i * 0.08)))
            if edge_p > 0:
                alpha = min(180, int(edge_p * 180))
                draw.line([networked[a], networked[b]], fill=(100, 160, 220, alpha), width=2)
        # Draw nodes on top
        for i, (x, y) in enumerate(networked):
            node_p = max(0, min(1.0, (net_p - i * 0.10)))
            if node_p > 0:
                r = 15
                alpha = min(255, int(node_p * 255))
                draw.ellipse([x - r, y - r, x + r, y + r], fill=(60, 130, 200, alpha), outline=(30, 80, 160, alpha), width=2)

        # Labels
        _draw_text_fade(draw, "Isolated", (200, 560), font_label, t, duration * 0.30, color=(120, 120, 120))
        _draw_text_fade(draw, "Networked", (870, 560), font_label, t, duration * 0.70, color=(30, 100, 200))
        _draw_text_fade(draw, "Knowledge compounds when connected", (WIDTH // 2 - 170, 40), font_title, t, duration * 0.80, color=(40, 40, 40))

        frame_path = frames_dir / f"frame_{frame_idx:05d}.png"
        img.save(str(frame_path))

    cmd = [
        "ffmpeg", "-y", "-framerate", str(FPS),
        "-i", str(frames_dir / "frame_%05d.png"),
        "-c:v", "png", "-pix_fmt", "rgba", str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    for f in frames_dir.glob("*.png"):
        f.unlink()
    frames_dir.rmdir()
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg encode failed: {result.stderr[-500:]}")
    return output_path


# Registry mapping panel numbers to their render functions
PANEL_RENDERERS = {
    2: render_panel_2,
    3: render_panel_3,
    10: render_panel_10,
    14: render_panel_14,
}


def render_diagram(panel_number: int, duration: float, output_path: str) -> str:
    """Render animated diagram for a slide panel. Returns path to RGBA .mov."""
    renderer = PANEL_RENDERERS.get(panel_number)
    if renderer is None:
        return _render_generic_diagram(panel_number, duration, output_path)
    return renderer(duration, output_path)


def _render_generic_diagram(panel_number: int, duration: float, output_path: str) -> str:
    """Fallback: simple fade-in placeholder for panels without custom renderers."""
    total_frames = int(duration * FPS)
    font = _load_font(28)
    frames_dir = Path(tempfile.mkdtemp())

    for frame_idx in range(total_frames):
        t = frame_idx / FPS
        img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        _draw_text_fade(draw, f"Panel {panel_number}", (WIDTH // 2 - 60, HEIGHT // 2 - 20), font, t, 0.5, color=(60, 60, 60))
        frame_path = frames_dir / f"frame_{frame_idx:05d}.png"
        img.save(str(frame_path))

    cmd = [
        "ffmpeg", "-y", "-framerate", str(FPS),
        "-i", str(frames_dir / "frame_%05d.png"),
        "-c:v", "png", "-pix_fmt", "rgba", str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    for f in frames_dir.glob("*.png"):
        f.unlink()
    frames_dir.rmdir()
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg encode failed: {result.stderr[-500:]}")
    return output_path
