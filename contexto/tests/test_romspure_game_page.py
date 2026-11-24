import importlib

import pytest
import requests


GAME_URL = (
    "https://romspure.cc/roms/nintendo-game-boy/pokemon-green-version-279/"
)
DOWNLOADS_URL = (
    "https://romspure.cc/download/pokemon-green-version-279-42571"
)
VARIANT_1_URL = f"{DOWNLOADS_URL}/1"
VARIANT_2_URL = f"{DOWNLOADS_URL}/2"
AJAX_URL = "https://romspure.cc/wp-admin/admin-ajax.php"

GAME_PAGE_HTML = f"""
<html>
  <script type="application/ld+json">
  {{
    "@context": "https://schema.org",
    "@type": "VideoGame",
    "name": "Pokemon Green Version",
    "image": "https://romspure.cc/uploads/pokemon-green.jpg",
    "publisher": [{{"@type": "Organization", "name": "Nintendo"}}],
    "aggregateRating": {{"ratingValue": 4.1, "ratingCount": 15}}
  }}
  </script>
  <img class="rs-cover" src="https://romspure.cc/uploads/pokemon-green.jpg">
  <h1 class="rs-title">Pokemon Green Version</h1>
  <section class="rs-info">
    <div class="rs-info__tile">
      <span class="rs-info__k">Publisher</span>
      <span class="rs-info__v"><span class="rs-chips"><a>Nintendo</a></span></span>
    </div>
    <div class="rs-info__tile">
      <span class="rs-info__k">Region</span>
      <span class="rs-info__v"><span class="rs-chips"><a>Japan</a><a>USA</a></span></span>
    </div>
    <div class="rs-info__tile">
      <span class="rs-info__k">Released</span>
      <span class="rs-info__v">April 27, 1996</span>
    </div>
  </section>
  <section class="rs-section">
    <h2 class="rs-h2">Description</h2>
    <div class="entry-content rs-prose">
      <p>Primeiro parágrafo.</p><p>Segundo <strong>parágrafo</strong>.</p>
    </div>
  </section>
  <section class="rs-section rs-gallery">
    <h2 class="rs-h2">Screenshots</h2>
    <a href="https://romspure.cc/uploads/screenshot-1.jpg"><img src="thumb-1.jpg"></a>
    <img data-src="/uploads/screenshot-2.jpg">
  </section>
  <a href="{DOWNLOADS_URL}" rel="nofollow" class="rs-btn rs-btn--primary">
    Download
  </a>
</html>
"""

DOWNLOAD_LIST_HTML = f"""
<div class="bg-white border rounded-2xl">
  <h2>Download Pokemon Green Version</h2>
  <div class="space-y-3">
    <a href="{VARIANT_1_URL}" rel="nofollow" class="group border rounded-xl">
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold text-brand-text break-words">
          Pokemon - Green Version (Japan)
        </div>
        <div class="flex items-center gap-2 text-xs text-brand-muted mt-1">
          <span class="font-semibold shrink-0">366.11 K</span>
          <span class="text-brand-sub shrink-0">·</span>
          <span class="truncate">Fan Translation</span>
        </div>
      </div>
    </a>
    <a href="{VARIANT_2_URL}" rel="nofollow" class="group border rounded-xl">
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold text-brand-text break-words">
          Pokemon - Green Version (Original)
        </div>
        <div class="flex items-center gap-2 text-xs text-brand-muted mt-1">
          <span class="font-semibold shrink-0">512 K</span>
        </div>
      </div>
    </a>
  </div>
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
    return importlib.import_module("romspure_game_page")


def test_collects_exact_schema_metadata_images_and_direct_downloads():
    romspure_game_page = load_module()
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(text=GAME_PAGE_HTML)),
        ("GET", DOWNLOADS_URL, FakeResponse(text=DOWNLOAD_LIST_HTML)),
        (
            "POST",
            AJAX_URL,
            FakeResponse(payload={"success": True, "data": {"nonce": "abc123"}}),
        ),
        (
            "POST",
            AJAX_URL,
            FakeResponse(
                payload={
                    "success": True,
                    "data": {
                        "url": "https://sto.romsfast.com/files/pokemon-green-1.zip",
                        "name": "Pokemon - Green Version (Japan)",
                        "size": "366.11 K",
                    },
                }
            ),
        ),
        (
            "POST",
            AJAX_URL,
            FakeResponse(
                payload={
                    "success": True,
                    "data": {
                        "url": "https://sto.romsfast.com/files/pokemon-green-2.zip"
                    },
                }
            ),
        ),
    )

    result = romspure_game_page.get_game_details(GAME_URL, session=session)

    assert result == {
        "name": "Pokemon Green Version",
        "description": "Primeiro parágrafo.\n\nSegundo parágrafo.",
        "release_date": "April 27, 1996",
        "reviews_count": 15,
        "stars_rate": 4.1,
        "publisher": "Nintendo",
        "regions": ["Japan", "USA"],
        "icon": "https://romspure.cc/uploads/pokemon-green.jpg",
        "screenshots": [
            "https://romspure.cc/uploads/screenshot-1.jpg",
            "https://romspure.cc/uploads/screenshot-2.jpg",
        ],
        "downloads": [
            {
                "filename": "Pokemon - Green Version (Japan)",
                "type": "Fan Translation",
                "size": "366.11 K",
                "download_url": (
                    "https://sto.romsfast.com/files/pokemon-green-1.zip"
                ),
            },
            {
                "filename": "Pokemon - Green Version (Original)",
                "type": None,
                "size": "512 K",
                "download_url": (
                    "https://sto.romsfast.com/files/pokemon-green-2.zip"
                ),
            },
        ],
    }
    assert session.steps == []
    assert len(session.calls) == 5
    assert session.calls[2][2]["data"] == {"action": "romspure_get_nonce"}
    assert session.calls[3][2]["data"] == {
        "action": "app_get_download_link",
        "post_id": "42571",
        "index": "1",
        "nonce": "abc123",
    }
    assert session.calls[4][2]["headers"]["Referer"] == VARIANT_2_URL


def test_returns_none_for_every_unavailable_field_without_extra_requests():
    romspure_game_page = load_module()
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(text="<html><h1>Only Name</h1></html>")),
    )

    result = romspure_game_page.get_game_details(GAME_URL, session=session)

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
    assert session.steps == []


def test_sets_direct_url_to_none_when_one_ajax_resolution_fails():
    romspure_game_page = load_module()
    first_end = DOWNLOAD_LIST_HTML.find(f'<a href="{VARIANT_2_URL}"')
    one_download_html = DOWNLOAD_LIST_HTML[:first_end] + "</div></div>"
    session = ScriptedSession(
        ("GET", GAME_URL, FakeResponse(text=GAME_PAGE_HTML)),
        ("GET", DOWNLOADS_URL, FakeResponse(text=one_download_html)),
        (
            "POST",
            AJAX_URL,
            FakeResponse(payload={"success": True, "data": {"nonce": "abc123"}}),
        ),
        (
            "POST",
            AJAX_URL,
            FakeResponse(error=requests.HTTPError("503 Server Error")),
        ),
    )

    result = romspure_game_page.get_game_details(GAME_URL, session=session)

    assert result["downloads"][0]["download_url"] is None


def test_rejects_non_romspure_url_before_requesting():
    romspure_game_page = load_module()
    session = ScriptedSession()

    with pytest.raises(ValueError, match="romspure.cc"):
        romspure_game_page.get_game_details(
            "https://example.com/game.html",
            session=session,
        )

    assert session.calls == []


def test_wraps_primary_game_page_http_error():
    romspure_game_page = load_module()
    session = ScriptedSession(
        (
            "GET",
            GAME_URL,
            FakeResponse(error=requests.HTTPError("503 Server Error")),
        )
    )

    with pytest.raises(
        romspure_game_page.RomsPureGamePageError,
        match="Não foi possível abrir a página do jogo no RomsPure",
    ):
        romspure_game_page.get_game_details(GAME_URL, session=session)

