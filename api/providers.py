"""Provider registry. Scrapers stay independent and unchanged in contexto/."""

from dataclasses import dataclass
from typing import Callable

from contexto import (
    romsfun_game_page, romsfun_search,
    romspure_game_page, romspure_search,
    romsgames_game_page, romsgames_search,
    wowroms_game_page, wowroms_search,
)


@dataclass(frozen=True)
class Provider:
    label: str
    domain: str
    search: Callable
    details: Callable


PROVIDERS = {
    "romsfun": Provider("RomsFun", "romsfun.com", romsfun_search.search_page, romsfun_game_page.get_game_details),
    "romspure": Provider("RomsPure", "romspure.cc", romspure_search.search_page, romspure_game_page.get_game_details),
    "romsgames": Provider("RomsGames", "romsgames.net", romsgames_search.search_page, romsgames_game_page.get_game_details),
    "wowroms": Provider("WowRoms", "wowroms.com", wowroms_search.search_page, wowroms_game_page.get_game_details),
}
