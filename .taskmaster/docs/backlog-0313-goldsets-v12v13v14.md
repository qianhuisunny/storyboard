# Backlog — Add Gold Set Video 12, 13, 14

## Task: Add New Gold Sets (video12, video13, video14)

Expand the gold set evaluation corpus by adding 3 more gold standard storyboards (video12, video13, video14).

### Requirements
- Identify and select 3 appropriate source videos for video12, video13, video14
- Create gold_standard.json for each following the same format as existing gold sets
- Each gold_standard.json must include: brief, outline (sections with talking points, evidence, duration), storyboard (screen-by-screen with voiceover, visual direction, screen type, action notes), and meta
- Run eval pipeline on new gold sets to establish baselines
- Ensure eval_gold_set.py `list_gold_sets()` picks up the new entries automatically

### Key files
- `data/gold_sets/` — where gold_standard.json files live
- `goldsets/` — source video files
- `backend/app/services/eval_gold_set.py` — eval service
- `frontend/src/components/admin/GoldSetEval.tsx` — eval UI
