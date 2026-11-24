"""Local HTTP API. Run from the project root: python -m api.server."""

import logging
import os
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit

import requests
from flask import Flask, Response, jsonify, request, stream_with_context

from api.downloads import DownloadProxyError, open_pinned_download, select_provider_download
from api.providers import PROVIDERS
from contexto import providers_console_search as console_catalog

logger = logging.getLogger(__name__)
executor = ThreadPoolExecutor(max_workers=8, thread_name_prefix="provider")
app = Flask(__name__)
app.config["TRUSTED_HOSTS"] = ["localhost", "127.0.0.1", "[::1]"]
allowed_origins = set(os.environ.get(
    "CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173"
).split(","))


@app.before_request
def check_origin():
    origin = request.headers.get("Origin")
    # Electron file:// renderer has an opaque origin. This API only exposes reads.
    if origin and origin != "null" and origin not in allowed_origins and origin != request.host_url.rstrip("/"):
        return jsonify(error="Origem não autorizada."), 403


@app.after_request
def response_headers(response):
    origin = request.headers.get("Origin")
    if origin in allowed_origins or origin == "null":
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


def search_provider(source: str, query: str, page: int) -> dict:
    provider = PROVIDERS[source]
    try:
        result = provider.search(query, page=page)
        return {
            "label": provider.label, "results": result["results"], "error": None,
            "pagination": {"page": result["page"], "has_next": result["has_next"]},
        }
    except Exception:
        logger.exception("Search failed: %s", source)
        return {
            "label": provider.label, "results": [],
            "error": f"Não foi possível consultar {provider.label}. Tente novamente.",
            "pagination": {"page": page, "has_next": False},
        }


@app.get("/api/health")
def health():
    return jsonify(status="ok")


@app.get("/api/search")
def search():
    query = request.args.get("q", "").strip()
    console_name = request.args.get("console", "").strip()
    source = request.args.get("source")
    try:
        page = int(request.args.get("page", "1"))
    except ValueError:
        return jsonify(error="Página inválida."), 400
    if (not query and not console_name) or len(query) > 200:
        return jsonify(error="Informe uma pesquisa entre 1 e 200 caracteres."), 400
    if not 1 <= page <= 500:
        return jsonify(error="A página deve estar entre 1 e 500."), 400
    if source is not None and source not in PROVIDERS:
        return jsonify(error="Fonte inválida."), 400
    if console_name:
        try:
            console = console_catalog._resolve_console(console_name)
            response = console_catalog.search_console(console["name"], page, source=source, query=query)
            results = {}
            for provider in response["providers"]:
                key = provider["name"]
                entry = results.setdefault(key, {
                    "label": PROVIDERS[key].label, "results": [], "error": None,
                    "pagination": {"page": page, "has_next": False},
                })
                entry["results"].extend(provider["results"])
                entry["error"] = entry["error"] or provider["error"]
                entry["pagination"]["has_next"] |= provider["has_next"]
            return jsonify(query=query, console=console["name"], sources=results)
        except ValueError as error:
            return jsonify(error=str(error)), 400
        except console_catalog.ConsoleCatalogError:
            logger.exception("Console catalog unavailable")
            return jsonify(error="Não foi possível carregar o catálogo de consoles."), 503
    selected = [source] if source else list(PROVIDERS)
    jobs = {key: executor.submit(search_provider, key, query, page) for key in selected}
    return jsonify(query=query, sources={key: job.result() for key, job in jobs.items()})


@app.get("/api/consoles")
def consoles():
    """Return the complete definitive catalog, including optional image references."""
    try:
        return jsonify(console_catalog._load_catalog())
    except console_catalog.ConsoleCatalogError:
        logger.exception("Console catalog unavailable")
        return jsonify(error="Não foi possível carregar o catálogo de consoles."), 503


def validate_game_url(url: str, domain: str) -> bool:
    try:
        parsed = urlsplit(url)
        return (
            len(url) <= 2048 and not any(ord(char) < 33 for char in url)
            and "\\" not in url and parsed.scheme == "https"
            and parsed.hostname in {domain, f"www.{domain}"}
            and parsed.port in {None, 443} and not parsed.username and not parsed.password
            and bool(parsed.path.strip("/")) and not parsed.fragment
        )
    except ValueError:
        return False


@app.get("/api/game")
def game():
    source = request.args.get("source", "")
    provider = PROVIDERS.get(source)
    url = request.args.get("url", "")
    if provider is None:
        return jsonify(error="Fonte inválida."), 400
    if not validate_game_url(url, provider.domain):
        return jsonify(error="URL inválida para esta fonte."), 400
    try:
        details = provider.details(url)
        return jsonify(source=source, label=provider.label, game=details)
    except Exception:
        logger.exception("Details failed: %s", source)
        return jsonify(error=f"Não foi possível carregar este jogo em {provider.label}. Tente novamente."), 502


@app.get("/api/download")
def download():
    source = request.args.get("source", "")
    provider = PROVIDERS.get(source)
    game_url = request.args.get("url", "")
    expected_filename = request.args.get("filename")
    if provider is None:
        return jsonify(error="Fonte inválida."), 400
    if not validate_game_url(game_url, provider.domain):
        return jsonify(error="URL inválida para esta fonte."), 400
    try:
        file_index = int(request.args.get("file", ""))
    except ValueError:
        return jsonify(error="Arquivo inválido."), 400

    client = requests.Session()
    try:
        selected = select_provider_download(
            provider,
            game_url,
            file_index,
            expected_filename=expected_filename,
            session=client,
        )
        remote = open_pinned_download(selected.url, session=client, referer=game_url)
    except DownloadProxyError as error:
        client.close()
        return jsonify(error=str(error)), error.status
    except Exception:
        client.close()
        logger.exception("Download resolution failed: %s", source)
        return jsonify(error=f"Não foi possível preparar este download em {provider.label}."), 502

    def body():
        try:
            yield from remote.chunks()
        finally:
            remote.close()
            client.close()

    response = Response(stream_with_context(body()), mimetype="application/octet-stream")
    response.headers.set("Content-Disposition", "attachment", filename=selected.filename)
    content_length = remote.headers.get("Content-Length")
    if isinstance(content_length, str) and content_length.isdigit():
        response.headers["Content-Length"] = content_length
    return response


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("API_PORT", "5000")), threaded=True, debug=False)
