# PRIMA Play Store Media Design

## Objective

Create a cohesive Play Store media package that presents PRIMA Rawajati as a
credible, modern public-service product while keeping the real application UI
recognizable and truthful.

## Visual Direction

- Use PRIMA navy, gold, white, and restrained secondary accents.
- Lead every screenshot with one short benefit-oriented Indonesian headline.
- Place the real app capture inside a stable phone frame; do not fabricate app
  functionality or show stock photography.
- Keep text within Play Store safe areas and readable from thumbnail scale.
- Use 1080 x 1920 portrait screenshots and a 1920 x 1080 landscape video.

## Screenshot Story

1. PRIMA identity and all-in-one value.
2. Service requirements and downloadable documents.
3. First-run onboarding and simple guidance.
4. Rawajati facility map.
5. AI assistant available around the clock.
6. Resident information and local agenda.
7. Clear, free public-service preparation.
8. Trust, official-source references, and transparency.

## Promotional Video

The 30-second video opens with the PRIMA identity, moves through services, map,
resident information, and Tanya AI, then ends with a direct product lockup. Use
smooth pans and zooms, Indonesian voice-over, subtle instrumental music, and
burned-in captions. The video must remain understandable with audio muted.

## Deliverables

- Eight final PNG screenshots under `img/play/screenshots-professional/`.
- A 1920 x 1080 H.264/AAC MP4 under `img/play/video/`.
- The voice-over, music bed, and poster frame beside the final video.
- Reproducible Python generators under `tools/`.

## Validation

- Verify dimensions, formats, and nonblank image coverage programmatically.
- Visually inspect the complete screenshot set and representative video frames.
- Verify the MP4 stream metadata and duration with ffprobe.
