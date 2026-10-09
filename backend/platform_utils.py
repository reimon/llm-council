"""Small helpers that differ between macOS, Linux and Windows."""

import os
import shutil
import signal
import subprocess
import sys
from typing import Optional

IS_WINDOWS = sys.platform == "win32"
IS_MAC = sys.platform == "darwin"

# CLI processes still running, so Stop and shutdown can kill them
LIVE_PROCS: set = set()


def spawn_kwargs() -> dict:
    """Start a CLI in its own process group, so killing it also kills the helpers it spawns."""
    if IS_WINDOWS:
        return {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
    return {"start_new_session": True}


def kill_tree(proc) -> None:
    """Kill a CLI started with spawn_kwargs() together with its children."""
    if proc.returncode is not None:
        return
    try:
        if IS_WINDOWS:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
        else:
            os.killpg(proc.pid, signal.SIGKILL)
    except OSError:
        pass
    try:
        proc.kill()
    except (OSError, ProcessLookupError):
        pass


def kill_all() -> None:
    for proc in list(LIVE_PROCS):
        kill_tree(proc)
    LIVE_PROCS.clear()


# Windows caps a command line at 32,767 characters; stay well under it.
MAX_ARG_CHARS = 24000


def _extra_bin_dirs():
    """
    Where npm, uv and installers put CLIs. A backend started before a tool was installed
    has an old PATH, so these are searched too.
    """
    home = os.path.expanduser("~")
    dirs = [os.path.join(home, ".local", "bin")]
    if IS_WINDOWS:
        appdata = os.environ.get("APPDATA", os.path.join(home, "AppData", "Roaming"))
        local = os.environ.get("LOCALAPPDATA", os.path.join(home, "AppData", "Local"))
        dirs += [
            os.path.join(appdata, "npm"),
            # Antigravity CLI (agy) official Windows installer locations
            os.path.join(local, "Antigravity"),
            os.path.join(local, "Antigravity", "bin"),
            os.path.join(local, "agy", "bin"),
            os.path.join(local, "Programs", "Antigravity", "bin"),
        ]
    else:
        dirs += ["/opt/homebrew/bin", "/usr/local/bin", os.path.join(home, ".npm-global", "bin")]
    return [d for d in dirs if os.path.isdir(d)]


def find_bin(name: str) -> Optional[str]:
    """Full path of a CLI, or None if it is not installed."""
    found = shutil.which(name)
    if found:
        return found
    extra = os.pathsep.join(_extra_bin_dirs())
    return shutil.which(name, path=extra) if extra else None


def resolve_bin(name: str) -> str:
    """
    Full path of a CLI. On Windows, npm-installed tools are `.cmd` shims that
    CreateProcess only finds through their full path, so a bare name is not enough.
    """
    return find_bin(name) or name


def pick_folder(prompt: str) -> Optional[str]:
    """Open the OS folder picker. Returns the chosen path, or None if cancelled/unavailable."""
    if IS_MAC:
        cmd = ["osascript", "-e", f'POSIX path of (choose folder with prompt "{prompt}")']
    elif IS_WINDOWS:
        script = (
            "Add-Type -AssemblyName System.Windows.Forms;"
            "$d = New-Object System.Windows.Forms.FolderBrowserDialog;"
            f"$d.Description = '{prompt}';"
            "if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }"
        )
        cmd = ["powershell", "-NoProfile", "-STA", "-Command", script]
    elif shutil.which("zenity"):
        cmd = ["zenity", "--file-selection", "--directory", f"--title={prompt}"]
    elif shutil.which("kdialog"):
        cmd = ["kdialog", "--getexistingdirectory", os.path.expanduser("~"), "--title", prompt]
    else:
        return None
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True)
    except OSError:
        return None
    path = proc.stdout.strip()
    if proc.returncode != 0 or not path:
        return None
    return path.rstrip("/\\") or path
