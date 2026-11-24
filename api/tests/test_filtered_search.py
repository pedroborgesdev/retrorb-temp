"""Regressions at the HTTP boundary: title and console must travel together."""
import base64
from pathlib import Path
import xml.etree.ElementTree as ET

import pytest
import requests

from api.server import app


def response(body):
    result = requests.Response()
    result.status_code = 200
    result._content = body.encode()
    result.encoding = 'utf-8'
    return result


@pytest.mark.parametrize('page', [1, 2])
def test_black_ps2_replays_captured_results_without_global_search(monkeypatch, page):
    capture = Path(__file__).resolve().parents[2] / 'contexto/burpsuite/romsfun-fluxo-pesquisa-filtrada-ps2-correcao'
    item = next(item for item in ET.parse(capture).getroot().findall('item')
                if item.findtext('url') == 'https://romsfun.com/roms/playstation-2/?q=black')
    body = base64.b64decode(item.findtext('response')).decode().partition('\r\n\r\n')[2]
    calls = []

    def get(_session, url, **kwargs):
        calls.append((url, kwargs['params']))
        # The global first page doesn't contain Black for PS2.
        return response(body if kwargs['params'].get('consoles[]') == '8' else '<html></html>')

    monkeypatch.setattr(requests.Session, 'get', get)
    result = app.test_client().get('/api/search', query_string={'q': 'black', 'console': 'PS2', 'source': 'romsfun', 'page': page})
    assert result.status_code == 200
    items = result.json['sources']['romsfun']['results']
    assert any(item['title'] == 'Black' and item['console'] == 'PlayStation 2' for item in items)
    expected_url = 'https://romsfun.com/browse-all-roms/' if page == 1 else 'https://romsfun.com/browse-all-roms/page/2/'
    assert calls == [(expected_url, {'q': 'black', 'consoles[]': '8'})]


@pytest.mark.parametrize('page', [1, 2])
def test_romspure_sends_hidden_console_id_with_title_and_page(monkeypatch, page):
    calls = []

    def get(_session, url, **kwargs):
        calls.append((url, kwargs['params']))
        return response('<html></html>')

    monkeypatch.setattr(requests.Session, 'get', get)
    result = app.test_client().get('/api/search', query_string={'q': 'black', 'console': 'PS2', 'source': 'romspure', 'page': page})
    assert result.json['sources']['romspure']['error'] is None
    assert calls[0][1]['console'] == '2990'
    assert calls[0][1]['console_opts[]'] == '2990'
    assert calls[0][1]['q'] == 'black'
    assert calls[0][0] == ('https://romspure.cc/browse-roms/' if page == 1 else 'https://romspure.cc/browse-roms/page/2/')


def test_wowroms_keeps_console_from_game_url_when_card_omits_it(monkeypatch):
    calls = []
    body = '''<li class="element" data-alpha="Black Sigil">
      <a class="title-5" title="Black Sigil" href="https://wowroms.com/en/roms/nintendo-ds/black-sigil/123.html">Black Sigil</a>
    </li><li class="element" data-alpha="Wrong platform">
      <a class="title-5" title="Wrong platform" href="https://wowroms.com/en/roms/gameboy/black/456.html">Wrong platform</a>
    </li><a href="?search=black&amp;page=2">Next</a>'''

    def get(_session, url, **kwargs):
        calls.append((url, kwargs['params']))
        return response(body)

    monkeypatch.setattr(requests.Session, 'get', get)
    result = app.test_client().get('/api/search', query_string={'q': 'black', 'console': 'Nintendo DS', 'source': 'wowroms'})
    data = result.json['sources']['wowroms']
    assert [item['title'] for item in data['results']] == ['Black Sigil']
    assert data['pagination']['has_next'] is True
    assert calls == [('https://wowroms.com/en/roms/list/nintendo%2Bds', {'search': 'black'})]


def test_romsgames_filters_urls_before_enrichment_and_survives_missing_metadata(monkeypatch):
    calls = []
    body = '''<a class="shadow-lg" href="/nintendo-ds-rom-pokemon-black/"><img alt="Pokemon Black"></a>
      <a class="shadow-lg" href="/playstation-2-rom-black/"><img alt="Black"></a>'''

    def get(_session, url, **kwargs):
        calls.append(url)
        return response(body if '/search/' in url else '<html>No structured metadata</html>')

    monkeypatch.setattr(requests.Session, 'get', get)
    result = app.test_client().get('/api/search', query_string={'q': 'black', 'console': 'PS2', 'source': 'romsgames'})
    data = result.json['sources']['romsgames']
    assert [item['title'] for item in data['results']] == ['Black']
    assert data['pagination']['has_next'] is False
    assert calls == ['https://www.romsgames.net/search/', 'https://www.romsgames.net/playstation-2-rom-black/']


def test_romsgames_title_search_does_not_repeat_unpaginated_results(monkeypatch):
    def get(*args, **kwargs):
        pytest.fail('A busca por título do RomsGames não tem segunda página.')

    monkeypatch.setattr(requests.Session, 'get', get)
    result = app.test_client().get('/api/search', query_string={'q': 'black', 'console': 'PS2', 'source': 'romsgames', 'page': 2})
    data = result.json['sources']['romsgames']
    assert data['results'] == []
    assert data['error'] is None
    assert data['pagination'] == {'page': 2, 'has_next': False}
