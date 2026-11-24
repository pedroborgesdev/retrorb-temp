import importlib

import pytest
import requests


GAME_URL = "https://romsfun.com/roms/game-boy-advance/pokemon-fire-red.html"
DOWNLOADS_URL = "https://romsfun.com/download/pokemon-fire-red-2454"
AJAX_URL = "https://romsfun.com/wp-admin/admin-ajax.php"

GAME_PAGE_HTML = f"""
<html>
  <img class="rf-hero-thumb"
       src="https://romsfun.com/uploads/pokemon-fire-red-cover.jpg">
  <h1 class="text-romfun-pink">Pokemon Fire Red</h1>
  <div class="rating" data-post_id="2454" data-rateyo-rating="3.5"></div>
  <span>(1,022 reviews)</span>
  <table>
    <tr><td>Release Date</td><td><p>07/09/2004</p></td></tr>
    <tr><td>Publisher</td><td><a>Nintendo</a></td></tr>
    <tr><td>Region</td><td><span class="rf-fl-n">Europe</span>
      <span class="rf-fl-n">Japan</span><span class="rf-fl-n">USA</span></td></tr>
  </table>
  <a href="{DOWNLOADS_URL}"><svg></svg>Download ROM</a>
  <h2>Description</h2>
  <div class="prose"><div class="revert page-content">
    <p>Primeiro parágrafo.</p><p>Segundo <strong>parágrafo</strong>.</p>
  </div><div class="pt-2 w-full"></div></div>
  <div id="romGallery">
    <a data-src="https://romsfun.com/uploads/screenshot-1.jpg"></a>
    <a data-src="https://romsfun.com/uploads/screenshot-2.jpg"></a>
  </div>
</html>
"""

DOWNLOAD_LIST_HTML = """
<h2>Normal download links</h2>
<table><tbody>
  <tr>
    <td><a href="https://romsfun.com/download/pokemon-fire-red-2454/1">
      Pokemon - FireRed Version (USA) <svg></svg></a></td>
    <td>No-Intro</td><td>5M</td>
  </tr>
  <tr>
    <td><a href="https://romsfun.com/download/pokemon-fire-red-2454/2">
      Pokemon - FireRed Version (Rev 1) <svg></svg></a></td>
    <td>Revision</td><td>6M</td>
  </tr>
</tbody></table>
"""

VARIANT_1_HTML = f"""
<div id="download-container" data-ajax-url="{AJAX_URL}">
  <a id="download-link" href="https://statics.romsfun.com/old-1.zip?e=1&s=old">
    Download Now
  </a>
</div>
"""

VARIANT_2_HTML = f"""
<div id="download-container" data-ajax-url="{AJAX_URL}">
  <a id="download-link" href="https://statics.romsfun.com/old-2.zip?e=1&s=old">
    Download Now
  </a>
</div>
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
    return importlib.import_module("romsfun_game_page")


def test_collects_details_images_and_all_direct_downloads():
    romsfun_game_page = load_module()
    variant_1_url = f"{DOWNLOADS_URL}/1"
    variant_2_url = f"{DOWNLOADS_URL}/2"
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(text=GAME_PAGE_HTML)),
        ("GET", DOWNLOADS_URL, FakeResponse(text=DOWNLOAD_LIST_HTML)),
        ("GET", variant_1_url, FakeResponse(text=VARIANT_1_HTML)),
        (
            "POST",
            AJAX_URL,
            FakeResponse(
                payload={
                    "success": True,
                    "data": {"download_url": "https://statics.romsfun.com/fresh-1.zip"},
                }
            ),
        ),
        ("GET", variant_2_url, FakeResponse(text=VARIANT_2_HTML)),
        (
            "POST",
            AJAX_URL,
            FakeResponse(
                payload={
                    "success": True,
                    "data": {"download_url": "https://statics.romsfun.com/fresh-2.zip"},
                }
            ),
        ),
    )

    result = romsfun_game_page.get_game_details(GAME_URL, session=session)

    assert result == {
        "name": "Pokemon Fire Red",
        "description": "Primeiro parágrafo.\n\nSegundo parágrafo.",
        "release_date": "07/09/2004",
        "reviews_count": 1022,
        "stars_rate": 3.5,
        "publisher": "Nintendo",
        "regions": ["Europe", "Japan", "USA"],
        "icon": "https://romsfun.com/uploads/pokemon-fire-red-cover.jpg",
        "screenshots": [
            "https://romsfun.com/uploads/screenshot-1.jpg",
            "https://romsfun.com/uploads/screenshot-2.jpg",
        ],
        "downloads": [
            {
                "filename": "Pokemon - FireRed Version (USA)",
                "type": "No-Intro",
                "size": "5M",
                "download_url": "https://statics.romsfun.com/fresh-1.zip",
            },
            {
                "filename": "Pokemon - FireRed Version (Rev 1)",
                "type": "Revision",
                "size": "6M",
                "download_url": "https://statics.romsfun.com/fresh-2.zip",
            },
        ],
    }
    assert len(session.calls) == 6
    assert session.steps == []
    assert session.calls[3][2]["data"] == {"action": "k_get_download"}
    assert session.calls[3][2]["headers"]["Referer"] == variant_1_url


def test_returns_none_for_every_unavailable_field_without_extra_requests():
    romsfun_game_page = load_module()
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(text="<html></html>")),
    )

    result = romsfun_game_page.get_game_details(GAME_URL, session=session)

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


def test_keeps_page_details_when_download_list_request_fails():
    romsfun_game_page = load_module()
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(text=GAME_PAGE_HTML)),
        (
            "GET",
            DOWNLOADS_URL,
            FakeResponse(error=requests.HTTPError("503 Server Error")),
        ),
    )

    result = romsfun_game_page.get_game_details(GAME_URL, session=session)

    assert result["name"] == "Pokemon Fire Red"
    assert result["downloads"] is None


def test_keeps_download_metadata_when_direct_url_resolution_fails():
    romsfun_game_page = load_module()
    first_row_start = DOWNLOAD_LIST_HTML.find("  <tr>")
    second_row_start = DOWNLOAD_LIST_HTML.find("  <tr>", first_row_start + 1)
    rows_end = DOWNLOAD_LIST_HTML.rfind("</tbody>")
    one_download_html = DOWNLOAD_LIST_HTML.replace(
        DOWNLOAD_LIST_HTML[second_row_start:rows_end],
        "",
    )
    variant_url = f"{DOWNLOADS_URL}/1"
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(text=GAME_PAGE_HTML)),
        ("GET", DOWNLOADS_URL, FakeResponse(text=one_download_html)),
        (
            "GET",
            variant_url,
            FakeResponse(error=requests.HTTPError("503 Server Error")),
        ),
    )

    result = romsfun_game_page.get_game_details(GAME_URL, session=session)

    assert result["downloads"] == [
        {
            "filename": "Pokemon - FireRed Version (USA)",
            "type": "No-Intro",
            "size": "5M",
            "download_url": None,
        }
    ]


def test_ignores_malformed_optional_urls_on_game_page():
    romsfun_game_page = load_module()
    malformed_html = """
    <html>
      <h1>Valid Name</h1>
      <img class="rf-hero-thumb" src="https://[malformed">
      <a href="https://[malformed">Download ROM</a>
      <div id="romGallery">
        <a data-src="https://[malformed"></a>
      </div>
    </html>
    """
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(text=malformed_html)),
    )

    result = romsfun_game_page.get_game_details(GAME_URL, session=session)

    assert result["name"] == "Valid Name"
    assert result["icon"] is None
    assert result["screenshots"] is None
    assert result["downloads"] is None


def test_uses_variant_page_link_when_ajax_data_has_unexpected_shape():
    romsfun_game_page = load_module()
    first_row_start = DOWNLOAD_LIST_HTML.find("  <tr>")
    second_row_start = DOWNLOAD_LIST_HTML.find("  <tr>", first_row_start + 1)
    rows_end = DOWNLOAD_LIST_HTML.rfind("</tbody>")
    one_download_html = DOWNLOAD_LIST_HTML.replace(
        DOWNLOAD_LIST_HTML[second_row_start:rows_end],
        "",
    )
    variant_url = f"{DOWNLOADS_URL}/1"
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(text=GAME_PAGE_HTML)),
        ("GET", DOWNLOADS_URL, FakeResponse(text=one_download_html)),
        ("GET", variant_url, FakeResponse(text=VARIANT_1_HTML)),
        (
            "POST",
            AJAX_URL,
            FakeResponse(payload={"success": True, "data": None}),
        ),
    )

    result = romsfun_game_page.get_game_details(GAME_URL, session=session)

    assert result["downloads"][0]["download_url"] == (
        "https://statics.romsfun.com/old-1.zip?e=1&s=old"
    )


def test_keeps_download_when_columns_and_link_are_missing():
    romsfun_game_page = load_module()
    partial_download_html = """
    <h2>Normal download links</h2>
    <table><tbody>
      <tr><td>Archive without link</td><td>Patch</td></tr>
    </tbody></table>
    """
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(text=GAME_PAGE_HTML)),
        ("GET", DOWNLOADS_URL, FakeResponse(text=partial_download_html)),
    )

    result = romsfun_game_page.get_game_details(GAME_URL, session=session)

    assert result["downloads"] == [
        {
            "filename": "Archive without link",
            "type": "Patch",
            "size": None,
            "download_url": None,
        }
    ]


def test_rejects_non_romsfun_url_before_requesting():
    romsfun_game_page = load_module()
    session = ScriptedSession()

    with pytest.raises(ValueError, match="romsfun.com"):
        romsfun_game_page.get_game_details(
            "https://example.com/game.html",
            session=session,
        )

    assert session.calls == []


def test_uses_variant_page_link_when_ajax_fails():
    romsfun_game_page = load_module()
    first_row_start = DOWNLOAD_LIST_HTML.find("  <tr>")
    second_row_start = DOWNLOAD_LIST_HTML.find("  <tr>", first_row_start + 1)
    rows_end = DOWNLOAD_LIST_HTML.rfind("</tbody>")
    one_download_html = DOWNLOAD_LIST_HTML.replace(
        DOWNLOAD_LIST_HTML[second_row_start:rows_end],
        "",
    )
    variant_url = f"{DOWNLOADS_URL}/1"
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(text=GAME_PAGE_HTML)),
        ("GET", DOWNLOADS_URL, FakeResponse(text=one_download_html)),
        ("GET", variant_url, FakeResponse(text=VARIANT_1_HTML)),
        (
            "POST",
            AJAX_URL,
            FakeResponse(error=requests.HTTPError("503 Server Error")),
        ),
    )

    result = romsfun_game_page.get_game_details(GAME_URL, session=session)

    assert result["downloads"][0]["download_url"] == (
        "https://statics.romsfun.com/old-1.zip?e=1&s=old"
    )


def test_rejects_redirect_before_following_external_destination():
    romsfun_game_page = load_module()
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(status_code=302)),
    )

    with pytest.raises(romsfun_game_page.RomsFunGamePageError):
        romsfun_game_page.get_game_details(GAME_URL, session=session)

    assert len(session.calls) == 1
    assert session.calls[0][2]["allow_redirects"] is False
