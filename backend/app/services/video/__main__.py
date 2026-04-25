"""
Video Generation CLI.

Usage:
    cd backend && source venv/bin/activate
    PYTHONPATH=app/services python -m video generate \\
        --storyboard /path/to/storyboard.json

Output defaults to <repo_root>/data/video_output (gitignored). Override
with --output if you want artifacts somewhere else.

Talking-head panels are rendered via HeyGen's Photo Avatar API using
HeyGen's built-in TTS (no local audio upload step required). The
default avatar is HeyGen's public "Lisa" (avatar_id=Lisa_public) at
1920x1080. Override with --avatar-id / --voice-id.

Billing note: HeyGen's Photo Avatar costs ~$1 per minute of generated
video ($5 top-up = 300 seconds = 5 minutes of talking-head content).
Slides use OpenAI TTS + Remotion which is essentially free.
Use --dry-run to preview the fixture without making any API calls.
"""
import argparse
import sys
from pathlib import Path
from .models import PipelineConfig
from .pipeline import run_pipeline
from .preview import make_sample

# Resolve <repo_root>/data/video_output from this file: 5 .parent calls
# take us from backend/app/services/video/__main__.py up to the repo root.
# Same pattern used by slides.py for REMOTION_DIR / PROMPT_PATH.
_REPO_ROOT = Path(__file__).parent.parent.parent.parent.parent
DEFAULT_OUTPUT_DIR = str(_REPO_ROOT / "data" / "video_output")
DEFAULT_SAMPLE_DIR = str(_REPO_ROOT / "data" / "video_output_sample")


def main():
    parser = argparse.ArgumentParser(description="Plotline Video Generation Pipeline")
    sub = parser.add_subparsers(dest="command")

    gen = sub.add_parser("generate", help="Generate video from storyboard")
    gen.add_argument(
        "--storyboard",
        required=True,
        help="Path to storyboard JSON file",
    )
    gen.add_argument(
        "--output",
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory (default: {DEFAULT_OUTPUT_DIR})",
    )
    gen.add_argument(
        "--voice",
        default="alloy",
        help="OpenAI TTS voice for slides panels (default: alloy)",
    )
    gen.add_argument(
        "--avatar-id",
        default="Lisa_public",
        help="HeyGen avatar identifier for talking-head panels (default: Lisa_public). "
        "HeyGen internally treats this as a look_id; public avatar strings and "
        "look hashes both work, but look hashes must be in the workspace pool.",
    )
    gen.add_argument(
        "--voice-id",
        default="1bd001e7e50f421d891986aad5158bc8",
        help="HeyGen voice_id for talking-head TTS. Defaults to a general-purpose "
        "female voice that's confirmed working with Lisa_public.",
    )
    gen.add_argument(
        "--avatar-style",
        default="normal",
        help="HeyGen avatar style: normal / happy / serious (default: normal)",
    )
    gen.add_argument("--parallel", type=int, default=4, help="Max concurrent API calls")
    gen.add_argument("--skip-tts", action="store_true", help="Reuse existing audio files")
    gen.add_argument(
        "--skip-avatar",
        action="store_true",
        help="Reuse existing talking-head clips (don't re-call HeyGen)",
    )
    gen.add_argument(
        "--only-panels",
        type=str,
        help="Comma-separated panel numbers to generate",
    )
    gen.add_argument(
        "--talking-head-provider",
        default="heygen",
        choices=["heygen", "seedance"],
        help="Video provider for talking-head panels (default: heygen)",
    )
    gen.add_argument(
        "--seedance-ref-image",
        type=str,
        default=None,
        help="Path to character reference image for Seedance lip sync",
    )
    gen.add_argument(
        "--enable-keyframe-overlay",
        action="store_true",
        help="Render keyframe overlays on panel clips (auto-generates if missing)",
    )
    gen.add_argument(
        "--skip-keyframe-gen",
        action="store_true",
        help="Use storyboard-provided keyframes only (don't auto-generate)",
    )
    gen.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview fixture parse only — zero API calls, zero credits",
    )

    # `sample` subcommand: build a hand-crafted preview fixture for the UI
    # without running the real pipeline. Uses the test storyboard fixture
    # and fakes up per-panel metadata. Zero API calls — the only cost is
    # one ffmpeg invocation for a ~2s placeholder video.
    samp = sub.add_parser(
        "sample",
        help="Generate a preview fixture for the video pipeline UI (no API calls)",
    )
    samp.add_argument(
        "--output",
        default=DEFAULT_SAMPLE_DIR,
        help=f"Where to write the fixture (default: {DEFAULT_SAMPLE_DIR})",
    )

    args = parser.parse_args()

    if args.command == "sample":
        index_path = make_sample(args.output)
        print(f"Preview sample written: {index_path}")
        print(
            f"  → cd {args.output} && python3 -m http.server 8765"
        )
        print(f"  → open http://localhost:8765/")
        return

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
        print(f"Stock Video: {len(sb.stock_video_panels)}")
        if only_panels:
            print(f"Only panels: {only_panels}")
        print(f"\nNo API calls made (dry run).")
        return

    config = PipelineConfig(
        storyboard_path=args.storyboard,
        output_dir=args.output,
        voice=args.voice,
        heygen_avatar_id=args.avatar_id,
        heygen_voice_id=args.voice_id,
        heygen_avatar_style=args.avatar_style,
        max_parallel=args.parallel,
        skip_tts=args.skip_tts,
        skip_avatar=args.skip_avatar,
        only_panels=only_panels,
        talking_head_provider=args.talking_head_provider,
        seedance_ref_image=args.seedance_ref_image,
        enable_keyframe_overlay=args.enable_keyframe_overlay,
        skip_keyframe_gen=args.skip_keyframe_gen,
    )

    run_pipeline(config)


if __name__ == "__main__":
    main()
