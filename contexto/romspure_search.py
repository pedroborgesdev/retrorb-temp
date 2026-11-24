"""Pesquisa jogos no RomsPure e retorna o mesmo contrato do RomsFun."""

from __future__ import annotations

import json
import re
import sys
from html import unescape
from time import monotonic
from typing import TypedDict
from urllib.parse import urljoin, urlparse

import requests


GAME_NAME = "pokemon fire red"

SEARCH_URL = "https://romspure.cc/browse-roms/"
REQUEST_TIMEOUT_SECONDS = 15
SEARCH_BUDGET_SECONDS = 18
REQUEST_HEADERS = {
    "Accept": "text/html,application/xhtml+xml",
    "Referer": "https://romspure.cc/",
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/151.0 Safari/537.36"
    ),
}

TAG_PATTERN = re.compile(r"<[^>]+>")
REMOVABLE_ELEMENT_PATTERN = re.compile(
    r"<(?:script|style|svg)\b[^>]*>.*?</(?:script|style|svg)>",
    re.IGNORECASE | re.DOTALL,
)
ATTRIBUTE_PATTERN = re.compile(
    r"(?P<name>[\w:-]+)\s*=\s*(?P<quote>['\"])(?P<value>.*?)(?P=quote)",
    re.DOTALL,
)
CARD_PATTERN = re.compile(
    r'<article\b[^>]*class=["\'][^"\']*\brom-item\b[^"\']*["\'][^>]*>'
    r"(.*?)</article>",
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


class RomsPureSearchError(RuntimeError):
    """Indica que a busca principal no RomsPure falhou."""


def _remaining_timeout(deadline: float) -> float | None:
    remaining = deadline - monotonic()
    if remaining <= 0:
        return None
    return min(REQUEST_TIMEOUT_SECONDS, remaining)


def _raise_for_status(response: requests.Response) -> None:
    response.raise_for_status()
    status_code = getattr(response, "status_code", 200)
    if 300 <= status_code < 400:
        raise requests.HTTPError("Redirecionamento inesperado do RomsPure.")


def _validate_page(page: int) -> None:
    if isinstance(page, bool) or not isinstance(page, int) or page < 1:
        raise ValueError("A página deve ser um inteiro positivo.")


def _search_url(page: int) -> str:
    if page == 1:
        return SEARCH_URL
    return urljoin(SEARCH_URL, f"page/{page}/")


def _has_next_page(page_html: str, current_page: int) -> bool:
    expected_path = f"/browse-roms/page/{current_page + 1}/"
    for anchor in re.finditer(r"<a\b[^>]*>", page_html, re.IGNORECASE):
        attributes = _attributes(anchor.group(0))
        classes = attributes.get("class", "").lower().split()
        if attributes.get("aria-label", "").lower() != "next" and "next" not in classes:
            continue
        href = attributes.get("href")
        if not href:
            continue
        parsed = urlparse(urljoin(SEARCH_URL, href))
        if parsed.scheme == "https" and parsed.hostname == "romspure.cc":
            if parsed.path == expected_path:
                return True
    return False


def _attributes(tag: str) -> dict[str, str]:
    return {
        match.group("name").lower(): unescape(match.group("value"))
        for match in ATTRIBUTE_PATTERN.finditer(tag)
    }


def _clean_html(fragment: str) -> str:
    fragment = REMOVABLE_ELEMENT_PATTERN.sub("", fragment)
    text = unescape(TAG_PATTERN.sub(" ", fragment))
    return " ".join(text.split())


def _element_text_by_class(fragment: str, marker: str) -> str | None:
    for opening in re.finditer(
        r"<(?P<tag>span|div)\b(?P<attrs>[^>]*)>",
        fragment,
        re.IGNORECASE,
    ):
        classes = _attributes(opening.group("attrs")).get("class", "")
        if marker not in classes:
            continue
        closing = re.search(
            rf"</{opening.group('tag')}>\s*",
            fragment[opening.end() :],
            re.IGNORECASE,
        )
        if closing is None:
            continue
        body = fragment[opening.end() : opening.end() + closing.start()]
        value = _clean_html(body)
        if value:
            return value
    return None


def _parse_search_results(page_html: str) -> list[SearchResult]:
    results: list[SearchResult] = []
    for card_match in CARD_PATTERN.finditer(page_html):
        card = card_match.group(1)

        result_url: str | None = None
        for anchor in re.finditer(r"<a\b[^>]*>", card, re.IGNORECASE):
            href = _attributes(anchor.group(0)).get("href")
            if href and "/roms/" in href:
                candidate = urljoin(SEARCH_URL, href)
                parsed = urlparse(candidate)
                if parsed.scheme == "https" and parsed.hostname == "romspure.cc":
                    result_url = candidate
                    break
        if result_url is None:
            continue

        title_match = re.search(
            r"<h3\b[^>]*>(.*?)</h3>",
            card,
            re.IGNORECASE | re.DOTALL,
        )
        title = _clean_html(title_match.group(1)) if title_match else None

        icon: str | None = None
        image_match = re.search(r"<img\b[^>]*>", card, re.IGNORECASE)
        if image_match:
            source = _attributes(image_match.group(0)).get("src")
            if source:
                icon = urljoin(result_url, source)

        console = _element_text_by_class(card, "text-brand-muted truncate")
        if console is None:
            console = _element_text_by_class(card, "bg-brand-goldlight")

        results.append(
            {
                "title": title,
                "url": result_url,
                "icon": icon,
                "console": console,
                "size": _element_text_by_class(card, "min-w-[24px]"),
                "downloads": None,
            }
        )
    return results


def _iter_json_objects(value: object):
    if isinstance(value, dict):
        yield value
        for nested in value.values():
            yield from _iter_json_objects(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from _iter_json_objects(nested)


def _parse_exact_download_count(page_html: str) -> int | None:
    scripts = re.findall(
        r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>'
        r"(.*?)</script>",
        page_html,
        re.IGNORECASE | re.DOTALL,
    )
    for script in scripts:
        try:
            payload = json.loads(unescape(script.strip()))
        except (json.JSONDecodeError, TypeError):
            continue
        for item in _iter_json_objects(payload):
            statistic = item.get("interactionStatistic")
            if not isinstance(statistic, dict):
                continue
            interaction = statistic.get("interactionType")
            interaction_type = (
                interaction.get("@type")
                if isinstance(interaction, dict)
                else interaction
            )
            if interaction_type != "DownloadAction":
                continue
            value = statistic.get("userInteractionCount")
            if isinstance(value, bool):
                continue
            if isinstance(value, int):
                return value
            if isinstance(value, str) and re.fullmatch(r"[\d,]+", value):
                return int(value.replace(",", ""))

    visible = re.search(r"\b([\d,]+)\s+downloads?\b", page_html, re.I)
    if visible:
        return int(visible.group(1).replace(",", ""))
    return None


def _enrich_download_counts(
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
        result["downloads"] = _parse_exact_download_count(response.text)


def search_page(
    game_name: str,
    page: int = 1,
    session: requests.Session | None = None,
) -> SearchPage:
    """Pesquisa uma página de ``game_name`` no RomsPure."""
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
            raise RomsPureSearchError("Tempo limite da busca excedido.")
        try:
            response = client.get(
                _search_url(page),
                params={"q": normalized_name, "sort": "last_update"},
                headers=REQUEST_HEADERS,
                timeout=timeout,
                allow_redirects=False,
            )
            _raise_for_status(response)
        except requests.RequestException as error:
            raise RomsPureSearchError(
                "Não foi possível pesquisar no RomsPure."
            ) from error

        results = _parse_search_results(response.text)
        _enrich_download_counts(results, client, deadline)
        return {
            "results": results,
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
    except (RomsPureSearchError, ValueError) as error:
        print(f"Erro: {error}", file=sys.stderr)
        return 1

    print(json.dumps(results, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
