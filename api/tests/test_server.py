from dataclasses import replace

import pytest

from api.server import PROVIDERS, app
from contexto import providers_console_search as console_catalog


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


def test_search_preserves_pagination_and_queries_only_requested_provider(client, monkeypatch):
    calls = []

    def search(query, page):
        calls.append((query, page))
        return {"results": [], "page": page, "has_next": True}

    monkeypatch.setitem(PROVIDERS, "wowroms", replace(PROVIDERS["wowroms"], search=search))
    response = client.get("/api/search?q=Pokemon&source=wowroms&page=2")
    assert response.status_code == 200
    assert calls == [("Pokemon", 2)]
    assert response.json == {"query": "Pokemon", "sources": {"wowroms": {"label": "WowRoms", "results": [], "error": None, "pagination": {"page": 2, "has_next": True}}}}


def test_one_provider_failure_does_not_fail_aggregate(client, monkeypatch):
    def success(query, page):
        return {"results": [{"title": "A", "url": None, "icon": None, "console": None, "size": None, "downloads": None}], "page": page, "has_next": False}

    def failure(query, page):
        raise RuntimeError("Internal token should not be exposed")

    for source, provider in list(PROVIDERS.items()):
        monkeypatch.setitem(PROVIDERS, source, replace(provider, search=failure if source == "romspure" else success))
    response = client.get("/api/search?q=Pokemon")
    assert response.status_code == 200
    assert len(response.json["sources"]) == 4
    assert response.json["sources"]["romspure"]["error"]
    assert response.json["sources"]["wowroms"]["results"][0]["title"] == "A"
    assert "Internal token" not in response.text


@pytest.mark.parametrize("query", ["", "q=", "q=test&source=bad", "q=test&page=0", "q=test&page=-1", "q=test&page=abc", "q=test&page=501", "q=" + "x" * 201])
def test_invalid_search_is_rejected(client, query):
    assert client.get(f"/api/search?{query}").status_code == 400


@pytest.mark.parametrize("url", [
    "http://romsfun.com/game.html", "https://127.0.0.1/game", "https://romsfun.com.evil.test/game",
    "https://user@romsfun.com/game", "https://romsfun.com:8443/game", "https://romsfun.com\\@evil.test/game",
    "https://romsfun.com/\nfile", "file:///etc/passwd", "https://romsfun.com", "https://wowroms.com/game",
])
def test_invalid_game_urls_never_reach_provider(client, url):
    assert client.get("/api/game", query_string={"source": "romsfun", "url": url}).status_code == 400


def test_details_keep_null_fields(client, monkeypatch):
    game = {key: None for key in ["name", "description", "release_date", "reviews_count", "stars_rate", "publisher", "regions", "icon", "screenshots", "downloads"]}
    monkeypatch.setitem(PROVIDERS, "romsfun", replace(PROVIDERS["romsfun"], details=lambda url: game))
    response = client.get("/api/game", query_string={"source": "romsfun", "url": "https://romsfun.com/roms/test.html"})
    assert response.json == {"source": "romsfun", "label": "RomsFun", "game": game}


def test_details_failure_is_502(client, monkeypatch):
    def fail(url):
        raise RuntimeError("secret")

    monkeypatch.setitem(PROVIDERS, "romsfun", replace(PROVIDERS["romsfun"], details=fail))
    response = client.get("/api/game", query_string={"source": "romsfun", "url": "https://romsfun.com/roms/test.html"})
    assert response.status_code == 502
    assert "secret" not in response.text


def test_api_rejects_unknown_origins_and_host(client):
    assert client.get("/api/health", headers={"Origin": "https://evil.example"}).status_code == 403
    assert client.get("/api/health", headers={"Host": "evil.example"}).status_code == 400
    response = client.get("/api/health", headers={"Origin": "http://127.0.0.1:5173"})
    assert response.headers["Access-Control-Allow-Origin"] == "http://127.0.0.1:5173"


def test_consoles_endpoint_returns_complete_definitive_json(client):
    import json

    response = client.get("/api/consoles")
    assert response.status_code == 200
    assert response.json == json.loads(console_catalog.CATALOG_PATH.read_text())


@pytest.mark.parametrize("image", [None, "images/consoles/ps3.png"])
def test_console_image_is_optional_and_preserved(client, monkeypatch, tmp_path, image):
    import json

    data = console_catalog._load_catalog()
    data["consoles"][0]["image"] = image
    path = tmp_path / "consoles.json"
    path.write_text(json.dumps(data))
    monkeypatch.setattr(console_catalog, "CATALOG_PATH", path)
    assert client.get("/api/consoles").json == data
    assert console_catalog._resolve_console(data["consoles"][0]["name"])["image"] == image


def test_console_search_without_text_uses_script_mapping_and_pagination(client, monkeypatch):
    calls = []

    def fetch(mapping, page):
        calls.append((mapping["name"], mapping["console_name"], page))
        return {"name": mapping["name"], "console_name": mapping["console_name"],
                "results": [], "has_next": True, "error": None}

    monkeypatch.setattr(console_catalog, "_fetch_provider", fetch)
    response = client.get("/api/search", query_string={"console": "PlayStation 3", "source": "romsfun", "page": 2, "q": ""})
    assert response.status_code == 200
    assert calls == [("romsfun", "PS3", 2)]
    assert response.json["sources"]["romsfun"]["pagination"] == {"page": 2, "has_next": True}


def test_console_and_title_search_filters_by_all_aliases(client, monkeypatch):
    calls = []

    def fetch(mapping, page, *, query):
        calls.append((query, page))
        return {"name": mapping["name"], "console_name": mapping["console_name"], "results": [{"title": "A", "console": name} for name in ["Sony Playstation 3", "PS3", "PS2", None]], "has_next": True, "error": None}

    monkeypatch.setattr(console_catalog, "_fetch_provider", fetch)
    response = client.get("/api/search", query_string={"q": "God of War", "console": "PlayStation 3", "source": "romspure"})
    assert response.status_code == 200
    assert calls == [("God of War", 1)]
    assert [item["console"] for item in response.json["sources"]["romspure"]["results"]] == ["Sony Playstation 3", "PS3"]


def test_unknown_console_is_rejected(client):
    assert client.get("/api/search?console=Unknown").status_code == 400
