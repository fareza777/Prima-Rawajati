#!/usr/bin/env python3
"""Capture 9:16 phone screenshots for Google Play Store listing."""

from __future__ import annotations

import os
import sys
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "img" / "play" / "screenshots"
PORT = 8765
BASE_URL = f"http://127.0.0.1:{PORT}/index.html"

# App dirancang ~430px lebar; viewport lebar memicu layout desktop (strip di tengah).
LOGICAL_W = 430
LOGICAL_H = 765  # 9:16 portrait (430 * 16/9)
OUT_W, OUT_H = 1080, 1920
SCALE = OUT_W / LOGICAL_W

PAGES = [
    ("01-beranda.png", "home", 1200),
    ("02-layanan.png", "layanan", 1200),
    ("03-peta.png", "peta", 4000),
    ("04-info.png", "info", 1200),
    ("05-tanya-ai.png", "chat", 1500),
]


def _start_static_server() -> HTTPServer:
    os.chdir(ROOT)
    server = HTTPServer(("127.0.0.1", PORT), SimpleHTTPRequestHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def main() -> int:
    try:
        from playwright.sync_api import sync_playwright
        from PIL import Image
    except ImportError:
        print("Install: pip install playwright pillow", file=sys.stderr)
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    server = _start_static_server()

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        context = browser.new_context(
            viewport={"width": LOGICAL_W, "height": LOGICAL_H},
            device_scale_factor=SCALE,
            locale="id-ID",
            is_mobile=True,
            has_touch=True,
        )
        page = context.new_page()
        page.goto(BASE_URL, wait_until="domcontentloaded", timeout=90_000)
        page.wait_for_function(
            "() => window.PRIMA_DATA_READY === true || document.querySelector('#page-home.active')",
            timeout=60_000,
        )
        page.wait_for_timeout(3800)
        page.evaluate(
            """() => {
              document.body.classList.remove('splash-active');
              const s = document.getElementById('app-splash');
              if (s) { s.style.display = 'none'; s.remove(); }
              document.documentElement.style.width = '430px';
              document.body.style.maxWidth = '430px';
              document.body.style.margin = '0';
            }"""
        )
        page.wait_for_timeout(400)

        for filename, page_id, delay_ms in PAGES:
            page.evaluate(
                "(id) => { if (typeof navigateTo === 'function') navigateTo(id); }",
                page_id,
            )
            page.wait_for_timeout(delay_ms)
            dest = OUT / filename
            page.screenshot(path=str(dest), type="png")

            img = Image.open(dest)
            w, h = img.size
            if w != OUT_W or h != OUT_H:
                # Crop/fit tanpa stretch horizontal
                img = img.resize((OUT_W, OUT_H), Image.Resampling.LANCZOS)
                img.save(dest, "PNG", optimize=True)
            print(f"OK {dest.name} {w}x{h} -> {OUT_W}x{OUT_H}")

        browser.close()

    server.shutdown()
    print(f"\nScreenshots: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
