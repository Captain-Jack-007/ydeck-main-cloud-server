# YDeck Product Launch Checklist

## Required

- Deck preview contains at least 15 slides.
- Every slide is one static 1920x1080 `section.ydeck-slide`.
- Layout ids come from `references/layouts.md`.
- Category and scenario are both `ydeck-library`.
- No scripts, iframes, remote URLs, external CSS, or remote fonts.
- Content is readable at presentation distance.
- No adjacent slides reuse the same composition.
- Footer includes layout id and slide count.

## Quality

- Use #6D28D9 as the main accent and #2563EB as secondary support.
- Keep body text under 34px only for labels or table cells.
- Use large whitespace and clear hierarchy.
- Prefer diagrams, matrices, dashboards, timelines, and evidence cards over generic bullet lists.
- The final slide must state a decision or next action.

## Modern icons

- Icon groups use create_icon_visual or equivalent Phosphor-quality inline SVG.
- No generic star placeholders, emoji icons, crude custom icons, remote icon fonts, or CDN icon scripts.
- Icons are semantic, visually consistent, and sized for the slide layout.
## Template Conformance QA

Generated decks must be checked against the selected template, not only against generic HTML validity. Compare the generated deck against:

- allowed layout ids from `references/layouts.md`
- palette and contrast from `template.json.palette`
- typography scale and hierarchy from the preview
- spacing rhythm and density limits
- composition variety across adjacent slides
- chart and icon capability flags from `template.json.capabilities`
- preview/generation reliability notes from `template.json.quality`

If a slide fails, repair that slide only and preserve its layout role.

