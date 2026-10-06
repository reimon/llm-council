"""Codex CLI client: queries models through the locally installed `codex` (uses your ChatGPT login, no API key)."""

import asyncio
import os
import tempfile
from typing import List, Dict, Any, Optional
from .config import CODEX_BIN


def _messages_to_prompt(messages: List[Dict[str, str]]) -> str:
    if len(messages) == 1:
        return messages[0]['content']
    return "\n\n".join(f"[{m['role']}]\n{m['content']}" for m in messages)


async def query_model(
    model: str,
    messages: List[Dict[str, str]],
    timeout: float = 300.0
) -> Optional[Dict[str, Any]]:
    """Query a single model via `codex exec`. Returns {'content': ...} or None on failure."""
    prompt = _messages_to_prompt(messages)
    fd, out_path = tempfile.mkstemp(suffix=".txt")
    os.close(fd)

    args = [
        CODEX_BIN, "exec",
        "--skip-git-repo-check",
        "--ephemeral",
        "--sandbox", "read-only",
        "--color", "never",
        "-C", tempfile.gettempdir(),
        "-o", out_path,
    ]
    if model and model != "default":
        args += ["-m", model]
    args.append("-")  # read prompt from stdin

    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            _, stderr = await asyncio.wait_for(proc.communicate(prompt.encode()), timeout)
        except asyncio.TimeoutError:
            proc.kill()
            raise RuntimeError(f"timed out after {timeout}s")

        if proc.returncode != 0:
            raise RuntimeError(stderr.decode(errors="ignore")[-500:])

        with open(out_path, encoding="utf-8") as f:
            content = f.read().strip()
        return {'content': content, 'reasoning_details': None}

    except Exception as e:
        print(f"Error querying codex model {model}: {e}")
        return None
    finally:
        try:
            os.remove(out_path)
        except OSError:
            pass


async def query_models_parallel(
    models: List[str],
    messages: List[Dict[str, str]]
) -> Dict[str, Optional[Dict[str, Any]]]:
    responses = await asyncio.gather(*[query_model(m, messages) for m in models])
    return {model: response for model, response in zip(models, responses)}
