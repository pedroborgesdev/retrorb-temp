import json
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse


CONTEXT_DIR = Path(__file__).resolve().parents[1]
SOURCE_PATH = CONTEXT_DIR / "consoles.json"
DEFINITIVE_PATH = CONTEXT_DIR / "consoles-definitive.json"
PROVIDER_DOMAINS = {
    "romsfun": "romsfun.com",
    "romspure": "romspure.cc",
    "romsgames": "www.romsgames.net",
    "wowroms": "wowroms.com",
}


def load_catalogs():
    return (
        json.loads(SOURCE_PATH.read_text(encoding="utf-8")),
        json.loads(DEFINITIVE_PATH.read_text(encoding="utf-8")),
    )


def find_console(consoles, canonical_name):
    return next(item for item in consoles if item["name"] == canonical_name)


def provider_pairs(console):
    return {
        (provider["name"], provider["console_name"])
        for provider in console["providers"]
    }


def test_definitive_catalog_has_exact_schema_and_deterministic_order():
    _, definitive = load_catalogs()

    assert set(definitive) == {"consoles"}
    consoles = definitive["consoles"]
    assert [item["name"].casefold() for item in consoles] == sorted(
        item["name"].casefold() for item in consoles
    )
    assert len({item["name"].casefold() for item in consoles}) == len(consoles)

    for item in consoles:
        assert set(item) - {"image"} == {"name", "correlative_names", "providers"}
        assert item.get("image") is None or isinstance(item["image"], str)
        assert isinstance(item["name"], str) and item["name"].strip()
        assert item["correlative_names"] == sorted(
            set(item["correlative_names"]), key=lambda value: (value.casefold(), value)
        )
        for provider in item["providers"]:
            assert set(provider) == {"name", "console_name", "consult"}
            consult = provider["consult"]
            assert set(consult) == {"method", "url", "params", "pagination", "search"}
            assert consult["method"] == "GET"
            assert urlparse(consult["url"]).scheme == "https"
            assert urlparse(consult["url"]).hostname == PROVIDER_DOMAINS[provider["name"]]
            assert isinstance(consult["params"], dict)
            assert all(
                isinstance(key, str) and isinstance(value, str)
                for key, value in consult["params"].items()
            )

            pagination = consult["pagination"]
            if pagination["mode"] == "path":
                assert set(pagination) == {"mode", "url_template"}
                assert "{page}" in pagination["url_template"]
                assert urlparse(pagination["url_template"]).hostname == PROVIDER_DOMAINS[provider["name"]]
            else:
                assert pagination == {"mode": "query", "page_param": "page"}


def test_consult_metadata_exactly_matches_captured_provider_routes():
    source, definitive = load_catalogs()
    source_by_pair = {
        (provider_name, console["name"]): console
        for provider_name in PROVIDER_DOMAINS
        for console in source[provider_name]
    }

    for console in definitive["consoles"]:
        for provider in console["providers"]:
            provider_name = provider["name"]
            captured = source_by_pair[(provider_name, provider["console_name"])]
            consult = provider["consult"]

            if provider_name == "romsfun":
                assert consult == {
                    "method": "GET",
                    "url": "https://romsfun.com/browse-all-roms/",
                    "params": {"q": "", "consoles[]": str(captured["id"])},
                    "search": {"param": "q"},
                    "pagination": {
                        "mode": "path",
                        "url_template": "https://romsfun.com/browse-all-roms/page/{page}/",
                    },
                }
            elif provider_name == "romspure":
                assert consult == {
                    "method": "GET",
                    "url": "https://romspure.cc/browse-roms/",
                    "params": {
                        "q": "",
                        "sort": "last_update",
                        "console": str(captured["id"]),
                        "console_opts[]": str(captured["id"]),
                    },
                    "search": {"param": "q"},
                    "pagination": {
                        "mode": "path",
                        "url_template": "https://romspure.cc/browse-roms/page/{page}/",
                    },
                }
            elif provider_name == "romsgames":
                assert consult == {
                    "method": "GET",
                    "url": captured["url"],
                    "params": {"sort": "popularity"},
                    "search": {"param": "q", "url": "https://www.romsgames.net/search/", "paginated": False},
                    "pagination": {"mode": "query", "page_param": "page"},
                }
            else:
                assert consult == {
                    "method": "GET",
                    "url": captured["url"],
                    "params": {},
                    "search": {"param": "search"},
                    "pagination": {"mode": "query", "page_param": "page"},
                }


def test_every_source_console_appears_once_and_aliases_include_canonical_name():
    source, definitive = load_catalogs()
    source_pairs = Counter(
        (provider_name, console["name"])
        for provider_name in ("romsfun", "romspure", "romsgames", "wowroms")
        for console in source[provider_name]
    )
    output_pairs = Counter(
        (provider["name"], provider["console_name"])
        for console in definitive["consoles"]
        for provider in console["providers"]
    )

    assert output_pairs == source_pairs

    for console in definitive["consoles"]:
        expected_aliases = {console["name"]} | {
            provider["console_name"]
            for provider in console["providers"]
        }
        assert set(console["correlative_names"]) == expected_aliases


def test_only_identical_platform_aliases_are_merged():
    _, definitive = load_catalogs()
    consoles = definitive["consoles"]

    ps2 = find_console(consoles, "PlayStation 2")
    assert provider_pairs(ps2) == {
        ("romsfun", "PS2"),
        ("romspure", "PS2"),
        ("romsgames", "Playstation 2"),
        ("wowroms", "Playstation 2"),
    }

    game_boy = find_console(consoles, "Game Boy")
    assert provider_pairs(game_boy) == {
        ("romsfun", "Game Boy (GB)"),
        ("romspure", "Nintendo Game Boy"),
        ("romsgames", "Gameboy"),
        ("wowroms", "Nintendo Gameboy"),
    }

    expected_sensitive_groups = {
        "Game Boy Color": {
            ("romsfun", "Game Boy Color"),
            ("romspure", "Nintendo Game Boy Color"),
            ("romsgames", "Gameboy Color"),
            ("wowroms", "Nintendo Gameboy Color"),
        },
        "Game Boy Advance": {
            ("romsfun", "GBA"),
            ("romspure", "Nintendo Game Boy Advance"),
            ("romsgames", "Gameboy Advance"),
            ("wowroms", "Nintendo Gameboy Advance"),
        },
        "Neo Geo": {
            ("romsfun", "Neo Geo"),
            ("romsgames", "SNK Neo Geo"),
            ("wowroms", "Neo Geo"),
        },
        "Neo Geo AES": {
            ("romsfun", "Neo Geo AES"),
            ("romspure", "SNK Neo Geo AES"),
        },
        "Neo Geo CD": {("romsfun", "Neo Geo CD")},
        "Neo Geo Pocket": {
            ("romsgames", "Neo Geo Pocket"),
            ("wowroms", "Neo Geo Pocket"),
        },
        "Neo Geo Pocket Color": {
            ("romsfun", "Neo Geo Pocket Color"),
            ("romsgames", "Neo Geo Pocket Color"),
            ("wowroms", "Neo Geo Pocket Color"),
        },
        "TurboGrafx-16 / PC Engine": {
            ("romsfun", "NEC TurboGrafx-16"),
            ("romsgames", "TurboGrafx-16"),
            ("wowroms", "PC Engine/TurboGrafx 16"),
        },
        "TurboGrafx-CD / PC Engine CD": {
            ("romsfun", "NEC TurboGrafx CD"),
            ("wowroms", "PC Engine CD/Turbo Duo/TurboGrafx CD"),
        },
        "MAME": {
            ("romsfun", "MAME"),
            ("romspure", "MAME"),
            ("wowroms", "MAME"),
        },
        "MAME 0.37b5": {("wowroms", "MAME 0.37b5")},
        "MAME 0.37b11": {("romsgames", "MAME 037b11")},
        "MAME 0.139u1": {("wowroms", "MAME 0.139u1")},
        "Magnavox Odyssey 2 / Philips Videopac": {
            ("romsgames", "Magnavox Odyssey 2"),
            ("romsgames", "Philips Videopac"),
        },
    }
    for canonical_name, expected_pairs in expected_sensitive_groups.items():
        assert provider_pairs(find_console(consoles, canonical_name)) == expected_pairs
