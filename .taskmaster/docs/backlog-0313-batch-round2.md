# Backlog — Batch Process Round #2

## Task: Batch Process All Gold Sets Through Full Pipeline (Round 2)

After prompt/model tuning from Round 1 insights, run all gold sets through the full agent pipeline again to measure improvement.

### Requirements
- Run after Round 1 analysis is complete and prompt/model changes have been applied
- Batch run all gold sets (video1-17) through: TopicResearcher → BriefBuilder → StoryboardDirector → Evidence Research → StoryboardWriter
- Use same gold set briefs as Round 1 input for fair comparison
- Store all AI outputs as Round 2 results (separate from Round 1)
- Run eval comparison against gold standards for each
- Compare Round 2 metrics against Round 1 baseline: did prompt/model changes improve results?
- Metrics to compare: screen count accuracy, duration accuracy, word count, filler phrase rate, citation rate, voiceover tone
- Generate Round 1 vs Round 2 comparison report

### Dependencies
- Depends on: Batch Round #1 completion, gold sets video4-17 creation, prompt tuning based on Round 1 results

### Key files
- `backend/app/services/eval_gold_set.py` — eval pipeline
- `data/gold_sets/` — gold standard data
- `frontend/src/components/admin/GoldSetEval.tsx` — eval results UI
- `backend/config/llm_config.json` — model selection
