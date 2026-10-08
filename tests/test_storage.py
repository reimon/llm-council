import json
import os

import pytest

from backend import storage

CID = "11111111-2222-3333-4444-555555555555"


def test_round_trip_and_listing(data_dir):
    storage.create_conversation(CID)
    storage.add_user_message(CID, "hello")
    assert storage.get_conversation(CID)["messages"][0]["content"] == "hello"
    [meta] = storage.list_conversations()
    assert meta["id"] == CID and meta["message_count"] == 1


def test_listing_sees_updates_after_cache(data_dir):
    storage.create_conversation(CID)
    assert storage.list_conversations()[0]["title"] == "Nova conversa"
    storage.update_conversation_title(CID, "Novo título com mais texto")
    assert storage.list_conversations()[0]["title"] == "Novo título com mais texto"
    storage.delete_conversation(CID)
    assert storage.list_conversations() == []


def test_unreadable_file_is_skipped(data_dir):
    storage.create_conversation(CID)
    (data_dir / "broken.json").write_text("{not json", encoding="utf-8")
    assert [c["id"] for c in storage.list_conversations()] == [CID]


@pytest.mark.parametrize("bad", ["../projects", "..", "abc", ""])
def test_invalid_ids_are_rejected(data_dir, bad):
    assert storage.get_conversation(bad) is None
    assert storage.delete_conversation(bad) is False
    with pytest.raises(ValueError):
        storage.get_conversation_path(bad)


def test_failed_write_keeps_previous_file(data_dir):
    storage.create_conversation(CID)
    conv = storage.get_conversation(CID)
    conv["messages"].append({"role": "user", "content": object()})  # not JSON serializable
    with pytest.raises(TypeError):
        storage.save_conversation(conv)
    assert storage.get_conversation(CID)["messages"] == []
    assert [f for f in os.listdir(data_dir)] == [f"{CID}.json"]
    json.loads((data_dir / f"{CID}.json").read_text(encoding="utf-8"))
