import socket

import pytest
import requests

from api import downloads as download_module
from api.downloads import (
    DownloadProxyError,
    ensure_public_https_url,
    sanitize_filename,
    select_provider_download,
)


class StubProvider:
    def __init__(self, downloads):
        self.downloads = downloads

    def details(self, _url):
        return {"downloads": self.downloads}


def test_select_provider_download_uses_server_side_details_and_index():
    provider = StubProvider([
        {"filename": "first.zip", "download_url": "https://cdn.example/first.zip"},
        {"filename": "second.7z", "download_url": "https://cdn.example/second.7z"},
    ])

    selected = select_provider_download(provider, "https://games.example/game", 1)

    assert selected.url == "https://cdn.example/second.7z"
    assert selected.filename == "second.7z"


@pytest.mark.parametrize("index", [-1, 1])
def test_select_provider_download_rejects_out_of_bounds_index(index):
    provider = StubProvider([
        {"filename": "game.zip", "download_url": "https://cdn.example/game.zip"},
    ])

    with pytest.raises(DownloadProxyError, match="Arquivo indisponível") as error:
        select_provider_download(provider, "https://games.example/game", index)

    assert error.value.status == 404


def test_sanitize_filename_removes_paths_controls_and_unsafe_names():
    assert sanitize_filename("../../Pokemon\x00 Red.zip") == "Pokemon Red.zip"
    assert sanitize_filename("..") == "download.zip"
    assert sanitize_filename(None) == "download.zip"


def test_public_url_validation_rejects_private_dns_results():
    def private_dns(_host, _port, **_kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))]

    with pytest.raises(DownloadProxyError, match="destino não permitido"):
        ensure_public_https_url("https://files.example/game.zip", resolver=private_dns)


def test_public_url_validation_rejects_private_ipv6_results():
    def private_dns(_host, _port, **_kwargs):
        return [(socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("::1", 443, 0, 0))]

    with pytest.raises(DownloadProxyError, match="destino não permitido"):
        ensure_public_https_url("https://files.example/game.zip", resolver=private_dns)


def test_public_url_validation_accepts_public_https_host():
    def public_dns(_host, _port, **_kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]

    assert ensure_public_https_url("https://files.example/game.zip", resolver=public_dns) == "https://files.example/game.zip"


@pytest.mark.parametrize("url", [
    "http://files.example/game.zip",
    "https://user:pass@files.example/game.zip",
    "https://files.example:444/game.zip",
    "https://files.example/game.zip#fragment",
])
def test_public_url_validation_rejects_malformed_or_untrusted_urls(url):
    with pytest.raises(DownloadProxyError, match="URL de download inválida"):
        ensure_public_https_url(url)


class StubHttpResponse:
    def __init__(self, status=200, location=None):
        self.status = status
        self.headers = {} if location is None else {"Location": location}

    def release_conn(self):
        pass

    def close(self):
        pass


def test_remote_connection_is_pinned_to_the_validated_ip(monkeypatch):
    calls = []

    class StubPool:
        def __init__(self, host, **kwargs):
            calls.append((host, kwargs))

        def urlopen(self, *_args, **_kwargs):
            return StubHttpResponse()

        def close(self):
            pass

    monkeypatch.setattr(download_module.urllib3, "HTTPSConnectionPool", StubPool)
    resolver = lambda *_args, **_kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]

    remote = download_module.open_pinned_download(
        "https://files.example/game.zip",
        session=requests.Session(),
        referer="https://romsfun.com/game",
        resolver=resolver,
    )

    assert calls[0][0] == "93.184.216.34"
    assert calls[0][1]["server_hostname"] == "files.example"
    assert calls[0][1]["assert_hostname"] == "files.example"
    remote.close()


def test_redirect_destination_is_revalidated_before_connecting(monkeypatch):
    class RedirectPool:
        def __init__(self, _host, **_kwargs):
            pass

        def urlopen(self, *_args, **_kwargs):
            return StubHttpResponse(302, "https://private.example/archive.zip")

        def close(self):
            pass

    monkeypatch.setattr(download_module.urllib3, "HTTPSConnectionPool", RedirectPool)

    def resolver(host, _port, **_kwargs):
        address = "10.0.0.2" if host == "private.example" else "93.184.216.34"
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 443))]

    with pytest.raises(DownloadProxyError, match="destino não permitido"):
        download_module.open_pinned_download(
            "https://files.example/game.zip",
            session=requests.Session(),
            referer="https://romsfun.com/game",
            resolver=resolver,
        )
