# 📋 Video Pipeline — April 12 Hackathon

**Branch:** `video_storyboarding` (~34 commits)
**Latest verified full run:** 6:44 final video, $0.67 spend, 12 min runtime ✅

## The pipeline in one picture

```
Storyboard JSON (16 panels)
         │
         ▼
OpenAI TTS (all 16 → mp3s)     ← same alloy voice everywhere for consistency
         │
         ▼
┌──────────────┬──────────────┬──────────────┐
│ talking_head │  stock_video │    slides    │
│  (3 panels)  │  (2 panels)  │  (11 panels) │
├──────────────┼──────────────┼──────────────┤
│ HeyGen       │ Pexels       │ GPT-4o       │
│ audio-driven │ Videos API   │ template pick│
│ /v2/video/   │ /videos/     │ + Whisper    │
│ generate     │ search       │ word times   │
│              │              │ + GPT-4o     │
│              │              │ element sync │
│              │              │ + Remotion   │
└──────────────┴──────────────┴──────────────┘
         │
         ▼
ffmpeg two-stage stitch (normalize + concat)
         │
         ▼
final.mp4 + manifest.json + index.html
```

## External APIs (all six used in every run)

| API | Purpose | Cost/run | Key in `backend/.env` |
|---|---|---|---|
| **OpenAI TTS** (`tts-1-hd`) | Narration audio for every panel | ~$0.12 | `OPENAI_API_KEY` |
| **OpenAI Whisper** (`whisper-1`) | Word timestamps for slide animation sync | ~$0.04 | same |
| **OpenAI GPT-4o** | Slide template picker + element alignment + stock video keyword gen | ~$0.14 | same |
| **HeyGen** (`v2/video/generate` + `v1/video_status.get`) | Talking-head lip-sync using our audio | ~$0.37 | `HEYGEN_API_KEY` (X-Api-Key header, not Bearer) |
| **Pexels Videos** (`/videos/search`) | Real stock B-roll for stock_video panels | free | `PEXEL_API_KEY` (note: singular, not PEXELS) |
| **litterbox.catbox.moe** | Ephemeral public host for audio URLs HeyGen fetches | free | none |

## Three render paths

1. **`talking_head`** — OpenAI TTS → upload mp3 to litterbox → HeyGen audio-driven (`voice.type="audio"` + `audio_url`) → poll → download. Avatar is `Lisa_public`. HeyGen output is native 1920×1080 @ 25fps so stitcher normalize is near-lossless.

2. **`stock_video`** — GPT-4o turns `visual_direction` into a 3-5 word Pexels search query → picks best 1080p clip → ffmpeg loops/trims and overlays our TTS audio (`-map 0:v -map 1:a` drops Pexels' original audio).

3. **`slides`** — GPT-4o picks one of 5 Remotion templates (PyramidChart / SplitComparison / Timeline / ThreeColumn / DataCard) → Whisper transcribes the TTS audio with word timestamps → GPT-4o aligns each visual element to the moment it's mentioned in the voiceover → Remotion renders with `elementTimings` prop so each element fades in at exactly the right frame.
