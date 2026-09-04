"""
prepare_hero.py — приёмка рендеров из Blender.

Что делает:
  1. Берёт тяжёлые PNG из _source/ и переганяет в WebP двух размеров
     (десктоп и мобильный) в assets/img/hero/.
  2. По маскам экрана (_source/screen/) находит четыре угла экрана на каждом
     кадре и записывает их в манифест — по ним сайт впишет живой HTML-экран
     в перспективу телевизора.
  3. Печатает отчёт по весу, чтобы не упереться в лимиты GitHub Pages.

Запуск из корня проекта:
    python tools/prepare_hero.py

Папка _source/ в репозиторий не попадает (см. .gitignore) — там лежат
исходные PNG на сотни мегабайт. В git уезжает только WebP.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Нужен Pillow:  pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "_source"
OUT = ROOT / "assets" / "img" / "hero"

# Ширина выходных наборов. Телевизор на экране занимает ~520–700 CSS-пикселей,
# так что 1400px хватает и для плотных дисплеев.
WIDTH_DESKTOP = 1400
WIDTH_MOBILE = 720

WEBP_QUALITY = 82
WEBP_METHOD = 6

# Диапазон поворота турнтейбла — должен совпадать с ключами в Blender.
ANGLE_MIN = -18.0
ANGLE_MAX = 18.0

# Одиночные пассы: имя файла в _source → имя в assets/img/hero
SINGLE_PASSES = ["bg", "glow", "props", "smoke-far", "smoke-near"]

# Порог альфы, выше которого пиксель маски считается экраном
MASK_ALPHA = 128


def natural_key(path: Path):
    """Сортировка tv_2.png < tv_10.png, а не наоборот."""
    return [int(p) if p.isdigit() else p.lower() for p in re.split(r"(\d+)", path.name)]


def frames_in(folder: Path) -> list[Path]:
    if not folder.is_dir():
        return []
    return sorted(
        [p for p in folder.iterdir() if p.suffix.lower() in {".png", ".tif", ".tiff"}],
        key=natural_key,
    )


def save_webp(image: Image.Image, target: Path, width: int) -> int:
    """Ресайз по ширине с сохранением пропорций, запись WebP. Вернёт размер в байтах."""
    target.parent.mkdir(parents=True, exist_ok=True)

    if image.width != width:
        height = round(image.height * width / image.width)
        image = image.resize((width, height), Image.LANCZOS)

    image.save(target, "WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD)
    return target.stat().st_size


def find_screen_corners(mask_path: Path) -> dict | None:
    """
    Находит четыре угла белого четырёхугольника на прозрачном фоне.

    Экран в кадре — выпуклый четырёхугольник, поэтому углы берутся как крайние
    точки по суммам и разностям координат: у повёрнутого прямоугольника
    минимум x+y это всегда левый верхний угол, максимум x−y — правый верхний,
    и так далее. Координаты возвращаются нормированными к размеру кадра,
    чтобы пережить любое масштабирование.
    """
    with Image.open(mask_path) as img:
        img = img.convert("RGBA")
        w, h = img.size
        alpha = img.getchannel("A")

    bbox = alpha.getbbox()
    if bbox is None:
        return None

    pixels = alpha.load()
    left, top, right, bottom = bbox

    best = {
        "tl": (float("inf"), None),   # min(x + y)
        "br": (float("-inf"), None),  # max(x + y)
        "tr": (float("-inf"), None),  # max(x - y)
        "bl": (float("inf"), None),   # min(x - y)
    }

    for y in range(top, bottom):
        for x in range(left, right):
            if pixels[x, y] < MASK_ALPHA:
                continue

            s = x + y
            d = x - y

            if s < best["tl"][0]:
                best["tl"] = (s, (x, y))
            if s > best["br"][0]:
                best["br"] = (s, (x, y))
            if d > best["tr"][0]:
                best["tr"] = (d, (x, y))
            if d < best["bl"][0]:
                best["bl"] = (d, (x, y))

    if any(v[1] is None for v in best.values()):
        return None

    return {
        corner: [round(pt[0] / w, 5), round(pt[1] / h, 5)]
        for corner, (_, pt) in best.items()
    }


def human(size: int) -> str:
    return f"{size / 1024:.0f} КБ" if size < 1024 * 1024 else f"{size / 1024 / 1024:.2f} МБ"


def process_turntable(name: str, folder: Path, report: dict) -> int:
    """Переганяет секвенцию в два набора WebP. Вернёт число кадров."""
    frames = frames_in(folder)
    if not frames:
        print(f"  ! {folder.relative_to(ROOT)} — кадров не найдено, пропускаю")
        return 0

    total = 0
    for index, frame in enumerate(frames, start=1):
        with Image.open(frame) as img:
            img = img.convert("RGBA")
            total += save_webp(img.copy(), OUT / name / f"{name}_{index:02d}.webp", WIDTH_DESKTOP)
            total += save_webp(img.copy(), OUT / name / f"{name}_{index:02d}@sm.webp", WIDTH_MOBILE)

    report[name] = total
    print(f"  {name}: {len(frames)} кадров → {human(total)}")
    return len(frames)


def main() -> int:
    if not SOURCE.is_dir():
        print(f"Папки {SOURCE.relative_to(ROOT)} нет.")
        print("Создайте её и положите туда рендеры из Blender — структура описана в README.")
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    report: dict[str, int] = {}

    print("Секвенции:")
    tv_frames = process_turntable("tv", SOURCE / "tv", report)
    screen_frames = process_turntable("screen", SOURCE / "screen", report)

    if tv_frames and screen_frames and tv_frames != screen_frames:
        print(f"  ! Внимание: кадров ТВ {tv_frames}, а масок экрана {screen_frames}.")
        print("    Они должны совпадать — иначе экран разъедется с корпусом.")

    print("\nОдиночные пассы:")
    for name in SINGLE_PASSES:
        src = next((SOURCE / f"{name}{ext}" for ext in (".png", ".tif") if (SOURCE / f"{name}{ext}").exists()), None)
        if src is None:
            print(f"  · {name} — нет, пропускаю")
            continue

        with Image.open(src) as img:
            img = img.convert("RGBA")
            size = save_webp(img.copy(), OUT / f"{name}.webp", WIDTH_DESKTOP)
            size += save_webp(img.copy(), OUT / f"{name}@sm.webp", WIDTH_MOBILE)

        report[name] = size
        print(f"  {name} → {human(size)}")

    print("\nУглы экрана по маскам:")
    corners = []
    for index, mask in enumerate(frames_in(SOURCE / "screen"), start=1):
        found = find_screen_corners(mask)
        if found is None:
            print(f"  ! кадр {index}: белой области не найдено — проверьте, что маска не пустая")
            continue
        corners.append(found)

    if corners:
        print(f"  разобрано кадров: {len(corners)}")

    manifest = {
        "frames": tv_frames,
        "angleMin": ANGLE_MIN,
        "angleMax": ANGLE_MAX,
        "widthDesktop": WIDTH_DESKTOP,
        "widthMobile": WIDTH_MOBILE,
        "screenCorners": corners,
    }

    manifest_path = OUT / "hero.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nМанифест: {manifest_path.relative_to(ROOT)}")

    grand = sum(report.values())
    print(f"Итого в assets/img/hero: {human(grand)}")
    if grand > 12 * 1024 * 1024:
        print("! Тяжеловато для первого экрана. Уменьшите WIDTH_DESKTOP или число кадров.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
