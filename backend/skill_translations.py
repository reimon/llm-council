"""Portuguese translations for local SKILL.md descriptions (they are usually written in English).

Translations are made once by a light model and cached in data/skill_translations.json,
keyed by a hash of the original text, so an edited SKILL.md gets translated again.
"""

import asyncio
import hashlib
import json
import os
import re
from typing import Any, Dict, List

from .config import DATA_DIR, LLM_PROVIDER, TITLE_MODEL
from .jsonfile import write_json

CACHE_PATH = os.path.join(os.path.dirname(DATA_DIR), "skill_translations.json")
BATCH = 40

_lock = asyncio.Lock()


def _key(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]


def _load() -> Dict[str, str]:
    if not os.path.exists(CACHE_PATH):
        return {}
    with open(CACHE_PATH, encoding="utf-8") as f:
        return json.load(f)


def _save(cache: Dict[str, str]):
    write_json(CACHE_PATH, cache, ensure_ascii=False)


def apply(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Fill description.pt for local skills from the cache (original text stays in .en)."""
    cache = _load()
    for s in items:
        if s.get("source") != "local":
            continue
        original = (s.get("description") or {}).get("en", "")
        translated = cache.get(_key(original)) if original else None
        if translated:
            s["description"] = {**s["description"], "pt": translated}
    return items


def pending(items: List[Dict[str, Any]]) -> List[str]:
    cache = _load()
    texts = {(s.get("description") or {}).get("en", "") for s in items if s.get("source") == "local"}
    return [t for t in texts if t and _key(t) not in cache]


async def _translate_batch(texts: List[str]) -> Dict[str, str]:
    from .providers import query_member

    numbered = "\n".join(f"{i}: {json.dumps(t, ensure_ascii=False)}" for i, t in enumerate(texts))
    prompt = (
        "Translate each software skill description below into Brazilian Portuguese. "
        "Keep product names, commands, file names and code identifiers unchanged. "
        "Reply with ONLY a JSON object mapping each number (as a string) to its translation, nothing else.\n\n"
        + numbered
    )
    provider = "codex" if LLM_PROVIDER == "codex" else "openrouter"
    response = await query_member({"provider": provider, "model": TITLE_MODEL}, [{"role": "user", "content": prompt}], timeout=300.0)
    if not response or not response.get("content"):
        return {}
    match = re.search(r"\{.*\}", response["content"], re.S)
    if not match:
        return {}
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return {}
    return {texts[int(k)]: v for k, v in data.items() if k.isdigit() and int(k) < len(texts) and isinstance(v, str)}


async def translate_missing(items: List[Dict[str, Any]]):
    """Translate every uncached description, a batch at a time. Safe to call repeatedly."""
    if _lock.locked():
        return
    async with _lock:
        todo = pending(items)
        for i in range(0, len(todo), BATCH):
            results = await _translate_batch(todo[i:i + BATCH])
            if results:
                cache = _load()
                cache.update({_key(src): pt for src, pt in results.items()})
                _save(cache)


def is_running() -> bool:
    return _lock.locked()
