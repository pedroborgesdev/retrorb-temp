"""Coleta detalhes e links diretos de um jogo no RomsGames."""

from __future__ import annotations

import json
import re
import sys
from html import unescape
from typing import TypedDict
from urllib.parse import unquote, urljoin, urlparse

import requests


GAME_PAGE_URL = (
    "https://www.romsgames.net/"
    "gameboy-advance-rom-pokemon-firered-version/"
)

BASE_URL = "https://www.romsgames.net/"
REQUEST_TIMEOUT_SECONDS = 15
HTML_HEADERS = {
    "Accept": "text/html,application/xhtml+xml",
    "Referer": BASE_URL,
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


class DownloadDetails(TypedDict):
    filename: str | None
    type: str | None
    size: str | None
    download_url: str | None


class GameDetails(TypedDict):
    name: str | None
    description: str | None
    release_date: str | None
    reviews_count: int | None
    stars_rate: float | None
    publisher: str | None
    regions: list[str] | None
    icon: str | None
    screenshots: list[str] | None
    downloads: list[DownloadDetails] | None


class RomsGamesGamePageError(RuntimeError):
    """Indica que a página principal do jogo não pôde ser coletada."""


def _attributes(tag: str) -> dict[str, str]:
    return {
        match.group("name").lower(): unescape(match.group("value"))
        for match in ATTRIBUTE_PATTERN.finditer(tag)
    }


def _clean_html(fragment: str) -> str:
    fragment = REMOVABLE_ELEMENT_PATTERN.sub("", fragment)
    fragment = re.sub(r"<br\s*/?>", "\n", fragment, flags=re.IGNORECASE)
    fragment = re.sub(r"</p\s*>", "\n\n", fragment, flags=re.IGNORECASE)
    text = unescape(TAG_PATTERN.sub("", fragment)).replace("\r", "")
    paragraphs = [" ".join(part.split()) for part in text.split("\n")]
    return "\n\n".join(part for part in paragraphs if part)


def _validate_romsgames_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "www.romsgames.net":
        raise ValueError(
            "A URL deve usar HTTPS e pertencer a www.romsgames.net."
        )


def _raise_for_status(response: requests.Response) -> None:
    response.raise_for_status()
    status_code = getattr(response, "status_code", 200)
    if 300 <= status_code < 400:
        raise requests.HTTPError("Redirecionamento inesperado do RomsGames.")


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


def _name(page_html: str, structured: dict[str, object]) -> str | None:
    match = re.search(
        r"<h1\b[^>]*>(.*?)</h1>",
        page_html,
        re.IGNORECASE | re.DOTALL,
    )
    if match:
        value = _clean_html(match.group(1))
        if value:
            return value
    value = structured.get("name")
    return value if isinstance(value, str) and value else None


def _rating(structured: dict[str, object]) -> tuple[float | None, int | None]:
    aggregate = structured.get("aggregateRating")
    if not isinstance(aggregate, dict):
        return None, None
    stars_rate: float | None = None
    reviews_count: int | None = None
    try:
        value = aggregate.get("ratingValue")
        if value is not None:
            stars_rate = float(value)
    except (TypeError, ValueError):
        pass
    try:
        value = aggregate.get("ratingCount")
        if value is not None and not isinstance(value, bool):
            reviews_count = int(str(value).replace(",", ""))
    except (TypeError, ValueError):
        pass
    return stars_rate, reviews_count


def _publisher(structured: dict[str, object]) -> str | None:
    publishers = structured.get("publisher")
    if isinstance(publishers, str):
        return publishers or None
    if isinstance(publishers, dict):
        publishers = [publishers]
    if isinstance(publishers, list):
        for publisher in publishers:
            if not isinstance(publisher, dict):
                continue
            name = publisher.get("name")
            if isinstance(name, str) and name:
                return name
    return None


def _regions(page_html: str) -> list[str] | None:
    for match in re.finditer(
        r'<div\b[^>]*class=["\'][^"\']*\bmb-4\b[^"\']*["\'][^>]*>'
        r"(.*?)</div>",
        page_html,
        re.IGNORECASE | re.DOTALL,
    ):
        fragment = match.group(1)
        image = re.search(r"<img\b[^>]*>", fragment, re.IGNORECASE)
        if image is None:
            continue
        source = _attributes(image.group(0)).get("src", "")
        if "-flag." not in source:
            continue
        value = _clean_html(fragment)
        return [value] if value else None
    return None


def _screenshots(
    structured: dict[str, object],
    page_url: str,
) -> list[str] | None:
    raw = structured.get("screenshot")
    values = raw if isinstance(raw, list) else [raw]
    urls = [
        urljoin(page_url, value)
        for value in values
        if isinstance(value, str) and value
    ]
    return list(dict.fromkeys(urls)) or None


def _media_ids(page_html: str) -> list[str]:
    return list(
        dict.fromkeys(
            re.findall(
                r'data-media-id=["\'](\d+)["\']',
                page_html,
                re.IGNORECASE,
            )
        )
    )


def _format_size(value: object) -> str | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, str):
        return value or None
    if not isinstance(value, (int, float)) or value < 0:
        return None
    size = float(value)
    units = ("B", "KB", "MB", "GB", "TB")
    unit_index = 0
    while size >= 1000 and unit_index < len(units) - 1:
        size /= 1000
        unit_index += 1
    if unit_index == 0:
        return f"{int(size)} B"
    formatted = f"{size:.2f}".rstrip("0").rstrip(".")
    return f"{formatted} {units[unit_index]}"


def _download_from_payload(payload: object) -> DownloadDetails:
    empty: DownloadDetails = {
        "filename": None,
        "type": None,
        "size": None,
        "download_url": None,
    }
    if not isinstance(payload, dict):
        return empty

    media = payload.get("media")
    media = media if isinstance(media, dict) else {}

    filename: str | None = None
    encoded_name = payload.get("downloadName")
    if isinstance(encoded_name, str) and encoded_name:
        filename = unquote(encoded_name)
    elif isinstance(media.get("name"), str):
        filename = media["name"]

    media_type: str | None = None
    resources = media.get("MediaResources")
    if isinstance(resources, list):
        for resource in resources:
            if not isinstance(resource, dict):
                continue
            mime_type = resource.get("mimeType")
            if isinstance(mime_type, str) and mime_type:
                media_type = mime_type
                break
    if media_type is None and isinstance(media.get("type"), str):
        media_type = media["type"]

    direct_url = payload.get("downloadUrl")
    return {
        "filename": filename,
        "type": media_type,
        "size": _format_size(media.get("size")),
        "download_url": (
            direct_url if isinstance(direct_url, str) and direct_url else None
        ),
    }


def _resolve_download(
    game_url: str,
    media_id: str,
    session: requests.Session,
) -> DownloadDetails:
    try:
        response = session.post(
            f"{game_url}?download",
            data={"mediaId": media_id},
            headers={
                **HTML_HEADERS,
                "Accept": "application/json",
                "Origin": "https://www.romsgames.net",
                "Referer": game_url,
                "X-Requested-With": "XMLHttpRequest",
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
            allow_redirects=False,
        )
        _raise_for_status(response)
        payload = response.json()
    except (requests.RequestException, ValueError):
        payload = None
    return _download_from_payload(payload)


def _parse_game_page(page_html: str, page_url: str) -> tuple[GameDetails, list[str]]:
    structured = _video_game_data(page_html)
    stars_rate, reviews_count = _rating(structured)
    description = structured.get("description")
    image = structured.get("image")
    details: GameDetails = {
        "name": _name(page_html, structured),
        "description": (
            unescape(description)
            if isinstance(description, str) and description
            else None
        ),
        "release_date": None,
        "reviews_count": reviews_count,
        "stars_rate": stars_rate,
        "publisher": _publisher(structured),
        "regions": _regions(page_html),
        "icon": (
            urljoin(page_url, image)
            if isinstance(image, str) and image
            else None
        ),
        "screenshots": _screenshots(structured, page_url),
        "downloads": None,
    }
    return details, _media_ids(page_html)


def get_game_details(
    game_url: str,
    session: requests.Session | None = None,
) -> GameDetails:
    """Retorna metadados e todos os downloads disponíveis de ``game_url``."""
    _validate_romsgames_url(game_url)
    normalized_url = game_url.rstrip("/") + "/"
    client = session or requests.Session()
    owns_session = session is None
    try:
        try:
            response = client.get(
                normalized_url,
                headers=HTML_HEADERS,
                timeout=REQUEST_TIMEOUT_SECONDS,
                allow_redirects=False,
            )
            _raise_for_status(response)
        except requests.RequestException as error:
            raise RomsGamesGamePageError(
                "Não foi possível abrir a página do jogo no RomsGames."
            ) from error

        details, media_ids = _parse_game_page(response.text, normalized_url)
        if media_ids:
            details["downloads"] = [
                _resolve_download(normalized_url, media_id, client)
                for media_id in media_ids
            ]
        return details
    finally:
        if owns_session:
            client.close()


def main() -> int:
    """Coleta ``GAME_PAGE_URL`` e imprime o resultado em JSON."""
    try:
        details = get_game_details(GAME_PAGE_URL)
    except (RomsGamesGamePageError, ValueError) as error:
        print(f"Erro: {error}", file=sys.stderr)
        return 1

    print(json.dumps(details, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
