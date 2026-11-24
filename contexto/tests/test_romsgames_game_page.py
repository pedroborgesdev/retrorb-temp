import importlib

import pytest
import requests


GAME_URL = "https://www.romsgames.net/gameboy-advance-rom-pokemon-firered-version/"
DOWNLOAD_URL = f"{GAME_URL}?download"

GAME_PAGE_HTML = """
<html>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org/",
    "@type": "VideoGame",
    "name": "Pokemon: FireRed Version",
    "gamePlatform": "Gameboy Advance",
    "image": "https://cache.downloadroms.io/pokemon-fire-red.jpeg",
    "screenshot": [
      "https://cache.downloadroms.io/screenshot-1.jpeg",
      "https://cache.downloadroms.io/screenshot-2.jpeg"
    ],
    "fileSize": "5.19 MB",
    "description": "Descrição do jogo.",
    "aggregateRating": {"ratingValue": "3.82", "ratingCount": "14035"}
  }
  </script>
  <h1 itemprop="name">Pokemon: FireRed Version</h1>
  <div class="mb-4">
    <img src="/image/usa-flag.png" alt="US English">
    United States (English)
  </div>
  <button data-media-id="13459" type="submit">Save Game</button>
  <button data-media-id="13460" type="submit">Save Alternate</button>
</html>
"""

DOWNLOAD_1_PAYLOAD = {
    "asset": {"region": "US", "hits": 4378538},
    "media": {
        "id": 13459,
        "name": "Pokemon: FireRed Version.zip",
        "type": "file",
        "size": 5192434,
        "MediaResources": [{"mimeType": "application/zip"}],
    },
    "downloadUrl": "https://static.romsgames.net/files/output-1.bin",
    "downloadName": "Pokemon%3A%20FireRed%20Version.zip",
}

DOWNLOAD_2_PAYLOAD = {
    "media": {
        "id": 13460,
        "name": "Pokemon FireRed Alternate.7z",
        "type": "file",
        "size": 1024,
        "MediaResources": [],
    },
    "downloadUrl": "https://static.romsgames.net/files/output-2.bin",
    "downloadName": "Pokemon%20FireRed%20Alternate.7z",
}


class FakeResponse:
    def __init__(self, *, text="", payload=None, error=None, status_code=200):
        self.text = text
        self.payload = payload
        self.error = error
        self.status_code = status_code

    def raise_for_status(self):
        if self.error is not None:
            raise self.error

    def json(self):
        return self.payload


class ScriptedSession:
    def __init__(self, *steps):
        self.steps = list(steps)
        self.calls = []

    def _request(self, method, url, **kwargs):
        expected_method, expected_url, response = self.steps.pop(0)
        assert (method, url) == (expected_method, expected_url)
        self.calls.append((method, url, kwargs))
        return response

    def get(self, url, **kwargs):
        return self._request("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self._request("POST", url, **kwargs)


def load_module():
    return importlib.import_module("romsgames_game_page")


def test_collects_strict_schema_and_resolves_every_media_id():
    romsgames_game_page = load_module()
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(text=GAME_PAGE_HTML)),
        ("POST", DOWNLOAD_URL, FakeResponse(payload=DOWNLOAD_1_PAYLOAD)),
        ("POST", DOWNLOAD_URL, FakeResponse(payload=DOWNLOAD_2_PAYLOAD)),
    )

    result = romsgames_game_page.get_game_details(GAME_URL, session=session)

    assert result == {
        "name": "Pokemon: FireRed Version",
        "description": "Descrição do jogo.",
        "release_date": None,
        "reviews_count": 14035,
        "stars_rate": 3.82,
        "publisher": None,
        "regions": ["United States (English)"],
        "icon": "https://cache.downloadroms.io/pokemon-fire-red.jpeg",
        "screenshots": [
            "https://cache.downloadroms.io/screenshot-1.jpeg",
            "https://cache.downloadroms.io/screenshot-2.jpeg",
        ],
        "downloads": [
            {
                "filename": "Pokemon: FireRed Version.zip",
                "type": "application/zip",
                "size": "5.19 MB",
                "download_url": "https://static.romsgames.net/files/output-1.bin",
            },
            {
                "filename": "Pokemon FireRed Alternate.7z",
                "type": "file",
                "size": "1.02 KB",
                "download_url": "https://static.romsgames.net/files/output-2.bin",
            },
        ],
    }
    assert session.steps == []
    assert session.calls[1][2]["data"] == {"mediaId": "13459"}
    assert session.calls[1][2]["allow_redirects"] is False


def test_returns_none_for_unavailable_fields_without_download_request():
    romsgames_game_page = load_module()
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(text="<html><h1>Only Name</h1></html>")),
    )

    result = romsgames_game_page.get_game_details(GAME_URL, session=session)

    assert result == {
        "name": "Only Name",
        "description": None,
        "release_date": None,
        "reviews_count": None,
        "stars_rate": None,
        "publisher": None,
        "regions": None,
        "icon": None,
        "screenshots": None,
        "downloads": None,
    }


def test_keeps_download_with_none_values_when_resolution_fails():
    romsgames_game_page = load_module()
    one_media_page = GAME_PAGE_HTML.replace(
        '<button data-media-id="13460" type="submit">Save Alternate</button>',
        "",
    )
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(text=one_media_page)),
        (
            "POST",
            DOWNLOAD_URL,
            FakeResponse(error=requests.HTTPError("503")),
        ),
    )

    result = romsgames_game_page.get_game_details(GAME_URL, session=session)

    assert result["downloads"] == [
        {
            "filename": None,
            "type": None,
            "size": None,
            "download_url": None,
        }
    ]


def test_rejects_non_romsgames_url_before_requesting():
    romsgames_game_page = load_module()
    session = ScriptedSession()

    with pytest.raises(ValueError, match="www.romsgames.net"):
        romsgames_game_page.get_game_details(
            "https://example.com/game/",
            session=session,
        )

    assert session.calls == []


def test_wraps_primary_page_request_error():
    romsgames_game_page = load_module()
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(error=requests.HTTPError("503"))),
    )

    with pytest.raises(
        romsgames_game_page.RomsGamesGamePageError,
        match="Não foi possível abrir a página do jogo no RomsGames",
    ):
        romsgames_game_page.get_game_details(GAME_URL, session=session)


def test_rejects_redirect_without_following_it():
    romsgames_game_page = load_module()
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(status_code=302)),
    )

    with pytest.raises(romsgames_game_page.RomsGamesGamePageError):
        romsgames_game_page.get_game_details(GAME_URL, session=session)

