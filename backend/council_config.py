"""Council setup: who sits on the council, which role each seat plays, and who chairs it."""

import json
import os
import shutil
import subprocess
import time
import uuid
from typing import Any, Dict, List, Optional

from .config import DATA_DIR, COUNCIL_MODELS, CHAIRMAN_MODEL, LLM_PROVIDER

COUNCIL_PATH = os.path.join(os.path.dirname(DATA_DIR), "council.json")

# Roles shape how a councillor answers in Stage 1. Ranking (Stage 2) stays neutral.
ROLES: Dict[str, Dict[str, str]] = {
    "generalist": {
        "prompt": "",
    },
    "contrarian": {
        "prompt": (
            "Your seat on the council is the CONTRARIAN. Challenge the assumptions behind the question, "
            "look for risks, weaknesses, failure scenarios and unintended consequences. "
            "Still give a clear answer, but make the strongest case against the obvious one."
        ),
    },
    "first_principles": {
        "prompt": (
            "Your seat on the council is FIRST PRINCIPLES. Break the problem down to its fundamentals, "
            "identify the core truths, question conventional wisdom and build your answer up from there."
        ),
    },
    "expansionist": {
        "prompt": (
            "Your seat on the council is the EXPANSIONIST. Think big: explore opportunities, adjacent "
            "possibilities and ambitious ideas the user may not have considered, then ground them in a concrete answer."
        ),
    },
    "outsider": {
        "prompt": (
            "Your seat on the council is the OUTSIDER. Bring perspectives from other fields and industries, "
            "analogous cases and benchmarks, and say what an expert from outside this domain would notice."
        ),
    },
    "executor": {
        "prompt": (
            "Your seat on the council is the EXECUTOR. Focus on how to actually do it: concrete steps, "
            "milestones, resources, metrics and risk mitigation."
        ),
    },
}

PROVIDERS = {
    "codex": {"bin": "codex", "label": "Codex CLI"},
    "claude": {"bin": "claude", "label": "Claude Code"},
    "antigravity": {"bin": "agy", "label": "Antigravity"},
}

CLAUDE_MODELS = ["fable", "opus", "sonnet", "haiku"]

_models_cache: Dict[str, Any] = {}


def _codex_models() -> List[str]:
    path = os.path.expanduser("~/.codex/models_cache.json")
    try:
        with open(path) as f:
            return [m["slug"] for m in json.load(f).get("models", []) if m.get("slug")]
    except Exception:
        return []


def _antigravity_models() -> List[str]:
    try:
        out = subprocess.run(["agy", "models"], capture_output=True, text=True, timeout=60).stdout
    except Exception:
        return []
    return [line.split("\t")[0].strip() for line in out.splitlines() if "\t" in line]


def list_providers() -> List[Dict[str, Any]]:
    """Installed providers and their models (model lists cached for 10 minutes)."""
    fetchers = {"codex": _codex_models, "claude": lambda: CLAUDE_MODELS, "antigravity": _antigravity_models}
    result = []
    for pid, info in PROVIDERS.items():
        installed = shutil.which(info["bin"]) is not None
        models: List[str] = []
        if installed:
            cached = _models_cache.get(pid)
            if cached and time.time() - cached[0] < 600:
                models = cached[1]
            else:
                models = fetchers[pid]()
                _models_cache[pid] = (time.time(), models)
        result.append({"id": pid, "label": info["label"], "installed": installed, "models": models})
    return result


def _default_council() -> Dict[str, Any]:
    provider = "codex" if LLM_PROVIDER == "codex" else "openrouter"
    roles = ["generalist", "contrarian", "first_principles", "executor"]
    members = [
        {
            "id": str(uuid.uuid4()),
            "name": model.split("/")[-1],
            "provider": provider,
            "model": model,
            "role": roles[i % len(roles)],
            "enabled": True,
        }
        for i, model in enumerate(COUNCIL_MODELS)
    ]
    chairman = {"name": CHAIRMAN_MODEL.split("/")[-1], "provider": provider, "model": CHAIRMAN_MODEL}
    return {"members": members, "chairman": chairman}


def load_council() -> Dict[str, Any]:
    if not os.path.exists(COUNCIL_PATH):
        return _default_council()
    with open(COUNCIL_PATH) as f:
        return json.load(f)


def save_council(council: Dict[str, Any]) -> Dict[str, Any]:
    """Validate and persist. Display names must be unique (they label results)."""
    members = council.get("members", [])
    seen = set()
    for m in members:
        m.setdefault("id", str(uuid.uuid4()))
        m.setdefault("enabled", True)
        if m.get("role") not in ROLES:
            m["role"] = "generalist"
        base = (m.get("name") or m.get("model") or "model").strip()
        name, n = base, 2
        while name in seen:
            name, n = f"{base} ({n})", n + 1
        m["name"] = name
        seen.add(name)
    if not any(m["enabled"] for m in members):
        raise ValueError("O conselho precisa de pelo menos um conselheiro ativo")
    chairman = council.get("chairman") or {}
    if not chairman.get("model"):
        raise ValueError("Escolha um presidente")
    chairman["name"] = (chairman.get("name") or chairman["model"]).strip()
    data = {"members": members, "chairman": chairman}
    os.makedirs(os.path.dirname(COUNCIL_PATH), exist_ok=True)
    with open(COUNCIL_PATH, "w") as f:
        json.dump(data, f, indent=2)
    return data


def active_members() -> List[Dict[str, Any]]:
    return [m for m in load_council()["members"] if m.get("enabled", True)]


def role_prompt(role: Optional[str]) -> str:
    return ROLES.get(role or "generalist", ROLES["generalist"])["prompt"]
