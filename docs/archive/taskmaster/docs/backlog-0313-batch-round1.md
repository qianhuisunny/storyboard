# Backlog — Batch Process Round #1

## Task: Batch Process All Gold Sets Through Full Pipeline (Round 1)

Run all gold sets (feynman_technique, video2, video3, video4, video5, video6, video7, video8) through the full agent pipeline in batch to establish Round 1 baselines.

### Requirements
- Batch run each gold set through: TopicResearcher → BriefBuilder → StoryboardDirector → Evidence Research → StoryboardWriter
- Use gold set briefs as input (skip intake form, feed brief directly to Director)
- Store all AI outputs per gold set (outline, evidence, storyboard) as Round 1 results
- Run eval comparison against gold standards for each
- Collect aggregate metrics: avg screen count diff, avg duration accuracy, avg word count diff, filler phrase rate, citation rate
- Generate a summary report of Round 1 results across all gold sets
- This establishes the baseline before any prompt/model tuning

### Key files
- `backend/app/services/eval_gold_set.py` — eval pipeline (has `run_eval()` for individual gold sets)
- `data/gold_sets/` — gold standard data
- `frontend/src/components/admin/GoldSetEval.tsx` — eval results UI
- `backend/config/llm_config.json` — model selection for batch run
