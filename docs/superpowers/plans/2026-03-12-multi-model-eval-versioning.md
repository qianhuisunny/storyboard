# Multi-Model Eval Versioning Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store eval results per-model and navigate between them with arrow navigation, so users can compare how the same prompt performs across GPT-4o, Claude Opus, and Claude Sonnet.

**Architecture:** Per-model cache files (`cached_eval_{model}.json`) replace the single `cached_eval.json`. Backend exposes `list_cached_models()` and model-filtered GET. Frontend adds `‹ model 1/N ›` arrow nav inline in the header.

**Tech Stack:** Python/FastAPI backend, React/TypeScript frontend, JSON file storage.

**Spec:** `docs/superpowers/specs/2026-03-12-multi-model-eval-versioning-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/app/services/eval_gold_set.py` | Modify | `_cache_path`, `_save_cache`, `get_cached_eval`, `list_cached_models`, `_migrate_legacy_cache`, `run_eval` cache logic |
| `backend/app/main.py` | Modify | GET endpoint adds `?model=` param + `available_models` in response; POST keys jobs by `name:model` |
| `frontend/src/components/admin/GoldSetEval.tsx` | Modify | Arrow nav state, `fetchModelResult`, `formatModelLabel`, header JSX |

---

## Chunk 1: Backend — Per-Model Cache Storage

### Task 1: Migrate cache functions to per-model paths

**Files:**
- Modify: `backend/app/services/eval_gold_set.py`

- [ ] **Step 1: Add `_migrate_legacy_cache` and update `_cache_path`**

Replace the existing `_cache_path` and add migration helper. In `backend/app/services/eval_gold_set.py`, find:

```python
def _cache_path(name: str) -> Path:
    return GOLD_SETS_DIR / name / "cached_eval.json"
```

Replace with:

```python
def _cache_path(name: str, model: str = "gpt-4o") -> Path:
    safe_model = model.replace("/", "_")
    return GOLD_SETS_DIR / name / f"cached_eval_{safe_model}.json"


def _migrate_legacy_cache(name: str):
    """One-time migration: rename cached_eval.json → cached_eval_gpt-4o.json."""
    legacy = GOLD_SETS_DIR / name / "cached_eval.json"
    if not legacy.exists():
        return
    target = _cache_path(name, "gpt-4o")
    if not target.exists():
        legacy.rename(target)
    else:
        legacy.unlink()
```

- [ ] **Step 2: Update `get_cached_eval` to accept model and call migration**

Find:

```python
def get_cached_eval(name: str) -> Optional[dict]:
    path = _cache_path(name)
    if path.exists():
        return json.loads(path.read_text())
    return None
```

Replace with:

```python
def get_cached_eval(name: str, model: str = "gpt-4o") -> Optional[dict]:
    _migrate_legacy_cache(name)
    path = _cache_path(name, model)
    if path.exists():
        return json.loads(path.read_text())
    return None
```

- [ ] **Step 3: Update `_save_cache` to use model from result**

Find:

```python
def _save_cache(name: str, result: dict):
    path = _cache_path(name)
    path.write_text(json.dumps(result, indent=2, ensure_ascii=False))
```

Replace with:

```python
def _save_cache(name: str, result: dict):
    model = result.get("model_used", "gpt-4o")
    path = _cache_path(name, model)
    path.write_text(json.dumps(result, indent=2, ensure_ascii=False))
```

- [ ] **Step 4: Add `list_cached_models` function**

Add after `_save_cache`:

```python
def list_cached_models(name: str) -> list[dict]:
    """List all cached model runs for a gold set, sorted by timestamp descending."""
    _migrate_legacy_cache(name)
    gs_dir = GOLD_SETS_DIR / name
    if not gs_dir.exists():
        return []
    results = []
    for f in gs_dir.glob("cached_eval_*.json"):
        model_id = f.stem.replace("cached_eval_", "")
        try:
            data = json.loads(f.read_text())
            results.append({
                "model": model_id,
                "timestamp": data.get("timestamp"),
            })
        except (json.JSONDecodeError, OSError):
            continue
    return sorted(results, key=lambda x: x["timestamp"] or "", reverse=True)
```

- [ ] **Step 5: Update `run_eval` cache check to use model-specific path**

In `run_eval`, find:

```python
    if not force:
        cached = get_cached_eval(name)
        if (cached and cached.get("prompt_versions") == prompt_versions
                and cached.get("model_used", "gpt-4o") == (model or "gpt-4o")):
            return cached
```

Replace with:

```python
    effective_model = model or "gpt-4o"
    if not force:
        cached = get_cached_eval(name, effective_model)
        if cached and cached.get("prompt_versions") == prompt_versions:
            return cached
```

- [ ] **Step 6: Verify backend still starts**

Run: `cd backend && source venv/bin/activate && python -c "from app.services.eval_gold_set import list_cached_models, get_cached_eval; print(list_cached_models('video2')); print(bool(get_cached_eval('video2', 'gpt-4o')))"`

Expected: List with one entry (the migrated gpt-4o cache), `True`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/eval_gold_set.py
git commit -m "feat(eval): per-model cache storage with migration"
```

### Task 2: Update API endpoints

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Update GET endpoint to accept model param and return available_models**

Find the `get_gold_set_eval` function and replace it:

```python
@app.get("/api/eval/gold-set/{name}")
async def get_gold_set_eval(name: str, model: str = None):
    """Get cached gold set evaluation result."""
    from app.services.eval_gold_set import get_cached_eval, load_gold_set, list_cached_models

    available = list_cached_models(name)

    if model:
        cached = get_cached_eval(name, model)
    elif available:
        cached = get_cached_eval(name, available[0]["model"])
    else:
        cached = None

    if cached:
        return {"success": True, "cached": True, "data": cached, "available_models": available}

    try:
        gold = load_gold_set(name)
        return {"success": True, "cached": False, "data": {"gold": gold, "gold_set_name": name}, "available_models": available}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Gold set '{name}' not found")
```

- [ ] **Step 2: Update POST endpoint to key jobs by name:model**

Find `run_gold_set_eval` and update the job key logic. Replace:

```python
    # Don't start if already running
    if _eval_jobs.get(name, {}).get("status") == "running":
        return {"success": True, "message": "Already running"}

    _eval_jobs[name] = {"status": "running", "error": None}

    def _run():
        try:
            run_eval(name, force=True, model=model)
            _eval_jobs[name] = {"status": "done", "error": None}
        except Exception as e:
            _eval_jobs[name] = {"status": "error", "error": str(e)}
```

With:

```python
    # Key by name:model so different models can run concurrently
    job_key = f"{name}:{model or 'gpt-4o'}"
    if _eval_jobs.get(job_key, {}).get("status") == "running":
        return {"success": True, "message": "Already running"}

    _eval_jobs[job_key] = {"status": "running", "error": None}

    def _run():
        try:
            run_eval(name, force=True, model=model)
            _eval_jobs[job_key] = {"status": "done", "error": None}
        except Exception as e:
            _eval_jobs[job_key] = {"status": "error", "error": str(e)}
```

- [ ] **Step 3: Update status endpoint to accept model param**

Find `get_eval_status` and replace:

```python
@app.get("/api/eval/gold-set/{name}/status")
async def get_eval_status(name: str):
    """Poll eval job status."""
    job = _eval_jobs.get(name)
    if not job:
        return {"status": "idle"}
    return job
```

With:

```python
@app.get("/api/eval/gold-set/{name}/status")
async def get_eval_status(name: str, model: str = None):
    """Poll eval job status."""
    job_key = f"{name}:{model or 'gpt-4o'}"
    job = _eval_jobs.get(job_key)
    if not job:
        return {"status": "idle"}
    return job
```

- [ ] **Step 4: Test endpoints**

Run: `curl -s http://localhost:8001/api/eval/gold-set/video2 | python3 -c "import sys,json; d=json.load(sys.stdin); print('available_models:', d.get('available_models')); print('has data:', bool(d.get('data')))"`

Expected: `available_models` list with at least one entry, `has data: True`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(eval): model-filtered GET endpoint with available_models"
```

## Chunk 2: Frontend — Arrow Navigation

### Task 3: Add arrow navigation to eval header

**Files:**
- Modify: `frontend/src/components/admin/GoldSetEval.tsx`

- [ ] **Step 1: Add state and helper function**

After the existing `const [isCached, setIsCached] = useState(false);` line, add:

```typescript
const [availableRuns, setAvailableRuns] = useState<{model: string; timestamp: string}[]>([]);
const [viewIndex, setViewIndex] = useState(0);
```

After the `models` fetch `useEffect`, add the `formatModelLabel` helper:

```typescript
const formatModelLabel = useCallback((modelId: string) => {
  if (!modelId) return "";
  const found = models.find(m => m.id === modelId);
  if (found) return found.label;
  return modelId.replace(/-\d{8}$/, "");
}, [models]);
```

- [ ] **Step 2: Update `fetchCached` to store available_models and reset viewIndex**

In `fetchCached`, after `setIsCached(json.cached);`, add:

```typescript
if (json.available_models) setAvailableRuns(json.available_models);
setViewIndex(0);
```

- [ ] **Step 3: Add `fetchModelResult` function**

After `fetchCached`, add:

```typescript
const fetchModelResult = useCallback(async (model: string) => {
  setLoading(true);
  try {
    const res = await fetch(`/api/eval/gold-set/${goldSetName}?model=${model}`);
    const json = await res.json();
    if (json.success) {
      setData(json.data);
      setIsCached(json.cached);
    }
  } catch (e) {
    setError(String(e));
  } finally {
    setLoading(false);
  }
}, [goldSetName]);
```

- [ ] **Step 4: Add arrow navigation handlers**

After `fetchModelResult`, add:

```typescript
const goToPrev = useCallback(() => {
  if (viewIndex > 0) {
    const newIdx = viewIndex - 1;
    setViewIndex(newIdx);
    fetchModelResult(availableRuns[newIdx].model);
  }
}, [viewIndex, availableRuns, fetchModelResult]);

const goToNext = useCallback(() => {
  if (viewIndex < availableRuns.length - 1) {
    const newIdx = viewIndex + 1;
    setViewIndex(newIdx);
    fetchModelResult(availableRuns[newIdx].model);
  }
}, [viewIndex, availableRuns, fetchModelResult]);
```

- [ ] **Step 5: Update `runEval` polling to pass model to status endpoint and navigate after completion**

In `runEval`, update the status poll URL from:

```typescript
const statusRes = await fetch(`/api/eval/gold-set/${goldSetName}/status`);
```

To:

```typescript
const statusRes = await fetch(`/api/eval/gold-set/${goldSetName}/status?model=${selectedModel}`);
```

And after `fetchCached()` (the reload on completion), add logic to navigate to the just-run model. Replace:

```typescript
            fetchCached(); // Reload the cached result
```

With:

```typescript
            // Reload and navigate to the just-run model
            const reloadRes = await fetch(`/api/eval/gold-set/${goldSetName}`);
            const reloadJson = await reloadRes.json();
            if (reloadJson.success) {
              setData(reloadJson.data);
              setIsCached(reloadJson.cached);
              if (reloadJson.available_models) {
                setAvailableRuns(reloadJson.available_models);
                const idx = reloadJson.available_models.findIndex(
                  (r: {model: string}) => r.model === selectedModel
                );
                setViewIndex(idx >= 0 ? idx : 0);
              }
            }
```

- [ ] **Step 5b: Update `runEval` dependency array**

Since `fetchCached()` is no longer called inside `runEval`, remove it from the dependency array. Find:

```typescript
  }, [goldSetName, selectedModel, fetchCached]);
```

Replace with:

```typescript
  }, [goldSetName, selectedModel]);
```

- [ ] **Step 6: Add arrow nav JSX to the header**

In the header's right-side div, add the arrow nav BETWEEN the timestamp/badge and the Run Eval button (matching spec). Find the Run Eval button:

```tsx
              <Button onClick={runEval} disabled={running} size="sm">
```

Add before it:

```tsx
              {availableRuns.length > 0 && (
                <div className="flex items-center gap-1.5 bg-muted/50 rounded-md px-2.5 py-1">
                  <button
                    onClick={goToPrev}
                    disabled={viewIndex === 0}
                    className={`text-lg leading-none px-1 ${viewIndex === 0 ? "text-muted-foreground/30 cursor-default" : "text-foreground hover:text-foreground/80 cursor-pointer"}`}
                  >
                    ‹
                  </button>
                  <span className="text-xs font-medium min-w-[80px] text-center">
                    {formatModelLabel(availableRuns[viewIndex]?.model)}
                    {" "}<span className="text-muted-foreground">{viewIndex + 1}/{availableRuns.length}</span>
                  </span>
                  <button
                    onClick={goToNext}
                    disabled={viewIndex === availableRuns.length - 1}
                    className={`text-lg leading-none px-1 ${viewIndex === availableRuns.length - 1 ? "text-muted-foreground/30 cursor-default" : "text-foreground hover:text-foreground/80 cursor-pointer"}`}
                  >
                    ›
                  </button>
                </div>
              )}
```

- [ ] **Step 7: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 8: Manual test**

1. Open `http://localhost:3000/admin/gold-set-eval`
2. Select `video2` — should see arrow nav showing `GPT-4o 1/1` with both arrows disabled
3. Select Claude Opus from model dropdown, click Run Eval
4. After completion, arrows should show `2` total, navigating between GPT-4o and Claude Opus results

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/admin/GoldSetEval.tsx
git commit -m "feat(eval): arrow navigation between model versions"
```
