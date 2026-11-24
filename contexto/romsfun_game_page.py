"""Coleta detalhes e links diretos da página de um jogo no RomsFun."""

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
    "https://romsfun.com/roms/game-boy-advance/pokemon-fire-red.html"
)

REQUEST_TIMEOUT_SECONDS = 15
HTML_HEADERS = {
    "Accept": "text/html,application/xhtml+xml",
    "Referer": "https://romsfun.com/",
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


@dataclass(frozen=True)
class DownloadOption:
    filename: str | None
    type: str | None
    size: str | None
    page_url: str | None


class RomsFunGamePageError(RuntimeError):
    """Indica que os detalhes do jogo não puderam ser coletados."""


def _raise_for_status(response: requests.Response) -> None:
    response.raise_for_status()
    status_code = getattr(response, "status_code", 200)
    if 300 <= status_code < 400:
        raise requests.HTTPError("Redirecionamento inesperado do RomsFun.")


def _attributes(tag: str) -> dict[str, str]:
    return {
        match.group("name").lower(): unescape(match.group("value"))
        for match in ATTRIBUTE_PATTERN.finditer(tag)
    }


def _clean_html(fragment: str) -> str:
    fragment = REMOVABLE_ELEMENT_PATTERN.sub("", fragment)
    fragment = re.sub(r"<br\s*/?>", "\n", fragment, flags=re.IGNORECASE)
    fragment = re.sub(r"</p\s*>", "\n\n", fragment, flags=re.IGNORECASE)
    fragment = TAG_PATTERN.sub("", fragment)
    text = unescape(fragment).replace("\r", "")
    paragraphs = [" ".join(part.split()) for part in text.split("\n")]
    return "\n\n".join(part for part in paragraphs if part)


def _validate_romsfun_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "romsfun.com":
        raise ValueError("A URL deve usar HTTPS e pertencer a romsfun.com.")


def _safe_urljoin(base_url: str, candidate: str) -> str | None:
    try:
        return urljoin(base_url, candidate)
    except ValueError:
        return None


def _optional_match(pattern: str, page_html: str) -> str | None:
    match = re.search(pattern, page_html, re.IGNORECASE | re.DOTALL)
    return match.group(1) if match is not None else None


def _table_value(page_html: str, label: str) -> str | None:
    fragment = _optional_match(
        rf"<tr\b[^>]*>.*?{re.escape(label)}.*?</td>\s*"
        rf"<td\b[^>]*>(.*?)</td>\s*</tr>",
        page_html,
    )
    if fragment is None:
        return None
    return _clean_html(fragment) or None


def _find_icon(page_html: str, page_url: str) -> str | None:
    for tag in re.findall(r"<img\b[^>]*>", page_html, re.IGNORECASE):
        attributes = _attributes(tag)
        if "rf-hero-thumb" in attributes.get("class", "").split():
            source = attributes.get("src")
            if source:
                return _safe_urljoin(page_url, source)
    return None


def _find_download_page_url(page_html: str, page_url: str) -> str | None:
    for match in re.finditer(
        r"<a\b(?P<attrs>[^>]*)>(?P<body>.*?)</a>",
        page_html,
        re.IGNORECASE | re.DOTALL,
    ):
        if "Download ROM" not in _clean_html(match.group("body")):
            continue
        href = _attributes(match.group("attrs")).get("href")
        if href:
            return _safe_urljoin(page_url, href)
    return None


def _parse_game_page(
    page_html: str,
    page_url: str,
) -> tuple[GameDetails, str | None]:
    name_fragment = _optional_match(r"<h1\b[^>]*>(.*?)</h1>", page_html)
    name = _clean_html(name_fragment) or None if name_fragment is not None else None
    release_date = _table_value(page_html, "Release Date")
    publisher = _table_value(page_html, "Publisher")
    region_fragment = _optional_match(
        r"<tr\b[^>]*>.*?Region.*?</td>\s*<td\b[^>]*>(.*?)</td>\s*</tr>",
        page_html,
    )
    regions: list[str] | None = None
    if region_fragment is not None:
        parsed_regions = [
            _clean_html(value)
            for value in re.findall(
                r'<span\b[^>]*class=["\'][^"\']*\brf-fl-n\b[^"\']*["\'][^>]*>'
                r"(.*?)</span>",
                region_fragment,
                re.IGNORECASE | re.DOTALL,
            )
        ]
        regions = [region for region in parsed_regions if region] or None

    stars_rate_raw = _optional_match(
        r'data-rateyo-rating=["\']([\d.]+)["\']',
        page_html,
    )
    try:
        stars_rate = float(stars_rate_raw) if stars_rate_raw is not None else None
    except ValueError:
        stars_rate = None

    reviews_count_raw = _optional_match(
        r"\(([\d,]+)\s+reviews?\)",
        page_html,
    )
    try:
        reviews_count = (
            int(reviews_count_raw.replace(",", ""))
            if reviews_count_raw is not None
            else None
        )
    except ValueError:
        reviews_count = None

    description_fragment = _optional_match(
        r"Description\s*</h2>.*?"
        r'<div\b[^>]*class=["\'][^"\']*\brevert\b[^"\']*\bpage-content\b'
        r'[^"\']*["\'][^>]*>(.*?)</div>\s*'
        r'<div\b[^>]*class=["\'][^"\']*\bpt-2\b',
        page_html,
    )
    description = (
        _clean_html(description_fragment) or None
        if description_fragment is not None
        else None
    )

    gallery = re.search(
        r'<div\b[^>]*id=["\']romGallery["\'][^>]*>(.*?)</div>',
        page_html,
        re.IGNORECASE | re.DOTALL,
    )
    screenshots: list[str] | None = None
    if gallery is not None:
        parsed_screenshots = []
        for source in re.findall(
            r'data-src=["\']([^"\']+)["\']',
            gallery.group(1),
            re.IGNORECASE,
        ):
            screenshot_url = _safe_urljoin(page_url, unescape(source))
            if screenshot_url and screenshot_url not in parsed_screenshots:
                parsed_screenshots.append(screenshot_url)
        screenshots = parsed_screenshots or None

    details: GameDetails = {
        "name": name,
        "description": description,
        "release_date": release_date,
        "reviews_count": reviews_count,
        "stars_rate": stars_rate,
        "publisher": publisher,
        "regions": regions,
        "icon": _find_icon(page_html, page_url),
        "screenshots": screenshots,
        "downloads": None,
    }
    return details, _find_download_page_url(page_html, page_url)


def _parse_download_options(
    page_html: str,
    page_url: str,
) -> list[DownloadOption]:
    table_body = _optional_match(
        r"Normal download links.*?<tbody\b[^>]*>(.*?)</tbody>",
        page_html,
    )
    if table_body is None:
        return []
    options: list[DownloadOption] = []
    for row in re.findall(
        r"<tr\b[^>]*>(.*?)</tr>",
        table_body,
        re.IGNORECASE | re.DOTALL,
    ):
        cells = re.findall(
            r"<td\b[^>]*>(.*?)</td>",
            row,
            re.IGNORECASE | re.DOTALL,
        )
        if not cells:
            continue
        anchor = re.search(
            r"<a\b(?P<attrs>[^>]*)>(?P<body>.*?)</a>",
            cells[0],
            re.IGNORECASE | re.DOTALL,
        )
        filename = _clean_html(
            anchor.group("body") if anchor is not None else cells[0]
        ) or None
        href = (
            _attributes(anchor.group("attrs")).get("href")
            if anchor is not None
            else None
        )
        option_url = _safe_urljoin(page_url, href) if href else None
        option_type = _clean_html(cells[1]) or None if len(cells) > 1 else None
        option_size = _clean_html(cells[2]) or None if len(cells) > 2 else None
        if not any((filename, option_type, option_size, option_url)):
            continue
        options.append(
            DownloadOption(
                filename=filename,
                type=option_type,
                size=option_size,
                page_url=option_url,
            )
        )
    return options


def _variant_page_data(
    page_html: str,
    page_url: str,
) -> tuple[str, str | None]:
    container = re.search(
        r'<div\b[^>]*id=["\']download-container["\'][^>]*>',
        page_html,
        re.IGNORECASE,
    )
    ajax_url = "https://romsfun.com/wp-admin/admin-ajax.php"
    if container is not None:
        configured_url = _attributes(container.group(0)).get("data-ajax-url")
        if configured_url:
            ajax_url = _safe_urljoin(page_url, configured_url) or ajax_url

    candidate: str | None = None
    link = re.search(
        r'<a\b[^>]*id=["\']download-link["\'][^>]*>',
        page_html,
        re.IGNORECASE,
    )
    if link is not None:
        href = _attributes(link.group(0)).get("href")
        if href:
            candidate = _safe_urljoin(page_url, href)
    return ajax_url, candidate


def _get_direct_download_url(
    option: DownloadOption,
    session: requests.Session,
) -> str | None:
    if option.page_url is None:
        return None
    try:
        _validate_romsfun_url(option.page_url)
        variant_response = session.get(
            option.page_url,
            headers={**HTML_HEADERS, "Referer": option.page_url.rsplit("/", 1)[0]},
            timeout=REQUEST_TIMEOUT_SECONDS,
            allow_redirects=False,
        )
        _raise_for_status(variant_response)
    except (requests.RequestException, ValueError):
        return None

    ajax_url, candidate = _variant_page_data(
        variant_response.text,
        option.page_url,
    )
    try:
        _validate_romsfun_url(ajax_url)
        ajax_response = session.post(
            ajax_url,
            data={"action": "k_get_download"},
            headers={
                **HTML_HEADERS,
                "Accept": "application/json",
                "Origin": "https://romsfun.com",
                "Referer": option.page_url,
                "X-Requested-With": "XMLHttpRequest",
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
            allow_redirects=False,
        )
        _raise_for_status(ajax_response)
        payload = ajax_response.json()
        payload_data = payload.get("data") if isinstance(payload, dict) else None
        direct_url = (
            payload_data.get("download_url")
            if (
                isinstance(payload, dict)
                and payload.get("success") is True
                and isinstance(payload_data, dict)
            )
            else None
        )
        if isinstance(direct_url, str) and direct_url:
            return direct_url
    except (requests.RequestException, ValueError):
        pass

    if candidate:
        return candidate
    return None


def get_game_details(
    game_url: str,
    session: requests.Session | None = None,
) -> GameDetails:
    """Retorna os detalhes e downloads normais de ``game_url``."""
    _validate_romsfun_url(game_url)
    client = session or requests.Session()
    owns_session = session is None

    try:
        try:
            game_response = client.get(
                game_url,
                headers=HTML_HEADERS,
                timeout=REQUEST_TIMEOUT_SECONDS,
                allow_redirects=False,
            )
            _raise_for_status(game_response)
        except requests.RequestException as error:
            raise RomsFunGamePageError(
                "Não foi possível carregar os detalhes do jogo no RomsFun."
            ) from error

        details, downloads_page_url = _parse_game_page(
            game_response.text,
            game_url,
        )
        if downloads_page_url is None:
            return details

        try:
            _validate_romsfun_url(downloads_page_url)
            downloads_response = client.get(
                downloads_page_url,
                headers={**HTML_HEADERS, "Referer": game_url},
                timeout=REQUEST_TIMEOUT_SECONDS,
                allow_redirects=False,
            )
            _raise_for_status(downloads_response)
        except (requests.RequestException, ValueError):
            return details

        options = _parse_download_options(
            downloads_response.text,
            downloads_page_url,
        )
        if not options:
            return details
        details["downloads"] = [
            {
                "filename": option.filename,
                "type": option.type,
                "size": option.size,
                "download_url": _get_direct_download_url(option, client),
            }
            for option in options
        ]
        return details
    finally:
        if owns_session:
            client.close()


def main() -> int:
    """Coleta ``GAME_PAGE_URL`` e imprime os detalhes em JSON."""
    try:
        details = get_game_details(GAME_PAGE_URL)
    except (RomsFunGamePageError, ValueError) as error:
        print(f"Erro: {error}", file=sys.stderr)
        return 1

    print(json.dumps(details, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
