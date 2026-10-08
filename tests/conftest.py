import pytest

from backend import storage


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    """Point conversation and project storage at a temp folder."""
    conv_dir = tmp_path / "conversations"
    monkeypatch.setattr(storage, "DATA_DIR", str(conv_dir))
    monkeypatch.setattr(storage, "PROJECTS_PATH", str(tmp_path / "projects.json"))
    storage._meta_cache.clear()
    return conv_dir
