# Multi-Model Eval Versioning

Store and navigate between eval results from different LLM models using ChatGPT-style arrow navigation.

## Problem

The eval system overwrites `cached_eval.json` on each run. When switching models (GPT-4o → Claude Opus), the previous result is lost. Users need to compare how the same prompt performs across models.

## Decisions

| Question | Decision |
|----------|----------|
| Comparison dimension | Model only (not prompt version) |
| Navigation UX | Arrow nav `‹ GPT-4o 1/3 ›` (ChatGPT regenerate style) |
| Arrow placement | Inline in existing header, right side |
| Storage | One cache file per model |

## Storage

### Current

```
data/gold_sets/video2/
  gold_standard.json
  cached_eval.json        ← overwritten each run
```

### New

```
data/gold_sets/video2/
  gold_standard.json
  cached_eval_gpt-4o.json
  cached_eval_claude-opus-4-20250514.json
  cached_eval_claude-sonnet-4-20250514.json
```

File naming: `cached_eval_{model_id}.json` where `model_id` is the model string passed to the API (e.g., `gpt-4o`, `claude-opus-4-20250514`).

Each file contains the same structure as today's `cached_eval.json`, with the addition of `model_used` field (already added).

### Migration

In `_migrate_legacy_cache(name)`, called at the top of `get_cached_eval()` and `list_cached_models()`:
1. Check if `cached_eval.json` exists (old format)
2. Only rename to `cached_eval_gpt-4o.json` if the target does NOT already exist (avoid overwriting newer model-specific file)
3. If target exists, delete the legacy file (it's stale)

## Backend Changes

### `eval_gold_set.py`

**`_cache_path(name, model)`** — now takes model param:
```python
def _cache_path(name: str, model: str = "gpt-4o") -> Path:
    safe_model = model.replace("/", "_")
    return GOLD_SETS_DIR / name / f"cached_eval_{safe_model}.json"
```

**`get_cached_eval(name, model)`** — loads a specific model's cache.

**`list_cached_models(name)`** — new function. Scans directory for `cached_eval_*.json`, returns list of `{model, timestamp}` sorted by timestamp descending.

```python
def list_cached_models(name: str) -> list[dict]:
    dir = GOLD_SETS_DIR / name
    results = []
    for f in dir.glob("cached_eval_*.json"):
        model_id = f.stem.replace("cached_eval_", "")
        data = json.loads(f.read_text())
        results.append({
            "model": model_id,
            "timestamp": data.get("timestamp"),
        })
    return sorted(results, key=lambda x: x["timestamp"] or "", reverse=True)
```

**`_save_cache(name, result)`** — calls `_cache_path(name, result["model_used"])` to determine filename:
```python
def _save_cache(name: str, result: dict):
    model = result.get("model_used", "gpt-4o")
    path = _cache_path(name, model)
    path.write_text(json.dumps(result, indent=2, ensure_ascii=False))
```

**`run_eval(name, force, model)`** — already accepts model (done in prior session). Cache check uses model-specific path via `get_cached_eval(name, model)`.

### `main.py`

**`GET /api/eval/gold-set/{name}`** — updated response:

```json
{
  "success": true,
  "cached": true,
  "data": { /* eval result */ },
  "available_models": [
    {"model": "gpt-4o", "timestamp": "2026-03-12T18:12:21"},
    {"model": "claude-opus-4-20250514", "timestamp": "2026-03-12T19:01:33"}
  ]
}
```

Add optional query param `?model=claude-opus-4-20250514` to load a specific model's result. Without it, calls `list_cached_models(name)`, takes the first entry (most recent by timestamp), and loads that model's result. Always includes `available_models` in response from both cached and non-cached branches.

**`POST /api/eval/gold-set/{name}`** — key `_eval_jobs` by `f"{name}:{model}"` instead of just `name`, so concurrent runs of the same gold set with different models don't block each other.

## Frontend Changes

### `eval-components.tsx`

No type changes needed — `EvalData` already has `model_used?: string`.

### `GoldSetEval.tsx`

**New state:**
```typescript
const [availableRuns, setAvailableRuns] = useState<{model: string; timestamp: string}[]>([]);
const [viewIndex, setViewIndex] = useState(0);  // index into availableRuns
```

**`fetchCached` update:** Response now includes `available_models`. Store in `availableRuns`. Reset `viewIndex` to 0 (latest). This also runs when `goldSetName` changes, so switching gold sets resets the arrow navigation.

**Arrow navigation handlers:**
```typescript
const goToPrev = () => {
  if (viewIndex > 0) {
    const newIdx = viewIndex - 1;
    setViewIndex(newIdx);
    fetchModelResult(availableRuns[newIdx].model);
  }
};
const goToNext = () => {
  if (viewIndex < availableRuns.length - 1) {
    const newIdx = viewIndex + 1;
    setViewIndex(newIdx);
    fetchModelResult(availableRuns[newIdx].model);
  }
};
```

**`fetchModelResult(model)`** — new function, calls `GET /api/eval/gold-set/{name}?model={model}`, updates `data`.

**Header JSX** — add arrow nav between timestamp and Run Eval button:

```tsx
{availableRuns.length > 0 && (
  <div className="flex items-center gap-1.5 bg-muted/50 rounded-md px-2.5 py-1">
    <button onClick={goToPrev} disabled={viewIndex === 0}
      className={viewIndex === 0 ? "text-muted-foreground/30" : "text-foreground hover:text-foreground/80"}>
      ‹
    </button>
    <span className="text-xs font-medium min-w-[80px] text-center">
      {formatModelLabel(availableRuns[viewIndex]?.model)}
      {" "}<span className="text-muted-foreground">{viewIndex + 1}/{availableRuns.length}</span>
    </span>
    <button onClick={goToNext} disabled={viewIndex === availableRuns.length - 1}
      className={viewIndex === availableRuns.length - 1 ? "text-muted-foreground/30" : "text-foreground hover:text-foreground/80"}>
      ›
    </button>
  </div>
)}
```

**`formatModelLabel(modelId)`** — maps model IDs to short display labels. Uses the `/api/eval/models` response (already fetched on mount) as the lookup source. Fallback: strip date suffix via regex `/\-\d{8}$/`.

**After Run Eval completes:** Re-fetch to get updated `available_models`. Find the index of `selectedModel` in the refreshed `availableRuns` array and set `viewIndex` to it. If not found (shouldn't happen), default to 0.

### Interaction summary

| Action | What happens |
|--------|-------------|
| Page load | Fetch latest result + list of all model runs |
| Click `‹` / `›` | Load that model's cached result (no LLM call) |
| Change model dropdown | Sets which model the next Run Eval will use |
| Click Run Eval | Runs eval with dropdown model, saves to model-specific file, refreshes list, navigates to new result |

## Out of Scope

- Prompt version comparison (future enhancement)
- Deleting individual model runs
- Side-by-side model comparison view
