# Custom Template Creation Summary

This document summarizes how custom deck templates are represented, created,
previewed, selected, and used by YDeck.

## Purpose

Custom templates are not finished PowerPoint files. They are reusable deck
recipes that tell the generation flow what kinds of slides are allowed, what
visual language to follow, and how the frontend can preview the style before a
user generates a deck.

The current professional custom template library is the `ydeck-library`
category, but the production-readiness contract is not limited to that
category. Every template exposed to the frontend picker must be a complete,
static, export-safe deck recipe with slide layouts, preview metadata, chart
guidance, icon guidance, and QA rules.

## Template Folder Contract

Every selectable custom deck template lives under:

```txt
design-templates/<template-slug>/
```

The backend catalog expects these files:

```txt
design-templates/<template-slug>/SKILL.md
design-templates/<template-slug>/template.json
design-templates/<template-slug>/example.html
design-templates/<template-slug>/references/layouts.md
design-templates/<template-slug>/references/checklist.md
```

`SKILL.md` is required. If it is missing, the template is skipped by the
filesystem catalog.

## What Each File Does

`SKILL.md`

Defines generation behavior and human-readable authoring guidance. It can still
contain frontmatter for compatibility with older Open Design skills, but
structured metadata should be treated as secondary when `template.json` exists.

`template.json`

Defines the structured source of truth for the backend, frontend, and agents:
slug, name, category, scenario, exposure, version, mode, description, preview
entry, palette, canvas size, layout list, compatibility, capabilities, quality
score, typography, charting policy, icon policy, and best-fit deck types.

If `SKILL.md` and `template.json` disagree, the catalog uses `template.json` for
structured fields. `npm run validate:templates` reports that drift so it can be
cleaned up intentionally.

`example.html`

Provides the frontend preview deck. It should show what this template feels
like in practice as a static HTML sampler with stable preview scaling. The
preview does not need to use every layout option. It must be export-safe: no
scripts, iframes, remote URLs, remote CSS, remote fonts, or runtime chart/icon
libraries.

`references/layouts.md`

Lists the allowed layout ids and their roles. The generation flow uses this as
the template vocabulary. For `ydeck-library`, the shared layout vocabulary
includes executive thesis, context map, problem/solution, audience insight,
metric dashboard, evidence grid, comparison matrix, timeline, operating model,
image feature, risk controls, financial logic, teaching exercise, quote
evidence, and closing decision.

`references/checklist.md`

Defines QA requirements for the template. It covers slide count, fixed canvas,
allowed layouts, readability, footer conventions, static HTML safety, chart
rules, icon rules, and template conformance QA.

`references/sample_prompts.md`

Provides regression prompts for generating test decks against the template.
These prompts are useful for manual QA, automated deck-generation smoke tests,
and future screenshot regression workflows.

## Current YDeck Library Templates

The current `ydeck-library` set contains professional templates for:

- executive strategy
- product launch
- investor update
- market research
- sales proposal
- training workshop
- creative portfolio
- financial plan
- technical architecture
- brand story
- business report
- teaching exercises
- teaching games
- country overview
- project overview
- investment analysis
- company profile
- government / policy brief
- event / expo presentation
- book / chapter lesson deck

Each template has `category: "ydeck-library"`. Newer scenario-first templates
use a specific `scenario` such as `teaching-games`, `country-overview`, or
`investment-analysis` so the frontend can group by real user intent instead of
visual style.

New scenario-first templates are 25-layout design systems. They include
`layoutCount: 25`, `recommendedFlows`, and an 8-slide static preview sampler.
The agent should choose only the layouts that fit the user's deck type and
requested slide count; it should not force all 25 layouts into one deck.

All previewable templates now have normalized `template.json` metadata. Older
imported Open Design templates may still have legacy preview-runtime warnings in
their quality score, but those templates are marked `exposure: "reference"` and
are not returned by the frontend catalog until they pass the same strict static
preview rules.

## Structured Metadata

Every `template.json` should include:

```json
{
  "slug": "ydeck-library-business-report",
  "name": "YDeck Business Report",
  "category": "ydeck-library",
  "scenario": "business-report",
  "mode": "deck",
  "exposure": "frontend",
  "layoutCount": 25,
  "minSlides": 8,
  "version": "1.0.0",
  "recommendedFlows": [
    {
      "id": "business_report_standard",
      "name": "Business Report Standard Flow",
      "layoutIds": ["yl_business_report_report_title"]
    }
  ],
  "compatibility": {
    "minYDeckVersion": "0.4.0",
    "migrationPolicy": "preserve generated deck artifacts; use template version only for new generations"
  },
  "canvas": {
    "width": 1920,
    "height": 1080
  },
  "capabilities": {
    "supportsCharts": true,
    "supportsIcons": true,
    "supportsImageSlides": true,
    "supportsTeachingSlides": false,
    "supportsFinancialSlides": true,
    "supportsSpeakerNotes": true
  },
  "quality": {
    "previewSafety": "pass",
    "layoutCoverage": "25/25",
    "contrast": "pass",
    "compositionVariety": 92,
    "chartReadiness": 90,
    "iconReadiness": 90,
    "generationReliability": 88
  }
}
```

The schema lives at:

```txt
design-templates/template.schema.json
```

## Slide Creation Rules

When creating a custom template, every slide layout should be designed as a
static 1920x1080 HTML slide:

```html
<section class="ydeck-slide" style="width:1920px;height:1080px;">
  ...
</section>
```

Required rules:

- Use fixed 1920x1080 slide geometry.
- Keep every slide static and export-safe.
- Do not include scripts, iframes, remote URLs, remote CSS, remote fonts, or
  browser-side chart/icon packages.
- Use the template palette from `template.json`.
- Use the server-safe local font stacks from
  [server-safe-slide-fonts.md](./server-safe-slide-fonts.md).
- Use layout ids from `references/layouts.md`.
- Use `recommendedFlows` to select a scenario-appropriate subset of layouts.
- Do not treat a 25-layout template as a required 25-slide deck.
- Include readable hierarchy for presentation distance.
- Prefer dashboards, charts, matrices, timelines, evidence cards, diagrams, and
  image feature layouts over generic bullet-only slides.
- Include speaker notes support in generated slide JSON.
- Repair only the failed slide during QA instead of regenerating the whole deck.

## Charts And Icons

Custom templates can request charts and icons, but the generated slide HTML
must not load those libraries in the browser.

Charts use the backend `create_chart` tool. The backend renders ECharts
server-side and returns static inline SVG. The slide embeds that SVG directly.

Icons use the backend `create_icon_visual` tool. The backend returns safe inline
SVG/HTML using Phosphor-quality modern icons. Templates should avoid emoji,
generic stars, crude hand-drawn SVGs, icon fonts, CDN icons, and browser-side
icon packages.

## Frontend Catalog Behavior

The frontend loads templates from:

```http
GET /v1/design-templates
```

The backend reads `design-templates/`, filters the result, and returns only
frontend-safe deck templates. It does not expose every folder on disk.

A template is user-selectable when:

- it has a valid `SKILL.md`
- `mode` is absent or set to `deck`
- `template.json.exposure` is `frontend`
- `quality.previewSafety` is `pass`
- it passes the frontend deck-template filter
- it has a previewable HTML entry such as `example.html`

Known non-PPT, legacy-runtime, or engine-style folders are excluded from the
frontend picker even if they remain on disk for reference or backend use.

Preview routes:

```http
GET /v1/design-templates/:id/preview
GET /v1/design-templates/:id/preview/template
```

The frontend should use `previewUrl` and `previewPages` returned by
`GET /v1/design-templates` instead of hard-coding preview paths.

The catalog also returns:

- `thumbnailUrl`: fast thumbnail endpoint for template cards.
- `version`: template version used for new generations.
- `capabilities`: structured selection hints.
- `quality`: internal readiness/preview-safety signals.
- `exposure`: `frontend` for user-selectable templates, `reference` for
  templates kept on disk but hidden from the picker.

Thumbnail route:

```http
GET /v1/design-templates/:id/thumbnail
```

If a template ships `assets/preview-thumbnail.*` or `assets/preview-cover.*`,
the route serves that asset. Otherwise it returns a lightweight generated SVG
thumbnail from the template metadata.

## Backend Selection Behavior

During generation, the backend calls `selectDesignTemplates()` with fields such
as `templateId`, `deckType`, `designStyle`, and `prompt`.

Selection behavior:

- If the user sends a matching `templateId`, that template is selected directly.
- Otherwise, templates are scored against deck type, design style, and prompt.
- `ydeck-library` templates receive a small preference boost.
- If nothing matches, the fallback prefers
  `ydeck-library-executive-strategy`, then any frontend-safe `ydeck-library`
  template, then the first frontend-safe template.

Selected template excerpts are passed into the generation agents so they can
follow the template's layout vocabulary, palette, chart rules, icon rules, and
QA checklist.

For templates with `recommendedFlows`, layout selection is flow-aware:

- the layout agent selects the best matching flow from deck type, prompt,
  project context, slide count, and planned slide content
- each slide is constrained to candidate layout ids from that selected flow
- if the LLM returns an unknown or out-of-flow layout id, the backend normalizes
  it back to a valid template layout id
- the HTML designer and repair agent receive the selected flow plus the current
  slide's layout definition, so they preserve the template role instead of
  treating `layoutId` as a loose label
- a `deck.content` event with `action: "template_flow_selected"` is emitted so
  the frontend can show which template flow is being used

## Validation Tooling

Run:

```bash
npm run validate:templates
```

The validator checks every previewable template that has `template.json`:

- `SKILL.md` exists.
- `template.json` is valid JSON.
- `slug` matches the folder name.
- `mode` is `deck`.
- `category` is allowed.
- `exposure` is either `frontend` or `reference`.
- `compatibility.minYDeckVersion` exists.
- canvas is 1920x1080.
- preview HTML exists.
- preview slide count meets `minSlides` or `slideCount`.
- `layoutCount`, when present, matches the number of entries in
  `template.json.layouts`.
- `recommendedFlows`, when present, reference only known layout ids.
- every `exposure: "frontend"` template has no scripts, iframes, remote URLs,
  external CSS, or remote fonts.
- every `exposure: "frontend"` template has `quality.previewSafety: "pass"`.
- `exposure: "reference"` templates can report preview-safety issues as
  warnings while they wait for cleanup.
- every layout id in `template.json.layouts` appears in
  `references/layouts.md`.
- `references/checklist.md` exists.
- `references/sample_prompts.md` exists.

Strict production validation is driven by `exposure: "frontend"`, not by
category. A finance, product, marketing, education, or imported template can be
frontend-selectable only after it meets the same static preview rules.

## Template Conformance QA

Generated deck output should be compared against the selected template:

- allowed layouts
- palette and contrast
- typography scale
- spacing rhythm
- composition variety
- chart/icon rules
- density limits
- slide-scoped repair behavior

This reduces the risk that `example.html` looks polished while generated decks
drift into weaker generic HTML.

## How To Create A New Custom Template

1. Create a new folder under `design-templates/`.
2. Use a stable slug, for example `ydeck-library-customer-success`.
3. Add `SKILL.md` with frontmatter and authoring rules.
4. Add `template.json` with `mode: "deck"`, palette, canvas, layouts, charting,
   exposure, and icon metadata.
5. Add `references/layouts.md` with the allowed layout ids and roles.
6. Add `references/checklist.md` with required QA checks.
7. For scenario-first templates, define 25 layout options and 3 recommended
   flows in `template.json`.
8. Build `example.html` as a static 1920x1080 preview sampler. It can show a
   representative subset such as 8 slides; it does not need to show all 25
   layouts.
9. Set `exposure: "frontend"` only after the preview contains no scripts,
   iframes, remote URLs, or unsafe runtime dependencies. Use
   `exposure: "reference"` while the template is still legacy/runtime-only.
10. Run typecheck/build after backend catalog changes.
11. Confirm `GET /v1/design-templates` returns the new template and
    `/v1/design-templates/:id/preview` renders correctly.

## Validation Checklist

Before shipping a custom template:

- `SKILL.md` has `mode: deck`.
- `template.json` has matching `slug`, `name`, `category`, `scenario`, and
  `canvas`.
- `example.html` contains the expected number of slides.
- Every slide is fixed 1920x1080.
- No scripts, iframes, remote URLs, remote fonts, or external CSS exist in the
  preview.
- Colors have enough contrast in both preview and generated slides.
- Chart-heavy layouts use static inline SVG.
- Icon-heavy layouts use modern inline SVG.
- Adjacent slides do not reuse the same composition.
- The final slide states a decision, recommendation, or next action.
- `npm run validate:templates` passes before the template is exposed in
  production.

## Related Files

- `src/modules/designTemplates/designTemplateCatalog.service.ts`
- `src/modules/packs/packs.routes.ts`
- `src/modules/agents/cloudProductionAgent.ts`
- `src/modules/agents/tools/advancedSystem.tools.ts`
- `src/modules/visuals/chartVisual.service.ts`
- `src/modules/visuals/iconVisual.service.ts`
- `docs/frontend-design-system-selection.md`
