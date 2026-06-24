---
name: "YDeck Teaching + Exercises"
category: "ydeck-library"
scenario: "teaching-exercises"
mode: "deck"
description: |
  A clear instructional classroom system for lesson deck, exercise deck, training lesson, classroom slides, language learning.
triggers:
  - ydeck-library-teaching-exercises
  - lesson deck
  - exercise deck
  - training lesson
  - classroom slides
preview:
  type: html
  entry: "example.html"
speaker_notes: true
animations: false
---

# YDeck Teaching + Exercises

A clear instructional classroom system for lesson deck, exercise deck, training lesson, classroom slides, language learning.

## Library Model

This is a 25-layout design system, not a fixed 25-slide deck. The agent must choose only the layouts that fit the user's deck type, audience, source material, and requested slide count.

## Best For

- lesson deck
- exercise deck
- training lesson
- classroom slides
- language learning

## Design Direction

- Tone: clear instructional classroom.
- Scenario: teaching-exercises.
- Accent: #2563EB.
- Secondary: #16A34A.
- Canvas: fixed 1920x1080.
- HTML output must be static, export-safe, and script-free.

## Layout Selection Rules

1. Start from one of the recommended flows in template.json when the user request matches it.
2. Use only the layouts needed for the requested deck type and slide count.
3. Do not force all 25 layouts into one generated deck.
4. Preserve scenario-specific vocabulary and slide purpose.
5. Prefer charts, bars, timelines, matrices, maps, modern inline icons, and visual evidence over generic bullet lists.
6. Repair only the slide that failed QA, preserving the selected layout id and content role.

## Output Contract

Return exactly one 1920x1080 '<section class="ydeck-slide">' per slide. Include 'slideNumber', 'layoutId', 'title', 'speakerNotes', and 'html' in the slide JSON.

## Chart Library Support

Use the backend create_chart tool for data-heavy slides. The tool renders ECharts server-side and returns static inline SVG. Embed that SVG into the slide HTML; never include chart-library scripts, remote assets, canvas runtime, or CDN URLs in generated slides.

## Modern Icon Support

Use the backend create_icon_visual tool for icon groups. The tool selects semantic Phosphor icons and returns safe inline SVG/HTML. Icons must feel modern, precise, and presentation-grade.
