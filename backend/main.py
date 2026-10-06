"""FastAPI backend for LLM Council."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
import subprocess
import uuid
import json
import asyncio

from . import storage
from .config import LLM_PROVIDER
from .codex_client import project_dir
from .council import run_full_council, generate_conversation_title, stage1_collect_responses, stage2_collect_rankings, stage3_synthesize_final, calculate_aggregate_rankings

app = FastAPI(title="LLM Council API")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CreateConversationRequest(BaseModel):
    """Request to create a new conversation."""
    project_id: Optional[str] = None


class CreateProjectRequest(BaseModel):
    """Request to create a project pointing at a local folder."""
    name: str = ""
    path: str


class SendMessageRequest(BaseModel):
    """Request to send a message in a conversation."""
    content: str


class ConversationMetadata(BaseModel):
    """Conversation metadata for list view."""
    id: str
    created_at: str
    title: str
    message_count: int
    project_id: Optional[str] = None


class Conversation(BaseModel):
    """Full conversation with all messages."""
    id: str
    created_at: str
    title: str
    messages: List[Dict[str, Any]]
    project_id: Optional[str] = None
    project: Optional[Dict[str, Any]] = None


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "LLM Council API"}


@app.get("/api/conversations", response_model=List[ConversationMetadata])
async def list_conversations():
    """List all conversations (metadata only)."""
    return storage.list_conversations()


@app.post("/api/conversations", response_model=Conversation)
async def create_conversation(request: CreateConversationRequest):
    """Create a new conversation."""
    if request.project_id and not storage.get_project(request.project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    conversation_id = str(uuid.uuid4())
    conversation = storage.create_conversation(conversation_id, request.project_id)
    conversation["project"] = storage.get_project(request.project_id) if request.project_id else None
    return conversation


@app.get("/api/projects")
async def list_projects():
    """List all projects."""
    return storage.list_projects()


@app.post("/api/projects")
async def create_project(request: CreateProjectRequest):
    """Create a project from a local folder path."""
    path = os.path.realpath(os.path.expanduser(request.path.strip()))
    if not os.path.isdir(path):
        raise HTTPException(status_code=400, detail=f"A pasta não existe: {path}")
    name = request.name.strip() or os.path.basename(path)
    return storage.create_project(str(uuid.uuid4()), name, path)


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    """Delete a project and its conversations (the project folder itself is untouched)."""
    if not storage.delete_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "deleted"}


@app.post("/api/pick-folder")
async def pick_folder():
    """Open the native macOS folder picker and return the chosen path."""
    script = 'POSIX path of (choose folder with prompt "Escolha a pasta do projeto")'
    proc = await asyncio.to_thread(
        subprocess.run, ["osascript", "-e", script], capture_output=True, text=True
    )
    if proc.returncode != 0:
        return {"path": None}  # user cancelled or picker unavailable
    return {"path": proc.stdout.strip().rstrip("/") or "/"}


@app.get("/api/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(conversation_id: str):
    """Get a specific conversation with all its messages."""
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    pid = conversation.get("project_id")
    conversation["project"] = storage.get_project(pid) if pid else None

    # Older conversations were saved without ranking metadata; rebuild it.
    # Labels are assigned in Stage 1 order (Response A = first model), so this is exact.
    for msg in conversation["messages"]:
        if msg.get("role") == "assistant" and not msg.get("metadata") and msg.get("stage1") and msg.get("stage2"):
            label_to_model = {
                f"Response {chr(65 + i)}": r["model"] for i, r in enumerate(msg["stage1"])
            }
            msg["metadata"] = {
                "label_to_model": label_to_model,
                "aggregate_rankings": calculate_aggregate_rankings(msg["stage2"], label_to_model),
            }
    return conversation


@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """Delete a conversation."""
    if not storage.delete_conversation(conversation_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "deleted"}


@app.post("/api/conversations/{conversation_id}/message")
async def send_message(conversation_id: str, request: SendMessageRequest):
    """
    Send a message and run the 3-stage council process.
    Returns the complete response with all stages.
    """
    # Check if conversation exists
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Check if this is the first message
    is_first_message = len(conversation["messages"]) == 0

    # Add user message
    storage.add_user_message(conversation_id, request.content)

    # If this is the first message, generate a title
    if is_first_message:
        title = await generate_conversation_title(request.content)
        storage.update_conversation_title(conversation_id, title)

    pid = conversation.get("project_id")
    project = storage.get_project(pid) if pid else None
    if project and LLM_PROVIDER == "codex":
        project_dir.set(project["path"])

    # Run the 3-stage council process
    stage1_results, stage2_results, stage3_result, metadata = await run_full_council(
        request.content
    )

    # Add assistant message with all stages
    storage.add_assistant_message(
        conversation_id,
        stage1_results,
        stage2_results,
        stage3_result,
        metadata
    )

    # Return the complete response with metadata
    return {
        "stage1": stage1_results,
        "stage2": stage2_results,
        "stage3": stage3_result,
        "metadata": metadata
    }


@app.post("/api/conversations/{conversation_id}/message/stream")
async def send_message_stream(conversation_id: str, request: SendMessageRequest):
    """
    Send a message and stream the 3-stage council process.
    Returns Server-Sent Events as each stage completes.
    """
    # Check if conversation exists
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Check if this is the first message
    is_first_message = len(conversation["messages"]) == 0

    async def event_generator():
        try:
            # Add user message
            storage.add_user_message(conversation_id, request.content)

            # Start title generation in parallel (don't await yet)
            title_task = None
            if is_first_message:
                title_task = asyncio.create_task(generate_conversation_title(request.content))

            # Point the council at the project folder (title task above stays general)
            pid = conversation.get("project_id")
            project = storage.get_project(pid) if pid else None
            if project and LLM_PROVIDER == "codex":
                project_dir.set(project["path"])

            # Stage 1: Collect responses
            yield f"data: {json.dumps({'type': 'stage1_start'})}\n\n"
            stage1_results = await stage1_collect_responses(request.content)
            yield f"data: {json.dumps({'type': 'stage1_complete', 'data': stage1_results})}\n\n"

            # Stage 2: Collect rankings
            yield f"data: {json.dumps({'type': 'stage2_start'})}\n\n"
            stage2_results, label_to_model = await stage2_collect_rankings(request.content, stage1_results)
            aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)
            yield f"data: {json.dumps({'type': 'stage2_complete', 'data': stage2_results, 'metadata': {'label_to_model': label_to_model, 'aggregate_rankings': aggregate_rankings}})}\n\n"

            # Stage 3: Synthesize final answer
            yield f"data: {json.dumps({'type': 'stage3_start'})}\n\n"
            stage3_result = await stage3_synthesize_final(request.content, stage1_results, stage2_results)
            yield f"data: {json.dumps({'type': 'stage3_complete', 'data': stage3_result})}\n\n"

            # Wait for title generation if it was started
            if title_task:
                title = await title_task
                storage.update_conversation_title(conversation_id, title)
                yield f"data: {json.dumps({'type': 'title_complete', 'data': {'title': title}})}\n\n"

            # Save complete assistant message
            storage.add_assistant_message(
                conversation_id,
                stage1_results,
                stage2_results,
                stage3_result,
                {'label_to_model': label_to_model, 'aggregate_rankings': aggregate_rankings}
            )

            # Send completion event
            yield f"data: {json.dumps({'type': 'complete'})}\n\n"

        except Exception as e:
            # Send error event
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
