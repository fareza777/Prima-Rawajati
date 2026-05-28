#!/usr/bin/env python3
"""Generate PRIMA app icons (192, 512, maskable) — navy + gold pill branding."""

from __future__ import annotations

import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "img" / "icons"

NAVY = (10, 31, 68)
NAVY_DEEP = (5, 18, 46)
GOLD_TOP = (251, 232, 154)
GOLD_MID = (244, 201, 93)
GOLD = (212, 175, 55)
GOLD_DEEP = (163, 125, 18)
TEXT_NAVY = (10, 31, 68)
RAWAJATI = (251, 232, 154)


def find_font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    candidates = []
    if os.name == "nt":
        win = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
        candidates += [
            win / "georgiab.ttf",
            win / "timesbd.ttf",
            win / "arialbd.ttf",
        ]
    candidates += [
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
    ]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def draw_vertical_gradient(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size))
    px = img.load()
    cx, cy = size / 2, size / 2
    max_r = size * 0.72
    for y in range(size):
        for x in range(size):
            t = (y / size) * 0.55 + 0.12
            base = (
                lerp(NAVY_DEEP[0], NAVY[0], t),
                lerp(NAVY_DEEP[1], NAVY[1], t),
                lerp(NAVY_DEEP[2], NAVY[2], t),
                255,
            )
            d = math.hypot(x - cx, y - cy)
            vignette = min(1.0, d / max_r)
            r = lerp(base[0], NAVY_DEEP[0], vignette * 0.35)
            g = lerp(base[1], NAVY_DEEP[1], vignette * 0.35)
            b = lerp(base[2], NAVY_DEEP[2], vignette * 0.35)
            px[x, y] = (r, g, b, 255)
    return img


def rounded_rect(draw: ImageDraw.ImageDraw, box, radius: int, fill) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def draw_gold_pill(
    img: Image.Image,
    cx: int,
    cy: int,
    pill_w: int,
    pill_h: int,
) -> tuple[int, int, int, int]:
    """Return inner text box (x0, y0, x1, y1)."""
    x0 = cx - pill_w // 2
    y0 = cy - pill_h // 2
    x1 = x0 + pill_w
    y1 = y0 + pill_h
    radius = pill_h // 2

    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    rounded_rect(sd, (x0, y0 + 6, x1, y1 + 8), radius, (0, 0, 0, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    img.alpha_composite(shadow)

    pill = Image.new("RGBA", (pill_w, pill_h), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pill)
    for row in range(pill_h):
        t = row / max(pill_h - 1, 1)
        if t < 0.45:
            c = (
                lerp(GOLD_TOP[0], GOLD_MID[0], t / 0.45),
                lerp(GOLD_TOP[1], GOLD_MID[1], t / 0.45),
                lerp(GOLD_TOP[2], GOLD_MID[2], t / 0.45),
            )
        else:
            tt = (t - 0.45) / 0.55
            c = (
                lerp(GOLD_MID[0], GOLD_DEEP[0], tt),
                lerp(GOLD_MID[1], GOLD_DEEP[1], tt),
                lerp(GOLD_MID[2], GOLD_DEEP[2], tt),
            )
        pd.line([(0, row), (pill_w, row)], fill=c + (255,))
    rounded_rect(pd, (0, 0, pill_w - 1, pill_h - 1), radius, None)
    mask = Image.new("L", (pill_w, pill_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, pill_w - 1, pill_h - 1), radius=radius, fill=255
    )
    pill.putalpha(mask)

    highlight = Image.new("RGBA", (pill_w, pill_h), (0, 0, 0, 0))
    hd = ImageDraw.Draw(highlight)
    hd.ellipse(
        (pill_w * 0.12, -pill_h * 0.35, pill_w * 0.88, pill_h * 0.55),
        fill=(255, 255, 255, 55),
    )
    pill = Image.alpha_composite(pill, highlight)

    border = Image.new("RGBA", (pill_w, pill_h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(border)
    bd.rounded_rectangle(
        (1, 1, pill_w - 2, pill_h - 2),
        radius=radius - 1,
        outline=(255, 255, 255, 70),
        width=2,
    )
    pill = Image.alpha_composite(pill, border)

    img.alpha_composite(pill, (x0, y0))
    return x0, y0, x1, y1


def text_size(font: ImageFont.FreeTypeFont, text: str) -> tuple[int, int]:
    bbox = font.getbbox(text)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def render_icon(size: int, *, maskable: bool = False) -> Image.Image:
    img = draw_vertical_gradient(size)
    draw = ImageDraw.Draw(img)

    # Soft gold ambient glow
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse(
        (size * 0.18, size * 0.28, size * 0.82, size * 0.72),
        fill=(212, 175, 55, 38),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(size // 18))
    img.alpha_composite(glow)

    scale = 0.88 if maskable else 1.0
    pill_w = int(size * 0.62 * scale)
    pill_h = int(size * 0.22 * scale)
    block_cy = int(size * 0.46)

    draw_gold_pill(img, size // 2, block_cy, pill_w, pill_h)

    prima_size = max(18, int(pill_h * 0.52))
    prima_font = find_font(prima_size, bold=True)
    prima_text = "PRIMA"
    pw, ph = text_size(prima_font, prima_text)
    px = (size - pw) // 2
    py = block_cy - ph // 2 - int(ph * 0.06)
    draw.text(
        (px, py),
        prima_text,
        font=prima_font,
        fill=TEXT_NAVY,
        stroke_width=max(1, size // 256),
        stroke_fill=(255, 255, 255, 40),
    )

    raw_size = max(11, int(size * 0.075 * scale))
    raw_font = find_font(raw_size, bold=False)
    raw_text = "RAWAJATI"
    rw, rh = text_size(raw_font, raw_text)
    rx = (size - rw) // 2
    ry = block_cy + pill_h // 2 + int(size * 0.045)
    draw.text((rx, ry), raw_text, font=raw_font, fill=RAWAJATI + (220,))

    # Subtle underline accent
    line_y = ry + rh + int(size * 0.018)
    line_w = int(rw * 0.7)
    lx = (size - line_w) // 2
    draw.rounded_rectangle(
        (lx, line_y, lx + line_w, line_y + max(2, size // 180)),
        radius=2,
        fill=GOLD + (120,),
    )

    return img.convert("RGB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    specs = [
        ("icon-512.png", 512, False),
        ("icon-192.png", 192, False),
        ("icon-512-maskable.png", 512, True),
    ]
    for name, dim, maskable in specs:
        icon = render_icon(dim, maskable=maskable)
        path = OUT / name
        icon.save(path, "PNG", optimize=True)
        print(f"  + {path.relative_to(ROOT)} ({dim}px)")

    print("Done — icons ready for PWA + Play Store build.")


if __name__ == "__main__":
    main()
