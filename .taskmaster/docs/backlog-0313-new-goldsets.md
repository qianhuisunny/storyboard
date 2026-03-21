# Backlog — Add Gold Set Video 4, 5, 6

## Task: Add New Gold Sets (video4, video5, video6)

Expand the gold set evaluation corpus by adding 3 new gold standard storyboards (video4, video5, video6).

### Requirements
- Create gold_standard.json for video4, video5, video6 following the same format as existing gold sets (feynman_technique, video2, video3)
- Each gold_standard.json must include: brief, outline (sections with talking points, evidence, duration), storyboard (screen-by-screen with voiceover, visual direction, screen type, action notes), and meta
- video4 source already exists at `goldsets/video4/` (ChatGPT for Data Analysis) — needs gold_standard.json created
- video5 and video6: identify and select appropriate source videos, then create gold standards
- Run eval pipeline on new gold sets to establish baselines
- Ensure eval_gold_set.py `list_gold_sets()` picks up the new entries automatically

### Key files
- `data/gold_sets/` — where gold_standard.json files live
- `goldsets/` — source video files
- `backend/app/services/eval_gold_set.py` — eval service that loads and runs gold sets
- `frontend/src/components/admin/GoldSetEval.tsx` — eval UI
