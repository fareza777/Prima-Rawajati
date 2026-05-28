#!/usr/bin/env python3
"""Generate PRIMA app icons — premium navy + gold pill (no garis dekoratif)."""

from __future__ import annotations

import math
import os
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "img" / "icons"

NAVY = (10, 31, 68)
NAVY_DEEP = (5, 18, 46)
NAVY_LIGHT = (30, 58, 138)
GOLD_TOP = (248, 228, 168)
GOLD_MID = (230, 198, 108)
GOLD = (212, 175, 55)
GOLD_DEEP = (154, 118, 28)
INK = (8, 26, 56)
RAW_GOLD = (220, 198, 140)


def find_font(size: int, *, serif: bool = True) -> ImageFont.FreeTypeFont:
    if os.name == "nt":
        win = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
        if serif:
            paths = ["georgiab.ttf", "timesbd.ttf", "palab.ttf"]
        else:
            paths = ["segoeuib.ttf", "arialbd.ttf", "calibrib.ttf"]
        for name in paths:
            p = win / name
            if p.exists():
                return ImageFont.truetype(str(p), size)
    fallback = (
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
        if serif
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    )
    if Path(fallback).exists():
        return ImageFont.truetype(fallback, size)
    return ImageFont.load_default()


def text_size(font: ImageFont.FreeTypeFont, text: str) -> tuple[int, int]:
    box = font.getbbox(text)
    return box[2] - box[0], box[3] - box[1]


def fit_font(
    draw: ImageDraw.ImageDraw,
    text: str,
    max_w: int,
    start_size: int,
    *,
    serif: bool = True,
) -> ImageFont.FreeTypeFont:
    size = start_size
    font = find_font(size, serif=serif)
    while size > 8 and draw.textlength(text, font=font) > max_w:
        size -= 1
        font = find_font(size, serif=serif)
    return font


def draw_centered(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill,
) -> None:
    """Tengah geometris di titik xy (anchor middle-middle)."""
    draw.text(xy, text, font=font, fill=fill, anchor="mm")


def draw_tracked(
    draw: ImageDraw.ImageDraw,
    text: str,
    x: int,
    y: int,
    font: ImageFont.FreeTypeFont,
    fill,
    tracking: int,
) -> None:
    cx = x
    for ch in text:
        draw.text((cx, y), ch, font=font, fill=fill)
        cx += int(draw.textlength(ch, font=font)) + tracking


def tracked_width(
    draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, tracking: int
) -> int:
    if not text:
        return 0
    total = 0
    for i, ch in enumerate(text):
        total += int(draw.textlength(ch, font=font))
        if i < len(text) - 1:
            total += tracking
    return total


def _lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def make_background(size: int) -> Image.Image:
    """Smooth navy radial — tanpa lingkaran/arc yang terlihat seperti garis."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    cx, cy = size * 0.5, size * 0.5
    max_r = size * 0.78
    for y in range(size):
        for x in range(size):
            d = min(1.0, math.hypot(x - cx, y - cy) / max_r)
            t = d * d
            r = _lerp(NAVY_LIGHT[0], NAVY_DEEP[0], t)
            g = _lerp(NAVY_LIGHT[1], NAVY_DEEP[1], t)
            b = _lerp(NAVY_LIGHT[2], NAVY_DEEP[2], t)
            warm = max(0.0, 1.0 - d * 1.15)
            r = _lerp(r, 28, warm * 0.07)
            g = _lerp(g, 48, warm * 0.06)
            b = _lerp(b, 88, warm * 0.04)
            px[x, y] = (r, g, b)
    return img.convert("RGBA")


def make_pill(w: int, h: int) -> Image.Image:
    radius = h // 2
    pill = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    grad = Image.new("RGBA", (w, h))
    px = grad.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(GOLD_TOP[0] * (1 - t) + GOLD_DEEP[0] * t)
        g = int(GOLD_TOP[1] * (1 - t) + GOLD_DEEP[1] * t)
        b = int(GOLD_TOP[2] * (1 - t) + GOLD_DEEP[2] * t)
        row = (r, g, b, 255)
        for x in range(w):
            px[x, y] = row
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
    pill = Image.composite(grad, pill, mask)

    shine = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    spx = shine.load()
    for y in range(h):
        t = 1.0 - (y / max(h - 1, 1))
        alpha = int(42 * (t**1.8))
        if alpha <= 0:
            continue
        for x in range(w):
            spx[x, y] = (255, 255, 255, alpha)
    smask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(smask).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
    shine.putalpha(ImageChops.multiply(shine.split()[3], smask))
    pill = Image.alpha_composite(pill, shine)

    rim = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim)
    rd.rounded_rectangle(
        (0, 0, w - 1, h - 1),
        radius=radius,
        outline=(255, 255, 255, 45),
        width=1,
    )
    rd.rounded_rectangle(
        (1, 1, w - 2, h - 2),
        radius=radius - 1,
        outline=GOLD_DEEP + (90,),
        width=1,
    )
    return Image.alpha_composite(pill, rim)


def render_icon(size: int, *, maskable: bool = False) -> Image.Image:
    img = make_background(size)
    draw = ImageDraw.Draw(img)

    # Besar & tengah — isi ~80% area (tetap aman untuk crop bulat Android)
    pad = 0.07 if maskable else 0.05
    zone = int(size * (1 - pad * 2))

    pill_w = int(zone * 0.98)
    pill_h = max(14, int(zone * 0.42))
    gap = max(5, int(size * 0.026))

    raw_font = find_font(max(11, int(size * 0.095)), serif=False)
    tracking = max(1, int(size * 0.011))
    raw = "RAWAJATI"
    _, raw_h = text_size(raw_font, raw)

    block_h = pill_h + gap + raw_h
    block_top = (size - block_h) // 2
    cx = size // 2
    pill_cy = block_top + pill_h // 2

    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sx0, sy0 = cx - pill_w // 2, pill_cy - pill_h // 2 + 5
    sd.rounded_rectangle(
        (sx0, sy0, sx0 + pill_w, sy0 + pill_h),
        radius=pill_h // 2,
        fill=(0, 0, 0, 95),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(6, size // 48)))
    img.alpha_composite(shadow)

    pill = make_pill(pill_w, pill_h)
    img.alpha_composite(pill, (cx - pill_w // 2, pill_cy - pill_h // 2))

    prima = "PRIMA"
    prima_font = fit_font(
        draw,
        prima,
        int(pill_w * 0.86),
        max(18, int(pill_h * 0.52)),
        serif=True,
    )
    draw_centered(draw, (cx, pill_cy), prima, prima_font, INK)

    rw = tracked_width(draw, raw, raw_font, tracking)
    raw_y = block_top + pill_h + gap
    draw_tracked(
        draw,
        raw,
        cx - rw // 2,
        raw_y,
        raw_font,
        RAW_GOLD + (200,),
        tracking,
    )

    return img.convert("RGB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, dim, maskable in [
        ("icon-512.png", 512, False),
        ("icon-192.png", 192, False),
        ("icon-512-maskable.png", 512, True),
    ]:
        path = OUT / name
        render_icon(dim, maskable=maskable).save(path, "PNG", optimize=True)
        print(f"  + {path.relative_to(ROOT)} ({dim}px)")


if __name__ == "__main__":
    main()
