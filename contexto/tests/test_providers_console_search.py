import importlib

import pytest


GAME_URL = "https://romsfun.com/roms/playstation-3/example-game.html"
ROMSFUN_HTML = f"""
<div class="rf-li bg-white">
  <h3 class="rf-li-title"><a href="{GAME_URL}">Example Game</a></h3>
</div>
"""


class FakeResponse:
    status_code = 200

    def __init__(self, text=""):
        self.text = text

    def raise_for_status(self):
        return None


class RecordingSession:
    def __init__(self, response):
        self.response = response
        self.calls = []
        self.closed = False

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self.response

    def close(self):
        self.closed = True


def load_module():
    return importlib.import_module("providers_console_search")


def test_resolves_canonical_name_and_alias_case_insensitively():
    module = load_module()

    canonical = module._resolve_console("PlayStation 3")
    alias = module._resolve_console("  ps3  ")

    assert canonical["name"] == "PlayStation 3"
    assert alias == canonical
    assert [(item["name"], item["console_name"]) for item in alias["providers"]] == [
        ("romsfun", "PS3"),
        ("romspure", "Sony Playstation 3"),
    ]


@pytest.mark.parametrize("console_name", ["", "   ", "console inexistente"])
def test_rejects_invalid_console_before_requesting(monkeypatch, console_name):
    module = load_module()
    monkeypatch.setattr(
        module,
        "_fetch_provider",
        lambda *_args, **_kwargs: pytest.fail("não deveria fazer requisição"),
    )

    with pytest.raises(ValueError):
        module.search_console(console_name)


@pytest.mark.parametrize("page", [0, -1, True, 1.5, "2"])
def test_rejects_invalid_page_before_requesting(monkeypatch, page):
    module = load_module()
    monkeypatch.setattr(
        module,
        "_fetch_provider",
        lambda *_args, **_kwargs: pytest.fail("não deveria fazer requisição"),
    )

    with pytest.raises(ValueError, match="página"):
        module.search_console("PlayStation 3", page=page)


def test_rejects_ambiguous_alias():
    module = load_module()
    catalog = {
        "consoles": [
            {"name": "Console A", "correlative_names": ["shared"], "providers": []},
            {"name": "Console B", "correlative_names": ["Shared"], "providers": []},
        ]
    }

    with pytest.raises(ValueError, match="ambíguo"):
        module._resolve_console("shared", catalog=catalog)


def test_prepares_path_routes_for_playstation_3():
    module = load_module()
    providers = module._resolve_console("PlayStation 3")["providers"]

    assert module._prepare_request(providers[0], page=1) == (
        "https://romsfun.com/browse-all-roms/",
        {"q": "", "consoles[]": "15"},
    )
    assert module._prepare_request(providers[0], page=2) == (
        "https://romsfun.com/browse-all-roms/page/2/",
        {"q": "", "consoles[]": "15"},
    )
    assert module._prepare_request(providers[1], page=2) == (
        "https://romspure.cc/browse-roms/page/2/",
        {
            "q": "",
            "sort": "last_update",
            "console": "3913",
            "console_opts[]": "3913",
        },
    )


def test_prepares_query_routes_for_direct_console_pages():
    module = load_module()
    providers = module._resolve_console("PlayStation 2")["providers"]
    by_name = {item["name"]: item for item in providers}

    romsgames_url, romsgames_params = module._prepare_request(
        by_name["romsgames"], page=3
    )
    wowroms_url, wowroms_params = module._prepare_request(
        by_name["wowroms"], page=3
    )

    assert romsgames_url == "https://www.romsgames.net/roms/playstation-2/"
    assert romsgames_params == {"sort": "popularity", "page": "3"}
    assert wowroms_url == "https://wowroms.com/en/roms/list/playstation%2B2"
    assert wowroms_params == {"page": "3"}


def test_fetch_provider_reuses_parser_and_exact_result_contract():
    module = load_module()
    mapping = module._resolve_console("PlayStation 3")["providers"][0]
    session = RecordingSession(FakeResponse(ROMSFUN_HTML))

    response = module._fetch_provider(mapping, page=1, session_factory=lambda: session)

    assert response == {
        "name": "romsfun",
        "console_name": "PS3",
        "results": [
            {
                "title": "Example Game",
                "url": GAME_URL,
                "icon": None,
                "console": "Playstation 3",
                "size": None,
                "downloads": None,
            }
        ],
        "has_next": False,
        "error": None,
    }
    assert session.calls[0][0] == "https://romsfun.com/browse-all-roms/"
    assert session.calls[0][1]["allow_redirects"] is False
    assert session.closed is True


@pytest.mark.parametrize(
    ("provider_name", "unsafe_url"),
    [
        (
            "romspure",
            "https://127.0.0.1:443\\@romspure.cc/roms/example-game",
        ),
        (
            "romsgames",
            "https://127.0.0.1:443\\@www.romsgames.net/game-rom-example-game/",
        ),
    ],
)
def test_fetch_provider_does_not_enrich_unsafe_parsed_urls(
    monkeypatch, provider_name, unsafe_url
):
    module = load_module()
    providers = module._resolve_console("PlayStation 2")["providers"]
    mapping = next(item for item in providers if item["name"] == provider_name)
    provider_module = module.PROVIDER_MODULES[provider_name]
    monkeypatch.setattr(
        provider_module,
        "_parse_search_results",
        lambda _html: [
            {
                "title": "Example Game",
                "url": unsafe_url,
                "icon": None,
                "console": None,
                "size": None,
                "downloads": None,
            }
        ],
    )
    session = RecordingSession(FakeResponse("<html></html>"))

    response = module._fetch_provider(mapping, page=1, session_factory=lambda: session)

    assert response["results"] == []
    assert len(session.calls) == 1


def test_romsgames_adapter_excludes_pagination_links_from_results():
    module = load_module()
    mapping = next(
        item
        for item in module._resolve_console("PlayStation 2")["providers"]
        if item["name"] == "romsgames"
    )
    html = """
    <a href="/playstation-2-rom-example-game/" class="shadow-lg">
      <img alt="Example Game">
    </a>
    <a href="/roms/playstation-2/?page=2&amp;sort=popularity" class="shadow-lg">
      Next
    </a>
    """
    session = RecordingSession(FakeResponse(html))

    response = module._fetch_provider(mapping, page=1, session_factory=lambda: session)

    assert [item["title"] for item in response["results"]] == ["Example Game"]
    assert len(session.calls) == 2


@pytest.mark.parametrize(
    "catalog",
    [
        {
            "consoles": [
                {"name": "Broken", "correlative_names": None, "providers": []}
            ]
        },
        {
            "consoles": [
                {"name": "Broken", "correlative_names": ["Broken"], "providers": [None]}
            ]
        },
        {
            "consoles": [
                {
                    "name": "Broken",
                    "correlative_names": ["Broken"],
                    "providers": [
                        {"name": [], "console_name": "Broken", "consult": {}}
                    ],
                }
            ]
        },
    ],
)
def test_rejects_malformed_catalog_with_public_catalog_error(catalog):
    module = load_module()

    with pytest.raises(module.ConsoleCatalogError):
        module._resolve_console("Broken", catalog=catalog)


def test_search_preserves_catalog_order_and_isolates_provider_failure(monkeypatch):
    module = load_module()

    def fake_fetch(mapping, page):
        if mapping["name"] == "romspure":
            raise RuntimeError("internal detail that must not leak")
        return {
            "name": mapping["name"],
            "console_name": mapping["console_name"],
            "results": [],
            "has_next": True,
            "error": None,
        }

    monkeypatch.setattr(module, "_fetch_provider", fake_fetch)

    result = module.search_console("ps3", page=2)

    assert result == {
        "name": "PlayStation 3",
        "page": 2,
        "providers": [
            {
                "name": "romsfun",
                "console_name": "PS3",
                "results": [],
                "has_next": True,
                "error": None,
            },
            {
                "name": "romspure",
                "console_name": "Sony Playstation 3",
                "results": [],
                "has_next": False,
                "error": "Não foi possível consultar romspure.",
            },
        ],
    }
    assert "internal detail" not in str(result)


def test_search_discards_results_from_unrelated_consoles(monkeypatch):
    module = load_module()

    def result(title, console):
        return {
            "title": title,
            "url": None,
            "icon": None,
            "console": console,
            "size": None,
            "downloads": None,
        }

    def fake_fetch(mapping, page):
        results = {
            "romsfun": [
                result("Valid RomsFun", "Playstation 3"),
                result("Wrong PS4", "PlayStation 4"),
                result("Missing console", None),
            ],
            "romspure": [
                result("Valid RomsPure", "  Sony   Playstation 3 "),
                result("Wrong PS2", "PS2"),
            ],
        }[mapping["name"]]
        return {
            "name": mapping["name"],
            "console_name": mapping["console_name"],
            "results": results,
            "has_next": False,
            "error": None,
        }

    monkeypatch.setattr(module, "_fetch_provider", fake_fetch)

    response = module.search_console("PS3")

    assert [
        [item["title"] for item in provider["results"]]
        for provider in response["providers"]
    ] == [["Valid RomsFun"], ["Valid RomsPure"]]

