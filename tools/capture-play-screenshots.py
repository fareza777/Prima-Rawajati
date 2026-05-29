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
VIEWPORT = {"width": 1080, "height": 1920}
PORT = 8765
BASE_URL = f"http://127.0.0.1:{PORT}/index.html"

PAGES = [
    ("01-beranda.png", "home", 1200),
    ("02-layanan.png", "layanan", 1200),
    ("03-peta.png", "peta", 3500),
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
    except ImportError:
        print("Install: pip install playwright pillow", file=sys.stderr)
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    server = _start_static_server()

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        context = browser.new_context(
            viewport=VIEWPORT,
            device_scale_factor=1,
            locale="id-ID",
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
            }"""
        )
        page.wait_for_timeout(500)

        for filename, page_id, delay_ms in PAGES:
            page.evaluate(
                f"(id) => {{ if (typeof navigateTo === 'function') navigateTo(id); }}",
                page_id,
            )
            page.wait_for_timeout(delay_ms)
            dest = OUT / filename
            page.screenshot(path=str(dest), type="png")
            from PIL import Image

            img = Image.open(dest)
            if img.size != (1080, 1920):
                img = img.resize((1080, 1920), Image.Resampling.LANCZOS)
                img.save(dest, "PNG", optimize=True)
            print(f"OK {dest.name} {img.size}")

        browser.close()

    server.shutdown()
    print(f"\nScreenshots: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
