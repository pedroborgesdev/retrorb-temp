import importlib

import pytest
import requests


SEARCH_URL = "https://romspure.cc/browse-roms/"
GAME_1_URL = (
    "https://romspure.cc/roms/nintendo-game-boy/pokemon-green-version-279/"
)
GAME_2_URL = "https://romspure.cc/roms/nintendo-ds/pokemon-blaze-black/"

SEARCH_HTML = f"""
<article class="rom-item shadow-sm group/item">
  <a href="{GAME_1_URL}" class="max-w-[100%] block">
    <img src="https://romspure.cc/uploads/pokemon-green-300x300.jpg"
         alt="Pokemon Green Version">
    <span class="bg-brand-goldlight text-brand-dark">Nintendo Game Boy</span>
    <h3 class="truncate font-bold">Pokemon Green Version</h3>
    <span class="text-xs text-brand-muted truncate">Nintendo Game Boy</span>
    <span class="hidden group-data-[view=list]/view:inline-block font-semibold text-brand-text text-sm min-w-[24px] text-center">
      366.11 K
    </span>
    <span class="hidden group-data-[view=list]/view:inline-flex items-center gap-1 text-xs text-brand-muted min-w-[40px]">
      <svg></svg>1.7K
    </span>
  </a>
</article>
<article class="rom-item shadow-sm group/item">
  <a href="{GAME_2_URL}" class="max-w-[100%] block">
    <div>No image</div>
    <span class="bg-brand-goldlight text-brand-dark">Nintendo DS</span>
    <h3 class="truncate font-bold">Pokemon Blaze Black</h3>
    <span class="text-xs text-brand-muted truncate">Nintendo DS</span>
    <span class="hidden group-data-[view=list]/view:inline-block font-semibold text-brand-text text-sm min-w-[24px] text-center">
      107.63 M
    </span>
    <span class="hidden group-data-[view=list]/view:inline-flex items-center gap-1 text-xs text-brand-muted min-w-[40px]">
      <svg></svg>383
    </span>
  </a>
</article>
"""

GAME_WITH_COUNT = """
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "VideoGame",
  "name": "Pokemon Green Version",
  "interactionStatistic": {
    "@type": "InteractionCounter",
    "interactionType": {"@type": "DownloadAction"},
    "userInteractionCount": 1654
  }
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
    return importlib.import_module("romspure_search")


def test_search_returns_exact_schema_and_enriches_exact_download_count():
    romspure_search = load_module()
    session = ScriptedSession(
        (SEARCH_URL, FakeResponse(text=SEARCH_HTML)),
        (GAME_1_URL, FakeResponse(text=GAME_WITH_COUNT)),
        (GAME_2_URL, FakeResponse(text="<html>No structured count</html>")),
    )

    result = romspure_search.search_games(
        "  Pokémon Fire Red  ",
        session=session,
    )

    assert result == [
        {
            "title": "Pokemon Green Version",
            "url": GAME_1_URL,
            "icon": "https://romspure.cc/uploads/pokemon-green-300x300.jpg",
            "console": "Nintendo Game Boy",
            "size": "366.11 K",
            "downloads": 1654,
        },
        {
            "title": "Pokemon Blaze Black",
            "url": GAME_2_URL,
            "icon": None,
            "console": "Nintendo DS",
            "size": "107.63 M",
            "downloads": None,
        },
    ]
    assert session.steps == []
    assert session.calls[0][1]["params"] == {
        "q": "Pokémon Fire Red",
        "sort": "popular",
    }
    assert session.calls[0][1]["timeout"] == 15


def test_search_keeps_result_when_download_enrichment_request_fails():
    romspure_search = load_module()
    one_result_html = SEARCH_HTML[: SEARCH_HTML.find("<article", 10)]
    session = ScriptedSession(
        (SEARCH_URL, FakeResponse(text=one_result_html)),
        (
            GAME_1_URL,
            FakeResponse(error=requests.HTTPError("503 Server Error")),
        ),
    )

    result = romspure_search.search_games("Pokemon", session=session)

    assert result[0]["downloads"] is None


def test_search_rejects_blank_name_without_requesting():
    romspure_search = load_module()
    session = ScriptedSession()

    with pytest.raises(ValueError, match="nome do jogo"):
        romspure_search.search_games("   ", session=session)

    assert session.calls == []


def test_search_wraps_primary_http_error():
    romspure_search = load_module()
    session = ScriptedSession(
        (
            SEARCH_URL,
            FakeResponse(error=requests.HTTPError("503 Server Error")),
        )
    )

    with pytest.raises(
        romspure_search.RomsPureSearchError,
        match="Não foi possível pesquisar no RomsPure",
    ):
        romspure_search.search_games("Metroid", session=session)


def test_search_ignores_external_result_urls_in_untrusted_html():
    romspure_search = load_module()
    malicious_html = SEARCH_HTML.replace(
        GAME_1_URL,
        "https://example.com/roms/internal-service/",
    )
    first_result_only = malicious_html[: malicious_html.find("<article", 10)]
    session = ScriptedSession(
        (SEARCH_URL, FakeResponse(text=first_result_only)),
    )

    assert romspure_search.search_games("Pokemon", session=session) == []
    assert session.steps == []


def test_search_rejects_redirect_without_following_it():
    romspure_search = load_module()
    session = ScriptedSession(
        (SEARCH_URL, FakeResponse(status_code=302)),
    )

    with pytest.raises(romspure_search.RomsPureSearchError):
        romspure_search.search_games("Pokemon", session=session)

    assert session.calls[0][1]["allow_redirects"] is False


def test_search_stops_enrichment_after_budget(monkeypatch):
    romspure_search = load_module()
    times = iter([0.0, 0.0, 19.0])
    monkeypatch.setattr(romspure_search, "monotonic", times.__next__)
    one_result_html = SEARCH_HTML[: SEARCH_HTML.find("<article", 10)]
    session = ScriptedSession((SEARCH_URL, FakeResponse(text=one_result_html)))

    result = romspure_search.search_games("Pokemon", session=session)

    assert result[0]["downloads"] is None
    assert len(session.calls) == 1


def test_search_page_uses_numbered_path_and_reports_next_page():
    romspure_search = load_module()
    page_html = """
    <nav aria-label="Pagination">
      <a class="next page-numbers"
         href="https://romspure.cc/browse-roms/page/3/?q=Pokemon&amp;sort=popular">
        Next
      </a>
    </nav>
    """
    page_two_url = "https://romspure.cc/browse-roms/page/2/"
    session = ScriptedSession((page_two_url, FakeResponse(text=page_html)))

    result = romspure_search.search_page("Pokemon", page=2, session=session)

    assert result == {"results": [], "page": 2, "has_next": True}
    assert session.calls[0][1]["params"] == {
        "q": "Pokemon",
        "sort": "popular",
    }


def test_search_page_reports_last_page_without_next_link():
    romspure_search = load_module()
    page_two_url = "https://romspure.cc/browse-roms/page/2/"
    session = ScriptedSession((page_two_url, FakeResponse(text="<html></html>")))

    result = romspure_search.search_page("Pokemon", page=2, session=session)

    assert result["has_next"] is False


@pytest.mark.parametrize("page", [0, -1, 1.5, "2", True])
def test_search_page_rejects_invalid_page_without_requesting(page):
    romspure_search = load_module()
    session = ScriptedSession()

    with pytest.raises(ValueError, match="página"):
        romspure_search.search_page("Pokemon", page=page, session=session)

    assert session.calls == []

