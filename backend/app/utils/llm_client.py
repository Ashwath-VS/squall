"""LLM client — OpenAI-compatible (DeepSeek/Gemini/OpenAI). Reused from AirWave's proven impl."""

import json
import re
import time
from typing import Optional, Dict, Any, List

from openai import OpenAI

from ..config import Config
from .logger import get_logger

_log = get_logger("squall.llm")


class LLMClient:
    def __init__(self, api_key=None, base_url=None, model=None):
        self.api_key = api_key or Config.LLM_API_KEY
        self.base_url = base_url or Config.LLM_BASE_URL
        self.model = model or Config.LLM_MODEL_NAME
        if not self.api_key:
            raise ValueError("LLM_API_KEY not configured")
        self.client = OpenAI(api_key=self.api_key, base_url=self.base_url)

    def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2048,
        response_format: Optional[Dict] = None,
    ) -> str:
        kwargs: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format:
            kwargs["response_format"] = response_format

        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                response = self.client.chat.completions.create(**kwargs)
                break
            except Exception as exc:
                err = str(exc).lower()
                if any(k in err for k in ("429", "rate limit", "quota", "resource_exhausted")):
                    wait = 8 * (2 ** attempt)
                    _log.warning(f"Rate limited ({attempt+1}/3) — waiting {wait}s")
                    time.sleep(wait)
                    last_exc = exc
                    continue
                raise
        else:
            raise RuntimeError(f"LLM call failed after 3 retries: {last_exc}")

        content = response.choices[0].message.content or ""
        if not isinstance(content, str):
            content = str(content)
        content = re.sub(r"<think>[\s\S]*?</think>", "", content).strip()
        return content

    def chat_json(self, messages, temperature: float = 0.4, max_tokens: int = 2048) -> Dict[str, Any]:
        raw = self.chat(messages, temperature, max_tokens, response_format={"type": "json_object"})
        cleaned = raw.strip()
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass
        cb = re.search(r"```(?:json)?\s*\n?([\s\S]*?)\n?```", cleaned, re.IGNORECASE)
        if cb:
            try:
                return json.loads(cb.group(1).strip())
            except json.JSONDecodeError:
                pass
        brace = re.search(r"\{[\s\S]*\}", cleaned)
        if brace:
            try:
                return json.loads(brace.group(0))
            except json.JSONDecodeError:
                pass
        raise ValueError(f"Invalid JSON from LLM: {cleaned[:200]}")
