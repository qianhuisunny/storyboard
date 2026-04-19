"""
LLM Gateway — unified router for all LLM calls.

Model selection driven by config/llm_config.json (no code changes needed).
Logs every call with category, tokens, cost, and latency.

Usage:
    from app.infra.llm_gateway import llm

    text = llm.chat(
        category="storyboard",
        label="director",
        system_prompt="...",
        user_prompt="...",
    )
"""

import os
import time
import json
from pathlib import Path
from typing import Optional
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# Provider config: model prefix → (env_var_for_key, base_url or None)
PROVIDERS = {
    "gpt-": ("OPENAI_API_KEY", None),
    "qwen": ("IONROUTER_API_KEY", "https://router.ionrouter.com/v1"),
}

# Cost per 1M tokens (input, output) by model
MODEL_COSTS = {
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4-turbo": (10.00, 30.00),
    "qwen3-30b-a3b": (0.00, 0.00),  # IonRouter free tier
}

DEFAULT_MODEL = "gpt-4o"

CONFIG_PATH = Path(__file__).parent.parent.parent / "config" / "llm_config.json"


def _load_routes() -> dict[str, str]:
    try:
        config = json.loads(CONFIG_PATH.read_text())
        return config.get("routes", {})
    except Exception:
        return {}


class LLMGateway:
    def __init__(self):
        self._clients: dict[str, OpenAI] = {}
        self._stats: dict[str, dict] = {}
        self._routes: dict[str, str] = _load_routes()

    def _get_client(self, model: str) -> OpenAI:
        for prefix, (env_key, base_url) in PROVIDERS.items():
            if model.startswith(prefix):
                if prefix not in self._clients:
                    kwargs = {"api_key": os.getenv(env_key)}
                    if base_url:
                        kwargs["base_url"] = base_url
                    self._clients[prefix] = OpenAI(**kwargs)
                return self._clients[prefix]
        if "openai" not in self._clients:
            self._clients["openai"] = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        return self._clients["openai"]

    @property
    def client(self) -> OpenAI:
        return self._get_client(DEFAULT_MODEL)

    def chat(
        self,
        category: str,
        label: str,
        system_prompt: str,
        user_prompt: str,
        model: str = DEFAULT_MODEL,
        temperature: float = 0.7,
        max_tokens: int = 4000,
        usage_out: Optional[dict] = None,
    ) -> str:
        route_key = f"{category}.{label}"
        model = self._routes.get(route_key, model)

        start = time.perf_counter()

        try:
            client = self._get_client(model)
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
            )
        except Exception as e:
            elapsed = time.perf_counter() - start
            err_str = str(e)
            is_rate_limit = "429" in err_str or "rate" in err_str.lower()
            tag = "RATE LIMIT" if is_rate_limit else "ERROR"
            print(f"[LLM][{category}] {label:<16} | {model} | {tag} | {elapsed:.1f}s | {err_str[:120]}")
            raise

        elapsed = time.perf_counter() - start
        text = response.choices[0].message.content or ""

        in_tokens = 0
        out_tokens = 0
        if hasattr(response, "usage") and response.usage:
            in_tokens = response.usage.prompt_tokens
            out_tokens = response.usage.completion_tokens

        if usage_out is not None:
            usage_out["input_tokens"] = in_tokens
            usage_out["output_tokens"] = out_tokens

        cost = self._estimate_cost(model, in_tokens, out_tokens)
        self._record(category, label, model, in_tokens, out_tokens, cost, elapsed)

        print(
            f"[LLM][{category}] {label:<16} | {model} | "
            f"{in_tokens} in + {out_tokens} out | "
            f"${cost:.3f} | {elapsed:.1f}s"
        )

        return text

    def chat_json(
        self,
        category: str,
        label: str,
        system_prompt: str,
        user_prompt: str,
        model: str = DEFAULT_MODEL,
        temperature: float = 0.7,
        max_tokens: int = 4000,
    ) -> dict:
        """Chat + parse JSON from response. Raises ValueError on parse failure."""
        text = self.chat(category, label, system_prompt, user_prompt, model, temperature, max_tokens)
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        return json.loads(text)

    def _estimate_cost(self, model: str, in_tokens: int, out_tokens: int) -> float:
        in_rate, out_rate = MODEL_COSTS.get(model, (2.50, 10.00))
        return (in_tokens * in_rate + out_tokens * out_rate) / 1_000_000

    def _record(self, category: str, label: str, model: str, in_tokens: int, out_tokens: int, cost: float, elapsed: float):
        key = f"{category}.{label}"
        if key not in self._stats:
            self._stats[key] = {"calls": 0, "in_tokens": 0, "out_tokens": 0, "cost": 0.0, "time": 0.0}
        s = self._stats[key]
        s["calls"] += 1
        s["in_tokens"] += in_tokens
        s["out_tokens"] += out_tokens
        s["cost"] += cost
        s["time"] += elapsed

    def summary(self) -> str:
        """Print cumulative stats per category.label."""
        if not self._stats:
            return "[LLM] No calls recorded."

        lines = ["", "═" * 85, " LLM Usage Summary", "═" * 85]
        total_cost = 0.0
        total_calls = 0
        for key, s in sorted(self._stats.items()):
            lines.append(
                f"  {key:<32} | {s['calls']:>3} calls | "
                f"{s['in_tokens']:>7} in + {s['out_tokens']:>6} out | "
                f"${s['cost']:.3f} | {s['time']:.1f}s"
            )
            total_cost += s["cost"]
            total_calls += s["calls"]
        lines.append("─" * 85)
        lines.append(f"  {'TOTAL':<32} | {total_calls:>3} calls | ${total_cost:.3f}")
        lines.append("═" * 85)
        return "\n".join(lines)


# Singleton
llm = LLMGateway()
