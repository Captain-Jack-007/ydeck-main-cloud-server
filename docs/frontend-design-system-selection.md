# Frontend Template And Design System Selection

This document describes the frontend changes needed now that YDeck integrates
Open Design deck templates and design systems into deck generation.

## What Changed

The backend now loads deck templates from:

```txt
design-templates/<slug>/SKILL.md
design-templates/<slug>/references/checklist.md
design-templates/<slug>/references/layouts.md
design-templates/<slug>/template.json
```

The backend also loads design systems from:

```txt
design-systems/<slug>/manifest.json
design-systems/<slug>/DESIGN.md
design-systems/<slug>/tokens.css
```

During generation, the Context Agent selects relevant templates and design
systems. The HTML Designer and Repair Agent receive compact excerpts from those
files. The selected summaries are emitted in `deck:context`.

Before this integration, templates were only partially represented: projects had
a `templateId`, and `/v1/templates` returned DB `TemplatePack` rows, but the
production HTML designer was not reading filesystem `design-templates/<id>`
rules. Now it does.

For frontend UX, there are two separate selectors:

- `templateId`: deck structure or visual recipe from `design-templates/`.
- `designStyle`: design-system id from `design-systems/`.

## Catalog Routes

Load available slide/deck templates:

```http
GET /v1/design-templates
Authorization: Bearer <accessToken>
```

Response:

```json
[
  {
    "id": "simple-deck",
    "name": "simple-deck",
    "description": "Single-file horizontal-swipe HTML deck...",
    "scenario": "product",
    "preview": { "type": "html", "entry": "index.html" },
    "previewUrl": "/v1/design-templates/simple-deck/preview",
    "previewPages": [
      {
        "role": "example",
        "title": "Example Deck",
        "url": "/v1/design-templates/simple-deck/preview"
      },
      {
        "role": "template",
        "title": "Template Seed",
        "url": "/v1/design-templates/simple-deck/preview/template"
      }
    ]
  }
]
```

Template preview routes:

```http
GET /v1/design-templates/:id/preview
GET /v1/design-templates/:id/preview/template
```

`GET /v1/design-templates/:id/preview` returns the best local example deck for
the template, usually `example.html`. `/preview/template` returns the seed
template when one exists, usually `assets/template.html`.

`GET /v1/design-templates` is also a frontend PPT-template catalog, not a raw
dump of every skill folder. Broad authoring engines, landing-page sibling
fixtures, web-deck runtimes with heavy scripts/WebGL, templates without
previewable deck examples, and non-presentation packages stay off the
user-facing picker even if they remain on disk for backend/reference use.

Load available design systems:

```http
GET /v1/design-systems
Authorization: Bearer <accessToken>
```

Response:

```json
[
  {
    "id": "editorial",
    "name": "Editorial",
    "category": "Creative & Artistic",
    "description": "Bundled Open Design package for Editorial...",
    "previewUrl": "/v1/design-systems/editorial/preview",
    "previewPages": [
      {
        "role": "components",
        "title": "Components",
        "url": "/v1/design-systems/editorial/preview"
      },
      {
        "role": "colors",
        "title": "Colors",
        "url": "/v1/design-systems/editorial/preview/colors"
      },
      {
        "role": "typography",
        "title": "Typography",
        "url": "/v1/design-systems/editorial/preview/typography"
      },
      {
        "role": "spacing",
        "title": "Spacing",
        "url": "/v1/design-systems/editorial/preview/spacing"
      }
    ]
  }
]
```

The frontend should treat `id` as the value to send to the backend.

`GET /v1/design-systems` is a frontend deck-style catalog, not a raw filesystem
dump of every Open Design fixture. Brand/product website systems such as Loom,
Airbnb, Vercel, Shopify, and similar app or marketing-site references are
filtered out of this picker. They can remain on disk as reference material, but
the user-facing deck style list should contain presentation-suitable visual
systems only.

Preview routes:

```http
GET /v1/design-systems/:id/preview
GET /v1/design-systems/:id/preview/:page
```

`GET /v1/design-systems/:id/preview` returns the system's `components.html`.
Named preview pages return local files from
`design-systems/<id>/preview/<page>.html`. The backend inlines
`tokens.css`, blocks scripts with CSP, and allows the page to be embedded as a
frontend iframe.

## User Selection UI

Add both controls wherever the user can configure a new deck:

- new chat deck options
- deck generation wizard
- settings default generation preferences
- design refinement panel, if present

Recommended controls:

```txt
Label: Deck template
Default: Auto / Simple Deck
Options: loaded from GET /v1/design-templates

Label: Design system
Default: Auto / Neutral Modern
Options: loaded from GET /v1/design-systems
```

UI behavior:

- Show name, category/scenario, and short description.
- Group design systems by `category`.
- Group templates by `scenario`.
- Show visual previews for templates before the user selects one.
- Show visual previews for design systems before the user selects one.
- Include `Auto` options that omit the field and let backend/settings decide.
- Search/filter by name and description if the lists are long.
- Keep deck templates and design systems as separate controls.
- Do not hard-code either option list.

## Template Preview UI

Use `template.previewUrl` and `template.previewPages` to let the user inspect
how the deck structure might feel before generation.

Recommended flow:

- The template picker lists cards grouped by `scenario`.
- Each card shows name, scenario, description, and a small preview frame or
  thumbnail.
- Selecting a card opens a larger preview panel.
- Tabs come from `template.previewPages`, usually `Example Deck` and
  `Template Seed`.
- The selected template still sends only `templateId: template.id` during
  generation.

Example iframe:

```tsx
type DesignTemplatePreviewPage = {
  role?: string | null;
  title?: string | null;
  url: string;
};

type DesignTemplateSummary = {
  id: string;
  name: string;
  description?: string | null;
  scenario?: string | null;
  preview?: unknown;
  previewUrl?: string | null;
  previewPages?: DesignTemplatePreviewPage[];
};

function TemplatePreview({
  apiOrigin,
  template,
  pageUrl,
}: {
  apiOrigin: string;
  template: DesignTemplateSummary;
  pageUrl?: string;
}) {
  const url = pageUrl ?? template.previewUrl;
  if (!url) return null;

  return (
    <iframe
      title={`${template.name} template preview`}
      src={`${apiOrigin}${url}`}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className="aspect-video w-full border-0"
    />
  );
}
```

Template previews are example decks or seed decks. They are useful for judging
structure, rhythm, density, navigation feel, and visual recipe. They are not the
final generated deck, and the frontend should not copy preview HTML into a user
project.

## Design System Preview UI

Use the catalog's `previewUrl` and `previewPages` to build a preview page or
side panel for every design system.

Recommended flow:

- The design-system picker lists systems as compact cards.
- Selecting or hovering a card opens a larger preview panel.
- The preview panel renders the selected system in a sandboxed iframe.
- Tabs come from `system.previewPages`, usually `Components`, `Colors`,
  `Typography`, and `Spacing`.
- The selected design system still sends only `designStyle: system.id` during
  generation.

Example iframe:

```tsx
type DesignSystemPreviewPage = {
  role?: string | null;
  title?: string | null;
  url: string;
};

type DesignSystemSummary = {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  previewUrl?: string | null;
  previewPages?: DesignSystemPreviewPage[];
};

function DesignSystemPreview({
  apiOrigin,
  system,
  pageUrl,
}: {
  apiOrigin: string;
  system: DesignSystemSummary;
  pageUrl?: string;
}) {
  const url = pageUrl ?? system.previewUrl;
  if (!url) return null;

  return (
    <iframe
      title={`${system.name} design preview`}
      src={`${apiOrigin}${url}`}
      sandbox=""
      referrerPolicy="no-referrer"
      className="h-full min-h-[520px] w-full border-0"
    />
  );
}
```

The preview frame is a style/component preview page, not a generated slide.
Keep it visually distinct from the 1920x1080 deck preview. Good layouts:

- Desktop: left catalog grid, right preview panel with tabs.
- Mobile: list first, then full-width preview after selection.
- Generation wizard: show the selected system preview below the selector.
- Settings page: show preview beside the default design-system selector.

Use stable preview dimensions so card hover states and tab labels do not shift
the layout. If a frontend deployment cannot iframe the API origin, fetch the
preview HTML and render it with `srcDoc` in the same sandboxed iframe.

## Payload Contract

Generate deck:

```http
POST /v1/cloud/decks/generate
Content-Type: application/json
```

```json
{
  "prompt": "Create a pitch deck for an AI teaching tool.",
  "workspaceId": "665f...",
  "deckType": "investor_pitch",
  "templateId": "html-ppt-pitch-deck",
  "designStyle": "editorial",
  "language": "en",
  "slideCount": 10
}
```

Chat/agent message that creates or edits a deck:

```http
POST /v1/cloud/agent/message
Content-Type: application/json
```

```json
{
  "message": "Make a 10 slide investor deck for our AI tutor.",
  "workspaceId": "665f...",
  "templateId": "simple-deck",
  "designStyle": "corporate"
}
```

Settings default:

```http
PATCH /v1/user/settings
Content-Type: application/json
```

```json
{
  "workspaceId": "665f...",
  "defaultDesignStyle": "kami"
}
```

The backend still accepts legacy `designStyle` values such as `modern`. If the
value does not match a design-system id directly, the backend scores nearby
systems from style words, deck type, template id, branding, and preferences.

## Template vs Design System

Keep these separate in the UI:

| Control | Backend field | Meaning |
| --- | --- | --- |
| Deck template | `templateId` | Slide/deck structure or named recipe from `design-templates/` |
| Design system | `designStyle` | Brand/style rules and tokens from `design-systems/` |

Example:

```json
{
  "templateId": "html-ppt-pitch-deck",
  "designStyle": "stripe"
}
```

This means: use the pitch-deck recipe, but constrain colors, typography,
spacing, and component taste with the Stripe-like design system.

## Realtime UI

`deck:context` includes selected template and design-system summaries:

```json
{
  "type": "deck.context",
  "jobId": "6660...",
  "data": {
    "designTemplates": [
      {
        "id": "html-ppt-pitch-deck",
        "name": "html-ppt-pitch-deck",
        "scenario": "finance",
        "description": "Investor-ready 10-slide HTML pitch deck..."
      }
    ],
    "designSystems": [
      {
        "id": "editorial",
        "name": "Editorial",
        "category": "Creative & Artistic",
        "description": "Bundled Open Design package..."
      }
    ]
  }
}
```

Frontend should show this as part of the visible process:

```txt
Loaded deck template: html-ppt-pitch-deck
Loaded design system: Editorial
```

## Hydration And History

Saved project/deck responses expose `templateId` and `designStyle` through
project fields, metadata, and job input params.

Frontend should:

- Store selected `templateId` and design-system id in local thread metadata
  when creating an optimistic thread.
- Read `project.templateId`, `project.meta.templateId`, or
  `job.inputParams.templateId` when hydrating an existing deck.
- Read `project.designStyle`, `project.meta.designStyle`, or
  `job.inputParams.designStyle` when hydrating design system selection.
- Show template and design-system names in deck history/detail if catalogs are
  loaded.
- Keep rendering older decks whose `designStyle` is a legacy value or whose
  `templateId` is missing.

Hydration label rule:

```ts
const templateLabel =
  designTemplates.find((template) => template.id === templateId)?.name ??
  legacyLabelize(templateId);

const designSystemLabel =
  designSystems.find((system) => system.id === designStyle)?.name ??
  legacyLabelize(designStyle);
```

## Frontend Files To Change

Exact file names may differ in the web repo, but the work is:

| Area | Change |
| --- | --- |
| API client | Add `getDesignTemplates()` for `GET /v1/design-templates`. |
| API client | Use `template.previewUrl` / `template.previewPages` for template preview iframes. |
| API client | Add `getDesignSystems()` for `GET /v1/design-systems`. |
| API client | Use `system.previewUrl` / `system.previewPages` for design-system preview iframes. |
| Generation wizard | Add deck-template selector and design-system selector. |
| Generation wizard | Show template preview before generation so users can judge deck rhythm and density. |
| Chat composer options | Let advanced options choose template and design system before starting a deck. |
| Settings page | Load design-system catalog and save selected id as `defaultDesignStyle`. |
| Thread/local storage | Persist selected `templateId` and `designStyle` with draft thread metadata. |
| Realtime timeline | Render selected templates and systems from `deck:context`. |
| Deck history/detail | Label `templateId` and `designStyle` using catalog names when available. |
| Tests | Cover catalog loading, preview URL rendering, selection persistence, request payloads, template/system separation, and legacy fallback labels. |

## Suggested Types

```ts
export type DesignTemplatePreviewPage = {
  role?: string | null;
  title?: string | null;
  url: string;
};

export type DesignTemplateSummary = {
  id: string;
  name: string;
  description?: string | null;
  scenario?: string | null;
  preview?: unknown;
  previewUrl?: string | null;
  previewPages?: DesignTemplatePreviewPage[];
};

export type DesignSystemPreviewPage = {
  role?: string | null;
  title?: string | null;
  url: string;
};

export type DesignSystemSummary = {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  previewUrl?: string | null;
  previewPages?: DesignSystemPreviewPage[];
};

export type GenerateDeckRequest = {
  prompt: string;
  workspaceId?: string;
  title?: string;
  deckType?: string;
  templateId?: string; // selected DesignTemplateSummary.id
  designStyle?: string; // selected DesignSystemSummary.id
  language?: string;
  slideCount?: number;
  researchMode?: "auto" | "on" | "off";
};
```

## Selection Rules

Use these frontend rules:

- If user chooses template `Auto`, omit `templateId`.
- If user chooses design system `Auto`, omit `designStyle`.
- If user chooses a template, send `templateId: template.id`.
- If user chooses a design system, send `designStyle: system.id`.
- If settings has `defaultDesignStyle`, preselect that system when present.
- If catalogs fail to load, keep a small legacy text/select fallback and allow
  generation to continue.
- Do not send template files or design-system files from the frontend.

## Why The Frontend Sends IDs Only

The backend needs trusted local files during:

- outline/layout context
- per-slide HTML design
- per-slide repair
- QA/preflight decisions

If the frontend sends `SKILL.md`, `layouts.md`, `checklist.md`, `DESIGN.md`, or
`tokens.css` blobs, it creates version drift and large request payloads. The
frontend should only send stable ids; the backend resolves the actual files.

## Related Docs

- `docs/open-design-slide-generation-principles.md`
- `docs/frontend-slide-design-agent.md`
- `docs/frontend-agentic-flow.md`
- `docs/frontend-user-settings.md`
