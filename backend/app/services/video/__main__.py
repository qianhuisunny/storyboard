"""
Video Generation CLI.

Usage:
    cd backend && source venv/bin/activate
    PYTHONPATH=app/services python -m video generate \\
        --storyboard /path/to/storyboard.json \\
        --avatar-image https://example.com/speaker.png

Output defaults to <repo_root>/data/video_output (gitignored). Override
with --output if you want artifacts somewhere else.
"""
import argparse
import sys
from pathlib import Path
from .models import PipelineConfig
from .pipeline import run_pipeline

# Resolve <repo_root>/data/video_output from this file: 5 .parent calls
# take us from backend/app/services/video/__main__.py up to the repo root.
# Same pattern used by slides.py for REMOTION_DIR / PROMPT_PATH.
DEFAULT_OUTPUT_DIR = str(
    Path(__file__).parent.parent.parent.parent.parent / "data" / "video_output"
)


def main():
    parser = argparse.ArgumentParser(description="Plotline Video Generation Pipeline")
    sub = parser.add_subparsers(dest="command")

    gen = sub.add_parser("generate", help="Generate video from storyboard")
    gen.add_argument("--storyboard", required=True, help="Path to storyboard JSON file")
    gen.add_argument("--avatar-image", required=True, help="URL of speaker portrait image")
    gen.add_argument(
        "--output",
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory (default: {DEFAULT_OUTPUT_DIR})",
    )
    gen.add_argument("--voice", default="alloy", help="OpenAI TTS voice (default: alloy)")
    gen.add_argument("--kling-model", default="standard", choices=["standard", "pro"], help="Kling Avatar model tier")
    gen.add_argument("--parallel", type=int, default=4, help="Max concurrent API calls")
    gen.add_argument("--skip-tts", action="store_true", help="Reuse existing audio files")
    gen.add_argument("--skip-avatar", action="store_true", help="Reuse existing avatar clips")
    gen.add_argument("--only-panels", type=str, help="Comma-separated panel numbers to generate")
    gen.add_argument("--dry-run", action="store_true", help="Preview without API calls")

    args = parser.parse_args()

    if args.command != "generate":
        parser.print_help()
        sys.exit(1)

    only_panels = None
    if args.only_panels:
        only_panels = [int(x.strip()) for x in args.only_panels.split(",")]

    if args.dry_run:
        from .parser import parse_storyboard
        sb = parse_storyboard(args.storyboard)
        print(f"Storyboard: {sb.title}")
        print(f"Panels: {sb.total_panels}")
        print(f"Talking Head: {len(sb.talking_head_panels)}")
        print(f"Slides: {len(sb.slides_panels)}")
        if only_panels:
            print(f"Only panels: {only_panels}")
        print(f"\nNo API calls made (dry run).")
        return

    config = PipelineConfig(
        storyboard_path=args.storyboard,
        avatar_image_path=args.avatar_image,
        output_dir=args.output,
        voice=args.voice,
        kling_model=args.kling_model,
        max_parallel=args.parallel,
        skip_tts=args.skip_tts,
        skip_avatar=args.skip_avatar,
        only_panels=only_panels,
    )

    run_pipeline(config)


if __name__ == "__main__":
    main()
