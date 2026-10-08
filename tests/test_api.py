import json

import pytest
from fastapi.testclient import TestClient

from backend import council_config, main, storage

CID = "11111111-2222-3333-4444-555555555555"
COUNCIL = {
    "id": "c1",
    "name": "Test",
    "members": [{"name": "Alpha", "provider": "codex", "model": "m1", "enabled": True}],
    "chairman": {"name": "Chair", "provider": "codex", "model": "m1"},
}


@pytest.fixture
def client(data_dir, monkeypatch):
    monkeypatch.setattr(council_config, "load_council", lambda *a, **k: COUNCIL)
    monkeypatch.setattr(council_config, "active_members", lambda *a, **k: COUNCIL["members"])
    main.active_deliberations.clear()
    return TestClient(main.app, base_url="http://127.0.0.1:8001")


def events(response):
    return [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]


def test_writes_need_the_csrf_header(client):
    assert client.post("/api/conversations", json={}).status_code == 403
    ok = client.post("/api/conversations", json={}, headers={"X-LLM-Council": "1"})
    assert ok.status_code == 200


def test_reads_do_not_need_the_header(client):
    assert client.get("/api/conversations").status_code == 200


def test_foreign_host_is_rejected(data_dir):
    rebinding = TestClient(main.app, base_url="http://evil.example:8001")
    assert rebinding.get("/api/conversations").status_code == 403


def test_preflight_from_frontend_allows_header(client):
    r = client.options(
        "/api/conversations",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-llm-council,content-type",
        },
    )
    assert r.status_code == 200


def test_council_stops_when_nobody_answers(client, monkeypatch):
    calls = []

    async def no_answers(query, on_event=None):
        return []

    async def must_not_run(*a, **k):
        calls.append(a)
        raise AssertionError("stage should be skipped")

    async def title(_):
        return "t"

    monkeypatch.setattr(main, "stage1_collect_responses", no_answers)
    monkeypatch.setattr(main, "stage2_collect_rankings", must_not_run)
    monkeypatch.setattr(main, "stage3_synthesize_final", must_not_run)
    monkeypatch.setattr(main, "generate_conversation_title", title)
    storage.create_conversation(CID)

    r = client.post(f"/api/conversations/{CID}/message/stream", json={"content": "hi"},
                    headers={"X-LLM-Council": "1"})
    types = [e["type"] for e in events(r)]
    assert "stage2_start" not in types and types[-1] == "complete"
    assert not calls
    last = storage.get_conversation(CID)["messages"][-1]
    assert last["role"] == "assistant" and last["stage3"]["response"].startswith("Error:")
    assert "Alpha" in last["stage3"]["response"]


def test_follow_up_carries_history(client, monkeypatch):
    seen = {}

    async def stage1(query, on_event=None):
        seen["query"] = query
        return []

    async def title(_):
        return "t"

    monkeypatch.setattr(main, "stage1_collect_responses", stage1)
    monkeypatch.setattr(main, "generate_conversation_title", title)
    storage.create_conversation(CID)
    storage.add_user_message(CID, "first question")
    storage.add_assistant_message(CID, [], [], {"model": "Chair", "response": "first answer"})

    client.post(f"/api/conversations/{CID}/message/stream", json={"content": "and then?"},
                headers={"X-LLM-Council": "1"})
    assert "first question" in seen["query"] and "first answer" in seen["query"]
    assert seen["query"].rstrip().endswith("and then?")
