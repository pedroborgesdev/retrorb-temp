"""Pesquisa jogos na listagem submetida do WowRoms."""

from __future__ import annotations

import json
import re
import sys
from html import unescape
from typing import TypedDict
from urllib.parse import parse_qs, urljoin, urlparse

import requests


GAME_NAME = "pokemon"
LIST_URL = "https://wowroms.com/en/roms/list"
REQUEST_TIMEOUT_SECONDS = 15
REQUEST_HEADERS = {
    "Accept": "text/html,application/xhtml+xml",
    "Referer": "https://wowroms.com/",
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/151.0 Safari/537.36"
    ),
}

ATTRIBUTE_PATTERN = re.compile(
    r"(?P<name>[\w:-]+)\s*=\s*(?P<quote>['\"])(?P<value>.*?)(?P=quote)",
    re.DOTALL,
)
LI_TAG_PATTERN = re.compile(
    r"<li\b(?P<attrs>[^>]*)>|</li\s*>",
    re.IGNORECASE,
)
TAG_PATTERN = re.compile(r"<[^>]+>")


class SearchResult(TypedDict):
    title: str | None
    url: str | None
    icon: str | None
    console: str | None
    size: str | None
    downloads: int | None


class SearchPage(TypedDict):
    results: list[SearchResult]
    page: int
    has_next: bool


class WowRomsSearchError(RuntimeError):
    """Indica que a pesquisa do WowRoms não pôde ser carregada."""


def _attributes(fragment: str) -> dict[str, str]:
    return {
        match.group("name").lower(): unescape(match.group("value"))
        for match in ATTRIBUTE_PATTERN.finditer(fragment)
    }


def _clean_html(fragment: str) -> str:
    return " ".join(unescape(TAG_PATTERN.sub(" ", fragment)).split())


def _safe_urljoin(base_url: str, candidate: str) -> str | None:
    try:
        return urljoin(base_url, candidate)
    except ValueError:
        return None


def _is_wowroms_https_url(url: str) -> bool:
    """Valida a URL como o ``requests`` a interpretara antes do envio."""
    if (
        not isinstance(url, str)
        or "\\" in url
        or any(ord(character) < 32 or ord(character) == 127 for character in url)
    ):
        return False

    try:
        prepared_url = requests.Request("GET", url).prepare().url
        if prepared_url is None:
            return False
        candidates = (url, prepared_url)
        for candidate in candidates:
            parsed = urlparse(candidate)
            if (
                parsed.scheme.lower() != "https"
                or parsed.hostname is None
                or parsed.hostname.lower() != "wowroms.com"
                or parsed.username is not None
                or parsed.password is not None
                or parsed.port not in (None, 443)
            ):
                return False
    except (ValueError, requests.RequestException):
        return False
    return True


def _raise_for_status(response: requests.Response) -> None:
    response.raise_for_status()
    status_code = getattr(response, "status_code", 200)
    if 300 <= status_code < 400:
        raise requests.HTTPError("Redirecionamento inesperado do WowRoms.")


def _validate_page(page: int) -> None:
    if isinstance(page, bool) or not isinstance(page, int) or page < 1:
        raise ValueError("A página deve ser um inteiro positivo.")


def _has_next_page(page_html: str, current_page: int) -> bool:
    expected_page = str(current_page + 1)
    for item in re.finditer(
        r"<li\b(?P<attrs>[^>]*)>(?P<body>.*?)</li>",
        page_html,
        re.IGNORECASE | re.DOTALL,
    ):
        if "next" not in _attributes(item.group("attrs")).get("class", "").split():
            continue
        anchor = re.search(r"<a\b[^>]*>", item.group("body"), re.IGNORECASE)
        if anchor is None:
            continue
        href = _attributes(anchor.group(0)).get("href")
        if not href:
            continue
        next_url = _safe_urljoin(LIST_URL, href)
        if next_url is None:
            continue
        try:
            parsed = urlparse(next_url)
            query = parse_qs(parsed.query)
        except ValueError:
            continue
        if (
            parsed.scheme == "https"
            and parsed.hostname == "wowroms.com"
            and parsed.path == "/en/roms/list"
            and query.get("page") == [expected_page]
        ):
            return True
    return False


def _card_fragments(page_html: str) -> list[str]:
    tags = list(LI_TAG_PATTERN.finditer(page_html))
    openings = [
        tag
        for tag in tags
        if tag.group("attrs") is not None
        and "element" in _attributes(tag.group("attrs")).get("class", "").split()
    ]
    fragments: list[str] = []
    for opening_index, opening in enumerate(openings):
        boundary = (
            openings[opening_index + 1].start()
            if opening_index + 1 < len(openings)
            else len(page_html)
        )
        depth = 1
        fragment_end = boundary
        for tag in tags:
            if tag.start() < opening.end():
                continue
            if tag.start() >= boundary:
                break
            if tag.group("attrs") is None:
                depth -= 1
            else:
                depth += 1
            if depth == 0:
                fragment_end = tag.end()
                break
        fragments.append(page_html[opening.start() : fragment_end])
    return fragments


def _parse_card(card: str) -> SearchResult | None:
    title_anchor = re.search(
        r'<a\b(?P<attrs>[^>]*class=["\'][^"\']*\btitle-5\b[^"\']*'
        r'["\'][^>]*)>(?P<body>.*?)</a>',
        card,
        re.IGNORECASE | re.DOTALL,
    )
    if title_anchor is None:
        return None

    attributes = _attributes(title_anchor.group("attrs"))
    href = attributes.get("href")
    if not href:
        return None
    game_url = _safe_urljoin(LIST_URL, href)
    if game_url is None:
        return None
    if not _is_wowroms_https_url(game_url):
        return None
    try:
        path = urlparse(game_url).path
    except ValueError:
        return None
    if not path.startswith("/en/roms/"):
        return None

    title = attributes.get("title") or _clean_html(title_anchor.group("body"))

    icon: str | None = None
    image = re.search(r"<img\b[^>]*>", card, re.IGNORECASE)
    if image is not None:
        image_attributes = _attributes(image.group(0))
        source = image_attributes.get("data-src") or image_attributes.get("src")
        if source:
            icon = _safe_urljoin(game_url, source)

    console: str | None = None
    console_anchor = re.search(
        r'<a\b[^>]*class=["\'][^"\']*\bcolorRed\b[^"\']*["\'][^>]*>'
        r"(.*?)</a>",
        card,
        re.IGNORECASE | re.DOTALL,
    )
    if console_anchor is not None:
        console = _clean_html(console_anchor.group(1)) or None

    size_match = re.search(
        r"File\s*Size\s*:.*?<b\b[^>]*>(.*?)</b>",
        card,
        re.IGNORECASE | re.DOTALL,
    )
    size = _clean_html(size_match.group(1)) or None if size_match else None

    downloads_match = re.search(
        r"Downlaod\s*:.*?<b\b[^>]*>([\d,.]+)</b>",
        card,
        re.IGNORECASE | re.DOTALL,
    )
    downloads: int | None = None
    if downloads_match is not None:
        try:
            downloads = int(downloads_match.group(1).replace(",", ""))
        except ValueError:
            pass

    return {
        "title": _clean_html(title) or None,
        "url": game_url,
        "icon": icon,
        "console": console,
        "size": size,
        "downloads": downloads,
    }


def _parse_search_results(page_html: str) -> list[SearchResult]:
    results: list[SearchResult] = []
    for card in _card_fragments(page_html):
        result = _parse_card(card)
        if result is not None:
            results.append(result)
    return results


def search_page(
    game_name: str,
    page: int = 1,
    session: requests.Session | None = None,
) -> SearchPage:
    """Pesquisa uma página da listagem de ROMs."""
    normalized_name = game_name.strip()
    if not normalized_name:
        raise ValueError("Informe o nome do jogo.")
    _validate_page(page)

    params: dict[str, str | int] = {"search": normalized_name}
    if page > 1:
        params["page"] = page

    client = session or requests.Session()
    owns_session = session is None
    try:
        response = client.get(
            LIST_URL,
            params=params,
            headers=REQUEST_HEADERS,
            timeout=REQUEST_TIMEOUT_SECONDS,
            allow_redirects=False,
        )
        _raise_for_status(response)
        return {
            "results": _parse_search_results(response.text),
            "page": page,
            "has_next": _has_next_page(response.text, page),
        }
    except requests.RequestException as error:
        raise WowRomsSearchError(
            "Não foi possível pesquisar no WowRoms."
        ) from error
    finally:
        if owns_session:
            client.close()


def search_games(
    game_name: str,
    session: requests.Session | None = None,
) -> list[SearchResult]:
    """Pesquisa a primeira página de resultados."""
    return search_page(game_name, session=session)["results"]


def main() -> int:
    """Executa a busca configurada em ``GAME_NAME`` e imprime o JSON."""
    try:
        results = search_games(GAME_NAME)
    except (WowRomsSearchError, ValueError) as error:
        print(f"Erro: {error}", file=sys.stderr)
        return 1

    print(json.dumps(results, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

