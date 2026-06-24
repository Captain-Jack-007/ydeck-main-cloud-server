---
name: "YDeck Sales Proposal"
category: "ydeck-library"
scenario: "ydeck-library"
mode: "deck"
description: |
  A polished sales proposal deck for client context, pain, solution design, proof, timeline, and pricing logic.
triggers:
  - ydeck-library-sales-proposal
  - ydeck sales proposal
  - commercial confidence
  - professional deck
  - ydeck-library
preview:
  type: html
  entry: "example.html"
speaker_notes: true
animations: false
---

# YDeck Sales Proposal

A polished sales proposal deck for client context, pain, solution design, proof, timeline, and pricing logic.

## Library Category

This template belongs to the 'ydeck-library' category. It is a complete professional deck recipe with at least 15 slide layouts in its preview and layout contract.

## Best For

- sales proposals
- client pitches
- solution selling

## Design Direction

- Tone: commercial confidence.
- Scheme: light.
- Accent: #047857.
- Secondary: #2563EB.
- Canvas: fixed 1920x1080.
- HTML output must be static, export-safe, and script-free.

## Authoring Rules

1. Select one of the 15 listed layouts for every generated slide.
2. Keep slide copy concise and room-readable.
3. Use this template's palette and layout grammar unless the user chose an explicit design system.
4. Do not use remote scripts, remote images, remote CSS, iframes, scrolling, hover-only states, or animations required for meaning.
5. Repair only the slide that failed QA, preserving the selected layout id and content role.

## Output Contract

Return exactly one 1920x1080 '<section class="ydeck-slide">' per slide. Include 'slideNumber', 'layoutId', 'title', 'speakerNotes', and 'html' in the slide JSON.

## Chart Library Support

Use the backend create_chart tool for data-heavy slides. The tool renders ECharts server-side and returns static inline SVG. Embed that SVG into the slide HTML; never include chart-library scripts, remote assets, canvas runtime, or CDN URLs in generated slides. Supported chart types: bar, line, area, pie, doughnut, and funnel.

## Modern Icon Support

Use the backend create_icon_visual tool for icon groups. The tool selects semantic Phosphor icons and returns safe inline SVG/HTML. Icons must feel modern, precise, and presentation-grade. Do not use emoji, generic stars, crude custom drawings, icon fonts, CDN icons, or browser-side icon packages in slide HTML.
