#!/usr/bin/env python3
"""Generate Play Store feature graphic 1024x500 — safe margins, no clipped logo."""

from __future__ import annotations

import importlib.util
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "img" / "play" / "feature-graphic.png"
W, H = 1024, 500

# Reuse pill + fonts from icon generator
_spec = importlib.util.spec_from_file_location(
    "gen_icons", ROOT / "tools" / "generate-app-icons.py"
)
_icons = importlib.util.module_from_spec(_spec)
assert _spec.loader
_spec.loader.exec_module(_icons)

NAVY_DEEP = _icons.NAVY_DEEP
NAVY_LIGHT = _icons.NAVY_LIGHT
GOLD = _icons.GOLD
GOLD_LIGHT = (244, 201, 93)
INK = _icons.INK
RAW_GOLD = _icons.RAW_GOLD
WHITE = (255, 255, 255)
MUTED = (186, 196, 214)


def _lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def make_banner_bg() -> Image.Image:
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        for x in range(W):
            tx = x / max(W - 1, 1)
            ty = y / max(H - 1, 1)
            t = math.sqrt(tx * tx * 0.6 + ty * ty * 0.4)
            r = _lerp(NAVY_LIGHT[0], NAVY_DEEP[0], t)
            g = _lerp(NAVY_LIGHT[1], NAVY_DEEP[1], t)
            b = _lerp(NAVY_LIGHT[2], NAVY_DEEP[2], t)
            px[x, y] = (r, g, b)
    return img.convert("RGBA")


def main() -> None:
    margin_x, margin_y = 64, 48
    pill_w, pill_h = 200, 80
    gap = 36

    img = make_banner_bg()
    draw = ImageDraw.Draw(img)

    # Gold accent bar (inside canvas)
    draw.rectangle([0, H - 6, W, H], fill=GOLD)

    block_h = pill_h + 8 + 120
    pill_y = margin_y + max(0, (H - margin_y * 2 - block_h) // 2)
    pill_x = margin_x
    pill_cy = pill_y + pill_h // 2
    pill_cx = pill_x + pill_w // 2

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        (pill_x, pill_y + 4, pill_x + pill_w, pill_y + pill_h + 4),
        radius=pill_h // 2,
        fill=(0, 0, 0, 80),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(8))
    img.alpha_composite(shadow)

    pill = _icons.make_pill(pill_w, pill_h)
    img.alpha_composite(pill, (pill_x, pill_y))

    prima_font = _icons.fit_font(draw, "PRIMA", int(pill_w * 0.88), 44, serif=True)
    _icons.draw_centered(draw, (pill_cx, pill_cy), "PRIMA", prima_font, INK)

    text_x = pill_x + pill_w + gap
    max_text_w = W - margin_x - text_x
    y = pill_y + 4

    title_font = _icons.find_font(52, serif=True)
    sub_font = _icons.find_font(30, serif=False)
    tag_font = _icons.find_font(24, serif=False)

    draw.text((text_x, y), "Kelurahan Rawajati", font=title_font, fill=GOLD_LIGHT)
    y += 58
    draw.text(
        (text_x, y),
        "Platform Ringkas Interaktif Masyarakat",
        font=sub_font,
        fill=WHITE,
    )
    y += 42
    draw.text(
        (text_x, y),
        "Info layanan  ·  Peta  ·  Tanya AI 24 jam",
        font=tag_font,
        fill=MUTED,
    )

    # Safety: ensure nothing drawn outside — export exact size
    out = img.convert("RGB")
    if out.size != (W, H):
        out = out.resize((W, H), Image.Resampling.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, "PNG", optimize=True)
    print(f"Saved {OUT} ({out.size[0]}x{out.size[1]})")


if __name__ == "__main__":
    main()
