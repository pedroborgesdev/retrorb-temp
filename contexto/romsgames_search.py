"""Pesquisa jogos no RomsGames com o contrato comum de resultados."""

from __future__ import annotations

import json
import re
import sys
from html import unescape
from time import monotonic
from typing import TypedDict
from urllib.parse import urljoin, urlparse

import requests


GAME_NAME = "pokemon: firered"

BASE_URL = "https://www.romsgames.net/"
SEARCH_URL = f"{BASE_URL}search/"
DYNAMIC_SEARCH_URL = f"{SEARCH_URL}hint/"
REQUEST_TIMEOUT_SECONDS = 15
SEARCH_BUDGET_SECONDS = 18
REQUEST_HEADERS = {
    "Accept": "text/html,application/xhtml+xml",
    "Referer": f"{BASE_URL}roms/",
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/151.0 Safari/537.36"
    ),
}

TAG_PATTERN = re.compile(r"<[^>]+>")
ATTRIBUTE_PATTERN = re.compile(
    r"(?P<name>[\w:-]+)\s*=\s*(?P<quote>['\"])(?P<value>.*?)(?P=quote)",
    re.DOTALL,
)
CARD_PATTERN = re.compile(
    r"<a\b(?P<attrs>[^>]*)>(?P<body>.*?)</a>",
    re.IGNORECASE | re.DOTALL,
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


class RomsGamesSearchError(RuntimeError):
    """Indica que a busca principal no RomsGames falhou."""


def _remaining_timeout(deadline: float) -> float | None:
    remaining = deadline - monotonic()
    if remaining <= 0:
        return None
    return min(REQUEST_TIMEOUT_SECONDS, remaining)


def _attributes(tag: str) -> dict[str, str]:
    return {
        match.group("name").lower(): unescape(match.group("value"))
        for match in ATTRIBUTE_PATTERN.finditer(tag)
    }


def _clean_html(fragment: str) -> str:
    return " ".join(unescape(TAG_PATTERN.sub(" ", fragment)).split())


def _raise_for_status(response: requests.Response) -> None:
    response.raise_for_status()
    status_code = getattr(response, "status_code", 200)
    if 300 <= status_code < 400:
        raise requests.HTTPError("Redirecionamento inesperado do RomsGames.")


def _validate_page(page: int) -> None:
    if isinstance(page, bool) or not isinstance(page, int) or page < 1:
        raise ValueError("A página deve ser um inteiro positivo.")


def _video_game_data(page_html: str) -> dict[str, object]:
    scripts = re.findall(
        r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>'
        r"(.*?)</script>",
        page_html,
        re.IGNORECASE | re.DOTALL,
    )
    for script in scripts:
        try:
            payload = json.loads(script.strip())
        except (json.JSONDecodeError, TypeError):
            continue
        if not isinstance(payload, dict):
            continue
        candidates: list[object] = [payload]
        graph = payload.get("@graph")
        if isinstance(graph, list):
            candidates.extend(graph)
        elif isinstance(graph, dict):
            candidates.append(graph)
        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            item_type = candidate.get("@type")
            if item_type == "VideoGame" or (
                isinstance(item_type, list) and "VideoGame" in item_type
            ):
                return candidate
    return {}


def _parse_search_results(page_html: str) -> list[SearchResult]:
    results: list[SearchResult] = []
    for match in CARD_PATTERN.finditer(page_html):
        attributes = _attributes(match.group("attrs"))
        if "shadow-lg" not in attributes.get("class", "").split():
            continue
        href = attributes.get("href")
        if not href:
            continue
        game_url = urljoin(BASE_URL, href)
        parsed = urlparse(game_url)
        if parsed.scheme != "https" or parsed.hostname != "www.romsgames.net":
            continue

        body = match.group("body")
        image = re.search(r"<img\b[^>]*>", body, re.IGNORECASE)
        image_attributes = _attributes(image.group(0)) if image else {}
        title = image_attributes.get("alt")
        if not title:
            title_fragment = re.search(
                r'<div\b[^>]*class=["\'][^"\']*\btext-gray-900\b'
                r'[^"\']*["\'][^>]*>(.*?)</div>',
                body,
                re.IGNORECASE | re.DOTALL,
            )
            title = _clean_html(title_fragment.group(1)) if title_fragment else None

        source = image_attributes.get("src")
        icon = urljoin(game_url, source) if source else None
        if icon and "/image/no-cover." in icon:
            icon = None

        results.append(
            {
                "title": title or None,
                "url": game_url,
                "icon": icon,
                "console": None,
                "size": None,
                "downloads": None,
            }
        )
    return results


def _parse_suggestions(payload: object) -> list[SearchResult]:
    if not isinstance(payload, list):
        raise RomsGamesSearchError("O RomsGames retornou uma resposta inválida.")

    results: list[SearchResult] = []
    for item in payload:
        if not isinstance(item, dict) or item.get("type") != "rom":
            continue
        raw_url = item.get("url")
        if not isinstance(raw_url, str) or not raw_url.strip():
            continue
        try:
            result_url = urljoin(BASE_URL, raw_url)
            parsed = urlparse(result_url)
        except ValueError:
            continue
        if (
            parsed.scheme != "https"
            or parsed.hostname != "www.romsgames.net"
            or "-rom-" not in parsed.path.lower()
        ):
            continue

        title_value = item.get("name")
        title = (
            " ".join(unescape(title_value).split())
            if isinstance(title_value, str) and title_value.strip()
            else None
        )
        icon_value = item.get("thumbnailImageURL")
        icon: str | None = None
        if isinstance(icon_value, str) and icon_value.strip():
            try:
                candidate = urljoin(result_url, icon_value)
                if (
                    urlparse(candidate).scheme in {"http", "https"}
                    and "/image/no-cover." not in candidate
                ):
                    icon = candidate
            except ValueError:
                pass

        console_value = item.get("consoleShortTitle")
        results.append(
            {
                "title": title,
                "url": result_url,
                "icon": icon,
                "console": (
                    console_value.strip()
                    if isinstance(console_value, str) and console_value.strip()
                    else None
                ),
                "size": None,
                "downloads": None,
            }
        )
    return results


def search_suggestions(
    game_name: str,
    session: requests.Session | None = None,
) -> list[SearchResult]:
    """Consulta as sugestões dinâmicas nativas do RomsGames."""
    normalized_name = game_name.strip()
    if not normalized_name:
        raise ValueError("Informe o nome do jogo.")

    client = session or requests.Session()
    owns_session = session is None
    try:
        try:
            response = client.get(
                DYNAMIC_SEARCH_URL,
                params={"q": normalized_name},
                headers={**REQUEST_HEADERS, "Accept": "application/json"},
                timeout=REQUEST_TIMEOUT_SECONDS,
                allow_redirects=False,
            )
            _raise_for_status(response)
        except requests.RequestException as error:
            raise RomsGamesSearchError(
                "Não foi possível pesquisar sugestões no RomsGames."
            ) from error
        try:
            payload = json.loads(response.text)
        except (json.JSONDecodeError, TypeError) as error:
            raise RomsGamesSearchError(
                "O RomsGames retornou uma resposta inválida."
            ) from error
        return _parse_suggestions(payload)
    finally:
        if owns_session:
            client.close()


def _enrich_results(
    results: list[SearchResult],
    session: requests.Session,
    deadline: float,
) -> None:
    for result in results:
        game_url = result["url"]
        if game_url is None:
            continue
        timeout = _remaining_timeout(deadline)
        if timeout is None:
            return
        try:
            response = session.get(
                game_url,
                headers={**REQUEST_HEADERS, "Referer": SEARCH_URL},
                timeout=timeout,
                allow_redirects=False,
            )
            _raise_for_status(response)
        except requests.RequestException:
            continue
        structured = _video_game_data(response.text)
        console = structured.get("gamePlatform")
        size = structured.get("fileSize")
        result["console"] = console if isinstance(console, str) else None
        result["size"] = size if isinstance(size, str) else None


def search_page(
    game_name: str,
    page: int = 1,
    session: requests.Session | None = None,
) -> SearchPage:
    """Pesquisa a página disponível no RomsGames, que não pagina a busca."""
    normalized_name = game_name.strip()
    if not normalized_name:
        raise ValueError("Informe o nome do jogo.")
    _validate_page(page)
    if page > 1:
        return {"results": [], "page": page, "has_next": False}

    client = session or requests.Session()
    owns_session = session is None
    deadline = monotonic() + SEARCH_BUDGET_SECONDS
    try:
        timeout = _remaining_timeout(deadline)
        if timeout is None:
            raise RomsGamesSearchError("Tempo limite da busca excedido.")
        try:
            response = client.get(
                SEARCH_URL,
                params={"q": normalized_name},
                headers=REQUEST_HEADERS,
                timeout=timeout,
                allow_redirects=False,
            )
            _raise_for_status(response)
        except requests.RequestException as error:
            raise RomsGamesSearchError(
                "Não foi possível pesquisar no RomsGames."
            ) from error

        results = _parse_search_results(response.text)
        _enrich_results(results, client, deadline)
        return {"results": results, "page": page, "has_next": False}
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
    """Executa a busca de ``GAME_NAME`` e imprime o resultado em JSON."""
    try:
        results = search_games(GAME_NAME)
    except (RomsGamesSearchError, ValueError) as error:
        print(f"Erro: {error}", file=sys.stderr)
        return 1

    print(json.dumps(results, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
