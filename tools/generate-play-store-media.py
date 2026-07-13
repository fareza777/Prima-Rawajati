#!/usr/bin/env python3
"""Compose branded PRIMA Play Store screenshots from real app captures."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CAPTURES = ROOT / "img" / "play" / "captures"
OUT = ROOT / "img" / "play" / "screenshots-professional"
W, H = 1080, 1920

NAVY = (8, 34, 76)
NAVY_2 = (15, 56, 122)
GOLD = (241, 193, 70)
WHITE = (255, 255, 255)
MUTED = (198, 211, 233)
INK = (7, 25, 55)

FONT_REGULAR = Path("C:/Windows/Fonts/arial.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/arialbd.ttf")
FONT_SERIF = Path("C:/Windows/Fonts/georgiab.ttf")

STORIES = (
    ("01-semua-dalam-satu.png", "10-home.png", "PRIMA RAWAJATI", "Semua kebutuhan warga.\nSatu aplikasi.", "LAYANAN  •  PETA  •  INFO  •  TANYA AI", (241, 193, 70)),
    ("02-layanan-lebih-jelas.png", "11-services.png", "LAYANAN & SURAT", "Siapkan berkas\nsebelum ke loket.", "Syarat, prosedur, waktu, dan dokumen", (81, 159, 255)),
    ("03-tanya-ai-24-jam.png", "15-ai.png", "ASISTEN PRIMA", "Tanya layanan kapan saja,\n24 jam.", "Jawaban cepat dengan bahasa sehari-hari", (61, 203, 155)),
    ("04-peta-rawajati.png", "13-map.png", "PETA WILAYAH", "Temukan fasilitas penting\ndi Rawajati.", "Kantor layanan, RW, tempat ibadah, dan lainnya", (239, 92, 92)),
    ("05-info-warga.png", "14-resident-info.png", "INFO WARGA", "Agenda lingkungan\ndalam genggaman.", "Kegiatan, usaha binaan, dan informasi kelurahan", (248, 161, 62)),
    ("06-panduan-pertama.png", "01-onboarding-1.png", "MUDAH DIMULAI", "Panduan ringkas sejak\npertama dibuka.", "Empat langkah untuk mengenal seluruh fitur", (128, 122, 255)),
    ("07-detail-layanan.png", "12-service-detail.png", "LEBIH SIAP", "Detail layanan dibuat\njelas dan praktis.", "Cek kesiapan dan unduh dokumen pendukung", (59, 179, 112)),
    ("08-transparan.png", "16-trust.png", "TRANSPARAN", "Informasi jelas, sumber\ntetap tercantum.", "PRIMA membantu warga mengakses informasi", (241, 193, 70)),
)


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


@lru_cache(maxsize=1)
def gradient() -> Image.Image:
    image = Image.new("RGB", (W, H), NAVY)
    pixels = image.load()
    for y in range(H):
        t = y / (H - 1)
        for x in range(W):
            side = abs(x - W / 2) / (W / 2)
            lift = max(0.0, 1.0 - side) * max(0.0, 1.0 - t) * 0.18
            pixels[x, y] = tuple(
                int(NAVY[i] * (1 - t * 0.55 - lift) + NAVY_2[i] * (t * 0.55 + lift))
                for i in range(3)
            )
    return image


def rounded_crop(source: Image.Image, size: tuple[int, int], radius: int) -> Image.Image:
    fitted = source.resize(size, Image.Resampling.LANCZOS).convert("RGBA")
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    fitted.putalpha(mask)
    return fitted


def draw_story(story: tuple) -> Image.Image:
    _, source_name, eyebrow, headline, detail, accent = story
    canvas = gradient().copy().convert("RGBA")
    draw = ImageDraw.Draw(canvas)

    # Quiet civic-grid motif, kept behind the copy.
    for x in range(40, W, 80):
        draw.line((x, 0, x, 350), fill=(28, 65, 119, 255), width=1)
    for y in range(40, 360, 80):
        draw.line((0, y, W, y), fill=(28, 65, 119, 255), width=1)

    eyebrow_font = font(FONT_BOLD, 25)
    eyebrow_width = draw.textbbox((0, 0), eyebrow, font=eyebrow_font)[2] + 48
    draw.rounded_rectangle((70, 70, 70 + eyebrow_width, 118), radius=24, fill=accent)
    draw.text((94, 81), eyebrow, font=eyebrow_font, fill=INK)
    draw.multiline_text((70, 153), headline, font=font(FONT_SERIF, 62), fill=WHITE, spacing=7)
    draw.text((72, 307), detail, font=font(FONT_REGULAR, 26), fill=MUTED)

    phone_box = (106, 385, 974, 1970)
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(phone_box, radius=74, fill=(0, 0, 0, 145))
    shadow = shadow.filter(ImageFilter.GaussianBlur(30))
    canvas.alpha_composite(shadow)

    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(phone_box, radius=74, fill=(238, 242, 247), outline=(255, 255, 255), width=7)
    draw.rounded_rectangle((460, 405, 620, 422), radius=8, fill=(18, 31, 51))

    source = Image.open(CAPTURES / source_name).convert("RGB")
    screen = rounded_crop(source, (824, 1465), 54)
    canvas.alpha_composite(screen, (128, 442))

    # Bottom accent remains visible even in dense store thumbnails.
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((410, 1871, 670, 1880), radius=5, fill=accent)
    return canvas.convert("RGB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for story in STORIES:
        image = draw_story(story)
        path = OUT / story[0]
        image.save(path, "PNG", optimize=True)
        print(f"OK {path.name} {image.width}x{image.height}")


if __name__ == "__main__":
    main()
