# PRIMA Play Store Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a professional, reproducible Play Store screenshot set and promotional video for PRIMA Rawajati.

**Architecture:** A capture script records truthful application states from the local site. A Pillow compositor turns those captures into branded portrait store assets, while FFmpeg assembles the same visual system, generated narration, captions, and music into a landscape promotional video.

**Tech Stack:** Python 3, Pillow, Playwright, Edge TTS, FFmpeg/ffprobe.

## Global Constraints

- Screenshots are exactly 1080 x 1920 PNG.
- Video is 1920 x 1080 H.264 with AAC audio and approximately 30 seconds long.
- All visible marketing copy is Indonesian and must describe existing functionality.
- Existing source screenshots remain untouched.

---

### Task 1: Capture Current Product States

**Files:**
- Modify: `tools/capture-play-screenshots.py`
- Create: `img/play/captures/*.png`

- [ ] Add deterministic routes for splash, onboarding, home, services, map, resident information, AI, and footer states.
- [ ] Install Playwright only if unavailable and run the capture script.
- [ ] Verify every capture is 1080 x 1920 and visually nonblank.

### Task 2: Compose Professional Store Screenshots

**Files:**
- Create: `tools/generate-play-store-media.py`
- Create: `img/play/screenshots-professional/*.png`

- [ ] Implement the reusable navy/gold branded background and phone frame.
- [ ] Add eight concise benefit headlines and supporting labels.
- [ ] Render all PNG files and validate dimensions, contrast, and safe margins.

### Task 3: Produce Narration and Video

**Files:**
- Create: `tools/generate-play-promo-video.py`
- Create: `img/play/video/prima-promo-voiceover.mp3`
- Create: `img/play/video/prima-promo-music.wav`
- Create: `img/play/video/prima-rawajati-promo.mp4`
- Create: `img/play/video/prima-rawajati-poster.png`

- [ ] Generate natural Indonesian narration with Edge TTS.
- [ ] Generate a subtle instrumental bed without third-party copyrighted media.
- [ ] Render timed scenes, motion, captions, and final brand lockup with FFmpeg.
- [ ] Inspect duration, codecs, resolution, representative frames, and audio presence.

### Task 4: Final Quality Check

**Files:**
- Verify: `img/play/screenshots-professional/`
- Verify: `img/play/video/`

- [ ] Create and inspect screenshot and video-frame contact sheets.
- [ ] Run repository checks relevant to unchanged application behavior.
- [ ] Review git diff and report final asset paths and publishing notes.
