"""FastAPI backend for LLM Council."""

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
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
from . import platform_utils
from .config import LLM_PROVIDER
from .codex_client import project_dir, attached_images
from . import attachments as attachments_mod
from . import council_config
from . import skills as skills_mod
from . import skill_translations
from .providers import extra_dirs, query_member
import time
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
    attachments: List[Dict[str, Any]] = []
    council_id: Optional[str] = None


class ConversationMetadata(BaseModel):
    """Conversation metadata for list view."""
    id: str
    created_at: str
    title: str
    message_count: int
    project_id: Optional[str] = None
    is_deliberating: Optional[bool] = False


class Conversation(BaseModel):
    """Full conversation with all messages."""
    id: str
    created_at: str
    title: str
    messages: List[Dict[str, Any]]
    project_id: Optional[str] = None
    project: Optional[Dict[str, Any]] = None
    is_deliberating: Optional[bool] = False


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "LLM Council API"}


@app.get("/api/conversations", response_model=List[ConversationMetadata])
async def list_conversations():
    """List all conversations (metadata only)."""
    cleanup_old_deliberations()
    convs = storage.list_conversations()
    for c in convs:
        sess = active_deliberations.get(c["id"])
        c["is_deliberating"] = bool(sess and not sess.done)
    return convs


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
    for conv in storage.list_conversations():
        if conv.get("project_id") == project_id:
            session = active_deliberations.pop(conv["id"], None)
            if session:
                if session.task and not session.task.done():
                    session.task.cancel()
                await session.close_subscribers()
    if not storage.delete_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "deleted"}


@app.post("/api/uploads")
async def upload_file(request: Request, name: str):
    """Upload an image or video as the raw request body."""
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Arquivo vazio")
    try:
        return await attachments_mod.save_upload(name, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha ao processar o arquivo: {e}")


@app.get("/api/uploads/{upload_id}/{filename}")
async def get_upload(upload_id: str, filename: str):
    """Serve an uploaded file (used for thumbnails)."""
    try:
        path = os.path.join(attachments_mod.upload_dir(upload_id), os.path.basename(filename))
    except ValueError:
        raise HTTPException(status_code=404)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404)
    return FileResponse(path)


@app.get("/api/councils")
async def list_councils():
    """Every saved council and which one is the default."""
    return council_config.list_councils()


@app.post("/api/councils")
async def create_council(body: Dict[str, Any]):
    """Create a council, empty-ish or as a copy of another (`from_id`)."""
    try:
        return council_config.create_council(body.get("name") or "Novo conselho", body.get("from_id"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/councils/{council_id}")
async def delete_council(council_id: str):
    try:
        if not council_config.delete_council(council_id):
            raise HTTPException(status_code=404, detail="Council not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return council_config.list_councils()


@app.post("/api/councils/{council_id}/default")
async def make_default_council(council_id: str):
    try:
        return council_config.set_default(council_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/council")
async def get_council(id: Optional[str] = None):
    """One council's seats and chairman (the default when no id is given)."""
    return council_config.load_council(id)


@app.put("/api/council")
async def put_council(council: Dict[str, Any]):
    """Replace the council setup."""
    try:
        return council_config.save_council(council)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/skills/catalog")
async def skills_catalog():
    """Skills available from trusted sources (built-in library and local SKILL.md files)."""
    items = await asyncio.to_thread(skills_mod.catalog)
    return skill_translations.apply(items)


@app.post("/api/skills/translate")
async def translate_skills():
    """Start translating local skill descriptions to Portuguese in the background."""
    items = await asyncio.to_thread(skills_mod.catalog)
    todo = len(skill_translations.pending(items))
    if todo and not skill_translations.is_running():
        asyncio.create_task(skill_translations.translate_missing(items))
    return {"pending": todo, "running": todo > 0}


@app.get("/api/skills")
async def installed_skills():
    """Skills installed in the council library."""
    return skill_translations.apply(skills_mod.list_installed())


@app.post("/api/skills/{skill_id}")
async def install_skill(skill_id: str):
    """Install a skill from a trusted source."""
    try:
        return await asyncio.to_thread(skills_mod.install, skill_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.delete("/api/skills/{skill_id}")
async def uninstall_skill(skill_id: str):
    """Remove a skill from the library and from every seat that uses it."""
    if not skills_mod.uninstall(skill_id):
        raise HTTPException(status_code=404, detail="Skill not installed")
    council_config.strip_skill(skill_id)
    return {"status": "removed"}


@app.get("/api/providers")
async def get_providers():
    """Installed LLM CLIs and their models."""
    return await asyncio.to_thread(council_config.list_providers)


@app.post("/api/council/test")
async def test_seat(seat: Dict[str, Any]):
    """Ping one provider/model so the user can check it answers."""
    start = time.time()
    response = await query_member(seat, [{"role": "user", "content": "Reply with exactly: ok"}], timeout=180.0)
    elapsed = round(time.time() - start, 1)
    if response is None or not response.get("content"):
        return {"ok": False, "seconds": elapsed}
    return {"ok": True, "seconds": elapsed, "reply": response["content"][:200]}


@app.post("/api/pick-folder")
async def pick_folder():
    """Open the OS folder picker (macOS, Windows, or Linux with zenity/kdialog) and return the path."""
    path = await asyncio.to_thread(platform_utils.pick_folder, "Escolha a pasta do projeto")
    return {"path": path}  # None when cancelled or no picker is available


@app.get("/api/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(conversation_id: str):
    """Get a specific conversation with all its messages."""
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    pid = conversation.get("project_id")
    conversation["project"] = storage.get_project(pid) if pid else None

    sess = active_deliberations.get(conversation_id)
    conversation["is_deliberating"] = bool(sess and not sess.done)

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
    session = active_deliberations.pop(conversation_id, None)
    if session:
        if session.task and not session.task.done():
            session.task.cancel()
        await session.close_subscribers()
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
    council_config.selected_council.set(request.council_id)
    chosen = council_config.load_council()
    storage.add_user_message(
        conversation_id, request.content, request.attachments,
        council={"id": chosen["id"], "name": chosen["name"]},
    )

    # If this is the first message, generate a title
    if is_first_message:
        title = await generate_conversation_title(request.content)
        storage.update_conversation_title(conversation_id, title)

    pid = conversation.get("project_id")
    project = storage.get_project(pid) if pid else None
    if project and LLM_PROVIDER == "codex":
        project_dir.set(project["path"])

    query, images = await attachments_mod.build_context(request.content, request.attachments)
    attached_images.set(tuple(images))
    extra_dirs.set(tuple(x["path"] for x in request.attachments if x.get("kind") == "folder"))

    # Run the 3-stage council process
    stage1_results, stage2_results, stage3_result, metadata = await run_full_council(query)

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


class DeliberationSession:
    def __init__(self, conversation_id: str):
        self.conversation_id = conversation_id
        self.events: List[Dict[str, Any]] = []
        self.subscribers: List[asyncio.Queue] = []
        self.done: bool = False
        self.error: Optional[str] = None
        self.task: Optional[asyncio.Task] = None
        self.completed_at: Optional[float] = None

    async def emit(self, event_dict: Dict[str, Any]):
        self.events.append(event_dict)
        dead = []
        for q in list(self.subscribers):
            try:
                await q.put(event_dict)
            except Exception:
                dead.append(q)
        for q in dead:
            if q in self.subscribers:
                self.subscribers.remove(q)

    async def close_subscribers(self):
        for q in list(self.subscribers):
            try:
                await q.put(None)
            except Exception:
                pass
        self.subscribers.clear()

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        for ev in self.events:
            q.put_nowait(ev)
        if self.done:
            q.put_nowait(None)
        else:
            self.subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        if q in self.subscribers:
            self.subscribers.remove(q)


active_deliberations: Dict[str, DeliberationSession] = {}


def cleanup_old_deliberations():
    now = time.time()
    to_remove = [
        cid for cid, s in list(active_deliberations.items())
        if s.done and s.completed_at and (now - s.completed_at > 600)
    ]
    for cid in to_remove:
        active_deliberations.pop(cid, None)


async def run_deliberation_worker(session: DeliberationSession, request: SendMessageRequest):
    conversation_id = session.conversation_id
    try:
        conversation = storage.get_conversation(conversation_id)
        if conversation is None:
            await session.emit({"type": "error", "message": "Conversation not found"})
            return

        is_first_message = len(conversation["messages"]) == 0

        # Add user message
        council_config.selected_council.set(request.council_id)
        chosen = council_config.load_council()
        storage.add_user_message(
            conversation_id, request.content, request.attachments,
            council={"id": chosen["id"], "name": chosen["name"]},
        )

        # Start title generation in parallel (don't await yet)
        title_task = None
        if is_first_message:
            title_task = asyncio.create_task(generate_conversation_title(request.content))

        # Point the council at the project folder (title task above stays general)
        pid = conversation.get("project_id")
        project = storage.get_project(pid) if pid else None
        if project and LLM_PROVIDER == "codex":
            project_dir.set(project["path"])
        else:
            project_dir.set(None)

        # Fold attachments into the question; images go to the models as files
        query, images = await attachments_mod.build_context(request.content, request.attachments)
        attached_images.set(tuple(images))
        extra_dirs.set(tuple(x["path"] for x in request.attachments if x.get("kind") == "folder"))

        members = council_config.active_members()
        council_data = council_config.load_council()
        chairman = council_data.get("chairman", {})

        # Send initial council layout event
        await session.emit({
            "type": "council_init",
            "members": [
                {
                    "name": m["name"],
                    "role": m.get("role", "generalist"),
                    "model": m.get("model", ""),
                    "provider": m.get("provider", ""),
                }
                for m in members
            ],
            "chairman": {
                "name": chairman.get("name", "Chairman"),
                "model": chairman.get("model", ""),
                "provider": chairman.get("provider", ""),
            },
            "project": {
                "id": project["id"],
                "name": project["name"],
                "path": project["path"],
            } if project else None,
        })

        # Stage 1: Collect responses
        await session.emit({"type": "stage1_start", "models": [m["name"] for m in members]})
        stage1_results = await stage1_collect_responses(query, on_event=session.emit)
        await session.emit({"type": "stage1_complete", "data": stage1_results})

        # Stage 2: Collect rankings
        await session.emit({"type": "stage2_start", "models": [m["name"] for m in members]})
        stage2_results, label_to_model = await stage2_collect_rankings(query, stage1_results, on_event=session.emit)
        aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)
        await session.emit({
            "type": "stage2_complete",
            "data": stage2_results,
            "metadata": {"label_to_model": label_to_model, "aggregate_rankings": aggregate_rankings},
        })

        # Stage 3: Synthesize final answer
        await session.emit({"type": "stage3_start", "chairman": chairman.get("name", "Chairman")})
        stage3_result = await stage3_synthesize_final(query, stage1_results, stage2_results, on_event=session.emit)
        await session.emit({"type": "stage3_complete", "data": stage3_result})

        # Wait for title generation if it was started
        if title_task:
            try:
                title = await title_task
                storage.update_conversation_title(conversation_id, title)
                await session.emit({"type": "title_complete", "data": {"title": title}})
            except Exception:
                pass

        # Save complete assistant message
        storage.add_assistant_message(
            conversation_id,
            stage1_results,
            stage2_results,
            stage3_result,
            {"label_to_model": label_to_model, "aggregate_rankings": aggregate_rankings}
        )

        # Send completion event
        await session.emit({"type": "complete"})

    except asyncio.CancelledError:
        pass
    except Exception as e:
        import traceback
        traceback.print_exc()
        session.error = str(e)
        await session.emit({"type": "error", "message": str(e)})
    finally:
        session.done = True
        session.completed_at = time.time()
        await session.close_subscribers()


@app.post("/api/conversations/{conversation_id}/message/stream")
async def send_message_stream(conversation_id: str, request: SendMessageRequest):
    """
    Send a message and stream the 3-stage council process.
    Continues in the background even if the client disconnects.
    """
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    cleanup_old_deliberations()

    session = active_deliberations.get(conversation_id)
    if session is None or session.done:
        session = DeliberationSession(conversation_id)
        active_deliberations[conversation_id] = session
        session.task = asyncio.create_task(run_deliberation_worker(session, request))

    queue = session.subscribe()

    async def event_generator():
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield f"data: {json.dumps(item)}\n\n"
        finally:
            session.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@app.get("/api/conversations/{conversation_id}/events")
async def stream_conversation_events(conversation_id: str):
    """
    Reconnect to an ongoing deliberation stream or receive final state.
    """
    cleanup_old_deliberations()
    session = active_deliberations.get(conversation_id)
    if session is None:
        conversation = storage.get_conversation(conversation_id)
        if conversation is None:
            raise HTTPException(status_code=404, detail="Conversation not found")
        async def empty_gen():
            yield f"data: {json.dumps({'type': 'complete'})}\n\n"
        return StreamingResponse(
            empty_gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
        )

    queue = session.subscribe()

    async def event_generator():
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield f"data: {json.dumps(item)}\n\n"
        finally:
            session.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


if __name__ == "__main__":
    import sys
    import uvicorn
    if sys.platform == "win32":
        # Subprocesses (the model CLIs) need the Proactor loop on Windows
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    # Localhost only: the API runs your logged-in CLIs and can read local folders
    host = os.getenv("LLM_COUNCIL_HOST", "127.0.0.1")
    uvicorn.run(app, host=host, port=8001)
