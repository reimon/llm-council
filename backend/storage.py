"""JSON-based storage for conversations."""

import json
import os
import re
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
from .config import DATA_DIR
from .jsonfile import write_json

# Sidebar metadata per conversation file, reused while the file's mtime/size are unchanged
_meta_cache: Dict[str, Tuple[Tuple[float, int], Dict[str, Any]]] = {}


def ensure_data_dir():
    """Ensure the data directory exists."""
    Path(DATA_DIR).mkdir(parents=True, exist_ok=True)


def get_conversation_path(conversation_id: str) -> str:
    """Get the file path for a conversation. Ids are UUIDs; anything else could escape DATA_DIR."""
    if not re.fullmatch(r"[0-9a-fA-F\-]{36}", conversation_id or ""):
        raise ValueError(f"invalid conversation id: {conversation_id!r}")
    return os.path.join(DATA_DIR, f"{conversation_id}.json")


PROJECTS_PATH = os.path.join(os.path.dirname(DATA_DIR), "projects.json")


def list_projects() -> List[Dict[str, Any]]:
    """List all projects, oldest first."""
    if not os.path.exists(PROJECTS_PATH):
        return []
    with open(PROJECTS_PATH, encoding="utf-8") as f:
        return json.load(f)


def _save_projects(projects: List[Dict[str, Any]]):
    write_json(PROJECTS_PATH, projects)


def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    return next((p for p in list_projects() if p["id"] == project_id), None)


def create_project(project_id: str, name: str, path: str) -> Dict[str, Any]:
    """Create a project pointing at a local folder."""
    project = {
        "id": project_id,
        "name": name,
        "path": path,
        "created_at": datetime.utcnow().isoformat(),
    }
    _save_projects(list_projects() + [project])
    return project


def delete_project(project_id: str) -> bool:
    """Delete a project and all of its conversations."""
    projects = list_projects()
    if not any(p["id"] == project_id for p in projects):
        return False
    _save_projects([p for p in projects if p["id"] != project_id])
    for conv in list_conversations():
        if conv.get("project_id") == project_id:
            delete_conversation(conv["id"])
    return True


def create_conversation(conversation_id: str, project_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Create a new conversation.

    Args:
        conversation_id: Unique identifier for the conversation
        project_id: Project this conversation belongs to, or None for a general question

    Returns:
        New conversation dict
    """
    ensure_data_dir()

    conversation = {
        "id": conversation_id,
        "created_at": datetime.utcnow().isoformat(),
        "title": "Nova conversa",
        "project_id": project_id,
        "messages": []
    }

    save_conversation(conversation)
    return conversation


def get_conversation(conversation_id: str) -> Optional[Dict[str, Any]]:
    """
    Load a conversation from storage.

    Args:
        conversation_id: Unique identifier for the conversation

    Returns:
        Conversation dict or None if not found
    """
    try:
        path = get_conversation_path(conversation_id)
    except ValueError:
        return None

    if not os.path.exists(path):
        return None

    with open(path, 'r', encoding="utf-8") as f:
        return json.load(f)


def save_conversation(conversation: Dict[str, Any]):
    """
    Save a conversation to storage.

    Args:
        conversation: Conversation dict to save
    """
    ensure_data_dir()

    write_json(get_conversation_path(conversation['id']), conversation)


def list_conversations() -> List[Dict[str, Any]]:
    """
    List all conversations (metadata only).

    Returns:
        List of conversation metadata dicts
    """
    ensure_data_dir()

    conversations = []
    seen = set()
    for filename in os.listdir(DATA_DIR):
        if not filename.endswith('.json') or filename.startswith('.'):
            continue
        path = os.path.join(DATA_DIR, filename)
        seen.add(path)
        try:
            st = os.stat(path)
        except OSError:
            continue
        stamp = (st.st_mtime, st.st_size)
        cached = _meta_cache.get(path)
        if cached and cached[0] == stamp:
            conversations.append(dict(cached[1]))
            continue
        try:
            with open(path, 'r', encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, ValueError) as e:
            print(f"Skipping unreadable conversation {filename}: {e}")
            continue
        meta = {
            "id": data["id"],
            "created_at": data["created_at"],
            "title": data.get("title", "Nova conversa"),
            "message_count": len(data["messages"]),
            "project_id": data.get("project_id")
        }
        _meta_cache[path] = (stamp, meta)
        conversations.append(dict(meta))
    for path in list(_meta_cache):
        if path not in seen:
            del _meta_cache[path]

    # Sort by creation time, newest first
    conversations.sort(key=lambda x: x["created_at"], reverse=True)

    return conversations


def delete_conversation(conversation_id: str) -> bool:
    """Delete a conversation file. Returns False if it did not exist."""
    try:
        path = get_conversation_path(conversation_id)
    except ValueError:
        return False
    if not os.path.exists(path):
        return False
    os.remove(path)
    return True


def add_user_message(
    conversation_id: str,
    content: str,
    attachments: Optional[List[Dict[str, Any]]] = None,
    council: Optional[Dict[str, str]] = None,
):
    """
    Add a user message to a conversation.

    Args:
        conversation_id: Conversation identifier
        content: User message content
    """
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    messages = conversation.get("messages", [])
    if messages and messages[-1].get("role") == "user" and messages[-1].get("content") == content:
        return

    conversation["messages"].append({
        "role": "user",
        "content": content,
        "attachments": attachments or [],
        "council": council
    })

    save_conversation(conversation)


def add_assistant_message(
    conversation_id: str,
    stage1: List[Dict[str, Any]],
    stage2: List[Dict[str, Any]],
    stage3: Dict[str, Any],
    metadata: Optional[Dict[str, Any]] = None
):
    """
    Add an assistant message with all 3 stages to a conversation.

    Args:
        conversation_id: Conversation identifier
        stage1: List of individual model responses
        stage2: List of model rankings
        stage3: Final synthesized response
        metadata: label_to_model and aggregate_rankings, so rankings survive reloads
    """
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    conversation["messages"].append({
        "role": "assistant",
        "stage1": stage1,
        "stage2": stage2,
        "stage3": stage3,
        "metadata": metadata
    })

    save_conversation(conversation)


def update_conversation_title(conversation_id: str, title: str):
    """
    Update the title of a conversation.

    Args:
        conversation_id: Conversation identifier
        title: New title for the conversation
    """
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    conversation["title"] = title
    save_conversation(conversation)
