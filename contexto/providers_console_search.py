"""Pesquisa jogos por console em todos os provedores mapeados."""

from __future__ import annotations

import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from html import unescape
from pathlib import Path
from time import monotonic
from typing import Any, Callable, TypedDict, cast
from urllib.parse import parse_qs, unquote, urljoin, urlparse

import requests

try:
    from . import romsfun_search, romsgames_search, romspure_search, wowroms_search
except ImportError:
    import romsfun_search
    import romsgames_search
    import romspure_search
    import wowroms_search


CONSOLE_NAME = "Playstation 3"
GAME_NAME = ""  # Opcional: por exemplo, "black" junto de CONSOLE_NAME = "PS2".
CATALOG_PATH = Path(__file__).with_name("consoles-definitive.json")

PROVIDER_MODULES = {
    "romsfun": romsfun_search,
    "romspure": romspure_search,
    "romsgames": romsgames_search,
    "wowroms": wowroms_search,
}
PROVIDER_DOMAINS = {
    "romsfun": "romsfun.com",
    "romspure": "romspure.cc",
    "romsgames": "www.romsgames.net",
    "wowroms": "wowroms.com",
}


class SearchResult(TypedDict):
    title: str | None
    url: str | None
    icon: str | None
    console: str | None
    size: str | None
    downloads: int | None


class ProviderResponse(TypedDict):
    name: str
    console_name: str
    results: list[SearchResult]
    has_next: bool
    error: str | None


class ConsoleSearchResponse(TypedDict):
    name: str
    page: int
    providers: list[ProviderResponse]


class ConsoleCatalogError(RuntimeError):
    """Indica que o catálogo definitivo possui dados inválidos."""


def _normalized(value: str) -> str:
    return " ".join(value.split()).casefold()


def _validate_page(page: int) -> None:
    if isinstance(page, bool) or not isinstance(page, int) or page < 1:
        raise ValueError("A página deve ser um inteiro positivo.")


def _validate_catalog_data(catalog: object) -> dict[str, Any]:
    if not isinstance(catalog, dict) or set(catalog) != {"consoles"}:
        raise ConsoleCatalogError("O catálogo de consoles possui estrutura inválida.")
    consoles = catalog["consoles"]
    if not isinstance(consoles, list):
        raise ConsoleCatalogError("O catálogo de consoles possui estrutura inválida.")

    for console in consoles:
        if not isinstance(console, dict) or set(console) - {"image"} != {
            "name",
            "correlative_names",
            "providers",
        }:
            raise ConsoleCatalogError("Um console do catálogo possui estrutura inválida.")
        if console.get("image") is not None and not isinstance(console["image"], str):
            raise ConsoleCatalogError("A imagem do console deve ser uma referência textual.")
        aliases = console["correlative_names"]
        providers = console["providers"]
        if (
            not isinstance(console["name"], str)
            or not console["name"].strip()
            or not isinstance(aliases, list)
            or not all(isinstance(alias, str) and alias.strip() for alias in aliases)
            or not isinstance(providers, list)
        ):
            raise ConsoleCatalogError("Um console do catálogo possui valores inválidos.")
        for provider in providers:
            if not isinstance(provider, dict) or set(provider) != {
                "name",
                "console_name",
                "consult",
            }:
                raise ConsoleCatalogError("Um provedor do catálogo possui estrutura inválida.")
            if (
                not isinstance(provider["name"], str)
                or provider["name"] not in PROVIDER_MODULES
                or not isinstance(provider["console_name"], str)
                or not provider["console_name"].strip()
            ):
                raise ConsoleCatalogError("Um provedor do catálogo possui valores inválidos.")
            _prepare_request(provider, page=1)
    return catalog


def _load_catalog(path: Path | None = None) -> dict[str, Any]:
    catalog_path = path or CATALOG_PATH
    try:
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ConsoleCatalogError("Não foi possível carregar o catálogo de consoles.") from error

    return _validate_catalog_data(catalog)


def _resolve_console(
    console_name: str,
    *,
    catalog: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not isinstance(console_name, str) or not console_name.strip():
        raise ValueError("Informe o nome do console.")

    loaded = _validate_catalog_data(catalog) if catalog is not None else _load_catalog()
    searched = _normalized(console_name)
    matches = []
    for console in loaded.get("consoles", []):
        if not isinstance(console, dict):
            raise ConsoleCatalogError("O catálogo de consoles possui estrutura inválida.")
        names = [console.get("name"), *console.get("correlative_names", [])]
        if any(isinstance(name, str) and _normalized(name) == searched for name in names):
            matches.append(console)

    if not matches:
        raise ValueError(f'Console não encontrado: "{console_name.strip()}".')
    if len(matches) > 1:
        raise ValueError(f'Nome de console ambíguo: "{console_name.strip()}".')
    return matches[0]


def _validated_url(url: object, provider_name: str) -> str:
    if not isinstance(url, str):
        raise ConsoleCatalogError("A URL de consulta é inválida.")
    try:
        parsed = urlparse(url)
        valid = (
            parsed.scheme == "https"
            and parsed.hostname == PROVIDER_DOMAINS.get(provider_name)
            and parsed.username is None
            and parsed.password is None
            and parsed.port in (None, 443)
        )
    except ValueError:
        valid = False
    if not valid:
        raise ConsoleCatalogError(f"A URL de consulta do {provider_name} é inválida.")
    return url


def _prepare_request(
    provider: dict[str, Any],
    page: int,
    query: str = "",
) -> tuple[str, dict[str, str]]:
    _validate_page(page)
    provider_name = provider.get("name")
    if provider_name not in PROVIDER_MODULES:
        raise ConsoleCatalogError("Provedor desconhecido no catálogo.")

    consult = provider.get("consult")
    if not isinstance(consult, dict) or consult.get("method") != "GET":
        raise ConsoleCatalogError("A consulta do provedor é inválida.")
    url = _validated_url(consult.get("url"), provider_name)
    raw_params = consult.get("params")
    if not isinstance(raw_params, dict) or not all(
        isinstance(key, str) and isinstance(value, str)
        for key, value in raw_params.items()
    ):
        raise ConsoleCatalogError("Os parâmetros de consulta são inválidos.")
    params = dict(raw_params)

    pagination = consult.get("pagination")
    if not isinstance(pagination, dict):
        raise ConsoleCatalogError("A paginação do provedor é inválida.")
    mode = pagination.get("mode")
    if mode == "path":
        template = _validated_url(pagination.get("url_template"), provider_name)
        if "{page}" not in template:
            raise ConsoleCatalogError("O modelo de paginação é inválido.")
        if page > 1:
            url = template.format(page=page)
    elif mode == "query":
        page_param = pagination.get("page_param")
        if not isinstance(page_param, str) or not page_param:
            raise ConsoleCatalogError("O parâmetro de paginação é inválido.")
        if page > 1:
            params[page_param] = str(page)
    else:
        raise ConsoleCatalogError("O modo de paginação é inválido.")

    search = consult.get("search")
    if search is not None:
        if (
            not isinstance(search, dict)
            or search.get("param") not in {"q", "search"}
            or not isinstance(search.get("paginated", True), bool)
        ):
            raise ConsoleCatalogError("A configuração de busca do provedor é inválida.")
        if "url" in search:
            _validated_url(search["url"], provider_name)
    if query:
        if search is None:
            raise ConsoleCatalogError("O provedor não possui configuração de busca por título.")
        if "url" in search:
            url = search["url"]
            params = {}
        params[search["param"]] = query
    return url, params


def _has_next_query_page(
    page_html: str,
    current_url: str,
    current_page: int,
    page_param: str,
) -> bool:
    base = urlparse(current_url)
    expected_page = str(current_page + 1)
    for match in re.finditer(
        r"<a\b[^>]*\bhref\s*=\s*(['\"])(?P<href>.*?)\1",
        page_html,
        re.IGNORECASE | re.DOTALL,
    ):
        try:
            candidate = urlparse(urljoin(current_url, unescape(match.group("href"))))
            query = parse_qs(candidate.query)
        except ValueError:
            continue
        if (
            candidate.scheme == "https"
            and candidate.hostname == base.hostname
            and candidate.path.rstrip("/") == base.path.rstrip("/")
            and query.get(page_param) == [expected_page]
        ):
            return True
    return False


def _sanitize_result_urls(
    results: list[SearchResult],
    provider_name: str,
) -> None:
    expected_domain = PROVIDER_DOMAINS[provider_name]
    safe_results: list[SearchResult] = []
    for result in results:
        result_url = result.get("url")
        if not isinstance(result_url, str):
            continue
        decoded_url = unquote(result_url)
        if "\\" in decoded_url or any(ord(character) < 32 or ord(character) == 127 for character in decoded_url):
            continue
        try:
            parsed = urlparse(result_url)
            valid = (
                parsed.scheme == "https"
                and parsed.hostname == expected_domain
                and parsed.username is None
                and parsed.password is None
                and parsed.port in (None, 443)
            )
        except ValueError:
            valid = False
        if valid and provider_name == "romsgames":
            valid = "-rom-" in parsed.path
        if valid:
            safe_results.append(result)
    results[:] = safe_results


def _fetch_provider(
    provider: dict[str, Any],
    page: int,
    session_factory: Callable[[], requests.Session] = requests.Session,
    *,
    query: str = "",
) -> ProviderResponse:
    provider_name = cast(str, provider["name"])
    console_name = cast(str, provider["console_name"])
    module = PROVIDER_MODULES[provider_name]
    url, params = _prepare_request(provider, page, query)
    search = provider["consult"].get("search", {})
    unpaginated_search = bool(query) and search.get("paginated") is False
    if unpaginated_search and page > 1:
        return {"name": provider_name, "console_name": console_name,
                "results": [], "has_next": False, "error": None}
    deadline = monotonic() + getattr(module, "SEARCH_BUDGET_SECONDS", 18)
    timeout = min(
        getattr(module, "REQUEST_TIMEOUT_SECONDS", 15),
        max(0.001, deadline - monotonic()),
    )
    client = session_factory()
    try:
        response = client.get(
            url,
            params=params,
            headers=module.REQUEST_HEADERS,
            timeout=timeout,
            allow_redirects=False,
        )
        module._raise_for_status(response)
        results = module._parse_search_results(response.text)
        _sanitize_result_urls(results, provider_name)

        # Category cards can omit the platform. Infer it only when the game's
        # own URL matches the mapped console, never from the requested filter alone.
        _restore_console_from_urls(results, provider)
        if provider_name == "romsgames":
            results = [result for result in results if _matches_console_url(result, provider)]

        if provider_name == "romspure":
            module._enrich_download_counts(results, client, deadline)
        elif provider_name == "romsgames":
            module._enrich_results(results, client, deadline)
            _restore_console_from_urls(results, provider)

        pagination = provider["consult"]["pagination"]
        if unpaginated_search:
            has_next = False
        elif pagination["mode"] == "path":
            has_next = module._has_next_page(response.text, page)
        else:
            has_next = _has_next_query_page(
                response.text,
                url,
                page,
                pagination["page_param"],
            )
        return {
            "name": provider_name,
            "console_name": console_name,
            "results": results,
            "has_next": has_next,
            "error": None,
        }
    finally:
        client.close()


def _matches_console_url(result: SearchResult, provider: dict[str, Any]) -> bool:
    category_path = unquote(urlparse(provider["consult"]["url"]).path).strip("/")
    game_path = unquote(urlparse(result["url"] or "").path).strip("/")
    console_slug = category_path.split("/")[-1].replace("+", "-").casefold()
    if provider["name"] == "romsgames":
        return game_path.casefold().startswith(f"{console_slug}-rom-")
    if provider["name"] == "wowroms":
        return game_path.casefold().startswith(f"en/roms/{console_slug}/")
    return False


def _restore_console_from_urls(results: list[SearchResult], provider: dict[str, Any]) -> None:
    for result in results:
        if not result.get("console") and _matches_console_url(result, provider):
            result["console"] = provider["console_name"]


def _failed_provider(provider: dict[str, Any]) -> ProviderResponse:
    name = str(provider.get("name", "provedor"))
    return {
        "name": name,
        "console_name": str(provider.get("console_name", "")),
        "results": [],
        "has_next": False,
        "error": f"Não foi possível consultar {name}.",
    }


def _filter_results_by_console(
    response: ProviderResponse,
    correlative_names: list[str],
) -> None:
    accepted_names = {_normalized(name) for name in correlative_names}
    response["results"] = [
        result
        for result in response["results"]
        if isinstance(result.get("console"), str)
        and _normalized(cast(str, result["console"])) in accepted_names
    ]


def search_console(
    console_name: str, page: int = 1, *, source: str | None = None, query: str = "",
) -> ConsoleSearchResponse:
    """Consulta o console e, opcionalmente, um título usando os mapeamentos JSON."""
    _validate_page(page)
    if not isinstance(query, str) or len(query.strip()) > 200:
        raise ValueError("A pesquisa deve ter até 200 caracteres.")
    query = query.strip()
    console = _resolve_console(console_name)
    providers = console.get("providers")
    if not isinstance(providers, list):
        raise ConsoleCatalogError("Os provedores do console são inválidos.")
    if source is not None:
        if source not in PROVIDER_MODULES:
            raise ValueError("Fonte inválida.")
        providers = [provider for provider in providers if provider["name"] == source]
    if not providers:
        return {"name": console["name"], "page": page, "providers": []}

    with ThreadPoolExecutor(max_workers=len(providers)) as executor:
        futures = [executor.submit(_fetch_provider, provider, page, **({"query": query} if query else {})) for provider in providers]
        responses = []
        for provider, future in zip(providers, futures, strict=True):
            try:
                responses.append(future.result())
            except Exception:
                responses.append(_failed_provider(provider))

    correlative_names = cast(list[str], console["correlative_names"])
    for response in responses:
        _filter_results_by_console(response, correlative_names)

    return {"name": console["name"], "page": page, "providers": responses}


def main() -> int:
    """Executa a busca configurada em ``CONSOLE_NAME`` e imprime JSON."""
    try:
        response = search_console(CONSOLE_NAME, query=GAME_NAME)
    except (ConsoleCatalogError, ValueError) as error:
        print(f"Erro: {error}", file=sys.stderr)
        return 1
    print(json.dumps(response, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
