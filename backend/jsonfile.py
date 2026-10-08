"""Crash-safe JSON writes: a half-written file never replaces the old one."""

import json
import os
import tempfile
import threading
from typing import Any

# Serializes writers that run in worker threads (asyncio.to_thread)
_lock = threading.Lock()


def write_json(path: str, data: Any, **dump_kwargs):
    """Write to a temp file in the same folder, then atomically swap it in."""
    folder = os.path.dirname(path) or "."
    os.makedirs(folder, exist_ok=True)
    dump_kwargs.setdefault("indent", 2)
    with _lock:
        fd, tmp = tempfile.mkstemp(dir=folder, prefix=".", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, **dump_kwargs)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, path)
        except BaseException:
            try:
                os.remove(tmp)
            except OSError:
                pass
            raise
