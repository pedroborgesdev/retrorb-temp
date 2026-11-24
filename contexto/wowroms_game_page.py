"""Coleta detalhes e o link direto de um jogo no WowRoms."""

from __future__ import annotations

import hashlib
import json
import re
import sys
import time
from html import unescape
from typing import TypedDict
from urllib.parse import urljoin, urlparse

import requests


GAME_PAGE_URL = (
    "https://wowroms.com/en/roms/nintendo-gameboy/"
    "pokemon-versione-rossa-italy-sgb-enhanced/9924.html"
)
REQUEST_TIMEOUT_SECONDS = 15
HTML_HEADERS = {
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
TAG_PATTERN = re.compile(r"<[^>]+>")
REMOVABLE_ELEMENT_PATTERN = re.compile(
    r"<(?:script|style|svg)\b[^>]*>.*?</(?:script|style|svg)>",
    re.IGNORECASE | re.DOTALL,
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


class WowRomsGamePageError(RuntimeError):
    """Indica que a página principal do jogo não pôde ser carregada."""


def _attributes(fragment: str) -> dict[str, str]:
    return {
        match.group("name").lower(): unescape(match.group("value"))
        for match in ATTRIBUTE_PATTERN.finditer(fragment)
    }


def _clean_html(fragment: str) -> str:
    fragment = REMOVABLE_ELEMENT_PATTERN.sub(" ", fragment)
    return " ".join(unescape(TAG_PATTERN.sub(" ", fragment)).split())


def _safe_urljoin(base_url: str, candidate: str) -> str | None:
    try:
        return urljoin(base_url, candidate)
    except ValueError:
        return None


def _validate_wowroms_url(url: str) -> None:
    if (
        not isinstance(url, str)
        or "\\" in url
        or any(ord(character) < 32 or ord(character) == 127 for character in url)
    ):
        raise ValueError("A URL deve usar HTTPS e pertencer a wowroms.com.")

    try:
        prepared_url = requests.Request("GET", url).prepare().url
        if prepared_url is None:
            raise ValueError
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
                raise ValueError
    except (ValueError, requests.RequestException) as error:
        raise ValueError(
            "A URL deve usar HTTPS e pertencer a wowroms.com."
        ) from error


def _raise_for_status(response: requests.Response) -> None:
    response.raise_for_status()
    status_code = getattr(response, "status_code", 200)
    if 300 <= status_code < 400:
        raise requests.HTTPError("Redirecionamento inesperado do WowRoms.")


def _optional_match(pattern: str, page_html: str) -> str | None:
    match = re.search(pattern, page_html, re.IGNORECASE | re.DOTALL)
    return match.group(1) if match is not None else None


def _clean_optional(fragment: str | None) -> str | None:
    if fragment is None:
        return None
    return _clean_html(fragment) or None


def _meta_description(page_html: str) -> str | None:
    for tag in re.findall(r"<meta\b[^>]*>", page_html, re.IGNORECASE):
        attributes = _attributes(tag)
        if attributes.get("name", "").lower() == "description":
            content = attributes.get("content")
            return " ".join(content.split()) if content else None
    return None


def _labeled_value(page_html: str, label: str) -> str | None:
    expected_label = label.rstrip(":").strip().casefold()
    for item in re.finditer(
        r"<li\b[^>]*>(?P<body>.*?)</li>",
        page_html,
        re.IGNORECASE | re.DOTALL,
    ):
        span = re.search(
            r"<span\b[^>]*>(.*?)</span>",
            item.group("body"),
            re.IGNORECASE | re.DOTALL,
        )
        if span is None:
            continue
        found_label = _clean_html(span.group(1)).rstrip(":").strip().casefold()
        if found_label != expected_label:
            continue
        value = re.search(
            r"<b\b[^>]*>(.*?)</b>",
            item.group("body"),
            re.IGNORECASE | re.DOTALL,
        )
        return _clean_optional(value.group(1)) if value is not None else None
    return None


def _find_icon(page_html: str, page_url: str) -> str | None:
    for tag in re.findall(r"<img\b[^>]*>", page_html, re.IGNORECASE):
        attributes = _attributes(tag)
        if "imgborder" not in attributes.get("class", "").split():
            continue
        source = attributes.get("src") or attributes.get("data-src")
        return _safe_urljoin(page_url, source) if source else None
    return None


def _find_ajax_url(page_html: str, page_url: str) -> str | None:
    raw_url = _optional_match(
        r"\bajaxLinkUrl\s*=\s*[\"']([^\"']+)[\"']",
        page_html,
    )
    return _safe_urljoin(page_url, unescape(raw_url)) if raw_url else None


def _find_download_page_url(page_html: str, page_url: str) -> str | None:
    for anchor in re.finditer(
        r"<a\b(?P<attrs>[^>]*)>(?P<body>.*?)</a>",
        page_html,
        re.IGNORECASE | re.DOTALL,
    ):
        if _clean_html(anchor.group("body")).lower() != "download rom":
            continue
        href = _attributes(anchor.group("attrs")).get("href")
        return _safe_urljoin(page_url, href) if href else None
    return None


def _timestamp_ms() -> int:
    return int(time.time() * 1000)


def _resolve_direct_url(
    ajax_url: str,
    referer: str,
    session: requests.Session,
) -> str | None:
    try:
        _validate_wowroms_url(ajax_url)
        key = str(_timestamp_ms())
        token = hashlib.md5(key.encode()).hexdigest()
        response = session.post(
            ajax_url,
            params={"k": key, "t": token},
            headers={
                **HTML_HEADERS,
                "Accept": "application/json",
                "Origin": "https://wowroms.com",
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

    link = (
        payload.get("link")
        if isinstance(payload, dict) and payload.get("s") is True
        else None
    )
    if not isinstance(link, str) or not link.strip():
        return None
    try:
        parsed = urlparse(link)
    except ValueError:
        return None
    if parsed.scheme != "https" or not parsed.hostname:
        return None
    return link


def _parse_game_page(
    page_html: str,
    page_url: str,
) -> tuple[GameDetails, str | None, str | None]:
    name = _clean_optional(
        _optional_match(
            r'<h1\b[^>]*id=["\']page-product-title["\'][^>]*>(.*?)</h1>',
            page_html,
        )
    )
    year = _labeled_value(page_html, "Year")
    release_date = year if year and year != "0" else None
    region = _labeled_value(page_html, "Region")
    regions = [region] if region and region.lower() != "unknown" else None
    filename = _labeled_value(page_html, "File Name")
    size = _labeled_value(page_html, "File Size")
    ajax_url = _find_ajax_url(page_html, page_url)
    download_page_url = _find_download_page_url(page_html, page_url)

    downloads: list[DownloadDetails] | None = None
    if any((filename, size, ajax_url, download_page_url)):
        downloads = [
            {
                "filename": filename,
                "type": None,
                "size": size,
                "download_url": None,
            }
        ]

    details: GameDetails = {
        "name": name,
        "description": _meta_description(page_html),
        "release_date": release_date,
        "reviews_count": None,
        "stars_rate": None,
        "publisher": None,
        "regions": regions,
        "icon": _find_icon(page_html, page_url),
        "screenshots": None,
        "downloads": downloads,
    }
    return details, ajax_url, download_page_url


def get_game_details(
    game_url: str,
    session: requests.Session | None = None,
) -> GameDetails:
    """Retorna os detalhes opcionais e o link direto de ``game_url``."""
    _validate_wowroms_url(game_url)
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
            raise WowRomsGamePageError(
                "Não foi possível abrir a página do jogo no WowRoms."
            ) from error

        details, ajax_url, download_page_url = _parse_game_page(
            response.text,
            game_url,
        )
        ajax_referer = game_url
        if ajax_url is None and download_page_url is not None:
            try:
                _validate_wowroms_url(download_page_url)
                download_response = client.get(
                    download_page_url,
                    headers={**HTML_HEADERS, "Referer": game_url},
                    timeout=REQUEST_TIMEOUT_SECONDS,
                    allow_redirects=False,
                )
                _raise_for_status(download_response)
                ajax_url = _find_ajax_url(
                    download_response.text,
                    download_page_url,
                )
                ajax_referer = download_page_url
            except (requests.RequestException, ValueError):
                return details

        if ajax_url is not None and details["downloads"]:
            details["downloads"][0]["download_url"] = _resolve_direct_url(
                ajax_url,
                ajax_referer,
                client,
            )
        return details
    finally:
        if owns_session:
            client.close()


def main() -> int:
    """Coleta ``GAME_PAGE_URL`` e imprime os detalhes em JSON."""
    try:
        details = get_game_details(GAME_PAGE_URL)
    except (WowRomsGamePageError, ValueError) as error:
        print(f"Erro: {error}", file=sys.stderr)
        return 1

    print(json.dumps(details, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

