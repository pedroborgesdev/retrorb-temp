"""Generate application and brand icon packages from PNG sources.

Run through `npm run icons`, or:
    python scripts/prepare_icons.py --output public/icons
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    raise SystemExit(
        "Instale o gerador de ícones: python -m pip install -r scripts/requirements.txt"
    ) from None


ROOT = Path(__file__).resolve().parent.parent
# ICO entries encode dimensions in one byte: 0 represents 256, not 512/1024.
ICO_SIZES = (16, 20, 24, 28, 32, 40, 48, 64, 96, 128, 256)
PNG_SIZES = tuple(sorted(set(ICO_SIZES) | {72, 144, 152, 180, 192, 384, 512, 1024}))
PRIMARY_NAME = "retrorb"
BRAND_NAMES = (PRIMARY_NAME, "retrorb-extended", "retrorb-typography")


def prepare_one(source: Path, output: Path, name: str) -> tuple[int, list[int]]:
    with Image.open(source) as original:
        if original.format != "PNG":
            raise ValueError(f"A imagem de origem {source.name} deve ser PNG.")
        image = ImageOps.exif_transpose(original).convert("RGBA")
    dimensions = image.size

    if name == "retrorb-extended":
        bbox = image.getbbox()
        if bbox:
            image = image.crop(bbox)
        dimensions = list(image.size)

    for size in PNG_SIZES:
        rendered = ImageOps.contain(image, (size, size), Image.Resampling.LANCZOS)
        rendered.save(output / f"{name}-{size}.png", optimize=True)

        if size in ICO_SIZES:
            square = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            square.paste(rendered, ((size - rendered.width) // 2, (size - rendered.height) // 2))
            square.save(output / "ico" / f"{name}-{size}.ico", sizes=[(size, size)])

    side = max(image.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    icon_base = square.resize((256, 256), Image.Resampling.LANCZOS)
    icon_base.save(output / f"{name}.ico", sizes=[(size, size) for size in ICO_SIZES])
    square.resize((1024, 1024), Image.Resampling.LANCZOS).save(output / f"{name}.icns")
    return side, dimensions


def prepare_icons(output: Path) -> None:
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    ico_dir = output / "ico"
    ico_dir.mkdir(exist_ok=True)

    for stale in output.glob("retromancy*"):
        stale.unlink()
    for stale in ico_dir.glob("retromancia*"):
        stale.unlink()

    assets: dict[str, dict[str, object]] = {}
    for name in BRAND_NAMES:
        source = ROOT / f"{name}.png"
        if not source.exists():
            raise ValueError(f"Imagem obrigatória não encontrada: {source}")
        side, dimensions = prepare_one(source, output, name)
        assets[name] = {
            "source": source.name,
            "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "source_dimensions": dimensions,
            "windows": f"{name}.ico",
            "macos": f"{name}.icns",
            "linux": f"{name}-512.png",
        }
        if side < 1024:
            print(f"Aviso: {source.name} tem origem menor que 1024 px; versões maiores foram ampliadas.")

    favicon_source = ROOT / f"{PRIMARY_NAME}.png"
    with Image.open(favicon_source) as original:
        image = ImageOps.exif_transpose(original).convert("RGBA")
    side = max(image.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    square.resize((256, 256), Image.Resampling.LANCZOS).save(output / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    manifest = {
        "name": "Retromancy",
        "short_name": "Retromancy",
        "icons": [
            {"src": f"{PRIMARY_NAME}-{size}.png", "sizes": f"{size}x{size}", "type": "image/png", "purpose": "any"}
            for size in (192, 512)
        ],
        "theme_color": "#111113",
        "background_color": "#111113",
    }
    (output / "site.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    inventory = {
        "source": assets[PRIMARY_NAME]["source"],
        "source_sha256": assets[PRIMARY_NAME]["source_sha256"],
        "source_dimensions": assets[PRIMARY_NAME]["source_dimensions"],
        "ico_sizes": ICO_SIZES,
        "png_sizes": PNG_SIZES,
        "assets": assets,
        "windows": f"{PRIMARY_NAME}.ico",
        "macos": f"{PRIMARY_NAME}.icns",
        "linux": f"{PRIMARY_NAME}-512.png",
        "favicon": "favicon.ico",
    }
    (output / "generated.json").write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Ícones gerados em {output}: 3 artes de marca, {len(BRAND_NAMES) * len(ICO_SIZES)} ICOs individuais e {len(BRAND_NAMES) * len(PNG_SIZES)} PNGs.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "public" / "icons")
    args = parser.parse_args()
    try:
        prepare_icons(args.output)
    except (OSError, ValueError) as error:
        parser.exit(1, f"Não foi possível gerar os ícones: {error}\n")


if __name__ == "__main__":
    main()
