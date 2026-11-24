#!/usr/bin/env python3
"""Baixa logos reais de consoles em PNG (não fotos dos aparelhos).

Fontes (busca online nos acervos GitHub):
  1. PRO100BYTE/console-logos — seleção colorida de Dan Patrick
  2. HVR88/Monochrome-Gaming-Logos — PNGs transparentes monocromáticos

Uso:
  pip install requests pillow
  python baixar_logos_consoles.py
  python baixar_logos_consoles.py --lista consoles.txt --saida public/consoles

Uma linha por console em consoles.txt. Links na linha são ignorados.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote

import requests
from PIL import Image, UnidentifiedImageError

# Nome canônico -> nomes alternativos para pesquisa. Edite/adicione à vontade.
CONSOLES: dict[str, list[str]] = {
    # Nintendo (mesa)
    "Nintendo Entertainment System": ["NES", "Nintendo NES", "Famicom NES"],
    "Nintendo Famicom": ["Family Computer", "Nintendo Family Computer", "Famicom"],
    "Super Nintendo": ["SNES", "Super Nintendo Entertainment System", "Nintendo SNES"],
    "Super Famicom": ["Nintendo Super Famicom", "SFC"],
    "Nintendo 64": ["N64", "Nintendo N64"],
    "Nintendo GameCube": ["GameCube", "NGC"],
    "Nintendo Wii": ["Wii"],
    "Nintendo Wii U": ["Wii U", "WiiU"],
    "Nintendo Switch": ["Switch"],
    "Nintendo Switch 2": ["Switch 2"],
    "Nintendo Virtual Boy": ["Virtual Boy"],
    "Nintendo Famicom Disk System": ["Famicom Disk System", "FDS"],
    "Nintendo Pokemon Mini": ["Pokemon Mini"],
    # Nintendo (portáteis)
    "Nintendo Game & Watch": ["Game and Watch", "Game & Watch"],
    "Nintendo Game Boy": ["Game Boy", "GameBoy", "GB"],
    "Nintendo Game Boy Pocket": ["Game Boy Pocket", "GBP"],
    "Nintendo Game Boy Color": ["Game Boy Color", "GameBoy Color", "GBC"],
    "Nintendo Game Boy Advance": ["Game Boy Advance", "GBA"],
    "Nintendo Game Boy Advance SP": ["Game Boy Advance SP", "GBA SP"],
    "Nintendo Game Boy Micro": ["Game Boy Micro"],
    "Nintendo DS": ["Nintendo Dual Screen", "NDS"],
    "Nintendo DS Lite": ["DS Lite", "NDS Lite"],
    "Nintendo DSi": ["DSi"],
    "Nintendo 3DS": ["3DS"],
    "Nintendo 3DS XL": ["3DS XL"],
    "Nintendo 2DS": ["2DS"],
    "New Nintendo 3DS": ["New 3DS"],
    "New Nintendo 3DS XL": ["New 3DS XL"],
    "New Nintendo 2DS XL": ["New 2DS XL"],
    # Sony
    "Sony PlayStation": ["PlayStation 1", "PS1", "PSX", "Sony PlayStation 1"],
    "Sony PlayStation 2": ["PlayStation 2", "PS2"],
    "Sony PlayStation 3": ["PlayStation 3", "PS3"],
    "Sony PlayStation 4": ["PlayStation 4", "PS4"],
    "Sony PlayStation 5": ["PlayStation 5", "PS5"],
    "Sony PSP": ["PlayStation Portable", "PSP"],
    "Sony PlayStation Vita": ["PS Vita", "PSVita", "PSV"],
    "Sony PocketStation": ["PocketStation"],
    "Sony PlayStation Classic": ["PlayStation Classic"],
    # Microsoft
    "Microsoft Xbox": ["Xbox Original", "Original Xbox", "Xbox Classic"],
    "Microsoft Xbox 360": ["Xbox 360"],
    "Microsoft Xbox One": ["Xbox One"],
    "Microsoft Xbox Series X": ["Xbox Series X"],
    "Microsoft Xbox Series S": ["Xbox Series S"],
    # Sega
    "Sega SG-1000": ["SG-1000", "SG1000"],
    "Sega Master System": ["Master System", "SMS"],
    "Sega Genesis": ["Genesis", "Sega Mega Drive", "Mega Drive"],
    "Sega Mega Drive": ["Mega Drive", "Sega Genesis", "Genesis"],
    "Sega CD": ["Mega CD", "Sega Mega CD"],
    "Sega 32X": ["32X", "Mega 32X"],
    "Sega Saturn": ["Saturn"],
    "Sega Dreamcast": ["Dreamcast"],
    "Sega Game Gear": ["Game Gear"],
    "Sega Nomad": ["Nomad"],
    "Sega Pico": ["Pico"],
    "Sega Naomi": ["Naomi"],
    "Sega Model 2": ["Model 2"],
    "Sega Model 3": ["Model 3"],
    # Atari
    "Atari 2600": ["Atari VCS", "Atari Video Computer System"],
    "Atari 5200": [],
    "Atari 7800": [],
    "Atari Jaguar": ["Jaguar"],
    "Atari Jaguar CD": ["Jaguar CD"],
    "Atari Lynx": ["Lynx"],
    "Atari 8-bit": ["Atari 8 Bit"],
    # NEC / SNK / outros
    "NEC PC Engine": ["PC Engine", "TurboGrafx-16", "TurboGrafx 16"],
    "NEC PC Engine CD": ["PC Engine CD", "TurboGrafx CD", "Turbo CD"],
    "NEC SuperGrafx": ["SuperGrafx"],
    "NEC PC-FX": ["PC FX", "PC-FX"],
    "SNK Neo Geo AES": ["Neo Geo", "Neo Geo AES"],
    "SNK Neo Geo MVS": ["Neo Geo MVS"],
    "SNK Neo Geo CD": ["Neo Geo CD"],
    "SNK Neo Geo Pocket": ["Neo Geo Pocket", "NGP"],
    "SNK Neo Geo Pocket Color": ["Neo Geo Pocket Color", "NGPC"],
    "Bandai WonderSwan": ["WonderSwan"],
    "Bandai WonderSwan Color": ["WonderSwan Color"],
    "Bandai SwanCrystal": ["SwanCrystal"],
    "3DO Interactive Multiplayer": ["3DO", "Panasonic 3DO"],
    "Philips CD-i": ["CD-i", "Philips CDI"],
    "Magnavox Odyssey": ["Odyssey"],
    "Magnavox Odyssey 2": ["Odyssey 2", "Videopac G7000"],
    "ColecoVision": ["Coleco Vision"],
    "Intellivision": ["Mattel Intellivision"],
    "Vectrex": [],
    "Fairchild Channel F": ["Channel F"],
    "Amstrad GX4000": ["GX4000"],
    "Commodore 64": ["C64"],
    "Commodore Amiga": ["Amiga"],
    "MSX": [],
    "MSX2": ["MSX 2"],
    "ZX Spectrum": ["Sinclair ZX Spectrum"],
    "Apple II": ["Apple 2"],
    "Arcade MAME": ["MAME", "Arcade"],
}

# Fontes na ordem de preferência. A primeira tem logos coloridas de alta resolução.
REPOS = [
    {
        "repo": "PRO100BYTE/console-logos",
        "branch": "main",
        "folder": "Recommended Versions (Normal) (1 Per Platform) v2.1",
        "name": "Dan Patrick (coloridas)",
    },
    {
        "repo": "HVR88/Monochrome-Gaming-Logos",
        "branch": "main",
        "folder": "png",
        "name": "Monochrome Gaming Logos",
    },
]

# Termos acessórios encontrados em nomes de arquivos; não são modelos de console.
EXTRAS_IGNORAVEIS = {
    "logo", "logos", "official", "original", "black", "white", "outline",
    "monochrome", "flat", "transparent", "colorized", "coloured", "colored",
    "colour", "light", "dark", "version", "recommended", "image", "icon",
    "alt", "alternative", "default", "standard", "us", "usa",
    "pal", "jpn", "japan", "europe", "european", "american", "eu",
    "north", "america", "jp", "v1", "v2", "v3", "1perplatform",
}
# Palavras que mudam a plataforma (ex.: Switch vs Switch 2, DS vs DS Lite).
DISTINCOES = {
    "2", "3", "4", "5", "64", "2600", "5200", "7800", "360", "32x",
    "color", "pocket", "advance", "sp", "micro", "lite", "xl", "2ds",
    "3ds", "dsi", "wii", "u", "switch", "series", "one", "x", "s",
    "cd", "mini", "neo", "new", "plus", "pro", "aes", "mvs", "classic", "ii", "iii",
}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower().replace("&", " and ")
    s = s.replace("gameboy", "game boy").replace("wiiu", "wii u")
    return " ".join(re.findall(r"[a-z0-9]+", s))


def slug(s: str) -> str:
    return norm(s).replace(" ", "_")


def carregar_lista(caminho: Path | None) -> dict[str, list[str]]:
    if caminho is None:
        return dict(CONSOLES)
    if not caminho.exists():
        raise FileNotFoundError(f"Lista não encontrada: {caminho}")
    selecionados = {}
    for linha in caminho.read_text(encoding="utf-8-sig").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#"):
            continue
        # Suporta: - [Game Boy](https://site), "Game Boy | https://site", etc.
        linha = re.sub(r"\[([^\]]+)\]\(https?://[^)]+\)", r"\1", linha)
        linha = re.sub(r"https?://\S+", "", linha)
        linha = re.sub(r"^\s*[-*•]\s*", "", linha)
        linha = re.sub(r"^\s*\d+[.)]\s*", "", linha)
        linha = linha.strip(" |\t-:;,")
        if not linha:
            continue
        # Se corresponder a um alias cadastrado, usa o nome canônico.
        achado = next(
            (k for k, aliases in CONSOLES.items()
             if norm(linha) in {norm(k), *(norm(a) for a in aliases)}),
            linha,
        )
        selecionados[achado] = CONSOLES.get(achado, [])
    return selecionados


def github_get(session: requests.Session, url: str):
    resp = session.get(url, timeout=30)
    if resp.status_code == 403 and resp.headers.get("X-RateLimit-Remaining") == "0":
        raise RuntimeError("Limite público da API GitHub atingido. Tente novamente mais tarde ou configure GITHUB_TOKEN.")
    resp.raise_for_status()
    return resp.json()


def listar_pngs(session: requests.Session, cfg: dict) -> list[dict]:
    """Percorre apenas a pasta de logos. Não baixa o repositório inteiro."""
    pasta_inicial = cfg["folder"]
    pendentes = [pasta_inicial]
    vistos = set()
    resultados = []
    while pendentes:
        pasta = pendentes.pop()
        if pasta in vistos:
            continue
        vistos.add(pasta)
        url = (f"https://api.github.com/repos/{cfg['repo']}/contents/"
               f"{quote(pasta, safe='/')}?ref={cfg['branch']}")
        try:
            dados = github_get(session, url)
        except requests.RequestException as ex:
            print(f"  [aviso] Não foi possível listar {pasta}: {ex}")
            continue
        if not isinstance(dados, list):
            continue
        for arq in dados:
            if arq.get("type") == "dir":
                pendentes.append(arq["path"])
            elif arq.get("type") == "file" and arq["name"].lower().endswith(".png"):
                resultados.append({
                    "nome": arq["name"],
                    "path": arq["path"],
                    "url": arq.get("download_url") or (
                        f"https://raw.githubusercontent.com/{cfg['repo']}/"
                        f"{cfg['branch']}/{quote(arq['path'], safe='/')}") ,
                    "origem": cfg["repo"],
                    "fonte": cfg["name"],
                    "relpath": arq["path"][len(pasta_inicial):].strip("/").lower(),
                })
    return resultados


def pontuar(arquivo: dict, nomes: list[str]) -> float:
    """Match conservador: nunca confundir Wii com Wii U ou Game Boy com GBC."""
    stem = norm(Path(arquivo["nome"]).stem)
    tokens = stem.split()
    set_arq = set(tokens)
    melhor = -1.0
    for nome in nomes:
        alvo = set(norm(nome).split())
        if not alvo or not alvo.issubset(set_arq):
            continue
        sobras = set_arq - alvo
        # Cuidado: não aceitar versões/modelos diferentes como se fossem o mesmo.
        if sobras & DISTINCOES:
            continue
        penalidade = len(sobras - EXTRAS_IGNORAVEIS) * 15
        pontuacao = 100 - penalidade - len(sobras & EXTRAS_IGNORAVEIS) * 1.5
        if set_arq == alvo:
            pontuacao += 20
        if "alt" in sobras or "alternative" in sobras:
            pontuacao -= 12
        if "outline" in sobras:
            pontuacao -= 5
        rel = arquivo["relpath"]
        # A seleção colorida da coleção Dan Patrick tem variações para fundos.
        if "color" in rel or "colour" in rel:
            pontuacao += 4
        if "light" in rel:
            pontuacao += 2
        if "black & white" in rel or "just white" in rel or "just black" in rel:
            pontuacao -= 6
        melhor = max(melhor, pontuacao)
    return melhor


def candidatos(nome: str, aliases: list[str], arquivos: list[dict]) -> list[dict]:
    # Prefere o nome canônico, depois aliases. Evita matches fracos por substring.
    nomes = [nome] + aliases
    matches = [(pontuar(arquivo, nomes), arquivo) for arquivo in arquivos]
    return [arq for nota, arq in sorted(matches, key=lambda x: x[0], reverse=True) if nota >= 85]


def baixar_uma(nome: str, aliases: list[str], catalogos: list[list[dict]], pasta: Path):
    arquivo_final = pasta / f"{slug(nome)}.png"
    if arquivo_final.exists():
        try:
            with Image.open(arquivo_final) as img:
                img.verify()
            return {"console": nome, "status": "existente", "arquivo": str(arquivo_final)}
        except (OSError, UnidentifiedImageError):
            pass
    sessao = requests.Session()
    sessao.headers.update({"User-Agent": "RetroMancy-ConsoleLogoFetcher/1.0"})
    for arquivos in catalogos:
        for candidato in candidatos(nome, aliases, arquivos)[:5]:
            try:
                r = sessao.get(candidato["url"], timeout=35)
                r.raise_for_status()
                # Decodificar e regravar assegura PNG válido (RGBA), não HTML fingindo ser PNG.
                with Image.open(io.BytesIO(r.content)) as img:
                    img.load()
                    img = img.convert("RGBA")
                    if img.width < 80 or img.height < 25:
                        continue
                    img.save(arquivo_final, "PNG", optimize=True)
                return {
                    "console": nome, "status": "baixado", "arquivo": str(arquivo_final),
                    "fonte": candidato["fonte"], "url": candidato["url"],
                    "dimensoes": [img.width, img.height],
                }
            except (requests.RequestException, OSError, UnidentifiedImageError, ValueError):
                continue
    return {"console": nome, "status": "nao_encontrado"}


def main():
    parser = argparse.ArgumentParser(description="Baixe logos de consoles em PNG.")
    parser.add_argument("--lista", type=Path, help="TXT: um console por linha (links ignorados)")
    parser.add_argument("--saida", type=Path, default=Path("logos_consoles"))
    parser.add_argument("--workers", type=int, default=5, help="Downloads simultâneos (padrão: 5)")
    args = parser.parse_args()

    try:
        consoles = carregar_lista(args.lista)
    except (FileNotFoundError, UnicodeError) as ex:
        parser.error(str(ex))
    if not consoles:
        parser.error("A lista não contém nomes de consoles.")

    args.saida.mkdir(parents=True, exist_ok=True)
    sessao = requests.Session()
    sessao.headers.update({"Accept": "application/vnd.github+json", "User-Agent": "RetroMancy-ConsoleLogoFetcher/1.0"})
    token = __import__("os").environ.get("GITHUB_TOKEN")
    if token:
        sessao.headers["Authorization"] = f"Bearer {token}"

    catalogos = []
    for repo in REPOS:
        print(f"[busca] Indexando {repo['name']}...")
        try:
            imagens = listar_pngs(sessao, repo)
        except (requests.RequestException, RuntimeError, ValueError) as ex:
            print(f"[aviso] Falha em {repo['repo']}: {ex}")
            imagens = []
        catalogos.append(imagens)
        print(f"        {len(imagens)} imagens encontradas.")

    if not any(catalogos):
        sys.exit("Nenhum catálogo disponível. Verifique a conexão com a internet/GitHub.")

    print(f"\n[download] {len(consoles)} consoles, até {max(1, args.workers)} downloads paralelos\n")
    resultados = []
    with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 12))) as executor:
        futuros = {executor.submit(baixar_uma, nome, aliases, catalogos, args.saida): nome
                   for nome, aliases in consoles.items()}
        for futuro in as_completed(futuros):
            try:
                registro = futuro.result()
            except Exception as ex:
                registro = {"console": futuros[futuro], "status": "erro", "erro": str(ex)}
            resultados.append(registro)
            icone = "OK" if registro["status"] in ("baixado", "existente") else "--"
            print(f"[{icone}] {registro['console']}: {registro['status']}")

    resultados.sort(key=lambda item: item["console"].lower())
    (args.saida / "resultado.json").write_text(
        json.dumps(resultados, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    faltantes = [r["console"] for r in resultados if r["status"] not in ("baixado", "existente")]
    (args.saida / "nao_encontrados.txt").write_text("\n".join(faltantes), encoding="utf-8")
    baixados = sum(r["status"] in ("baixado", "existente") for r in resultados)
    print(f"\nConcluído: {baixados}/{len(consoles)} logos na pasta {args.saida.resolve()}")
    print("Relatórios: resultado.json e nao_encontrados.txt")


if __name__ == "__main__":
    main()
