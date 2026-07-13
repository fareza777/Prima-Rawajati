#!/usr/bin/env python3
"""Generate PRIMA's reproducible 30-second Play Store promotional video."""

from __future__ import annotations

import math
import subprocess
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CAPTURES = ROOT / "img" / "play" / "captures"
OUT = ROOT / "img" / "play" / "video"
SCENES = OUT / "scenes"
W, H = 1920, 1080
NAVY = (8, 34, 76)
NAVY_LIGHT = (18, 64, 135)
GOLD = (241, 193, 70)
WHITE = (255, 255, 255)
MUTED = (194, 209, 233)
FONT_REGULAR = Path("C:/Windows/Fonts/arial.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/arialbd.ttf")
FONT_SERIF = Path("C:/Windows/Fonts/georgiab.ttf")

VOICE_TEXT = (
    "Kenalkan PRIMA Rawajati, platform ringkas untuk kebutuhan informasi warga. "
    "Temukan persyaratan layanan, alur pengurusan, estimasi waktu, dan dokumen "
    "yang bisa disiapkan sebelum datang ke loket. Jelajahi peta fasilitas penting "
    "di sekitar Rawajati. Ikuti informasi warga dan agenda lingkungan. Saat butuh "
    "jawaban cepat, tanyakan langsung kepada Asisten PRIMA, kapan saja selama dua "
    "puluh empat jam. PRIMA Rawajati. Layanan lebih jelas, warga lebih siap."
)

STORY = (
    ("00-splash.png", "PRIMA RAWAJATI", "Informasi warga,\nlebih dekat.", "Platform Ringkas Interaktif Masyarakat", GOLD),
    ("11-services.png", "LAYANAN & SURAT", "Siapkan berkas\nsebelum ke loket.", "Syarat, prosedur, estimasi waktu, dan dokumen", (77, 157, 255)),
    ("12-service-detail.png", "CEK KESIAPAN", "Setiap langkah\ndibuat lebih jelas.", "Informasi praktis untuk membantu warga bersiap", (58, 190, 126)),
    ("13-map.png", "PETA WILAYAH", "Kenali Rawajati\ndalam satu peta.", "Temukan fasilitas dan lokasi penting di sekitar Anda", (240, 91, 91)),
    ("14-resident-info.png", "INFO WARGA", "Tetap terhubung\ndengan lingkungan.", "Kegiatan, usaha binaan, dan informasi kelurahan", (248, 161, 62)),
    ("15-ai.png", "ASISTEN PRIMA", "Jawaban cepat,\nkapan saja.", "Tanya layanan dengan bahasa sehari-hari, 24 jam", (56, 207, 157)),
    ("10-home.png", "MULAI SEKARANG", "Layanan lebih jelas.\nWarga lebih siap.", "PRIMA • Kelurahan Rawajati", GOLD),
)


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


def background() -> Image.Image:
    image = Image.new("RGB", (W, H), NAVY)
    draw = ImageDraw.Draw(image)
    for y in range(H):
        t = y / (H - 1)
        color = tuple(int(NAVY[i] * (1 - t * 0.45) + NAVY_LIGHT[i] * t * 0.45) for i in range(3))
        draw.line((0, y, W, y), fill=color)
    for x in range(0, W, 96):
        draw.line((x, 0, x, H), fill=(25, 60, 112), width=1)
    for y in range(0, H, 96):
        draw.line((0, y, W, y), fill=(25, 60, 112), width=1)
    return image.convert("RGBA")


def phone(capture_name: str) -> Image.Image:
    frame = Image.new("RGBA", (610, 1040), (0, 0, 0, 0))
    shadow = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((25, 20, 585, 1035), radius=58, fill=(0, 0, 0, 155))
    frame.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(18)))
    draw = ImageDraw.Draw(frame)
    draw.rounded_rectangle((20, 10, 580, 1020), radius=58, fill=(238, 242, 247), outline=WHITE, width=6)
    source = Image.open(CAPTURES / capture_name).convert("RGB").resize((522, 928), Image.Resampling.LANCZOS)
    mask = Image.new("L", source.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *source.size), radius=38, fill=255)
    source.putalpha(mask)
    frame.alpha_composite(source, (49, 65))
    draw.rounded_rectangle((245, 28, 355, 40), radius=6, fill=(13, 30, 55))
    return frame


def create_scene(index: int, item: tuple) -> Path:
    capture_name, eyebrow, headline, detail, accent = item
    canvas = background()
    draw = ImageDraw.Draw(canvas)

    label_font = font(FONT_BOLD, 27)
    label_width = draw.textbbox((0, 0), eyebrow, font=label_font)[2] + 58
    draw.rounded_rectangle((125, 185, 125 + label_width, 245), radius=30, fill=accent)
    draw.text((154, 199), eyebrow, font=label_font, fill=(5, 31, 70))
    draw.multiline_text((120, 285), headline, font=font(FONT_SERIF, 72), fill=WHITE, spacing=12)
    draw.multiline_text((124, 485), detail, font=font(FONT_REGULAR, 30), fill=MUTED, spacing=8)

    # Brand rule and scene count create continuity across the sequence.
    draw.rounded_rectangle((123, 792, 620, 800), radius=4, fill=accent)
    draw.text((124, 835), "PRIMA", font=font(FONT_SERIF, 38), fill=GOLD)
    draw.text((267, 842), "KELURAHAN RAWAJATI", font=font(FONT_BOLD, 22), fill=MUTED)
    draw.text((124, 922), f"0{index + 1}  /  07", font=font(FONT_BOLD, 20), fill=(123, 151, 194))

    device = phone(capture_name)
    canvas.alpha_composite(device, (1190, 38))
    path = SCENES / f"scene-{index:02d}.png"
    canvas.convert("RGB").save(path, "PNG", optimize=True)
    return path


def generate_voiceover(path: Path) -> None:
    subprocess.run(
        [
            "edge-tts",
            "--voice", "id-ID-ArdiNeural",
            "--rate=+8%",
            "--pitch=-2Hz",
            "--text", VOICE_TEXT,
            "--write-media", str(path),
        ],
        check=True,
    )


def generate_music(path: Path, duration: float = 30.0, rate: int = 44100) -> None:
    """Create a restrained original ambient bed with no third-party source audio."""
    progression = (
        (130.81, 164.81, 196.00),
        (110.00, 146.83, 196.00),
        (98.00, 130.81, 164.81),
        (116.54, 146.83, 174.61),
    )
    frames = bytearray()
    total = int(duration * rate)
    for n in range(total):
        t = n / rate
        chord = progression[min(int(t // 7.5), 3)]
        fade = min(1.0, t / 2.0, (duration - t) / 2.0)
        pulse = 0.82 + 0.18 * math.sin(2 * math.pi * 0.25 * t)
        sample = sum(math.sin(2 * math.pi * f * t) for f in chord) / 3
        sample += 0.25 * math.sin(2 * math.pi * chord[0] * 2 * t)
        value = int(max(-1.0, min(1.0, sample * 0.12 * pulse * fade)) * 32767)
        frames.extend(value.to_bytes(2, byteorder="little", signed=True) * 2)
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(2)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(frames)


def render_video(scene_paths: list[Path], voice: Path, music: Path, output: Path) -> None:
    command = ["ffmpeg", "-y"]
    for path in scene_paths:
        command += ["-loop", "1", "-t", "4.8", "-i", str(path)]
    command += ["-i", str(voice), "-i", str(music)]

    filters = []
    for i in range(len(scene_paths)):
        filters.append(
            f"[{i}:v]zoompan=z='min(zoom+0.00022,1.032)':"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=144:s=1920x1080:fps=30,"
            f"format=yuv420p,setpts=PTS-STARTPTS[v{i}]"
        )
    previous = "v0"
    for i in range(1, len(scene_paths)):
        out = f"x{i}"
        filters.append(
            f"[{previous}][v{i}]xfade=transition=fade:duration=0.6:offset={4.2 * i:.1f}[{out}]"
        )
        previous = out
    voice_index = len(scene_paths)
    music_index = voice_index + 1
    filters.append(f"[{voice_index}:a]volume=1.35,highpass=f=80[voice]")
    filters.append(f"[{music_index}:a]volume=0.32,lowpass=f=1800[music]")
    filters.append("[voice][music]amix=inputs=2:duration=longest:dropout_transition=2[aout]")

    command += [
        "-filter_complex", ";".join(filters),
        "-map", f"[{previous}]", "-map", "[aout]",
        "-t", "30", "-r", "30",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(output),
    ]
    subprocess.run(command, check=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    SCENES.mkdir(parents=True, exist_ok=True)
    scene_paths = [create_scene(i, item) for i, item in enumerate(STORY)]
    voice = OUT / "prima-promo-voiceover.mp3"
    music = OUT / "prima-promo-music.wav"
    video = OUT / "prima-rawajati-promo.mp4"
    poster = OUT / "prima-rawajati-poster.png"
    generate_voiceover(voice)
    generate_music(music)
    render_video(scene_paths, voice, music, video)
    Image.open(scene_paths[0]).save(poster, "PNG", optimize=True)
    print(f"Video: {video}")
    print(f"Poster: {poster}")


if __name__ == "__main__":
    main()
