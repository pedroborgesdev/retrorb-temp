"""Safe helpers for resolving and proxying provider download files."""

from __future__ import annotations

import ipaddress
import re
import socket
from dataclasses import dataclass
from typing import Callable, Iterable
from urllib.parse import urljoin, urlsplit, urlunsplit

import requests
import urllib3


class DownloadProxyError(RuntimeError):
    """A client-safe error raised while resolving or fetching a download."""

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class ProviderDownload:
    url: str
    filename: str
    media_type: str | None = None
    size: str | None = None


def sanitize_filename(value: object, fallback: str = "download.zip") -> str:
    """Return a portable basename suitable for Content-Disposition and disk."""
    if not isinstance(value, str):
        return fallback
    basename = value.replace("\\", "/").rsplit("/", 1)[-1]
    basename = "".join(char for char in basename if ord(char) >= 32 and ord(char) != 127)
    basename = re.sub(r"[<>:\"/\\|?*]", "_", basename).strip(" .")
    if not basename or basename in {".", ".."}:
        return fallback
    if len(basename) > 180:
        stem, dot, suffix = basename.rpartition(".")
        basename = f"{stem[:150]}.{suffix[:20]}" if dot and stem else basename[:180]
    return basename


def select_provider_download(
    provider: object,
    game_url: str,
    file_index: int,
    *,
    expected_filename: str | None = None,
    session: requests.Session | None = None,
) -> ProviderDownload:
    """Resolve an index against fresh provider details and verify its identity."""
    details_method = getattr(provider, "details")
    details = details_method(game_url, session=session) if session is not None else details_method(game_url)
    downloads = details.get("downloads") if isinstance(details, dict) else None
    if not isinstance(downloads, list) or file_index < 0 or file_index >= len(downloads):
        raise DownloadProxyError("Arquivo indisponível.", 404)
    raw = downloads[file_index]
    if not isinstance(raw, dict) or not isinstance(raw.get("download_url"), str):
        raise DownloadProxyError("Arquivo indisponível.", 404)
    filename = sanitize_filename(raw.get("filename"))
    if expected_filename is not None and sanitize_filename(expected_filename) != filename:
        raise DownloadProxyError("A lista de arquivos mudou. Recarregue a página do jogo.", 409)
    return ProviderDownload(
        url=raw["download_url"],
        filename=filename,
        media_type=raw.get("type") if isinstance(raw.get("type"), str) else None,
        size=raw.get("size") if isinstance(raw.get("size"), str) else None,
    )


def _public_addresses(hostname: str, resolver: Callable[..., Iterable[tuple]]) -> list[str]:
    try:
        records = resolver(hostname, 443, type=socket.SOCK_STREAM)
        addresses = list(dict.fromkeys(record[4][0] for record in records))
    except (OSError, IndexError, TypeError) as error:
        raise DownloadProxyError("Não foi possível resolver o servidor de download.") from error
    if not addresses:
        raise DownloadProxyError("Não foi possível resolver o servidor de download.")
    try:
        if any(not ipaddress.ip_address(address).is_global for address in addresses):
            raise DownloadProxyError("URL de download com destino não permitido.", 400)
    except ValueError as error:
        raise DownloadProxyError("URL de download inválida.", 400) from error
    return addresses


def ensure_public_https_url(
    value: str,
    *,
    resolver: Callable[..., Iterable[tuple]] = socket.getaddrinfo,
) -> str:
    """Validate syntax and DNS results before a pinned HTTPS connection."""
    try:
        parsed = urlsplit(value)
        valid = (
            len(value) <= 4096
            and not any(ord(char) < 33 for char in value)
            and "\\" not in value
            and parsed.scheme == "https"
            and bool(parsed.hostname)
            and parsed.port in {None, 443}
            and not parsed.username
            and not parsed.password
            and not parsed.fragment
        )
    except (TypeError, ValueError):
        valid = False
    if not valid:
        raise DownloadProxyError("URL de download inválida.", 400)
    _public_addresses(parsed.hostname or "", resolver)
    return value


class PinnedDownloadResponse:
    """Small response facade that owns the pinned urllib3 connection pool."""

    def __init__(self, response: urllib3.HTTPResponse, pool: urllib3.HTTPSConnectionPool, url: str):
        self.response = response
        self.pool = pool
        self.url = url
        self.status = response.status
        self.headers = response.headers

    def chunks(self, size: int = 64 * 1024):
        try:
            yield from self.response.stream(size, decode_content=False)
        finally:
            self.close()

    def close(self) -> None:
        self.response.release_conn()
        self.response.close()
        self.pool.close()


def open_pinned_download(
    url: str,
    *,
    session: requests.Session,
    referer: str,
    resolver: Callable[..., Iterable[tuple]] = socket.getaddrinfo,
    max_redirects: int = 5,
) -> PinnedDownloadResponse:
    """Open HTTPS against the exact public IP that was validated.

    TLS SNI and certificate verification still use the original hostname. Every
    redirect is resolved and pinned independently, preventing a second DNS lookup
    from changing a validated public destination into a private one.
    """
    current = url
    for redirect_count in range(max_redirects + 1):
        ensure_public_https_url(current, resolver=resolver)
        parsed = urlsplit(current)
        hostname = parsed.hostname or ""
        address = _public_addresses(hostname, resolver)[0]
        pool = urllib3.HTTPSConnectionPool(
            address,
            port=443,
            assert_hostname=hostname,
            server_hostname=hostname,
            timeout=urllib3.Timeout(connect=10, read=60),
            maxsize=1,
            block=True,
        )
        prepared = requests.Request("GET", current).prepare()
        cookie = requests.cookies.get_cookie_header(session.cookies, prepared)
        headers = {
            "Accept": "application/octet-stream,application/zip,application/x-7z-compressed,*/*",
            "Accept-Encoding": "identity",
            "Host": hostname,
            "Referer": referer,
            "User-Agent": session.headers.get("User-Agent", "Retromancy/0.1"),
        }
        if cookie:
            headers["Cookie"] = cookie
        path = urlunsplit(("", "", parsed.path or "/", parsed.query, ""))
        try:
            response = pool.urlopen("GET", path, headers=headers, redirect=False, preload_content=False, retries=False)
        except Exception as error:
            pool.close()
            raise DownloadProxyError("Não foi possível iniciar o download remoto.") from error
        if response.status in {301, 302, 303, 307, 308}:
            location = response.headers.get("Location")
            response.release_conn()
            response.close()
            pool.close()
            if not location or redirect_count >= max_redirects:
                raise DownloadProxyError("O servidor de download excedeu o limite de redirecionamentos.")
            current = urljoin(current, location)
            continue
        if response.status < 200 or response.status >= 300:
            response.release_conn()
            response.close()
            pool.close()
            raise DownloadProxyError(f"O servidor remoto recusou o download (HTTP {response.status}).")
        return PinnedDownloadResponse(response, pool, current)
    raise DownloadProxyError("O servidor de download excedeu o limite de redirecionamentos.")
