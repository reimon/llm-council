"""Detect the AI apps installed on this computer, test them and build a council from the ones that work.

Run it from the project folder:
    uv run python -m backend.autoconfig
or use "Configurar automaticamente" in the council chamber (POST /api/council/autoconfigure).
"""

import asyncio
import os
import re
import time
import uuid
from typing import Any, Dict, List, Optional

from . import council_config
from .providers import query_member, LAST_ERRORS
from .platform_utils import find_bin

AUTO_COUNCIL_NAME = "Conselho automático"
TEST_PROMPT = [{"role": "user", "content": "Reply with exactly: ok"}]
ROLES = ["generalist", "contrarian", "first_principles", "executor", "expansionist", "outsider"]

# Preferred models per provider, best first; the first one the provider offers is used.
SEAT_PREFERENCES = {
    "claude": ["sonnet", "opus", "haiku"],
    "antigravity": ["gemini-3.8-flash-medium", "gemini-3.1-pro-low", "gemini-3.8-flash-low"],
    "gemini": ["default"],
}
CHAIR_PREFERENCES = [("claude", "opus"), ("codex", None), ("antigravity", None), ("gemini", "default")]


def _codex_default_model() -> Optional[str]:
    """The model set in ~/.codex/config.toml, which the user picked for Codex."""
    path = os.path.expanduser("~/.codex/config.toml")
    try:
        with open(path, encoding="utf-8") as f:
            m = re.search(r'^model\s*=\s*"([^"]+)"', f.read(), re.M)
            return m.group(1) if m else None
    except OSError:
        return None


def _pick(preferences: List[str], available: List[str]) -> Optional[str]:
    for p in preferences:
        if p in available or p == "default":
            return p
    return available[0] if available else None


def _candidates(providers: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """One seat per installed provider; Codex gets up to three models so a Codex-only setup still debates."""
    seats = []
    for p in providers:
        if not p["installed"] or p.get("needs_login"):
            continue
        if p["id"] == "codex":
            default = _codex_default_model()
            models = ([default] if default else []) + [m for m in p["models"] if m != default and "review" not in m]
            for model in (models or ["default"])[:3]:
                seats.append({"provider": "codex", "model": model})
        else:
            model = _pick(SEAT_PREFERENCES.get(p["id"], []), p["models"])
            if model:
                seats.append({"provider": p["id"], "model": model})
    return seats


async def _test(seat: Dict[str, str]) -> Dict[str, Any]:
    start = time.time()
    label = f"{seat['provider']}:{seat['model']}"
    LAST_ERRORS.pop(label, None)
    try:
        response = await query_member(seat, TEST_PROMPT, timeout=180.0)
    except Exception as e:  # never let one provider break the whole report
        LAST_ERRORS[label] = f"{e.__class__.__name__}: {e}"
        response = None
    ok = bool(response and response.get("content"))
    return {**seat, "ok": ok, "seconds": round(time.time() - start, 1),
            "error": None if ok else (LAST_ERRORS.get(label) or "sem resposta")[-400:]}


async def autoconfigure(log=print) -> Dict[str, Any]:
    """Build and save the automatic council. Returns a report of what was found and tested."""
    providers = await asyncio.to_thread(council_config.list_providers)
    for p in providers:
        p["path"] = find_bin(council_config.PROVIDERS[p["id"]]["bin"])
        state = "não instalado" if not p["installed"] else ("precisa de chave/login" if p.get("needs_login") else f"instalado em {p['path']}")
        log(f"- {p['label']}: {state} ({len(p['models'])} modelos)")

    seats = _candidates(providers)
    if not seats:
        return {"ok": False, "message": "Nenhum programa de IA instalado e logado foi encontrado.", "providers": providers, "tested": []}

    log(f"Testando {len(seats)} modelo(s), isso leva até alguns minutos...")
    tested = await asyncio.gather(*[_test(s) for s in seats])
    for t in tested:
        log(f"  {'OK ' if t['ok'] else 'FALHOU'} {t['provider']}:{t['model']} ({t['seconds']}s)"
            + ("" if t["ok"] else f"\n      motivo: {t['error']}"))

    working = [t for t in tested if t["ok"]]
    if not working:
        return {"ok": False, "message": "Os programas instalados não responderam. Confira o login de cada um.", "providers": providers, "tested": tested}

    members = [
        {
            "name": t["model"] if t["model"] != "default" else f"{t['provider']}-padrão",
            "provider": t["provider"],
            "model": t["model"],
            "role": ROLES[i % len(ROLES)],
            "enabled": True,
            "skills": [],
        }
        for i, t in enumerate(working)
    ]

    chair = None
    for provider, model in CHAIR_PREFERENCES:
        for t in working:
            if t["provider"] == provider:
                chair = {"provider": provider, "model": model or t["model"]}
                break
        if chair:
            break
    chair["name"] = chair["model"] if chair["model"] != "default" else f"{chair['provider']}-padrão"
    # The preferred chair model (e.g. Claude Opus) was not tested; fall back to a tested one if it fails
    if (chair["provider"], chair["model"]) not in {(t["provider"], t["model"]) for t in working}:
        if not (await _test(chair))["ok"]:
            first = working[0]
            chair = {"provider": first["provider"], "model": first["model"], "name": members[0]["name"]}

    store = council_config.list_councils()
    existing = next((c for c in store["councils"] if c["name"] == AUTO_COUNCIL_NAME), None)
    council = council_config.save_council({
        "id": existing["id"] if existing else str(uuid.uuid4()),
        "name": AUTO_COUNCIL_NAME,
        "description": "Montado automaticamente com os programas de IA que responderam no teste",
        "members": members,
        "chairman": {**chair, "skills": []},
    })
    council_config.set_default(council["id"])

    log(f"Conselho '{AUTO_COUNCIL_NAME}' salvo como padrão: {len(members)} conselheiro(s), presidente {chair['name']}.")
    return {"ok": True, "council": council, "providers": providers, "tested": tested,
            "message": f"{len(members)} conselheiro(s) configurado(s), presidente {chair['name']}."}


if __name__ == "__main__":
    print("LLM Council: configuração automática dos programas de IA")
    result = asyncio.run(autoconfigure())
    print(result["message"])
