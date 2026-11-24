"""Pesquisa jogos na página de resultados enviada do RomsFun."""

from __future__ import annotations

import json
import re
import sys
from html import unescape
from time import monotonic
from typing import TypedDict
from urllib.parse import urljoin, urlparse

import requests


GAME_NAME = "black"

BROWSE_URL = "https://romsfun.com/browse-all-roms/"
DYNAMIC_SEARCH_URL = "https://romsfun.com/api/search"
REQUEST_TIMEOUT_SECONDS = 15
SEARCH_BUDGET_SECONDS = 18
REQUEST_HEADERS = {
    "Accept": "text/html,application/xhtml+xml",
    "Referer": "https://romsfun.com/",
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
TAG_PATTERN = re.compile(r"<[^>]+>")
REMOVABLE_ELEMENT_PATTERN = re.compile(
    r"<(?:script|style|svg)\b[^>]*>.*?</(?:script|style|svg)>",
    re.IGNORECASE | re.DOTALL,
)
DIV_TAG_PATTERN = re.compile(
    r"<div\b(?P<attrs>[^>]*)>|</div\s*>",
    re.IGNORECASE,
)


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


class RomsFunSearchError(RuntimeError):
    """Indica que a busca não pôde produzir uma lista de resultados."""


CONSOLE_NAMES = {
    "game-boy": "Game Boy",
    "game-boy-advance": "Game Boy Advance",
    "game-boy-color": "Game Boy Color",
    "nintendo-ds": "Nintendo DS",
    "nintendo-3ds": "Nintendo 3DS",
    "nintendo-64": "Nintendo 64",
    "nintendo-entertainment-system": "Nintendo Entertainment System",
    "super-nintendo": "Super Nintendo",
    "playstation": "PlayStation",
    "playstation-2": "PlayStation 2",
    "playstation-portable": "PlayStation Portable",
    "sega-master-system": "Sega Master System",
    "sega-genesis": "Sega Genesis",
}


def _attributes(tag_or_fragment: str) -> dict[str, str]:
    return {
        match.group("name").lower(): unescape(match.group("value"))
        for match in ATTRIBUTE_PATTERN.finditer(tag_or_fragment)
    }


def _clean_html(fragment: str) -> str:
    fragment = REMOVABLE_ELEMENT_PATTERN.sub(" ", fragment)
    return " ".join(unescape(TAG_PATTERN.sub(" ", fragment)).split())


def _remaining_timeout(deadline: float) -> float | None:
    remaining = deadline - monotonic()
    if remaining <= 0:
        return None
    return min(REQUEST_TIMEOUT_SECONDS, remaining)


def _raise_for_status(response: requests.Response) -> None:
    response.raise_for_status()
    status_code = getattr(response, "status_code", 200)
    if 300 <= status_code < 400:
        raise requests.HTTPError("Redirecionamento inesperado do RomsFun.")


def _validate_page(page: int) -> None:
    if isinstance(page, bool) or not isinstance(page, int) or page < 1:
        raise ValueError("A página deve ser um inteiro positivo.")


def _search_url(page: int) -> str:
    if page == 1:
        return BROWSE_URL
    return urljoin(BROWSE_URL, f"page/{page}/")


def _safe_urljoin(base_url: str, candidate: str) -> str | None:
    try:
        return urljoin(base_url, candidate)
    except ValueError:
        return None


def _has_next_page(page_html: str, current_page: int) -> bool:
    expected_path = f"/browse-all-roms/page/{current_page + 1}/"
    for anchor in re.finditer(r"<a\b[^>]*>", page_html, re.IGNORECASE):
        attributes = _attributes(anchor.group(0))
        classes = attributes.get("class", "").lower().split()
        if attributes.get("aria-label", "").lower() != "next" and "next" not in classes:
            continue
        href = attributes.get("href")
        if not href:
            continue
        parsed = urlparse(urljoin(BROWSE_URL, href))
        if parsed.scheme == "https" and parsed.hostname == "romsfun.com":
            if parsed.path == expected_path:
                return True
    return False


def _card_fragments(page_html: str) -> list[str]:
    tags = list(DIV_TAG_PATTERN.finditer(page_html))
    fragments: list[str] = []
    index = 0
    while index < len(tags):
        opening = tags[index]
        attributes = opening.group("attrs")
        classes = (
            _attributes(attributes).get("class", "").split()
            if attributes is not None
            else []
        )
        if "rf-li" not in classes:
            index += 1
            continue

        depth = 1
        closing_index = index + 1
        while closing_index < len(tags):
            if tags[closing_index].group("attrs") is None:
                depth -= 1
            else:
                depth += 1
            if depth == 0:
                fragments.append(
                    page_html[opening.start() : tags[closing_index].end()]
                )
                break
            closing_index += 1
        index = closing_index + 1
    return fragments


def _result_url_and_title(card: str) -> tuple[str, str] | None:
    title_match = re.search(
        r'<h3\b[^>]*class=["\'][^"\']*\brf-li-title\b[^"\']*["\'][^>]*>'
        r'\s*<a\b(?P<attrs>[^>]*)>(?P<title>.*?)</a>\s*</h3>',
        card,
        re.IGNORECASE | re.DOTALL,
    )
    if title_match is None:
        return None

    href = _attributes(title_match.group("attrs")).get("href")
    if not href:
        return None
    result_url = _safe_urljoin(BROWSE_URL, href)
    if result_url is None:
        return None
    try:
        parsed = urlparse(result_url)
    except ValueError:
        return None
    if (
        parsed.scheme != "https"
        or parsed.hostname != "romsfun.com"
        or not parsed.path.startswith("/roms/")
    ):
        return None

    title = _clean_html(title_match.group("title"))
    return result_url, title


def _card_icon(card: str, result_url: str) -> str | None:
    image = re.search(r"<img\b[^>]*>", card, re.IGNORECASE)
    if image is None:
        return None
    attributes = _attributes(image.group(0))
    source = attributes.get("src") or attributes.get("data-src")
    return _safe_urljoin(result_url, source) if source else None


def _console_from_url(result_url: str) -> str | None:
    try:
        path_parts = urlparse(result_url).path.strip("/").split("/")
    except ValueError:
        return None
    if len(path_parts) < 3 or path_parts[0] != "roms":
        return None
    slug = path_parts[1].strip().lower()
    if not slug:
        return None
    return CONSOLE_NAMES.get(slug, slug.replace("-", " ").title())


def _card_stats(card: str) -> tuple[int | None, str | None]:
    stats = re.search(
        r'<div\b[^>]*class=["\'][^"\']*\brf-li-stats-m\b[^"\']*["\'][^>]*>'
        r"(.*?)</div>",
        card,
        re.IGNORECASE | re.DOTALL,
    )
    if stats is None:
        return None, None

    text = _clean_html(stats.group(1))
    downloads_match = re.search(
        r"(?<![\w.,])(\d{1,3}(?:,\d{3})+|\d+)(?![\w.,])",
        text,
    )
    size_match = re.search(
        r"\b(\d+(?:\.\d+)?\s*(?:K|M|G|T)(?:B)?)\b",
        text,
        re.IGNORECASE,
    )
    downloads = (
        int(downloads_match.group(1).replace(",", ""))
        if downloads_match is not None
        else None
    )
    size = size_match.group(1) if size_match is not None else None
    return downloads, size


def _parse_search_results(page_html: str) -> list[SearchResult]:
    results: list[SearchResult] = []
    for card in _card_fragments(page_html):
        identity = _result_url_and_title(card)
        if identity is None:
            continue
        result_url, title = identity
        downloads, size = _card_stats(card)
        results.append(
            {
                "title": title or None,
                "url": result_url,
                "icon": _card_icon(card, result_url),
                "console": _console_from_url(result_url),
                "size": size,
                "downloads": downloads,
            }
        )
    return results


def _parse_suggestions(payload: object) -> list[SearchResult]:
    if not isinstance(payload, list):
        raise RomsFunSearchError("O RomsFun retornou uma resposta inválida.")

    results: list[SearchResult] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        raw_url = item.get("url")
        if not isinstance(raw_url, str) or not raw_url.strip():
            continue
        try:
            result_url = urljoin(DYNAMIC_SEARCH_URL, raw_url)
            parsed = urlparse(result_url)
        except ValueError:
            continue
        if (
            parsed.scheme != "https"
            or parsed.hostname != "romsfun.com"
            or not parsed.path.startswith("/roms/")
        ):
            continue

        title_value = item.get("title")
        title = (
            " ".join(unescape(title_value).split())
            if isinstance(title_value, str) and title_value.strip()
            else None
        )
        icon_value = item.get("icon")
        icon: str | None = None
        if isinstance(icon_value, str) and icon_value.strip():
            try:
                candidate = urljoin(result_url, icon_value)
                if urlparse(candidate).scheme in {"http", "https"}:
                    icon = candidate
            except ValueError:
                pass

        console_value = item.get("console")
        console = (
            console_value.strip()
            if isinstance(console_value, str) and console_value.strip()
            else _console_from_url(result_url)
        )
        size_value = item.get("size")
        results.append(
            {
                "title": title,
                "url": result_url,
                "icon": icon,
                "console": console,
                "size": (
                    size_value.strip()
                    if isinstance(size_value, str) and size_value.strip()
                    else None
                ),
                "downloads": None,
            }
        )
    return results


def search_suggestions(
    game_name: str,
    session: requests.Session | None = None,
) -> list[SearchResult]:
    """Consulta as sugestões dinâmicas nativas do RomsFun."""
    normalized_name = game_name.strip()
    if not normalized_name:
        raise ValueError("Informe o nome do jogo.")

    client = session or requests.Session()
    owns_session = session is None
    try:
        try:
            response = client.get(
                DYNAMIC_SEARCH_URL,
                params={"s": normalized_name},
                headers={**REQUEST_HEADERS, "Accept": "application/json"},
                timeout=REQUEST_TIMEOUT_SECONDS,
                allow_redirects=False,
            )
            _raise_for_status(response)
        except requests.RequestException as error:
            raise RomsFunSearchError(
                "Não foi possível pesquisar sugestões no RomsFun."
            ) from error
        try:
            payload = json.loads(response.text)
        except (json.JSONDecodeError, TypeError) as error:
            raise RomsFunSearchError(
                "O RomsFun retornou uma resposta inválida."
            ) from error
        return _parse_suggestions(payload)
    finally:
        if owns_session:
            client.close()


def search_page(
    game_name: str,
    page: int = 1,
    session: requests.Session | None = None,
) -> SearchPage:
    """Pesquisa uma página de ``game_name`` na listagem do RomsFun."""
    normalized_name = game_name.strip()
    if not normalized_name:
        raise ValueError("Informe o nome do jogo.")
    _validate_page(page)

    client = session or requests.Session()
    owns_session = session is None
    deadline = monotonic() + SEARCH_BUDGET_SECONDS

    try:
        timeout = _remaining_timeout(deadline)
        if timeout is None:
            raise RomsFunSearchError("Tempo limite da busca excedido.")
        try:
            response = client.get(
                _search_url(page),
                params={"q": normalized_name},
                headers=REQUEST_HEADERS,
                timeout=timeout,
                allow_redirects=False,
            )
            _raise_for_status(response)
        except requests.RequestException as error:
            raise RomsFunSearchError(
                "Não foi possível pesquisar no RomsFun."
            ) from error
        return {
            "results": _parse_search_results(response.text),
            "page": page,
            "has_next": _has_next_page(response.text, page),
        }
    finally:
        if owns_session:
            client.close()


def search_games(
    game_name: str,
    session: requests.Session | None = None,
) -> list[SearchResult]:
    """Pesquisa ``game_name`` e preserva o contrato de lista original."""
    return search_page(game_name, session=session)["results"]


def main() -> int:
    """Executa a busca configurada em ``GAME_NAME`` e imprime o JSON."""
    try:
        results = search_games(GAME_NAME)
    except (RomsFunSearchError, ValueError) as error:
        print(f"Erro: {error}", file=sys.stderr)
        return 1

    print(json.dumps(results, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
