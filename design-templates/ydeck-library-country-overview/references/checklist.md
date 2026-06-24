# YDeck Country Overview Checklist

## Required

- Template defines exactly 25 layout options in template.json and references/layouts.md.
- Preview samples at least 8 slides, but generated decks do not need to use all 25 layouts.
- Every generated slide is one static 1920x1080 `section.ydeck-slide`.
- Layout ids come from `references/layouts.md`.
- Use recommendedFlows when the user request matches a supported deck type.
- Category is `ydeck-library`; scenario is `country-overview`.
- No scripts, iframes, remote URLs, external CSS, or remote fonts.
- Content is readable at presentation distance.
- No adjacent slides reuse the same composition.
- Footer includes layout id and slide number.

## Quality

- Use #1D4ED8 as the main accent and #0F766E as secondary support.
- Keep body text under 34px only for labels, table cells, or dense data.
- Prefer charts, bars, timelines, matrices, maps, diagrams, image evidence, and icon systems over generic bullet lists.
- Choose layouts by deck scenario, not by visual style alone.
- The final generated slide must state a decision, recap, assignment, or next action.

## Template Conformance QA

Generated decks must be checked against allowed layout ids, recommended flow fit, palette, typography scale, spacing rhythm, density limits, chart/icon rules, and slide-scoped repair behavior. If a slide fails, repair that slide only and preserve its layout role.
