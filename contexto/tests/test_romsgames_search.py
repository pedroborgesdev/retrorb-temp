import importlib
import json

import pytest
import requests


SEARCH_URL = "https://www.romsgames.net/search/"
DYNAMIC_SEARCH_URL = "https://www.romsgames.net/search/hint/"
GAME_1_URL = "https://www.romsgames.net/gameboy-advance-rom-pokemon-fire-red/"
GAME_2_URL = "https://www.romsgames.net/gameboy-advance-rom-pokemon-feuerrote/"

SEARCH_HTML = f"""
<div class="grid gap-6">
  <a href="/gameboy-advance-rom-pokemon-fire-red/"
     class="relative p-2 rounded-xl shadow-lg bg-white">
    <img src="https://cache.downloadroms.io/pokemon-fire-red.jpg"
         class="mb-3 rounded-lg" alt="Pokemon Fire Red">
    <div class="ml-2 text-sm font-light text-gray-900">Pokemon Fire Red</div>
  </a>
  <a href="/gameboy-advance-rom-pokemon-feuerrote/"
     class="relative p-2 rounded-xl shadow-lg bg-white">
    <img src="/image/no-cover.png" class="mb-3 rounded-lg"
         alt="Pokemon Feuerrote">
    <div class="ml-2 text-sm font-light text-gray-900">Pokemon Feuerrote</div>
  </a>
</div>
"""

GAME_1_HTML = """
<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "VideoGame",
  "name": "Pokemon Fire Red",
  "gamePlatform": "Gameboy Advance",
  "fileSize": "5.19 MB"
}
</script>
"""

GAME_2_HTML = """
<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "VideoGame",
  "name": "Pokemon Feuerrote",
  "gamePlatform": "Gameboy Advance"
}
</script>
"""


class FakeResponse:
    def __init__(self, *, text="", error=None, status_code=200):
        self.text = text
        self.error = error
        self.status_code = status_code

    def raise_for_status(self):
        if self.error is not None:
            raise self.error


class ScriptedSession:
    def __init__(self, *steps):
        self.steps = list(steps)
        self.calls = []

    def get(self, url, **kwargs):
        expected_url, response = self.steps.pop(0)
        assert url == expected_url
        self.calls.append((url, kwargs))
        return response


def load_module():
    return importlib.import_module("romsgames_search")


def test_search_returns_strict_schema_and_enriches_available_fields():
    romsgames_search = load_module()
    session = ScriptedSession(
        (SEARCH_URL, FakeResponse(text=SEARCH_HTML)),
        (GAME_1_URL, FakeResponse(text=GAME_1_HTML)),
        (GAME_2_URL, FakeResponse(text=GAME_2_HTML)),
    )

    result = romsgames_search.search_games(
        "  Pokémon Fire Red  ",
        session=session,
    )

    assert result == [
        {
            "title": "Pokemon Fire Red",
            "url": GAME_1_URL,
            "icon": "https://cache.downloadroms.io/pokemon-fire-red.jpg",
            "console": "Gameboy Advance",
            "size": "5.19 MB",
            "downloads": None,
        },
        {
            "title": "Pokemon Feuerrote",
            "url": GAME_2_URL,
            "icon": None,
            "console": "Gameboy Advance",
            "size": None,
            "downloads": None,
        },
    ]
    assert session.steps == []
    assert session.calls[0][1]["params"] == {"q": "Pokémon Fire Red"}
    assert session.calls[0][1]["allow_redirects"] is False


def test_search_keeps_result_when_enrichment_fails():
    romsgames_search = load_module()
    first_end = SEARCH_HTML.find("  <a href", SEARCH_HTML.find("  <a href") + 1)
    one_card = SEARCH_HTML[:first_end] + "</div>"
    session = ScriptedSession(
        (SEARCH_URL, FakeResponse(text=one_card)),
        (GAME_1_URL, FakeResponse(error=requests.HTTPError("503"))),
    )

    result = romsgames_search.search_games("Pokemon", session=session)

    assert result[0]["console"] is None
    assert result[0]["size"] is None


def test_search_rejects_blank_name_without_requesting():
    romsgames_search = load_module()
    session = ScriptedSession()

    with pytest.raises(ValueError, match="nome do jogo"):
        romsgames_search.search_games("   ", session=session)

    assert session.calls == []


def test_search_wraps_primary_request_error():
    romsgames_search = load_module()
    session = ScriptedSession(
        (SEARCH_URL, FakeResponse(error=requests.HTTPError("503"))),
    )

    with pytest.raises(
        romsgames_search.RomsGamesSearchError,
        match="Não foi possível pesquisar no RomsGames",
    ):
        romsgames_search.search_games("Metroid", session=session)


def test_search_ignores_external_cards():
    romsgames_search = load_module()
    malicious = SEARCH_HTML.replace(
        "/gameboy-advance-rom-pokemon-fire-red/",
        "https://example.com/gameboy-advance-rom-pokemon-fire-red/",
        1,
    )
    first_end = malicious.find("  <a href", malicious.find("  <a href") + 1)
    one_card = malicious[:first_end] + "</div>"
    session = ScriptedSession((SEARCH_URL, FakeResponse(text=one_card)))

    assert romsgames_search.search_games("Pokemon", session=session) == []


def test_search_rejects_redirect_without_following_it():
    romsgames_search = load_module()
    session = ScriptedSession((SEARCH_URL, FakeResponse(status_code=302)))

    with pytest.raises(romsgames_search.RomsGamesSearchError):
        romsgames_search.search_games("Pokemon", session=session)


def test_search_stops_enrichment_after_budget(monkeypatch):
    romsgames_search = load_module()
    times = iter([0.0, 0.0, 19.0])
    monkeypatch.setattr(romsgames_search, "monotonic", times.__next__)
    first_end = SEARCH_HTML.find("  <a href", SEARCH_HTML.find("  <a href") + 1)
    one_card = SEARCH_HTML[:first_end] + "</div>"
    session = ScriptedSession((SEARCH_URL, FakeResponse(text=one_card)))

    result = romsgames_search.search_games("Pokemon", session=session)

    assert result[0]["console"] is None
    assert result[0]["size"] is None
    assert len(session.calls) == 1


def test_search_page_reports_that_romsgames_has_no_pagination():
    romsgames_search = load_module()
    session = ScriptedSession(
        (SEARCH_URL, FakeResponse(text=SEARCH_HTML)),
        (GAME_1_URL, FakeResponse(text=GAME_1_HTML)),
        (GAME_2_URL, FakeResponse(text=GAME_2_HTML)),
    )

    result = romsgames_search.search_page("Pokemon", session=session)

    assert result["page"] == 1
    assert result["has_next"] is False
    assert len(result["results"]) == 2


def test_search_page_after_first_returns_empty_without_requesting():
    romsgames_search = load_module()
    session = ScriptedSession()

    result = romsgames_search.search_page("Pokemon", page=2, session=session)

    assert result == {"results": [], "page": 2, "has_next": False}
    assert session.calls == []


@pytest.mark.parametrize("page", [0, -1, 1.5, "2", True])
def test_search_page_rejects_invalid_page_without_requesting(page):
    romsgames_search = load_module()
    session = ScriptedSession()

    with pytest.raises(ValueError, match="página"):
        romsgames_search.search_page("Pokemon", page=page, session=session)

    assert session.calls == []


def test_search_suggestions_uses_hint_endpoint_and_exact_contract():
    romsgames_search = load_module()
    payload = [
        {
            "id": 9277,
            "name": "Pokemon: FireRed Version",
            "type": "rom",
            "url": "/gameboy-advance-rom-pokemon-firered-version/",
            "consoleShortTitle": "GBA",
            "thumbnailImageURL": "https://cache.downloadroms.io/fire-red.jpg",
        },
        {
            "id": 45682,
            "name": "Pokemon Feuerrote",
            "type": "rom",
            "url": "/gameboy-advance-rom-pokemon-feuerrote/",
            "consoleShortTitle": "GBA",
            "thumbnailImageURL": "/image/no-cover.png",
        },
    ]
    session = ScriptedSession(
        (DYNAMIC_SEARCH_URL, FakeResponse(text=json.dumps(payload)))
    )

    result = romsgames_search.search_suggestions(
        "  Pokemon Fire  ",
        session=session,
    )

    assert result == [
        {
            "title": "Pokemon: FireRed Version",
            "url": "https://www.romsgames.net/gameboy-advance-rom-pokemon-firered-version/",
            "icon": "https://cache.downloadroms.io/fire-red.jpg",
            "console": "GBA",
            "size": None,
            "downloads": None,
        },
        {
            "title": "Pokemon Feuerrote",
            "url": GAME_2_URL,
            "icon": None,
            "console": "GBA",
            "size": None,
            "downloads": None,
        },
    ]
    assert session.calls[0][1]["params"] == {"q": "Pokemon Fire"}
    assert session.calls[0][1]["allow_redirects"] is False


def test_search_suggestions_ignores_non_rom_and_external_items():
    romsgames_search = load_module()
    payload = [
        {"name": "Emulator", "type": "emulator", "url": "/emulator/"},
        {"name": "Search", "type": "rom", "url": "/search/"},
        {"name": "Malformed", "type": "rom", "url": "https://[bad"},
        {
            "name": "External",
            "type": "rom",
            "url": "https://example.com/private/",
        },
    ]
    session = ScriptedSession(
        (DYNAMIC_SEARCH_URL, FakeResponse(text=json.dumps(payload)))
    )

    assert romsgames_search.search_suggestions("Pokemon", session=session) == []


def test_search_suggestions_keeps_item_with_malformed_icon_as_none():
    romsgames_search = load_module()
    payload = [
        {
            "name": "Pokemon: FireRed Version",
            "type": "rom",
            "url": "/gameboy-advance-rom-pokemon-firered-version/",
            "thumbnailImageURL": "https://[malformed",
        }
    ]
    session = ScriptedSession(
        (DYNAMIC_SEARCH_URL, FakeResponse(text=json.dumps(payload)))
    )

    result = romsgames_search.search_suggestions("Pokemon", session=session)

    assert result[0]["title"] == "Pokemon: FireRed Version"
    assert result[0]["icon"] is None


def test_search_suggestions_wraps_invalid_json():
    romsgames_search = load_module()
    session = ScriptedSession(
        (DYNAMIC_SEARCH_URL, FakeResponse(text="not json"))
    )

    with pytest.raises(
        romsgames_search.RomsGamesSearchError,
        match="resposta inválida",
    ):
        romsgames_search.search_suggestions("Pokemon", session=session)


def test_search_suggestions_rejects_blank_name_without_requesting():
    romsgames_search = load_module()
    session = ScriptedSession()

    with pytest.raises(ValueError, match="nome do jogo"):
        romsgames_search.search_suggestions("  ", session=session)

    assert session.calls == []

