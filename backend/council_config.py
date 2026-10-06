"""Council setup: who sits on the council, which role each seat plays, and who chairs it."""

import contextvars
import json
import os
import shutil
import subprocess
import time
import uuid
from typing import Any, Dict, List, Optional

from .platform_utils import resolve_bin
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
    "gemini": {"bin": "gemini", "label": "Gemini CLI"},
}

# "default" lets the Gemini CLI pick its own model; any model name can also be typed in
GEMINI_CLI_MODELS = ["default"]


def gemini_cli_logged_in() -> bool:
    """
    The Gemini CLI now needs a Gemini API key (free at aistudio.google.com/apikey).
    Google sign-in for individuals was discontinued, so an oauth_creds.json file alone
    does not mean it works. The CLI reads the key from the environment or ~/.gemini/.env.
    """
    if os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
        return True
    env_file = os.path.expanduser("~/.gemini/.env")
    if os.path.exists(env_file):
        with open(env_file, encoding="utf-8") as f:
            return any(line.strip().startswith(("GEMINI_API_KEY=", "GOOGLE_API_KEY=")) for line in f)
    return False

CLAUDE_MODELS = ["fable", "opus", "sonnet", "haiku"]

_models_cache: Dict[str, Any] = {}


def _codex_models() -> List[str]:
    path = os.path.expanduser("~/.codex/models_cache.json")
    try:
        with open(path, encoding="utf-8") as f:
            return [m["slug"] for m in json.load(f).get("models", []) if m.get("slug")]
    except Exception:
        return []


def _antigravity_models() -> List[str]:
    try:
        out = subprocess.run([resolve_bin("agy"), "models"], capture_output=True, text=True, timeout=60).stdout
    except Exception:
        return []
    return [line.split("\t")[0].strip() for line in out.splitlines() if "\t" in line]


def list_providers() -> List[Dict[str, Any]]:
    """Installed providers and their models (model lists cached for 10 minutes)."""
    fetchers = {
        "codex": _codex_models,
        "claude": lambda: CLAUDE_MODELS,
        "antigravity": _antigravity_models,
        "gemini": lambda: GEMINI_CLI_MODELS,
    }
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
        entry = {"id": pid, "label": info["label"], "installed": installed, "models": models}
        if pid == "gemini" and installed and not gemini_cli_logged_in():
            entry["needs_login"] = True
        result.append(entry)
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


COUNCILS_PATH = os.path.join(os.path.dirname(DATA_DIR), "councils.json")

# Council chosen for the question being answered (None = the default council).
selected_council: contextvars.ContextVar = contextvars.ContextVar("selected_council", default=None)


def _read_store() -> Dict[str, Any]:
    """All saved councils. The first run migrates the single council.json into 'Conselho principal'."""
    if os.path.exists(COUNCILS_PATH):
        with open(COUNCILS_PATH, encoding="utf-8") as f:
            return json.load(f)
    if os.path.exists(COUNCIL_PATH):
        with open(COUNCIL_PATH, encoding="utf-8") as f:
            base = json.load(f)
    else:
        base = _default_council()
    first = {"id": str(uuid.uuid4()), "name": "Conselho principal", "description": "", **base}
    store = {"default_id": first["id"], "councils": [first]}
    _write_store(store)
    return store


def _write_store(store: Dict[str, Any]):
    os.makedirs(os.path.dirname(COUNCILS_PATH), exist_ok=True)
    with open(COUNCILS_PATH, "w", encoding="utf-8") as f:
        json.dump(store, f, indent=2, ensure_ascii=False)


def list_councils() -> Dict[str, Any]:
    return _read_store()


def load_council(council_id: Optional[str] = None) -> Dict[str, Any]:
    """A council by id, else the one selected for this question, else the default."""
    store = _read_store()
    wanted = council_id or selected_council.get() or store["default_id"]
    by_id = {c["id"]: c for c in store["councils"]}
    return by_id.get(wanted) or by_id.get(store["default_id"]) or store["councils"][0]


def _validate(council: Dict[str, Any]) -> Dict[str, Any]:
    """Normalise seats. Display names must be unique (they label results)."""
    members = council.get("members", [])
    seen = set()
    for m in members:
        m.setdefault("id", str(uuid.uuid4()))
        m.setdefault("enabled", True)
        if m.get("role") not in ROLES:
            m["role"] = "generalist"
        m["skills"] = [s for s in m.get("skills", []) if isinstance(s, str)]
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
    chairman["skills"] = [s for s in chairman.get("skills", []) if isinstance(s, str)]
    name = (council.get("name") or "").strip()
    if not name:
        raise ValueError("Dê um nome ao conselho")
    return {
        "id": council.get("id") or str(uuid.uuid4()),
        "name": name[:60],
        "description": (council.get("description") or "").strip()[:200],
        "members": members,
        "chairman": chairman,
    }


def save_council(council: Dict[str, Any]) -> Dict[str, Any]:
    """Create or update one council (matched by id; no id updates the default)."""
    store = _read_store()
    if not council.get("id"):
        current = load_council(store["default_id"])
        council = {**current, **council, "id": current["id"]}
    data = _validate(council)
    if any(c["id"] == data["id"] for c in store["councils"]):
        store["councils"] = [data if c["id"] == data["id"] else c for c in store["councils"]]
    else:
        store["councils"].append(data)
    _write_store(store)
    return data


def create_council(name: str, from_id: Optional[str] = None) -> Dict[str, Any]:
    """New council: a copy of another one (fresh seat ids) or a starter seat plus chair."""
    if from_id:
        src = json.loads(json.dumps(load_council(from_id)))
        for m in src["members"]:
            m["id"] = str(uuid.uuid4())
        council = {**src, "id": None, "name": name}
    else:
        starter = _default_council()
        council = {
            "name": name,
            "description": "",
            "members": starter["members"][:1],
            "chairman": starter["chairman"],
        }
    council["id"] = str(uuid.uuid4())
    return save_council(council)


def delete_council(council_id: str) -> bool:
    store = _read_store()
    if len(store["councils"]) <= 1:
        raise ValueError("Mantenha pelo menos um conselho")
    remaining = [c for c in store["councils"] if c["id"] != council_id]
    if len(remaining) == len(store["councils"]):
        return False
    store["councils"] = remaining
    if store["default_id"] == council_id:
        store["default_id"] = remaining[0]["id"]
    _write_store(store)
    return True


def set_default(council_id: str) -> Dict[str, Any]:
    store = _read_store()
    if not any(c["id"] == council_id for c in store["councils"]):
        raise ValueError("Conselho não encontrado")
    store["default_id"] = council_id
    _write_store(store)
    return store


def strip_skill(skill_id: str):
    """Remove a skill from every seat of every council."""
    store = _read_store()
    for c in store["councils"]:
        for seat in c["members"] + [c["chairman"]]:
            seat["skills"] = [s for s in seat.get("skills", []) if s != skill_id]
    _write_store(store)


def active_members() -> List[Dict[str, Any]]:
    return [m for m in load_council()["members"] if m.get("enabled", True)]


def role_prompt(role: Optional[str]) -> str:
    return ROLES.get(role or "generalist", ROLES["generalist"])["prompt"]
