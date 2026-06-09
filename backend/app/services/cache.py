"""Tiny in-process TTL cache (async-aware) — protects SerpAPI quota."""

import time
from asyncio import Lock
from typing import Any, Awaitable, Callable

from ..config import Config

_store: dict[str, tuple[float, Any]] = {}
_lock = Lock()


async def get_or_set(key: str, producer: Callable[[], Awaitable[Any]], ttl: int | None = None) -> Any:
    ttl = ttl if ttl is not None else Config.CACHE_TTL
    now = time.time()
    async with _lock:
        hit = _store.get(key)
        if hit and (now - hit[0]) < ttl:
            return hit[1]
    value = await producer()
    async with _lock:
        _store[key] = (time.time(), value)
    return value
