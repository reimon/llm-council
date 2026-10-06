"""Small helpers that differ between macOS, Linux and Windows."""

import os
import shutil
import subprocess
import sys
from typing import Optional

IS_WINDOWS = sys.platform == "win32"
IS_MAC = sys.platform == "darwin"

# Windows caps a command line at 32,767 characters; stay well under it.
MAX_ARG_CHARS = 24000


def resolve_bin(name: str) -> str:
    """
    Full path of a CLI. On Windows, npm-installed tools are `.cmd` shims that
    CreateProcess only finds through their full path, so a bare name is not enough.
    """
    return shutil.which(name) or name


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
