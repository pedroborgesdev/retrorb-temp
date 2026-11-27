import importlib
import json

import pytest
import requests


BROWSE_URL = "https://romsfun.com/browse-all-roms/"
DYNAMIC_SEARCH_URL = "https://romsfun.com/api/search"
GAME_URL = (
    "https://romsfun.com/roms/game-boy-advance/"
    "pokemon-fire-red.html"
)

BROWSE_RESULTS_HTML = f"""
<div class="rf-res-list space-y-4">
  <div class="rf-li bg-white rounded-xl shadow-md transition">
    <div class="rf-li-top">
      <a href="{GAME_URL}" class="rf-li-th">
        <img src="https://romsfun.com/uploads/pokemon-fire-red.jpg"
             alt="Pokemon Fire Red" loading="lazy">
      </a>
      <div class="rf-li-mid">
        <h3 class="rf-li-title">
          <a href="{GAME_URL}">Pokemon Fire Red</a>
        </h3>
        <div class="rf-li-stats rf-li-stats-m">
          <span class="badge badge-info text-xs">
            <span><svg><path></path></svg></span>180,509
          </span>
          <span class="badge badge-info text-xs inline-flex">
            <span><svg><path></path></svg></span>5M
          </span>
        </div>
      </div>
    </div>
  </div>
</div>
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
    return importlib.import_module("romsfun_search")


def test_search_uses_submitted_browse_page_and_returns_exact_contract():
    romsfun_search = load_module()
    session = RecordingSession(FakeResponse(text=BROWSE_RESULTS_HTML))

    result = romsfun_search.search_games(
        "  Pokémon Fire Red  ",
        session=session,
    )

    assert result == [
        {
            "title": "Pokemon Fire Red",
            "url": GAME_URL,
            "icon": "https://romsfun.com/uploads/pokemon-fire-red.jpg",
            "console": "Game Boy Advance",
            "size": "5M",
            "downloads": 180509,
        }
    ]
    assert len(session.calls) == 1
    url, options = session.calls[0]
    assert url == BROWSE_URL
    assert options["params"] == {"q": "Pokémon Fire Red", "sort": "downloads"}
    assert options["timeout"] == 15
    assert options["allow_redirects"] is False


def test_search_rejects_blank_name_without_requesting():
    romsfun_search = load_module()
    session = RecordingSession()

    with pytest.raises(ValueError, match="nome do jogo"):
        romsfun_search.search_games("   ", session=session)

    assert session.calls == []


def test_search_wraps_http_errors():
    romsfun_search = load_module()
    session = RecordingSession(
        FakeResponse(error=requests.HTTPError("503 Server Error"))
    )

    with pytest.raises(
        romsfun_search.RomsFunSearchError,
        match="Não foi possível pesquisar no RomsFun",
    ):
        romsfun_search.search_games("Metroid", session=session)


def test_search_returns_empty_list_when_nothing_is_found():
    romsfun_search = load_module()
    session = RecordingSession(FakeResponse(text="<html>Nenhum jogo</html>"))

    assert romsfun_search.search_games("jogo inexistente", session=session) == []


def test_search_sets_missing_card_fields_to_none():
    romsfun_search = load_module()
    html = f"""
    <div class="rf-li bg-white">
      <h3 class="rf-li-title"><a href="{GAME_URL}">Mystery Game</a></h3>
    </div>
    """
    session = RecordingSession(FakeResponse(text=html))

    assert romsfun_search.search_games("Mystery", session=session) == [
        {
            "title": "Mystery Game",
            "url": GAME_URL,
            "icon": None,
            "console": "Game Boy Advance",
            "size": None,
            "downloads": None,
        }
    ]


def test_search_keeps_size_when_download_count_is_missing():
    romsfun_search = load_module()
    html = f"""
    <div class="rf-li bg-white">
      <h3 class="rf-li-title"><a href="{GAME_URL}">Mystery Game</a></h3>
      <div class="rf-li-stats rf-li-stats-m"><span>5.14 M</span></div>
    </div>
    """
    session = RecordingSession(FakeResponse(text=html))

    result = romsfun_search.search_games("Mystery", session=session)

    assert result[0]["downloads"] is None
    assert result[0]["size"] == "5.14 M"


def test_search_does_not_mix_footer_data_into_last_card():
    romsfun_search = load_module()
    html = f"""
    <div class="rf-li bg-white">
      <h3 class="rf-li-title"><a href="{GAME_URL}">Mystery Game</a></h3>
    </div>
    <footer>
      <img src="https://romsfun.com/footer.jpg">
      <div class="rf-li-stats rf-li-stats-m"><span>999</span><span>9G</span></div>
    </footer>
    """
    session = RecordingSession(FakeResponse(text=html))

    result = romsfun_search.search_games("Mystery", session=session)

    assert result[0]["icon"] is None
    assert result[0]["downloads"] is None
    assert result[0]["size"] is None


def test_search_ignores_external_result_urls():
    romsfun_search = load_module()
    html = BROWSE_RESULTS_HTML.replace(GAME_URL, "https://example.com/game")
    session = RecordingSession(FakeResponse(text=html))

    assert romsfun_search.search_games("Pokemon", session=session) == []


def test_search_ignores_malformed_result_url_without_failing():
    romsfun_search = load_module()
    html = BROWSE_RESULTS_HTML.replace(GAME_URL, "https://[malformed")
    session = RecordingSession(FakeResponse(text=html))

    assert romsfun_search.search_games("Pokemon", session=session) == []


def test_search_rejects_redirect_without_following_it():
    romsfun_search = load_module()
    session = RecordingSession(FakeResponse(status_code=302))

    with pytest.raises(romsfun_search.RomsFunSearchError):
        romsfun_search.search_games("Pokemon", session=session)

    assert session.calls[0][1]["allow_redirects"] is False


def test_search_page_uses_numbered_path_and_reports_next_page():
    romsfun_search = load_module()
    html = BROWSE_RESULTS_HTML + """
    <nav aria-label="Pagination">
      <a aria-label="Next"
         href="https://romsfun.com/browse-all-roms/page/3/?q=Pokemon#roms">
        Next
      </a>
    </nav>
    """
    session = RecordingSession(FakeResponse(text=html))

    result = romsfun_search.search_page("Pokemon", page=2, session=session)

    assert result == {
        "results": [
            {
                "title": "Pokemon Fire Red",
                "url": GAME_URL,
                "icon": "https://romsfun.com/uploads/pokemon-fire-red.jpg",
                "console": "Game Boy Advance",
                "size": "5M",
                "downloads": 180509,
            }
        ],
        "page": 2,
        "has_next": True,
    }
    url, options = session.calls[0]
    assert url == "https://romsfun.com/browse-all-roms/page/2/"
    assert options["params"] == {"q": "Pokemon", "sort": "downloads"}


def test_search_page_reports_last_page_without_next_link():
    romsfun_search = load_module()
    session = RecordingSession(FakeResponse(text=BROWSE_RESULTS_HTML))

    result = romsfun_search.search_page("Pokemon", page=2, session=session)

    assert result["page"] == 2
    assert result["has_next"] is False


@pytest.mark.parametrize("page", [0, -1, 1.5, "2", True])
def test_search_page_rejects_invalid_page_without_requesting(page):
    romsfun_search = load_module()
    session = RecordingSession()

    with pytest.raises(ValueError, match="página"):
        romsfun_search.search_page("Pokemon", page=page, session=session)

    assert session.calls == []


def test_search_suggestions_uses_dynamic_endpoint_and_exact_contract():
    romsfun_search = load_module()
    payload = [
        {
            "title": "Pokémon FireRed Version",
            "url": GAME_URL,
            "icon": "https://romsfun.com/uploads/fire-red.jpg",
            "console": "GBA",
            "size": "5.08MB",
        }
    ]
    session = RecordingSession(FakeResponse(text=json.dumps(payload)))

    result = romsfun_search.search_suggestions(
        "  Pokémon Fire  ",
        session=session,
    )

    assert result == [
        {
            "title": "Pokémon FireRed Version",
            "url": GAME_URL,
            "icon": "https://romsfun.com/uploads/fire-red.jpg",
            "console": "GBA",
            "size": "5.08MB",
            "downloads": None,
        }
    ]
    url, options = session.calls[0]
    assert url == DYNAMIC_SEARCH_URL
    assert options["params"] == {"s": "Pokémon Fire"}
    assert options["allow_redirects"] is False


def test_search_suggestions_ignores_malformed_and_external_items():
    romsfun_search = load_module()
    payload = [
        None,
        {"title": "Missing URL"},
        {"title": "Malformed", "url": "https://[malformed"},
        {"title": "External", "url": "https://example.com/roms/game"},
    ]
    session = RecordingSession(FakeResponse(text=json.dumps(payload)))

    assert romsfun_search.search_suggestions("Pokemon", session=session) == []


def test_search_suggestions_keeps_item_with_malformed_icon_as_none():
    romsfun_search = load_module()
    payload = [
        {
            "title": "Pokemon Fire Red",
            "url": GAME_URL,
            "icon": "https://[malformed",
        }
    ]
    session = RecordingSession(FakeResponse(text=json.dumps(payload)))

    result = romsfun_search.search_suggestions("Pokemon", session=session)

    assert result[0]["title"] == "Pokemon Fire Red"
    assert result[0]["icon"] is None
    assert result[0]["console"] == "Game Boy Advance"


@pytest.mark.parametrize(
    ("slug", "expected"),
    [
        ("game-boy", "Game Boy"),
        ("nintendo-ds", "Nintendo DS"),
        ("nintendo-3ds", "Nintendo 3DS"),
        ("playstation-portable", "PlayStation Portable"),
        ("sega-master-system", "Sega Master System"),
    ],
)
def test_search_derives_console_from_game_url(slug, expected):
    romsfun_search = load_module()
    game_url = f"https://romsfun.com/roms/{slug}/example.html"
    html = f"""
    <div class="rf-li bg-white">
      <h3 class="rf-li-title"><a href="{game_url}">Example</a></h3>
    </div>
    """
    session = RecordingSession(FakeResponse(text=html))

    result = romsfun_search.search_games("Example", session=session)

    assert result[0]["console"] == expected


def test_search_suggestions_wraps_invalid_json():
    romsfun_search = load_module()
    session = RecordingSession(FakeResponse(text="not json"))

    with pytest.raises(
        romsfun_search.RomsFunSearchError,
        match="resposta inválida",
    ):
        romsfun_search.search_suggestions("Pokemon", session=session)


def test_search_suggestions_rejects_blank_name_without_requesting():
    romsfun_search = load_module()
    session = RecordingSession()

    with pytest.raises(ValueError, match="nome do jogo"):
        romsfun_search.search_suggestions("  ", session=session)

    assert session.calls == []
