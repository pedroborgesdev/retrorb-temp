from dataclasses import dataclass

from api import server


@dataclass
class StubProvider:
    label: str = "Stub"
    domain: str = "romsfun.com"

    def details(self, _url, session=None):
        assert session is not None
        return {"downloads": [{
            "filename": "Pokemon Red.zip",
            "type": "ZIP",
            "size": "5 MB",
            "download_url": "https://files.example/game.zip",
        }]}


class StubRemote:
    status = 200
    headers = {"Content-Type": "application/zip", "Content-Length": "6"}

    def chunks(self):
        yield b"abc"
        yield b"123"

    def close(self):
        pass


def test_download_endpoint_streams_resolved_attachment(monkeypatch):
    monkeypatch.setitem(server.PROVIDERS, "romsfun", StubProvider())
    monkeypatch.setattr(server, "open_pinned_download", lambda *args, **kwargs: StubRemote())

    response = server.app.test_client().get(
        "/api/download",
        query_string={
            "source": "romsfun",
            "url": "https://romsfun.com/roms/pokemon.html",
            "file": "0",
            "filename": "Pokemon Red.zip",
        },
    )

    assert response.status_code == 200
    assert response.data == b"abc123"
    assert response.headers["Content-Disposition"].startswith("attachment;")
    assert "Pokemon Red.zip" in response.headers["Content-Disposition"]
    assert response.headers["Content-Length"] == "6"


def test_download_endpoint_rejects_changed_file_identity(monkeypatch):
    monkeypatch.setitem(server.PROVIDERS, "romsfun", StubProvider())

    response = server.app.test_client().get(
        "/api/download",
        query_string={
            "source": "romsfun",
            "url": "https://romsfun.com/roms/pokemon.html",
            "file": "0",
            "filename": "Another.zip",
        },
    )

    assert response.status_code == 409
    assert response.get_json()["error"].startswith("A lista de arquivos mudou")


def test_download_endpoint_rejects_invalid_file_index(monkeypatch):
    monkeypatch.setitem(server.PROVIDERS, "romsfun", StubProvider())

    response = server.app.test_client().get(
        "/api/download",
        query_string={
            "source": "romsfun",
            "url": "https://romsfun.com/roms/pokemon.html",
            "file": "not-a-number",
            "filename": "Pokemon Red.zip",
        },
    )

    assert response.status_code == 400
