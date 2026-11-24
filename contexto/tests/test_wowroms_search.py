import importlib
import json

import pytest
import requests


LIST_URL = "https://wowroms.com/en/roms/list"
GAME_URL = (
    "https://wowroms.com/en/roms/nintendo-gameboy/"
    "pokemon-versione-rossa-italy-sgb-enhanced/9924.html"
)

SEARCH_RESULT_HTML = """
<ul class="list-unstyled isotope ulromlist">
  <li class="element first col-xs-24 col-md-8 borderp"
      data-alpha="Pokemon - Versione Rossa (Italy) (SGB Enhanced)">
    <ul class="row-container list-unstyled clearfix">
      <li class="row-left col-xs-10 col-md-10">
        <a href="/en/roms/nintendo-gameboy/pokemon-versione-rossa-italy-sgb-enhanced/9924.html"
           class="hoverBorder">
          <img src="/images/photo.jpg"
               data-src="https://wowroms-photos.com/emulators-roms-logo/26/9924/111-111/Pokemon---Versione-Rossa-(Italy)-(SGB-Enhanced).jpg">
        </a>
      </li>
      <li class="row-right text-left">
        <div class="group_info">
          <a class="title-5 heighta"
             title="Pokemon - Versione Rossa (Italy) (SGB Enhanced)"
             href="/en/roms/nintendo-gameboy/pokemon-versione-rossa-italy-sgb-enhanced/9924.html">
            Pokemon - Versione Rossa (Ital
          </a>
          <a class="col-title colorRed" href="/en/roms/list/Nintendo%2BGameboy">
            <img src="console.jpg"> Nintendo Gameboy
          </a>
          <a class="col-title" href="#">File Size : <b>370,52 kb</b></a>
          <a class="col-title" href="#">Downlaod : <b>78795</b></a>
        </div>
      </li>
    </ul>
  </li>
</ul>
"""


class FakeResponse:
    def __init__(self, *, text="", error=None, status_code=200):
        self.text = text
        self.error = error
        self.status_code = status_code

    def raise_for_status(self):
        if self.error is not None:
            raise self.error


class RecordingSession:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self.responses.pop(0)


def load_module():
    return importlib.import_module("wowroms_search")


def test_search_returns_exact_contract_from_submitted_list():
    wowroms_search = load_module()
    session = RecordingSession(FakeResponse(text=SEARCH_RESULT_HTML))

    result = wowroms_search.search_games("  pokemon  ", session=session)

    assert result == [
        {
            "title": "Pokemon - Versione Rossa (Italy) (SGB Enhanced)",
            "url": GAME_URL,
            "icon": (
                "https://wowroms-photos.com/emulators-roms-logo/26/9924/"
                "111-111/Pokemon---Versione-Rossa-(Italy)-(SGB-Enhanced).jpg"
            ),
            "console": "Nintendo Gameboy",
            "size": "370,52 kb",
            "downloads": 78795,
        }
    ]
    assert len(session.calls) == 1
    url, options = session.calls[0]
    assert url == LIST_URL
    assert options["params"] == {"search": "pokemon"}
    assert options["timeout"] == 15
    assert options["allow_redirects"] is False


def test_search_page_sends_page_and_detects_exact_next_page():
    wowroms_search = load_module()
    html = SEARCH_RESULT_HTML + """
    <div class="pagination title-3 clearfix">
      <ul class="top-paginate">
        <li class="next"><a href="?search=pokemon&page=3">&gt;</a></li>
      </ul>
    </div>
    """
    session = RecordingSession(FakeResponse(text=html))

    result = wowroms_search.search_page("pokemon", page=2, session=session)

    assert result["page"] == 2
    assert result["has_next"] is True
    assert result["results"][0]["url"] == GAME_URL
    assert session.calls[0][1]["params"] == {"search": "pokemon", "page": 2}


def test_search_page_reports_last_page_without_next_link():
    wowroms_search = load_module()
    session = RecordingSession(FakeResponse(text=SEARCH_RESULT_HTML))

    result = wowroms_search.search_page("pokemon", page=3, session=session)

    assert result["has_next"] is False


def test_search_sets_unavailable_card_fields_to_none():
    wowroms_search = load_module()
    html = f"""
    <li class="element" data-alpha="Unknown Game">
      <a class="title-5" title="Unknown Game" href="{GAME_URL}">Unknown</a>
    </li>
    """
    session = RecordingSession(FakeResponse(text=html))

    result = wowroms_search.search_games("Unknown", session=session)

    assert result == [
        {
            "title": "Unknown Game",
            "url": GAME_URL,
            "icon": None,
            "console": None,
            "size": None,
            "downloads": None,
        }
    ]


@pytest.mark.parametrize(
    "href",
    ["https://example.com/en/roms/game/1.html", "https://[malformed"],
)
def test_search_ignores_external_or_malformed_result_url(href):
    wowroms_search = load_module()
    html = f"""
    <li class="element">
      <a class="title-5" title="Unsafe" href="{href}">Unsafe</a>
    </li>
    """
    session = RecordingSession(FakeResponse(text=html))

    assert wowroms_search.search_games("Unsafe", session=session) == []


def test_search_rejects_backslash_authority_bypass():
    wowroms_search = load_module()
    malicious_url = (
        "https://169.254.169.254\\@wowroms.com/en/roms/private/1.html"
    )
    html = f"""
    <li class="element">
      <a class="title-5" title="Unsafe" href="{malicious_url}">Unsafe</a>
    </li>
    """
    session = RecordingSession(FakeResponse(text=html))

    assert wowroms_search.search_games("Unsafe", session=session) == []


def test_search_recovers_valid_card_after_unclosed_card():
    wowroms_search = load_module()
    malformed_card = """
    <li class="element">
      <a class="title-5" title="Broken" href="https://[malformed">Broken</a>
    """
    session = RecordingSession(
        FakeResponse(text=malformed_card + SEARCH_RESULT_HTML)
    )

    result = wowroms_search.search_games("Pokemon", session=session)

    assert [item["url"] for item in result] == [GAME_URL]


def test_search_returns_empty_list_when_nothing_is_found():
    wowroms_search = load_module()
    session = RecordingSession(FakeResponse(text="<html>No ROMs</html>"))

    assert wowroms_search.search_games("missing", session=session) == []


def test_search_rejects_blank_name_without_requesting():
    wowroms_search = load_module()
    session = RecordingSession()

    with pytest.raises(ValueError, match="nome do jogo"):
        wowroms_search.search_games("   ", session=session)

    assert session.calls == []


@pytest.mark.parametrize("page", [0, -1, 1.5, "2", True])
def test_search_page_rejects_invalid_page_without_requesting(page):
    wowroms_search = load_module()
    session = RecordingSession()

    with pytest.raises(ValueError, match="página"):
        wowroms_search.search_page("Pokemon", page=page, session=session)

    assert session.calls == []


def test_search_wraps_primary_http_error():
    wowroms_search = load_module()
    session = RecordingSession(
        FakeResponse(error=requests.HTTPError("503 Server Error"))
    )

    with pytest.raises(
        wowroms_search.WowRomsSearchError,
        match="Não foi possível pesquisar no WowRoms",
    ):
        wowroms_search.search_games("Pokemon", session=session)


def test_search_rejects_redirect_without_following_it():
    wowroms_search = load_module()
    session = RecordingSession(FakeResponse(status_code=302))

    with pytest.raises(wowroms_search.WowRomsSearchError):
        wowroms_search.search_games("Pokemon", session=session)

    assert session.calls[0][1]["allow_redirects"] is False


def test_main_searches_configured_name_and_prints_json(monkeypatch, capsys):
    wowroms_search = load_module()
    expected = [{"title": "Configured Game"}]
    monkeypatch.setattr(wowroms_search, "GAME_NAME", "Configured")
    monkeypatch.setattr(
        wowroms_search,
        "search_games",
        lambda game_name: expected if game_name == "Configured" else [],
    )

    exit_code = wowroms_search.main()

    assert exit_code == 0
    assert json.loads(capsys.readouterr().out) == expected

