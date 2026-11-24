# RomsGames scripts design

## Goal

Create `romsgames_search.py` and `romsgames_game_page.py` with exactly the
same output fields as the corresponding RomsFun and RomsPure scripts. Every
unavailable field remains present with the value `None`.

## Search

`search_games(game_name)` returns items containing only `title`, `url`,
`icon`, `console`, `size`, and `downloads`.

The `/search/` HTML provides title, URL, and icon. Each result page is then
requested to obtain `gamePlatform` and `fileSize` from its `VideoGame`
JSON-LD. RomsGames exposes an asset `hits` value but does not identify it as
a download count, so `downloads` is `None` instead of mislabeling views.
Placeholder cover images are represented as `icon: None`.

For `N` results the successful search uses `1 + N` GET requests.

## Game page

`get_game_details(game_url)` returns only `name`, `description`,
`release_date`, `reviews_count`, `stars_rate`, `publisher`, `regions`,
`icon`, `screenshots`, and `downloads`.

The page JSON-LD supplies the name, description, rating, icon, screenshot,
and file size. The visible hero supplies the region and one or more
`data-media-id` values. RomsGames does not expose a game release date or
publisher in the captured flow, so those fields are `None`.

Each media ID is posted to the same game URL with the `?download` query. The
JSON response produces one download dictionary containing only `filename`,
`type`, `size`, and `download_url`. MIME type is preferred for `type`, with
the media type used as a fallback. Failed individual media resolutions keep
the item and set unavailable values to `None`.

For `N` media IDs the successful detail flow uses `1 + N` requests.

## Safety

Only HTTPS page URLs on `www.romsgames.net` are fetched. Extracted result
URLs are allowlisted to the same host, requests do not follow redirects, and
direct storage URLs are returned but never fetched.
