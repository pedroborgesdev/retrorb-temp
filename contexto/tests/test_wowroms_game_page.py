import importlib

import pytest
import requests


GAME_URL = (
    "https://wowroms.com/en/roms/nintendo-gameboy/"
    "pokemon-versione-rossa-italy-sgb-enhanced/9924.html"
)
DOWNLOAD_PAGE_URL = (
    "https://wowroms.com/en/roms/nintendo-gameboy/"
    "download-pokemon-versione-rossa-italy-sgb-enhanced/9924.html"
)
AJAX_URL = (
    "https://wowroms.com/en/emulators-roms/download/9924/"
    "Pokemon%2B-%2BVersione%2BRossa%2B%2528Italy%2529%2B%2528SGB%2BEnhanced%2529"
)
DIRECT_URL = "https://dwfiles.wowroms.com/file"
DESCRIPTION = (
    "Pokemon - Versione Rossa (Italy) (SGB Enhanced) rom for Nintendo "
    "Gameboy (GB) and play Pokemon on your devices"
)

GAME_PAGE_HTML = f"""
<html>
  <meta name="description" content="{DESCRIPTION}">
  <div id="product-image">
    <img class="img-responsive image-fly imgborder"
         src="https://wowroms-photos.com/emulators-roms-logo/26/9924/420-420/Pokemon---Versione-Rossa-(Italy)-(SGB-Enhanced).jpg">
  </div>
  <h1 id="page-product-title" class="gameTitle">
    Pokemon - Versione Rossa (Italy) (SGB Enhanced)
  </h1>
  <li class="vendor borderbottom"><span>File Name</span><br>
    <b>Pokemon - Versione Rossa (Italy) (SGB Enhanced).zip</b>
  </li>
  <li class="vendor borderbottom"><span>File Size :</span>
    <b>370,52 kb</b>
  </li>
  <li class="vendor borderbottom"><span>Year :</span><b>0</b></li>
  <li class="vendor borderbottom"><span>Region :</span>
    <b><img src="italy.jpg"> Italy</b>
  </li>
  <a class="btn btnDwn" href="{DOWNLOAD_PAGE_URL}">Download rom</a>
  <script>var ajaxLinkUrl = "{AJAX_URL}";</script>
</html>
"""


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
    return importlib.import_module("wowroms_game_page")


def test_collects_optional_details_and_resolves_direct_download(monkeypatch):
    wowroms_game_page = load_module()
    monkeypatch.setattr(
        wowroms_game_page,
        "_timestamp_ms",
        lambda: 1795323958625,
    )
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(text=GAME_PAGE_HTML)),
        (
            "POST",
            AJAX_URL,
            FakeResponse(payload={"s": True, "link": DIRECT_URL}),
        ),
    )

    result = wowroms_game_page.get_game_details(GAME_URL, session=session)

    assert result == {
        "name": "Pokemon - Versione Rossa (Italy) (SGB Enhanced)",
        "description": DESCRIPTION,
        "release_date": None,
        "reviews_count": None,
        "stars_rate": None,
        "publisher": None,
        "regions": ["Italy"],
        "icon": (
            "https://wowroms-photos.com/emulators-roms-logo/26/9924/"
            "420-420/Pokemon---Versione-Rossa-(Italy)-(SGB-Enhanced).jpg"
        ),
        "screenshots": None,
        "downloads": [
            {
                "filename": (
                    "Pokemon - Versione Rossa (Italy) (SGB Enhanced).zip"
                ),
                "type": None,
                "size": "370,52 kb",
                "download_url": DIRECT_URL,
            }
        ],
    }
    assert len(session.calls) == 2
    method, url, options = session.calls[1]
    assert (method, url) == ("POST", AJAX_URL)
    assert options["params"] == {
        "k": "1795323958625",
        "t": "80e6589ff3db22f9a43a28e8e3ecc0ca",
    }
    assert options["headers"]["X-Requested-With"] == "XMLHttpRequest"
    assert options["allow_redirects"] is False
    assert session.steps == []


def test_returns_none_for_every_unavailable_field_without_extra_requests():
    wowroms_game_page = load_module()
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(text="<html></html>")),
    )

    result = wowroms_game_page.get_game_details(GAME_URL, session=session)

    assert result == {
        "name": None,
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
    assert session.steps == []
    assert len(session.calls) == 1


def test_normalizes_unknown_year_and_region_to_none():
    wowroms_game_page = load_module()
    html = """
    <h1 id="page-product-title">Unknown Game</h1>
    <li><span>Year :</span><b>0</b></li>
    <li><span>Region :</span><b>Unknown</b></li>
    """
    session = ScriptedSession(("GET", GAME_URL, FakeResponse(text=html)))

    result = wowroms_game_page.get_game_details(GAME_URL, session=session)

    assert result["release_date"] is None
    assert result["regions"] is None


@pytest.mark.parametrize(
    "ajax_response",
    [
        FakeResponse(error=requests.HTTPError("503 Server Error")),
        FakeResponse(payload=["unexpected"]),
        FakeResponse(payload={"s": False, "link": DIRECT_URL}),
        FakeResponse(payload={"s": True, "link": "javascript:alert(1)"}),
    ],
)
def test_keeps_download_metadata_when_ajax_resolution_fails(
    monkeypatch,
    ajax_response,
):
    wowroms_game_page = load_module()
    monkeypatch.setattr(wowroms_game_page, "_timestamp_ms", lambda: 1)
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(text=GAME_PAGE_HTML)),
        ("POST", AJAX_URL, ajax_response),
    )

    result = wowroms_game_page.get_game_details(GAME_URL, session=session)

    assert result["downloads"] == [
        {
            "filename": "Pokemon - Versione Rossa (Italy) (SGB Enhanced).zip",
            "type": None,
            "size": "370,52 kb",
            "download_url": None,
        }
    ]


def test_uses_download_page_as_ajax_url_fallback(monkeypatch):
    wowroms_game_page = load_module()
    monkeypatch.setattr(wowroms_game_page, "_timestamp_ms", lambda: 2)
    game_html_without_ajax = GAME_PAGE_HTML.replace(
        f'<script>var ajaxLinkUrl = "{AJAX_URL}";</script>',
        "",
    )
    download_page_html = f'<script>var ajaxLinkUrl = "{AJAX_URL}";</script>'
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(text=game_html_without_ajax)),
        ("GET", DOWNLOAD_PAGE_URL, FakeResponse(text=download_page_html)),
        (
            "POST",
            AJAX_URL,
            FakeResponse(payload={"s": True, "link": DIRECT_URL}),
        ),
    )

    result = wowroms_game_page.get_game_details(GAME_URL, session=session)

    assert result["downloads"][0]["download_url"] == DIRECT_URL
    assert session.calls[1][2]["headers"]["Referer"] == GAME_URL
    assert session.calls[2][2]["headers"]["Referer"] == DOWNLOAD_PAGE_URL
    assert session.steps == []


def test_keeps_details_when_download_page_fallback_fails():
    wowroms_game_page = load_module()
    game_html_without_ajax = GAME_PAGE_HTML.replace(
        f'<script>var ajaxLinkUrl = "{AJAX_URL}";</script>',
        "",
    )
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(text=game_html_without_ajax)),
        (
            "GET",
            DOWNLOAD_PAGE_URL,
            FakeResponse(error=requests.HTTPError("503 Server Error")),
        ),
    )

    result = wowroms_game_page.get_game_details(GAME_URL, session=session)

    assert result["name"] == "Pokemon - Versione Rossa (Italy) (SGB Enhanced)"
    assert result["downloads"][0]["download_url"] is None
    assert session.steps == []


def test_rejects_non_wowroms_url_before_requesting():
    wowroms_game_page = load_module()
    session = ScriptedSession()

    with pytest.raises(ValueError, match="wowroms.com"):
        wowroms_game_page.get_game_details(
            "https://example.com/game.html",
            session=session,
        )

    assert session.calls == []


def test_rejects_backslash_authority_bypass_before_requesting():
    wowroms_game_page = load_module()
    session = ScriptedSession()

    with pytest.raises(ValueError, match="wowroms.com"):
        wowroms_game_page.get_game_details(
            "https://169.254.169.254\\@wowroms.com/game.html",
            session=session,
        )

    assert session.calls == []


def test_rejects_backslash_ajax_url_without_secondary_request():
    wowroms_game_page = load_module()
    malicious_ajax = (
        "https://169.254.169.254\\@wowroms.com/en/emulators-roms/download/1"
    )
    html = GAME_PAGE_HTML.replace(AJAX_URL, malicious_ajax)
    session = ScriptedSession(("GET", GAME_URL, FakeResponse(text=html)))

    result = wowroms_game_page.get_game_details(GAME_URL, session=session)

    assert result["downloads"][0]["download_url"] is None
    assert len(session.calls) == 1
    assert session.steps == []


def test_rejects_backslash_download_page_without_secondary_request():
    wowroms_game_page = load_module()
    malicious_page = (
        "https://169.254.169.254\\@wowroms.com/en/roms/download/game.html"
    )
    html = GAME_PAGE_HTML.replace(AJAX_URL, "").replace(
        DOWNLOAD_PAGE_URL,
        malicious_page,
    )
    session = ScriptedSession(("GET", GAME_URL, FakeResponse(text=html)))

    result = wowroms_game_page.get_game_details(GAME_URL, session=session)

    assert result["downloads"][0]["download_url"] is None
    assert len(session.calls) == 1
    assert session.steps == []


def test_empty_metadata_does_not_borrow_next_field_value():
    wowroms_game_page = load_module()
    html = """
    <h1 id="page-product-title">Partial Game</h1>
    <li><span>File Name</span></li>
    <li><span>File Size :</span><b>370 kb</b></li>
    <li><span>Year :</span></li>
    <li><span>Region :</span><b>Italy</b></li>
    """
    session = ScriptedSession(("GET", GAME_URL, FakeResponse(text=html)))

    result = wowroms_game_page.get_game_details(GAME_URL, session=session)

    assert result["release_date"] is None
    assert result["regions"] == ["Italy"]
    assert result["downloads"] == [
        {
            "filename": None,
            "type": None,
            "size": "370 kb",
            "download_url": None,
        }
    ]


def test_wraps_primary_game_page_http_error():
    wowroms_game_page = load_module()
    session = ScriptedSession(
        (
            "GET",
            GAME_URL,
            FakeResponse(error=requests.HTTPError("503 Server Error")),
        ),
    )

    with pytest.raises(
        wowroms_game_page.WowRomsGamePageError,
        match="Não foi possível abrir a página do jogo no WowRoms",
    ):
        wowroms_game_page.get_game_details(GAME_URL, session=session)


def test_rejects_redirect_without_following_it():
    wowroms_game_page = load_module()
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(status_code=302)),
    )

    with pytest.raises(wowroms_game_page.WowRomsGamePageError):
        wowroms_game_page.get_game_details(GAME_URL, session=session)

    assert session.calls[0][2]["allow_redirects"] is False

