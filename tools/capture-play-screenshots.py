#!/usr/bin/env python3
"""Capture deterministic 9:16 PRIMA product states for Play Store media."""

from __future__ import annotations

import os
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "img" / "play" / "captures"
PORT = 8765
BASE_URL = f"http://127.0.0.1:{PORT}/index.html"
LOGICAL_W, LOGICAL_H = 430, 765
OUT_W, OUT_H = 1080, 1920
SCALE = OUT_W / LOGICAL_W


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        return


def start_server() -> ThreadingHTTPServer:
    os.chdir(ROOT)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), QuietHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def normalize_page(page) -> None:
    page.evaluate(
        """() => {
          document.documentElement.style.width = '430px';
          document.body.style.maxWidth = '430px';
          document.body.style.margin = '0';
          const greeting = document.getElementById('hero-greeting');
          if (greeting) greeting.textContent = 'Selamat datang, Warga Rawajati';
        }"""
    )


def save(page, filename: str) -> None:
    from PIL import Image

    dest = OUT / filename
    page.screenshot(path=str(dest), type="png")
    with Image.open(dest) as image:
        if image.size != (OUT_W, OUT_H):
            image.resize((OUT_W, OUT_H), Image.Resampling.LANCZOS).save(
                dest, "PNG", optimize=True
            )
    print(f"OK {filename} {OUT_W}x{OUT_H}")


def main() -> int:
    try:
        from playwright.sync_api import sync_playwright
        import PIL  # noqa: F401
    except ImportError:
        print("Install: python -m pip install playwright pillow", file=sys.stderr)
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    server = start_server()

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True)
        context = browser.new_context(
            viewport={"width": LOGICAL_W, "height": LOGICAL_H},
            device_scale_factor=SCALE,
            locale="id-ID",
            is_mobile=True,
            has_touch=True,
            color_scheme="light",
        )

        # Splash is captured before the application transitions into onboarding.
        page = context.new_page()
        page.goto(BASE_URL, wait_until="domcontentloaded", timeout=90_000)
        page.wait_for_timeout(650)
        normalize_page(page)
        save(page, "00-splash.png")
        page.close()

        # Four onboarding states are directly addressable through the app's URL API.
        for slide in range(4):
            page = context.new_page()
            page.goto(
                f"{BASE_URL}?onboarding=1&onboardingSlide={slide}",
                wait_until="domcontentloaded",
                timeout=90_000,
            )
            page.wait_for_timeout(4200)
            normalize_page(page)
            save(page, f"0{slide + 1}-onboarding-{slide + 1}.png")
            page.close()

        # Skip first-run UI for the remaining application states.
        context.add_init_script(
            "localStorage.setItem('prima_onboarding_v1_complete', '1')"
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
              document.body.classList.remove('splash-active', 'onboarding-active');
              document.getElementById('app-splash')?.remove();
              const onboarding = document.getElementById('app-onboarding');
              if (onboarding) onboarding.hidden = true;
            }"""
        )
        normalize_page(page)

        save(page, "10-home.png")

        page.evaluate("navigateTo('layanan')")
        page.wait_for_timeout(800)
        save(page, "11-services.png")

        page.evaluate(
            """() => {
              const first = window.PRIMA_DATA?.layanan?.[0];
              if (first && typeof showLayananDetail === 'function') showLayananDetail(first.id);
            }"""
        )
        page.wait_for_timeout(700)
        save(page, "12-service-detail.png")
        page.evaluate("closeModal()")
        page.wait_for_timeout(350)

        for filename, page_id, delay in (
            ("13-map.png", "peta", 3500),
            ("14-resident-info.png", "info", 900),
            ("15-ai.png", "chat", 1200),
        ):
            page.evaluate("id => navigateTo(id)", page_id)
            page.wait_for_timeout(delay)
            save(page, filename)

        page.evaluate("navigateTo('home')")
        page.wait_for_timeout(500)
        page.evaluate(
            """() => {
              const trust = document.querySelector('.trust-belt');
              if (trust) trust.scrollIntoView({ block: 'end', behavior: 'instant' });
              else window.scrollTo(0, document.body.scrollHeight);
            }"""
        )
        page.wait_for_timeout(700)
        save(page, "16-trust.png")
        browser.close()

    server.shutdown()
    print(f"Captures saved to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
