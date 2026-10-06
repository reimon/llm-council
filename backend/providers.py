"""Route a query to the right local CLI (Codex, Claude Code, Antigravity) or OpenRouter."""

import asyncio
import contextvars
import os
import tempfile
from typing import Any, Dict, List, Optional

from . import codex_client
from .platform_utils import resolve_bin, MAX_ARG_CHARS
from .codex_client import project_dir, attached_images, PROJECT_PREAMBLE, _messages_to_prompt

# Folders attached to the current question; CLIs that sandbox file reads need them allowed.
extra_dirs: contextvars.ContextVar = contextvars.ContextVar("extra_dirs", default=())

CLAUDE_BLOCKED_TOOLS = "Edit Write MultiEdit NotebookEdit Bash"

# Headless agy auto-denies terminal commands and then prints nothing at all, and its
# sandbox does not stop writes, so steer Gemini to its read-only file tools instead.
ANTIGRAVITY_PREAMBLE = (
    "Do not run any shell or terminal commands. To look at files, use only your "
    "file viewing, reading and search tools.\n\n"
)


def _cli_prompt(messages: List[Dict[str, str]]) -> str:
    """Codex receives images natively; the other CLIs get the file paths to open themselves."""
    prompt = _messages_to_prompt(messages)
    workdir = project_dir.get()
    if workdir:
        prompt = PROJECT_PREAMBLE.format(path=workdir) + prompt
    images = attached_images.get()
    if images:
        listing = "\n".join(f"- {p}" for p in images)
        prompt += f"\n\nImage files attached to this question (open and look at them):\n{listing}"
    return prompt


def _readable_dirs() -> List[str]:
    dirs = {os.path.dirname(p) for p in attached_images.get()}
    dirs.update(extra_dirs.get())
    if project_dir.get():
        dirs.add(project_dir.get())
    return sorted(dirs)


async def _run_cli(args: List[str], stdin: Optional[str], timeout: float, label: str) -> Optional[Dict[str, Any]]:
    workdir = project_dir.get() or tempfile.gettempdir()
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            cwd=workdir,
            stdin=asyncio.subprocess.PIPE if stdin is not None else asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            out, err = await asyncio.wait_for(
                proc.communicate(stdin.encode() if stdin is not None else None), timeout
            )
        except asyncio.TimeoutError:
            proc.kill()
            raise RuntimeError(f"timed out after {timeout}s")
        if proc.returncode != 0:
            raise RuntimeError(err.decode(errors="ignore")[-500:] or f"exit code {proc.returncode}")
        content = out.decode(errors="ignore").strip()
        if not content:
            # An empty answer is a failure (e.g. a denied tool), not a blank response
            raise RuntimeError("empty output: " + (err.decode(errors="ignore").strip()[-300:] or "no details"))
        return {"content": content, "reasoning_details": None}
    except Exception as e:
        print(f"Error querying {label}: {e}")
        return None


async def query_member(member: Dict[str, Any], messages: List[Dict[str, str]], timeout: float = 300.0) -> Optional[Dict[str, Any]]:
    """Query one council seat ({provider, model}) with the given messages."""
    provider, model = member.get("provider", "codex"), member.get("model", "")
    if project_dir.get():
        timeout = max(timeout, 900.0)

    if provider == "codex":
        return await codex_client.query_model(model, messages, timeout)

    if provider == "openrouter":
        from .openrouter import query_model as openrouter_query
        return await openrouter_query(model, messages, timeout)

    if provider == "claude":
        args = [resolve_bin("claude"), "-p", "--output-format", "text", "--disallowedTools", CLAUDE_BLOCKED_TOOLS]
        if model:
            args += ["--model", model]
        for d in _readable_dirs():
            args += ["--add-dir", d]
        return await _run_cli(args, _cli_prompt(messages), timeout, f"claude:{model}")

    if provider == "antigravity":
        # agy only takes the prompt as an argument; long prompts (Stage 2/3) go through a file
        # so they never hit command-line length limits (32k chars on Windows).
        prompt = ANTIGRAVITY_PREAMBLE + _cli_prompt(messages)
        prompt_file = None
        dirs = _readable_dirs()
        if len(prompt) > MAX_ARG_CHARS:
            fd, prompt_file = tempfile.mkstemp(suffix=".md", prefix="llm-council-prompt-")
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(prompt)
            dirs.append(os.path.dirname(prompt_file))
            prompt = ANTIGRAVITY_PREAMBLE + (
                f"Read the file {prompt_file} in full. It contains your complete task. "
                "Follow its instructions exactly and reply with only the answer it asks for."
            )
        args = [resolve_bin("agy"), f"-p={prompt}", "--mode", "plan", "--print-timeout", f"{int(timeout)}s"]
        if model:
            args += ["--model", model]
        for d in dirs:
            args += ["--add-dir", d]
        try:
            return await _run_cli(args, None, timeout + 30, f"antigravity:{model}")
        finally:
            if prompt_file:
                os.remove(prompt_file)

    if provider == "gemini":
        from .council_config import gemini_cli_logged_in
        if not gemini_cli_logged_in():
            # Without a login the CLI opens a browser auth page and waits; fail fast instead
            print("Error querying gemini: no API key (put GEMINI_API_KEY in ~/.gemini/.env)")
            return None
        # Gemini CLI: prompt on stdin, "plan" approval mode is its read-only mode (enforced by the CLI)
        args = [resolve_bin("gemini"), "-p", "Answer the request above.", "--approval-mode", "plan",
                "--skip-trust", "--output-format", "text"]
        if model and model != "default":
            args += ["-m", model]
        for d in _readable_dirs():
            args += ["--include-directories", d]
        return await _run_cli(args, _cli_prompt(messages), timeout, f"gemini:{model}")

    print(f"Unknown provider: {provider}")
    return None
