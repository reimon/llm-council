"""Attachments: uploaded images/videos, local folders and web links added to a question."""

import asyncio
import html
import json
import os
import re
import shutil
import subprocess
import uuid
from typing import Any, Dict, List, Tuple

import httpx

from .config import DATA_DIR
from .platform_utils import resolve_bin

UPLOADS_DIR = os.path.join(os.path.dirname(DATA_DIR), "uploads")
VIDEO_FRAMES = 6
LINK_MAX_CHARS = 20000

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".heic"}
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"}


def _safe_name(name: str) -> str:
    base = os.path.basename(name) or "file"
    return re.sub(r"[^\w.\- ]", "_", base)[:120]


def upload_dir(upload_id: str) -> str:
    if not re.fullmatch(r"[0-9a-f\-]{36}", upload_id):
        raise ValueError("invalid upload id")
    return os.path.join(UPLOADS_DIR, upload_id)


def _extract_video_frames(video_path: str, out_dir: str) -> List[str]:
    """Grab VIDEO_FRAMES evenly spaced frames so image-only models can 'see' the video."""
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise ValueError("para anexar vídeos, instale o ffmpeg (https://ffmpeg.org/download.html)")
    probe = subprocess.run(
        [resolve_bin("ffprobe"), "-v", "error", "-show_entries", "format=duration", "-of", "json", video_path],
        capture_output=True, text=True,
    )
    duration = float(json.loads(probe.stdout or "{}").get("format", {}).get("duration", 0) or 0)
    if duration <= 0:
        raise ValueError("não foi possível ler a duração do vídeo")
    fps = VIDEO_FRAMES / duration
    pattern = os.path.join(out_dir, "frame_%02d.jpg")
    subprocess.run(
        [resolve_bin("ffmpeg"), "-v", "error", "-y", "-i", video_path,
         "-vf", f"fps={fps},scale='min(1280,iw)':-2", "-frames:v", str(VIDEO_FRAMES), pattern],
        check=True, capture_output=True,
    )
    return sorted(
        os.path.join(out_dir, f) for f in os.listdir(out_dir) if f.startswith("frame_")
    )


async def save_upload(filename: str, data: bytes) -> Dict[str, Any]:
    """Store an uploaded image or video. Videos also get frames extracted."""
    name = _safe_name(filename)
    ext = os.path.splitext(name)[1].lower()
    if ext in IMAGE_EXTS:
        kind = "image"
    elif ext in VIDEO_EXTS:
        kind = "video"
    else:
        raise ValueError(f"tipo de arquivo não suportado: {ext or name}")

    upload_id = str(uuid.uuid4())
    out_dir = upload_dir(upload_id)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, name)
    with open(path, "wb") as f:
        f.write(data)

    attachment = {"kind": kind, "id": upload_id, "name": name}
    if kind == "video":
        frames = await asyncio.to_thread(_extract_video_frames, path, out_dir)
        attachment["frames"] = [os.path.basename(p) for p in frames]
    return attachment


def _strip_html(raw: str) -> Tuple[str, str]:
    title_match = re.search(r"<title[^>]*>(.*?)</title>", raw, re.S | re.I)
    title = html.unescape(title_match.group(1)).strip() if title_match else ""
    raw = re.sub(r"<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", raw, flags=re.S | re.I)
    text = html.unescape(re.sub(r"<[^>]+>", " ", raw))
    return title, re.sub(r"\s+", " ", text).strip()


async def fetch_link(url: str) -> str:
    """Download a page and return its readable text (truncated)."""
    if not re.match(r"^https?://", url, re.I):
        return f"(link ignorado: só http/https são aceitos: {url})"
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (LLM Council)"})
            resp.raise_for_status()
        ctype = resp.headers.get("content-type", "")
        if "html" in ctype:
            title, text = _strip_html(resp.text)
        elif ctype.startswith("text/") or "json" in ctype:
            title, text = "", resp.text
        else:
            return f"(não foi possível ler o conteúdo de {url}: tipo {ctype})"
        if len(text) > LINK_MAX_CHARS:
            text = text[:LINK_MAX_CHARS] + " […]"
        header = f"Título: {title}\n" if title else ""
        return header + text
    except Exception as e:
        return f"(falha ao baixar {url}: {e})"


async def build_context(content: str, attachments: List[Dict[str, Any]]) -> Tuple[str, List[str]]:
    """
    Turn attachments into extra prompt text plus a list of image files.

    Returns:
        (question with attachment context appended, absolute image paths for the models)
    """
    if not attachments:
        return content, []

    images: List[str] = []
    sections: List[str] = []
    links = [a for a in attachments if a.get("kind") == "link"]
    link_texts = await asyncio.gather(*(fetch_link(a["url"]) for a in links))

    for a in attachments:
        kind = a.get("kind")
        if kind == "image":
            images.append(os.path.abspath(os.path.join(upload_dir(a["id"]), a["name"])))
            sections.append(f"Imagem anexada nº {len(images)}: \"{a['name']}\".")
        elif kind == "video":
            frames = [os.path.abspath(os.path.join(upload_dir(a["id"]), f)) for f in a.get("frames", [])]
            first = len(images) + 1
            images.extend(frames)
            sections.append(
                f"Vídeo anexado \"{a['name']}\": as imagens anexadas nº {first} a {len(images)} "
                "são quadros extraídos dele em intervalos iguais, em ordem."
            )
        elif kind == "folder":
            sections.append(
                f"Pasta anexada: {a['path']}\nVocê pode ler os arquivos dela (somente leitura) para responder."
            )

    for a, text in zip(links, link_texts):
        sections.append(f"Conteúdo do link {a['url']}:\n{text}")

    context = "\n\n".join(sections)
    return f"{content}\n\n--- Anexos ---\n{context}", images
