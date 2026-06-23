# Open Design Slide Generation Principles

This document captures the Open Design parts YDeck should preserve for deck
generation. Treat these as backend design rules, not frontend suggestions.

## The Valuable Parts To Keep

YDeck should copy these ideas from Open Design:

- HTML-first slide generation.
- Fixed 1920x1080 slide framework.
- Design templates separate from skills.
- Design systems with `DESIGN.md` and `tokens.css`.
- Screenshot-based QA loop.
- Strict checklists before export.
- No freeform random slide generation.

## 1. HTML-First Slide Generation

The backend should generate slide HTML as the primary visual artifact.

Each slide must be a self-contained HTML section:

```html
<section
  class="ydeck-slide"
  style="width:1920px;height:1080px;position:relative;overflow:hidden;"
>
  ...
</section>
```

The browser preview, screenshot QA, HTML export, and PPTX export should all read
from this same artifact. The frontend should not recreate slide layout in React.

## 2. Fixed 1920x1080 Slide Framework

Every slide uses a 16:9 canvas at exactly `1920px` by `1080px`.

Why this matters:

- The LLM has a stable coordinate system.
- Playwright screenshots are deterministic.
- QA can detect overflow and missing canvas sizing.
- PPTX export can map pixels to slide units consistently.
- Templates can be compared and reused without adapting arbitrary aspect ratios.

Any generated slide missing explicit `width:1920px` and `height:1080px` should
fail QA and go through repair.

## 3. Templates Separate From Skills

Templates are visual recipes. Skills are operational workflows.

In this repo:

```txt
design-templates/   slide/deck visual templates only
design-systems/     brand/design systems and tokens
src/modules/agents/ agent workflow, tools, QA, repair, persistence
```

The `design-templates/` directory should contain only presentation templates.
Each template must declare:

```yaml
od:
  mode: deck
```

Do not put dashboards, landing pages, apps, posters, audio/video generators,
research workflows, audits, or utility skills in `design-templates/`.

Current backend integration:

```txt
design-templates/<slug>/SKILL.md
design-templates/<slug>/references/checklist.md
design-templates/<slug>/references/layouts.md
design-templates/<slug>/template.json
design-templates/<slug>/example.html or assets/template.html
```

The production Context Agent loads relevant deck templates from the filesystem.
Selection uses the requested `templateId` first, then deck type, design style,
and prompt terms. The selected template ids are emitted in `deck:context`, and
compact template excerpts are passed into HTML design and repair prompts.

Template examples and seeds are also exposed for the frontend picker:

```txt
GET /v1/design-templates/:id/preview
GET /v1/design-templates/:id/preview/template
```

These previews help the user choose structure, rhythm, density, and deck taste.
They should not be copied into a generated user deck.

## 4. Design Systems With DESIGN.md And tokens.css

A design system gives the LLM a bounded visual language instead of letting it
invent a style from scratch.

Each design system should provide:

```txt
design-systems/<system>/
  DESIGN.md
  tokens.css
  manifest.json
  components.html
  preview/*.html
```

Use `DESIGN.md` for human-readable rules:

- brand personality
- typography
- color usage
- spacing and density
- components
- banned patterns
- accessibility expectations

Use `tokens.css` for machine-usable values:

- colors
- font stacks
- spacing
- radii
- shadows
- chart colors
- semantic state colors

The design agent should read selected template and design-system context before
HTML generation.

`components.html` and `preview/*.html` are local reference fixtures for the
frontend picker. They let users see colors, typography, spacing, and component
taste before choosing a design system. They are not LLM-generated slide samples,
and the frontend should not copy preview HTML into generated decks.

Current backend integration:

```txt
design-systems/<slug>/manifest.json
design-systems/<slug>/DESIGN.md
design-systems/<slug>/tokens.css
design-systems/<slug>/components.html
design-systems/<slug>/preview/*.html
```

The production Context Agent loads a small set of relevant design systems from
the filesystem. Selection uses the requested `designStyle`, deck type,
project-selected template, workspace preferences, and workspace branding. The
selected system ids are emitted in `deck:context`, and compact `DESIGN.md` /
`tokens.css` excerpts are passed into HTML design and repair prompts.

The catalog exposes preview URLs so the web app can show the selected visual
language in a sandboxed iframe:

```txt
GET /v1/design-systems/:id/preview
GET /v1/design-systems/:id/preview/:page
```

This means `designStyle` is no longer just a loose word like `modern`; it can
resolve into concrete Open Design rules and tokens such as `default`,
`corporate`, `editorial`, `kami`, `github`, or another bundled system.

Frontend template/design-system selection contract:
`docs/frontend-design-system-selection.md`.

## 5. Screenshot-Based QA Loop

HTML-only checks are necessary, but visual QA needs screenshots.

The backend loop should be:

```txt
1. Generate slide HTML.
2. Render slide/deck screenshots with Playwright at 1920x1080.
3. Run deterministic checks.
4. Run vision QA when configured.
5. Identify the exact slide numbers with problems.
6. Repair only those slides.
7. Re-render and re-check repaired slides.
```

QA should catch:

- missing 1920x1080 canvas
- overflow or clipped content
- text too small
- overcrowded slides
- poor contrast
- unsafe HTML
- remote URLs outside approved first-party asset routes
- repeated generic layouts
- missing image alt text where image assets exist
- slide not matching its intended purpose

Repair should be per-slide, not whole-deck. If slide 2 has unsafe HTML, only
slide 2 should be sent to the repair LLM call.

## 6. Strict Checklists Before Export

Every deck template should have a checklist, either inside `SKILL.md` or under
`references/checklist.md`.

Before final save/export, the backend should enforce a preflight like:

```txt
- Every slide is 1920x1080.
- Every slide is self-contained HTML.
- No scripts, iframes, external fonts, or unapproved remote URLs.
- Text fits inside the slide.
- Slide count matches the requested outline.
- Each slide has a clear role.
- Layouts vary across the deck.
- Speaker notes exist when requested.
- QA score meets the configured threshold.
- Blocking QA issues are repaired.
```

If a template has more specific rules, those rules should be merged into the
deck preflight.

## 7. No Freeform Random Slide Generation

The LLM should not receive a vague prompt like:

```txt
Create the whole PPT.
```

Instead, generation should be staged:

```txt
1. Intent classification.
2. Plan.
3. Context loading.
4. Research or file extraction when needed.
5. Outline.
6. Content writing one slide at a time.
7. Layout/template selection.
8. HTML design one slide at a time.
9. Screenshot QA.
10. Targeted per-slide repair.
11. Final save/export.
```

This keeps outputs controllable, debuggable, replayable, and easier for the
frontend to explain to the user.

## Frontend Contract

The frontend should:

- start jobs
- subscribe to realtime events
- show plan/content/layout/QA/repair progress
- render backend HTML previews in sandboxed iframes
- fetch the final artifact from the job/project

The frontend should not:

- generate slide HTML
- choose layouts client-side
- repair HTML client-side
- bypass backend QA
- treat one raw LLM response as the canonical deck

## Backend Files That Already Match This Direction

Relevant implementation points:

| Area | Files |
| --- | --- |
| Fixed slide canvas and artifact HTML | `src/modules/render/buildDeckHtml.ts`, `src/modules/render/htmlPptx.ts` |
| Screenshot rendering | `src/modules/render/render.service.ts` |
| Agentic deck generation | `src/modules/agents/cloudProductionAgent.ts` |
| Design/QA tools | `src/modules/agents/tools/advancedSystem.tools.ts`, `src/modules/agents/tools/cloudDeck.tools.ts` |
| Deck-only templates | `design-templates/` |
| Design systems | `design-systems/` |
| Frontend event replay | `docs/frontend-job-event-replay.md` |

## Non-Negotiables

- HTML is the source visual artifact.
- Slides are 1920x1080.
- Templates are slide/deck templates only.
- Design systems constrain style.
- QA uses screenshots where possible.
- Repairs are targeted by slide number.
- Export happens only after preflight passes.
- The frontend renders and explains progress; it does not become the designer.
