"""Squall configuration — loads from project-root .env, falls back to env vars (prod)."""

import os
from dotenv import load_dotenv

_root_env = os.path.join(os.path.dirname(__file__), "../../.env")
if os.path.exists(_root_env):
    load_dotenv(_root_env, override=True)
else:
    load_dotenv(override=True)


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "squall-secret-key")
    DEBUG = os.environ.get("FLASK_DEBUG", "True").lower() == "true"
    JSON_AS_ASCII = False

    # LLM (OpenAI-compatible; DeepSeek by default)
    LLM_API_KEY = os.environ.get("LLM_API_KEY")
    LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "https://api.deepseek.com/v1")
    LLM_MODEL_NAME = os.environ.get("LLM_MODEL_NAME", "deepseek-chat")

    # Live data
    SERPAPI_KEY = os.environ.get("SERPAPI_KEY")

    # Cache TTL (seconds) — protects SerpAPI quota
    CACHE_TTL = int(os.environ.get("CACHE_TTL", "900"))  # 15 min

    @classmethod
    def validate(cls) -> list[str]:
        errors: list[str] = []
        if not cls.LLM_API_KEY:
            errors.append("LLM_API_KEY not configured — Communicator agent will be unavailable.")
        if not cls.SERPAPI_KEY:
            import logging
            logging.getLogger("squall").warning(
                "SERPAPI_KEY not set — flight list and news signals will run degraded "
                "(weather + traffic only). Set it in Fly.io secrets for full coverage."
            )
        return errors
