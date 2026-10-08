# CLAUDE.md - Technical Notes for LLM Council

This file contains technical details, architectural decisions, and important implementation notes for future development sessions.

## Project Overview

LLM Council is a 3-stage deliberation system where multiple LLMs collaboratively answer user questions. The key innovation is anonymized peer review in Stage 2, preventing models from playing favorites.

## Architecture

### Backend Structure (`backend/`)

**`config.py`**
- `COUNCIL_MODELS` / `CHAIRMAN_MODEL` only seed the first council when `data/councils.json` does not exist yet; real seats come from the UI or auto-configuration
- Uses environment variable `OPENROUTER_API_KEY` from `.env`
- Backend runs on **port 8001** (NOT 8000 - user had another app on 8000)

**`openrouter.py`**
- `query_model()`: Single async model query
- `query_models_parallel()`: Parallel queries using `asyncio.gather()`
- Returns dict with 'content' and optional 'reasoning_details'
- Graceful degradation: returns None on failure, continues with successful responses

**`council.py`** - The Core Logic
- `format_history()` / `with_history()`: follow-up questions carry the last 3 question/final-answer pairs (answers truncated); the worker prefixes the query with them, so all 3 stages see the context
- `response_label(i)`: "Response A" ... "Response Z", "Response AA", ... (parsers match `Response [A-Z]+`)
- `stage1_collect_responses()`: Parallel queries to all council models
- `stage2_collect_rankings()`:
  - Anonymizes responses as "Response A, B, C, etc."
  - Creates `label_to_model` mapping for de-anonymization
  - Prompts models to evaluate and rank (with strict format requirements)
  - Returns tuple: (rankings_list, label_to_model_dict)
  - Each ranking includes both raw text and `parsed_ranking` list
- `stage3_synthesize_final()`: Chairman synthesizes from all responses + rankings
- `parse_ranking_from_text()`: Extracts "FINAL RANKING:" section, handles both numbered lists and plain format
- `calculate_aggregate_rankings()`: Computes average rank position across all peer evaluations

**`storage.py`**
- JSON-based conversation storage in `data/conversations/`
- All JSON writes go through `jsonfile.write_json()` (temp file + `os.replace`), so a crash never leaves a half-written file
- Conversation ids must be UUIDs (`get_conversation_path` raises otherwise); `list_conversations` caches sidebar metadata by file mtime/size
- Each conversation: `{id, created_at, messages[]}`
- Assistant messages contain: `{role, stage1, stage2, stage3}`
- Metadata (label_to_model, aggregate_rankings) is persisted on each assistant message

**Council setup** (`council_config.py`, `providers.py`, `components/CouncilRoom.jsx`)
- Councils live in `data/councils.json` (each with `members[]` with provider/model/role/enabled, plus `chairman`); without the file a default is built from `COUNCIL_MODELS`/`CHAIRMAN_MODEL`
- Seat `name` labels results everywhere (Stage 1/2 tabs, label_to_model), so `save_council` makes names unique
- `providers.query_member()` routes by provider: codex (`codex exec`), claude (`claude -p`, write tools disallowed, `--add-dir` for project/attachments), antigravity (`agy -p --mode plan`), openrouter
- Roles add a persona prompt in Stage 1 only; Stage 2 ranking stays neutral

**Projects** (`storage.py`, `main.py`, `codex_client.py`)
- Projects (`{id, name, path}`) live in `data/projects.json`; conversations carry `project_id`
- For project chats the API sets the `project_dir` contextvar in `codex_client.py` (regardless of `LLM_PROVIDER`), so every CLI call in Stages 1-3 runs in the project folder (Codex: `-C <path>`, read-only sandbox) plus a preamble telling the model to read the code; timeout rises to 900s
- The title task is created before the contextvar is set, so titles stay a plain call
- `/api/pick-folder` opens the macOS folder picker via `osascript`

**Attachments** (`attachments.py`)
- `POST /api/uploads?name=` takes the raw file body (no multipart dependency); videos get 6 frames via ffmpeg
- `build_context()` appends folder paths and fetched link text to the question and returns image paths; the API puts those in the `attached_images` contextvar, which `codex_client` turns into `--image=` flags (use the `=` form: `-i` is variadic and would swallow the `-` stdin prompt)

**`main.py`**
- FastAPI app with CORS enabled for localhost:5173 and localhost:3000
- `local_only_guard` middleware: rejects a non-local `Host` (DNS rebinding) while bound to localhost, and requires the `X-LLM-Council: 1` header on every non-GET `/api/` request (CSRF). `frontend/src/api.js` adds it through `request()`; use that helper for new calls
- The council runs only through POST `/api/conversations/{id}/message/stream` (`run_deliberation_worker`); GET `.../events` reattaches to a running one
- If no seat answers in Stage 1, the worker skips Stages 2-3 and saves an "Error:" assistant message listing each seat's last error
- Metadata includes: label_to_model mapping and aggregate_rankings

### Frontend Structure (`frontend/src/`)

**`App.jsx`**
- Main orchestration: manages conversations list and current conversation
- Handles message sending and metadata storage
- Metadata arrives via the stream and is also persisted in the backend JSON

**`components/ChatInterface.jsx`**
- Multiline textarea (3 rows, resizable)
- Enter to send, Shift+Enter for new line
- User messages wrapped in markdown-content class for padding

**`components/Stage1.jsx`**
- Tab view of individual model responses
- ReactMarkdown rendering with markdown-content wrapper

**`components/Stage2.jsx`**
- **Critical Feature**: Tab view showing RAW evaluation text from each model
- De-anonymization happens CLIENT-SIDE for display (models receive anonymous labels)
- Shows "Extracted Ranking" below each evaluation so users can validate parsing
- Aggregate rankings shown with average position and vote count
- Explanatory text clarifies that boldface model names are for readability only

**`components/Stage3.jsx`**
- Final synthesized answer from chairman
- Green-tinted background (#f0fff0) to highlight conclusion

**Styling (`*.css`)**
- Light mode theme (not dark mode)
- Primary color: #4a90e2 (blue)
- Global markdown styling in `index.css` with `.markdown-content` class
- 12px padding on all markdown content to prevent cluttered appearance

## Key Design Decisions

### Stage 2 Prompt Format
The Stage 2 prompt is very specific to ensure parseable output:
```
1. Evaluate each response individually first
2. Provide "FINAL RANKING:" header
3. Numbered list format: "1. Response C", "2. Response A", etc.
4. No additional text after ranking section
```

This strict format allows reliable parsing while still getting thoughtful evaluations.

### De-anonymization Strategy
- Models receive: "Response A", "Response B", etc.
- Backend creates mapping: `{"Response A": "openai/gpt-5.1", ...}`
- Frontend displays model names in **bold** for readability
- Users see explanation that original evaluation used anonymous labels
- This prevents bias while maintaining transparency

### Error Handling Philosophy
- Continue with successful responses if some models fail (graceful degradation)
- Never fail the entire request due to single model failure
- Log errors but don't expose to user unless all models fail

### UI/UX Transparency
- All raw outputs are inspectable via tabs
- Parsed rankings shown below raw text for validation
- Users can verify system's interpretation of model outputs
- This builds trust and allows debugging of edge cases

## Important Implementation Details

### Relative Imports
All backend modules use relative imports (e.g., `from .config import ...`) not absolute imports. This is critical for Python's module system to work correctly when running as `python -m backend.main`.

### Cross-platform
- `platform_utils.resolve_bin()` returns full CLI paths (Windows needs them for npm `.cmd` shims); always use it when spawning `codex`, `claude`, `agy`, `ffmpeg`
- Open text files with `encoding="utf-8"` (Windows defaults to cp1252)
- `agy` takes the prompt only as an argument: prompts over `MAX_ARG_CHARS` are written to a temp file the model is told to read
- Backend binds `127.0.0.1` (override with `LLM_COUNCIL_HOST`); `start.ps1` is the Windows launcher

### Port Configuration
- Backend: 8001 (changed from 8000 to avoid conflict)
- Frontend: 5173 (Vite default)
- Update both `backend/main.py` and `frontend/src/api.js` if changing

### Markdown Rendering
All ReactMarkdown components must be wrapped in `<div className="markdown-content">` for proper spacing. This class is defined globally in `index.css`.

### Model Configuration
Seats and chairman are configured in the UI (Council Room) and saved in `data/councils.json`; `backend/config.py` only provides the first-run default. Chairman can be same or different from council members.

## Common Gotchas

1. **Module Import Errors**: Always run backend as `python -m backend.main` from project root, not from backend directory
2. **CORS Issues**: Frontend must match allowed origins in `main.py` CORS middleware
3. **Ranking Parse Failures**: If models don't follow format, fallback regex extracts any "Response X" patterns in order
4. **Missing Metadata**: Conversations saved before metadata persistence have no `metadata` field, so rankings will not show for them

## Future Enhancement Ideas

- Export conversations to markdown/PDF
- Model performance analytics over time
- Custom ranking criteria (not just accuracy/insight)
- Support for reasoning models (o1, etc.) with special handling

## Testing Notes

- Backend: `uv run pytest` (tests in `tests/`: ranking parser, aggregation, history, storage, API guard and worker). The `data_dir` fixture points storage at a temp folder
- Frontend: `cd frontend && npm run lint && npm run build`
- Shared non-component helpers live in their own modules (`components/tokens.js`, `roles.js`, `skillName.js`, `src/useLang.js`) so `react-refresh/only-export-components` stays clean

## Data Flow Summary

```
User Query
    ↓
Stage 1: Parallel queries → [individual responses]
    ↓
Stage 2: Anonymize → Parallel ranking queries → [evaluations + parsed rankings]
    ↓
Aggregate Rankings Calculation → [sorted by avg position]
    ↓
Stage 3: Chairman synthesis with full context
    ↓
Return: {stage1, stage2, stage3, metadata}
    ↓
Frontend: Display with tabs + validation UI
```

The entire flow is async/parallel where possible to minimize latency.
