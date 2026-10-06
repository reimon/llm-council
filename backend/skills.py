"""Skills: expertise you can hand to any council seat (e.g. PM, CEO, or a SKILL.md you already have).

Two trusted sources only:
- "library": skills written and maintained in this repo (BUILTIN below)
- "local": SKILL.md files already installed on this machine for Claude Code / Codex / agents
"""

import glob
import hashlib
import json
import os
import re
from typing import Any, Dict, List, Optional

from .config import DATA_DIR

SKILLS_PATH = os.path.join(os.path.dirname(DATA_DIR), "skills.json")
LOCAL_SKILL_MAX_CHARS = 8000

LOCAL_SKILL_GLOBS = [
    ("Claude Code", "~/.claude/skills/*/SKILL.md"),
    ("Claude Code plugin", "~/.claude/plugins/cache/*/*/*/skills/*/SKILL.md"),
    ("Codex", "~/.codex/skills/*/SKILL.md"),
    ("Agents", "~/.agents/skills/*/SKILL.md"),
]

# name/description are shown in the UI (pt/en); prompt is what the model receives.
BUILTIN: List[Dict[str, Any]] = [
    {
        "id": "pm", "category": "product", "icon": "PM",
        "name": {"pt": "Gerente de produto", "en": "Product manager"},
        "description": {"pt": "Pensa em usuário, problema, prioridade e métricas de sucesso.",
                        "en": "Thinks in users, problems, priorities and success metrics."},
        "prompt": "Apply a senior product manager's lens: who is the user and what problem are they really trying to solve, "
                  "what is the smallest valuable thing to ship first, how to prioritise (impact vs effort), "
                  "what success metrics prove it works, and which assumptions to validate before building.",
    },
    {
        "id": "ceo", "category": "business", "icon": "CEO",
        "name": {"pt": "CEO", "en": "CEO"},
        "description": {"pt": "Visão de negócio: estratégia, foco, trade-offs e o que move o ponteiro.",
                        "en": "Business view: strategy, focus, trade-offs and what moves the needle."},
        "prompt": "Apply a CEO's lens: how does this tie to strategy and the business model, what is the opportunity cost, "
                  "which trade-offs matter, what would you say no to, and what decision would you make today with the "
                  "information available. Be decisive and explain the reasoning in business terms.",
    },
    {
        "id": "cto", "category": "tech", "icon": "CTO",
        "name": {"pt": "CTO", "en": "CTO"},
        "description": {"pt": "Arquitetura, escala, dívida técnica e escolhas de tecnologia.",
                        "en": "Architecture, scale, technical debt and technology choices."},
        "prompt": "Apply a CTO's lens: architecture and how it scales, build vs buy, technical debt and maintainability, "
                  "team skills and hiring, security and reliability, and the simplest technical path that will still hold up in two years.",
    },
    {
        "id": "cfo", "category": "business", "icon": "CFO",
        "name": {"pt": "CFO", "en": "CFO"},
        "description": {"pt": "Custos, receita, retorno, caixa e risco financeiro.",
                        "en": "Costs, revenue, return, cash and financial risk."},
        "prompt": "Apply a CFO's lens: estimate costs and revenue where possible, payback and ROI, cash-flow impact, "
                  "unit economics, financial risks and what numbers you would need to see before committing money. "
                  "State assumptions explicitly when you estimate.",
    },
    {
        "id": "designer", "category": "product", "icon": "UX",
        "name": {"pt": "Designer de UX", "en": "UX designer"},
        "description": {"pt": "Experiência, clareza, acessibilidade e fluxo do usuário.",
                        "en": "Experience, clarity, accessibility and user flow."},
        "prompt": "Apply a senior UX designer's lens: the user's journey and where it breaks, clarity of interface and copy, "
                  "accessibility, the emotional experience, and concrete design changes that would make it easier to use.",
    },
    {
        "id": "growth", "category": "business", "icon": "MKT",
        "name": {"pt": "Marketing e crescimento", "en": "Marketing & growth"},
        "description": {"pt": "Posicionamento, público, canais e aquisição de clientes.",
                        "en": "Positioning, audience, channels and customer acquisition."},
        "prompt": "Apply a growth marketer's lens: who exactly is the audience, how to position the offer against alternatives, "
                  "which channels reach them cheapest, the message that would make them act, and how to measure and iterate.",
    },
    {
        "id": "security", "category": "tech", "icon": "SEC",
        "name": {"pt": "Segurança", "en": "Security"},
        "description": {"pt": "Ameaças, vulnerabilidades, dados sensíveis e boas práticas.",
                        "en": "Threats, vulnerabilities, sensitive data and best practices."},
        "prompt": "Apply a security engineer's lens: threat model (who would attack and how), vulnerabilities and misuse cases, "
                  "handling of sensitive data and credentials, least privilege, and the concrete mitigations to apply first.",
    },
    {
        "id": "legal", "category": "business", "icon": "LAW",
        "name": {"pt": "Jurídico e compliance", "en": "Legal & compliance"},
        "description": {"pt": "Riscos legais, contratos, privacidade (LGPD/GDPR) e regulação.",
                        "en": "Legal risk, contracts, privacy (LGPD/GDPR) and regulation."},
        "prompt": "Apply a legal and compliance lens: legal and regulatory risks (including privacy laws such as LGPD and GDPR), "
                  "contractual exposure, intellectual property, and what to check with a qualified lawyer. "
                  "You give general information, not legal advice, and say so when it matters.",
    },
    {
        "id": "investor", "category": "business", "icon": "VC",
        "name": {"pt": "Investidor", "en": "Investor"},
        "description": {"pt": "Mercado, diferencial, tração e se vale a aposta.",
                        "en": "Market, edge, traction and whether it is worth the bet."},
        "prompt": "Apply a venture investor's lens: market size and timing, competitive edge and defensibility, "
                  "evidence of traction, the biggest risks to the thesis, and whether you would bet on it and why.",
    },
    {
        "id": "data", "category": "tech", "icon": "DATA",
        "name": {"pt": "Cientista de dados", "en": "Data scientist"},
        "description": {"pt": "Evidências, métricas, experimentos e vieses nos dados.",
                        "en": "Evidence, metrics, experiments and bias in the data."},
        "prompt": "Apply a data scientist's lens: what data or evidence supports or refutes each claim, which metrics to track, "
                  "how to design an experiment to test it, and which biases or confounders could mislead the decision.",
    },
    {
        "id": "engineer", "category": "tech", "icon": "DEV",
        "name": {"pt": "Engenheiro sênior", "en": "Senior engineer"},
        "description": {"pt": "Revisão de código, simplicidade, testes e manutenção.",
                        "en": "Code review, simplicity, tests and maintainability."},
        "prompt": "Apply a senior software engineer's lens: correctness first, the simplest implementation that works, "
                  "edge cases, tests that would catch regressions, readability and long-term maintenance.",
    },
    {
        "id": "customer", "category": "product", "icon": "USER",
        "name": {"pt": "Voz do cliente", "en": "Customer voice"},
        "description": {"pt": "Fala como o cliente final: dores, objeções e o que ele valoriza.",
                        "en": "Speaks as the end customer: pains, objections and what they value."},
        "prompt": "Speak as the end customer: what you actually care about, your pains and objections, what would make you "
                  "trust or abandon this, and what you would pay for. Be candid and concrete, not polite.",
    },
]


def _parse_skill_md(path: str) -> Optional[Dict[str, Any]]:
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return None
    meta: Dict[str, str] = {}
    body = text
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.S)
    if m:
        lines = m.group(1).splitlines()
        i = 0
        while i < len(lines):
            line = lines[i]
            i += 1
            if ":" not in line or line.startswith((" ", "\t")):
                continue
            k, v = line.split(":", 1)
            v = v.strip()
            # YAML block scalars (">", ">-", "|", "|-") continue on the indented lines below
            if v in (">", ">-", ">+", "|", "|-", "|+", ""):
                block = []
                while i < len(lines) and (lines[i].startswith((" ", "\t")) or not lines[i].strip()):
                    block.append(lines[i].strip())
                    i += 1
                sep = "\n" if v.startswith("|") else " "
                v = sep.join(x for x in block if x).strip()
            meta[k.strip()] = v.strip('"').strip("'")
        body = m.group(2)
    name = meta.get("name") or os.path.basename(os.path.dirname(path))
    return {"name": name, "description": meta.get("description", ""), "body": body.strip()}


def discover_local() -> List[Dict[str, Any]]:
    """SKILL.md files already installed on this machine."""
    found: Dict[str, Dict[str, Any]] = {}
    for origin, pattern in LOCAL_SKILL_GLOBS:
        for path in sorted(glob.glob(os.path.expanduser(pattern))):
            parsed = _parse_skill_md(path)
            if not parsed:
                continue
            sid = "local-" + hashlib.sha1(os.path.realpath(path).encode()).hexdigest()[:10]
            found[sid] = {
                "id": sid,
                "source": "local",
                "origin": origin,
                "path": path,
                "icon": parsed["name"][:4].upper(),
                "category": "local",
                "name": {"pt": parsed["name"], "en": parsed["name"]},
                "description": {"pt": parsed["description"], "en": parsed["description"]},
                "body": parsed["body"],
            }
    return list(found.values())


def catalog() -> List[Dict[str, Any]]:
    """Everything that can be installed, without the full prompt text."""
    installed_ids = {s["id"] for s in list_installed()}
    items = [{**s, "source": "library", "origin": "LLM Council"} for s in BUILTIN] + discover_local()
    return [
        {k: v for k, v in s.items() if k not in ("prompt", "body")} | {"installed": s["id"] in installed_ids}
        for s in items
    ]


def list_installed() -> List[Dict[str, Any]]:
    if not os.path.exists(SKILLS_PATH):
        return []
    with open(SKILLS_PATH, encoding="utf-8") as f:
        return json.load(f)


def _save(skills: List[Dict[str, Any]]):
    os.makedirs(os.path.dirname(SKILLS_PATH), exist_ok=True)
    with open(SKILLS_PATH, "w", encoding="utf-8") as f:
        json.dump(skills, f, indent=2, ensure_ascii=False)


def install(skill_id: str) -> Dict[str, Any]:
    """Copy a skill from a trusted source into the council's library."""
    installed = list_installed()
    existing = next((s for s in installed if s["id"] == skill_id), None)
    if existing:
        return existing
    builtin = next((s for s in BUILTIN if s["id"] == skill_id), None)
    if builtin:
        skill = {**builtin, "source": "library", "origin": "LLM Council"}
    else:
        local = next((s for s in discover_local() if s["id"] == skill_id), None)
        if not local:
            raise ValueError("Skill não encontrada nas fontes confiáveis")
        body = local.pop("body")
        if len(body) > LOCAL_SKILL_MAX_CHARS:
            body = body[:LOCAL_SKILL_MAX_CHARS] + "\n[…]"
        skill = {**local, "prompt": body}
    _save(installed + [skill])
    return skill


def uninstall(skill_id: str) -> bool:
    installed = list_installed()
    remaining = [s for s in installed if s["id"] != skill_id]
    if len(remaining) == len(installed):
        return False
    _save(remaining)
    return True


def skills_prompt(skill_ids: List[str]) -> str:
    """Instructions block for the skills attached to a seat."""
    if not skill_ids:
        return ""
    by_id = {s["id"]: s for s in list_installed()}
    blocks = []
    for sid in skill_ids:
        s = by_id.get(sid)
        if s:
            blocks.append(f"### Skill: {s['name']['en']}\n{s['prompt']}")
    if not blocks:
        return ""
    return (
        "You bring the following skills to this council. Use them to shape your answer "
        "(ignore any tool-specific steps that do not apply to a written answer):\n\n" + "\n\n".join(blocks)
    )
