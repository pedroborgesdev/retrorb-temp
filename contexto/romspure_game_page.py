"""Coleta detalhes e links diretos da página de um jogo no RomsPure."""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from html import unescape
from typing import TypedDict
from urllib.parse import urljoin, urlparse

import requests


GAME_PAGE_URL = (
    "https://romspure.cc/roms/nintendo-game-boy/"
    "pokemon-green-version-279/"
)

AJAX_URL = "https://romspure.cc/wp-admin/admin-ajax.php"
REQUEST_TIMEOUT_SECONDS = 15
HTML_HEADERS = {
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
IMAGE_URL_PATTERN = re.compile(
    r"\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$",
    re.IGNORECASE,
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


@dataclass(frozen=True)
class DownloadOption:
    filename: str | None
    type: str | None
    size: str | None
    page_url: str
    post_id: str
    index: str


class RomsPureGamePageError(RuntimeError):
    """Indica que a página principal do jogo não pôde ser coletada."""


def _raise_for_status(response: requests.Response) -> None:
    response.raise_for_status()
    status_code = getattr(response, "status_code", 200)
    if 300 <= status_code < 400:
        raise requests.HTTPError("Redirecionamento inesperado do RomsPure.")


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


def _validate_romspure_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "romspure.cc":
        raise ValueError("A URL deve usar HTTPS e pertencer a romspure.cc.")


def _first_match(pattern: str, page_html: str) -> str | None:
    match = re.search(pattern, page_html, re.IGNORECASE | re.DOTALL)
    return match.group(1) if match else None


def _video_game_data(page_html: str) -> dict[str, object]:
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


def _info_tile(page_html: str, label: str) -> str | None:
    for tile in re.findall(
        r'<div\b[^>]*class=["\'][^"\']*\brs-info__tile\b[^"\']*["\']'
        r"[^>]*>(.*?)</div>",
        page_html,
        re.IGNORECASE | re.DOTALL,
    ):
        key = _first_match(
            r'<span\b[^>]*class=["\'][^"\']*\brs-info__k\b[^"\']*'
            r'["\'][^>]*>(.*?)</span>',
            tile,
        )
        if key is not None and _clean_html(key).casefold() == label.casefold():
            return tile
    return None


def _info_value(page_html: str, label: str) -> str | None:
    tile = _info_tile(page_html, label)
    if tile is None:
        return None
    value = _first_match(
        r'<span\b[^>]*class=["\'][^"\']*\brs-info__v\b[^"\']*'
        r'["\'][^>]*>(.*)',
        tile,
    )
    if value is None:
        return None
    cleaned = _clean_html(value)
    return cleaned or None


def _regions(page_html: str) -> list[str] | None:
    tile = _info_tile(page_html, "Region")
    if tile is None:
        return None
    values = [
        _clean_html(value)
        for value in re.findall(
            r"<a\b[^>]*>(.*?)</a>", tile, re.IGNORECASE | re.DOTALL
        )
    ]
    values = [value for value in values if value]
    if values:
        return list(dict.fromkeys(values))
    value = _info_value(page_html, "Region")
    return [value] if value else None


def _section_by_heading(page_html: str, headings: set[str]) -> str | None:
    for section in re.findall(
        r"<section\b[^>]*>(.*?)</section>",
        page_html,
        re.IGNORECASE | re.DOTALL,
    ):
        heading = _first_match(r"<h[1-6]\b[^>]*>(.*?)</h[1-6]>", section)
        if heading and _clean_html(heading).casefold() in headings:
            return section
    return None


def _description(page_html: str) -> str | None:
    section = _section_by_heading(page_html, {"description"})
    if section is None:
        return None
    content = _first_match(
        r'<div\b[^>]*class=["\'][^"\']*\bentry-content\b[^"\']*'
        r'["\'][^>]*>(.*)</div>',
        section,
    )
    if content is None:
        return None
    cleaned = _clean_html(content)
    return cleaned or None


def _icon(page_html: str, page_url: str, structured: dict[str, object]) -> str | None:
    for tag in re.findall(r"<img\b[^>]*>", page_html, re.IGNORECASE):
        attributes = _attributes(tag)
        if "rs-cover" not in attributes.get("class", "").split():
            continue
        source = attributes.get("src")
        if source:
            return urljoin(page_url, source)
    image = structured.get("image")
    if isinstance(image, str) and image:
        return urljoin(page_url, image)
    return None


def _screenshots(page_html: str, page_url: str) -> list[str] | None:
    section = _section_by_heading(
        page_html,
        {"screenshot", "screenshots", "gallery"},
    )
    if section is None:
        return None

    urls: list[str] = []
    without_linked_images = section
    for anchor in re.finditer(
        r"<a\b(?P<attrs>[^>]*)>(?P<body>.*?)</a>",
        section,
        re.IGNORECASE | re.DOTALL,
    ):
        href = _attributes(anchor.group("attrs")).get("href")
        if href and IMAGE_URL_PATTERN.search(href):
            urls.append(urljoin(page_url, href))
        without_linked_images = without_linked_images.replace(anchor.group(0), "")

    for tag in re.findall(r"<img\b[^>]*>", without_linked_images, re.I):
        attributes = _attributes(tag)
        source = attributes.get("data-src") or attributes.get("src")
        if source and IMAGE_URL_PATTERN.search(source):
            urls.append(urljoin(page_url, source))
    unique = list(dict.fromkeys(urls))
    return unique or None


def _rating_values(
    page_html: str,
    structured: dict[str, object],
) -> tuple[float | None, int | None]:
    rating = structured.get("aggregateRating")
    stars_rate: float | None = None
    reviews_count: int | None = None
    if isinstance(rating, dict):
        try:
            raw_stars = rating.get("ratingValue")
            if raw_stars is not None:
                stars_rate = float(raw_stars)
        except (TypeError, ValueError):
            pass
        try:
            raw_count = rating.get("ratingCount")
            if raw_count is not None and not isinstance(raw_count, bool):
                reviews_count = int(str(raw_count).replace(",", ""))
        except (TypeError, ValueError):
            pass

    if stars_rate is None:
        raw_stars = _first_match(
            r'data-rateyo-rating=["\']([\d.]+)["\']', page_html
        )
        if raw_stars is not None:
            stars_rate = float(raw_stars)
    if reviews_count is None:
        rating_fragment = _first_match(
            r'<span\b[^>]*class=["\'][^"\']*\brs-meta__rating\b'
            r'[^"\']*["\'][^>]*>(.*?)</span>\s*</span>',
            page_html,
        )
        if rating_fragment:
            count_match = re.search(r"\(([\d,]+)\)", rating_fragment)
            if count_match:
                reviews_count = int(count_match.group(1).replace(",", ""))
    return stars_rate, reviews_count


def _publisher(page_html: str, structured: dict[str, object]) -> str | None:
    visible = _info_value(page_html, "Publisher")
    if visible:
        return visible
    publishers = structured.get("publisher")
    if isinstance(publishers, dict):
        publishers = [publishers]
    if isinstance(publishers, list):
        for publisher in publishers:
            if isinstance(publisher, dict) and isinstance(publisher.get("name"), str):
                return publisher["name"]
    return None


def _download_page_url(page_html: str, page_url: str) -> str | None:
    for match in re.finditer(
        r"<a\b(?P<attrs>[^>]*)>(?P<body>.*?)</a>",
        page_html,
        re.IGNORECASE | re.DOTALL,
    ):
        href = _attributes(match.group("attrs")).get("href")
        if not href or "/download/" not in href:
            continue
        if "download" in _clean_html(match.group("body")).casefold():
            return urljoin(page_url, href).rstrip("/")
    return None


def _parse_game_page(page_html: str, page_url: str) -> tuple[GameDetails, str | None]:
    structured = _video_game_data(page_html)
    name_fragment = _first_match(r"<h1\b[^>]*>(.*?)</h1>", page_html)
    structured_name = structured.get("name")
    name = _clean_html(name_fragment) if name_fragment else None
    if not name and isinstance(structured_name, str):
        name = structured_name

    stars_rate, reviews_count = _rating_values(page_html, structured)
    details: GameDetails = {
        "name": name or None,
        "description": _description(page_html),
        "release_date": _info_value(page_html, "Released"),
        "reviews_count": reviews_count,
        "stars_rate": stars_rate,
        "publisher": _publisher(page_html, structured),
        "regions": _regions(page_html),
        "icon": _icon(page_html, page_url, structured),
        "screenshots": _screenshots(page_html, page_url),
        "downloads": None,
    }
    return details, _download_page_url(page_html, page_url)


def _text_by_class(fragment: str, marker: str) -> str | None:
    for opening in re.finditer(
        r"<(?P<tag>div|span)\b(?P<attrs>[^>]*)>",
        fragment,
        re.IGNORECASE,
    ):
        if marker not in _attributes(opening.group("attrs")).get("class", ""):
            continue
        closing = re.search(
            rf"</{opening.group('tag')}>\s*",
            fragment[opening.end() :],
            re.IGNORECASE,
        )
        if closing is None:
            continue
        body = fragment[opening.end() : opening.end() + closing.start()]
        cleaned = _clean_html(body)
        if cleaned:
            return cleaned
    return None


def _parse_download_options(
    page_html: str,
    page_url: str,
) -> list[DownloadOption]:
    post_id_match = re.search(r"-(\d+)$", urlparse(page_url).path.rstrip("/"))
    if post_id_match is None:
        hidden = re.search(
            r'<input\b[^>]*name=["\']post_id["\'][^>]*value=["\'](\d+)["\']',
            page_html,
            re.IGNORECASE,
        )
        post_id = hidden.group(1) if hidden else None
    else:
        post_id = post_id_match.group(1)
    if post_id is None:
        return []

    options: list[DownloadOption] = []
    for match in re.finditer(
        r"<a\b(?P<attrs>[^>]*)>(?P<body>.*?)</a>",
        page_html,
        re.IGNORECASE | re.DOTALL,
    ):
        href = _attributes(match.group("attrs")).get("href")
        if not href:
            continue
        option_url = urljoin(page_url + "/", href).rstrip("/")
        parsed = urlparse(option_url)
        index_match = re.search(r"/(\d+)$", parsed.path)
        if parsed.hostname != "romspure.cc" or index_match is None:
            continue
        if not option_url.startswith(page_url.rstrip("/") + "/"):
            continue

        body = match.group("body")
        options.append(
            DownloadOption(
                filename=_text_by_class(body, "break-words"),
                type=_text_by_class(body, "truncate"),
                size=_text_by_class(body, "font-semibold shrink-0"),
                page_url=option_url,
                post_id=post_id,
                index=index_match.group(1),
            )
        )
    return options


def _get_nonce(session: requests.Session, referer: str) -> str | None:
    try:
        response = session.post(
            AJAX_URL,
            data={"action": "romspure_get_nonce"},
            headers={
                **HTML_HEADERS,
                "Accept": "application/json",
                "Origin": "https://romspure.cc",
                "Referer": referer,
                "X-Requested-With": "XMLHttpRequest",
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
            allow_redirects=False,
        )
        _raise_for_status(response)
        payload = response.json()
    except (requests.RequestException, ValueError):
        return None
    nonce = (
        payload.get("data", {}).get("nonce")
        if isinstance(payload, dict) and payload.get("success") is True
        else None
    )
    return nonce if isinstance(nonce, str) and nonce else None


def _get_direct_url(
    option: DownloadOption,
    nonce: str,
    session: requests.Session,
) -> str | None:
    try:
        response = session.post(
            AJAX_URL,
            data={
                "action": "app_get_download_link",
                "post_id": option.post_id,
                "index": option.index,
                "nonce": nonce,
            },
            headers={
                **HTML_HEADERS,
                "Accept": "application/json",
                "Origin": "https://romspure.cc",
                "Referer": option.page_url,
                "X-Requested-With": "XMLHttpRequest",
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
            allow_redirects=False,
        )
        _raise_for_status(response)
        payload = response.json()
    except (requests.RequestException, ValueError):
        return None
    direct_url = (
        payload.get("data", {}).get("url")
        if isinstance(payload, dict) and payload.get("success") is True
        else None
    )
    return direct_url if isinstance(direct_url, str) and direct_url else None


def _collect_downloads(
    page_url: str,
    session: requests.Session,
    game_url: str,
) -> list[DownloadDetails] | None:
    _validate_romspure_url(page_url)
    try:
        response = session.get(
            page_url,
            headers={**HTML_HEADERS, "Referer": game_url},
            timeout=REQUEST_TIMEOUT_SECONDS,
            allow_redirects=False,
        )
        _raise_for_status(response)
    except requests.RequestException:
        return None

    options = _parse_download_options(response.text, page_url)
    if not options:
        return None
    nonce = _get_nonce(session, options[0].page_url)

    downloads: list[DownloadDetails] = []
    for option in options:
        downloads.append(
            {
                "filename": option.filename,
                "type": option.type,
                "size": option.size,
                "download_url": (
                    _get_direct_url(option, nonce, session) if nonce else None
                ),
            }
        )
    return downloads


def get_game_details(
    game_url: str,
    session: requests.Session | None = None,
) -> GameDetails:
    """Retorna os detalhes e downloads disponíveis de ``game_url``."""
    _validate_romspure_url(game_url)
    client = session or requests.Session()
    owns_session = session is None
    try:
        try:
            response = client.get(
                game_url,
                headers=HTML_HEADERS,
                timeout=REQUEST_TIMEOUT_SECONDS,
                allow_redirects=False,
            )
            _raise_for_status(response)
        except requests.RequestException as error:
            raise RomsPureGamePageError(
                "Não foi possível abrir a página do jogo no RomsPure."
            ) from error

        details, downloads_page_url = _parse_game_page(response.text, game_url)
        if downloads_page_url:
            details["downloads"] = _collect_downloads(
                downloads_page_url,
                client,
                game_url,
            )
        return details
    finally:
        if owns_session:
            client.close()


def main() -> int:
    """Coleta ``GAME_PAGE_URL`` e imprime o resultado em JSON."""
    try:
        details = get_game_details(GAME_PAGE_URL)
    except (RomsPureGamePageError, ValueError) as error:
        print(f"Erro: {error}", file=sys.stderr)
        return 1

    print(json.dumps(details, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
