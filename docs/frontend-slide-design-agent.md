# Frontend Slide Design Agent Contract

This document explains how the YDeck web frontend should work with the cloud
slide design agent. The important frontend idea is:

For the whole agentic job lifecycle, tool list, and frontend state contract, see
[Frontend Agentic Flow Contract](./frontend-agentic-flow.md).

```txt
The frontend does not design slides locally.
The frontend starts a job, listens to realtime events, previews backend HTML,
and fetches the final deck artifact.
```

The backend agent now has a dedicated visual design tool layer. It is responsible
for turning structured slide content into designed HTML, checking it, repairing
it when needed, saving it, and streaming preview HTML to the browser.

Slides should not all share one generic template. The backend renders different
approved layouts per slide, such as title hero, image split, metric/chart,
timeline/process, comparison, problem cards, card grid, and closing CTA. Preview
HTML may include inline SVG icons, HTML/SVG charts, timelines, and backend
stored image assets. The frontend should not recreate these client-side; render
the backend HTML in the sandboxed preview iframe.

## The Backend Loop

For frontend purposes, treat deck generation as this pipeline:

```txt
1. User prompt
2. Cloud deck agent plans content
3. Agent calls design_deck
4. design_deck selects controlled layouts
5. HTML Designer designs each slide one by one with a separate LLM call
6. Backend emits slide.preview as soon as each slide is designed
7. design_deck runs deterministic design QA
8. design_deck repairs/retries when needed
9. Backend saves deck artifact
10. Frontend renders preview HTML in sandboxed iframes
```

## Pre-Design Tool Order

The design tool is intentionally late in the workflow. The backend must first
understand what the user wants, then prepare a clean slide brief.

Recommended order:

```txt
1. Intent Classifier
   Decide chat vs create deck vs edit deck vs export.

2. Planner Agent
   Create the visible user plan.

3. Context Agent
   Load workspace, project, brand, preferences, packs, and previous versions.

4. File Extraction Agent, only when files exist
   Extract summaries, facts, and suggested slides.

5. Research Agent, only when needed
   Use Tavily/web research for recent facts, market data, competitors, policy,
   country data, statistics, and investor-ready claims.

6. Outline Agent
   Decide slide purpose, story order, and slide types.

7. Content Agent
   Write titles, subtitles, bullets, notes, and visual intent. No HTML yet.

8. Layout Agent
   Choose an approved YDeck layout for each slide.

9. Image Asset Agent, only when useful
   Search Pexels, show image candidates, select/download/store the chosen image.

10. HTML Designer Agent
    Design one slide at a time using the prepared brief.

11. QA + Repair Agents
    Check and fix readability, overflow, layout quality, and safety.
```

The HTML Designer Agent should receive:

```txt
slide purpose
approved layout id
written content
brand/theme context
research facts, if any
stored image assets, if any
speaker notes
neighboring slide context
```

It should not be responsible for inventing the whole story, deciding whether to
research, or searching images directly.

## Design Refinement Requests

When the user says something like:

```txt
Try a different design
Make it more modern
Use a different style
Make it more visual
```

and the frontend sends the current `projectId`, the backend treats this as a
design refinement job. Before regenerating previews, the backend emits a
`deck:plan` event with a concrete design-change plan.

The plan tells the user that YDeck will:

```txt
1. Understand the requested design change
2. Keep the existing story and key claims unless text changes are requested
3. Choose alternate layouts for each slide
4. Refresh visual hierarchy, spacing, typography, and color rhythm
5. Use icons, charts, timelines, and stored images where useful
6. Regenerate slide previews one by one
7. Run design QA and save a new version
```

Frontend behavior:

```txt
Show the design-change plan first.
Then replace slide previews incrementally as new slide.preview events arrive.
Keep the old deck visible until replacement previews are ready.
```

The current MVP design loop is deterministic. It checks layout, density,
readability risk, unsafe HTML, missing canvas sizing, excessive bullets, long
titles, and other structural issues. Browser screenshots and vision critique are
planned next, but the frontend contract is already shaped for that future.

## Agent Tools

These tools are backend-internal. The frontend does not call them directly.
They appear in `agent:loop` logs so the UI may show progress/debug information.

| Tool | Purpose | Frontend meaning |
| --- | --- | --- |
| `inspect_project` | Reads project title, prompt, template, and previous artifact. | Agent is gathering context. |
| `read_workspace_context` | Reads workspace branding/preferences. | Brand/style context is being loaded. |
| `list_packs` | Reads available template/plugin packs. | Layout/style choices are being informed. |
| `design_deck` | Main visual design tool. Selects layouts, creates HTML, QA checks, repairs, saves artifact, streams previews. | This is the preferred successful generation path. |
| `design_slide` | Designs one slide for targeted preview/repair. | Useful for future single-slide edit flows. |
| `create_deck` | Saves a deck artifact without the explicit design loop. | Fallback only. |
| `update_deck` | Saves a refined deck artifact. | Fallback/refinement path. |

For normal cloud generation, the frontend should expect successful jobs to have:

```json
{
  "resultMeta": {
    "source": "design_deck",
    "agent": {
      "toolCalls": [
        { "name": "inspect_project", "ok": true },
        { "name": "read_workspace_context", "ok": true },
        { "name": "list_packs", "ok": true },
        { "name": "design_deck", "ok": true }
      ]
    }
  }
}
```

Do not fail the UI if the source is `create_deck`; old jobs and fallback jobs may
still exist. Prefer the artifact fields described below.

## Realtime Events

Connect with Socket.IO:

```ts
import { io } from "socket.io-client";

const socket = io(API_ORIGIN, {
  path: "/realtime",
  auth: { token: accessToken },
  transports: ["websocket"]
});

socket.emit("deck:subscribe", { jobId });
```

Important events:

| Event | Use |
| --- | --- |
| `deck:plan` | Show the user-facing agent plan. |
| `deck:outline` | Show the deck outline/timeline. |
| `deck:status` | Update progress/status UI. |
| `agent:loop` | Show agent thinking/tool activity if desired. |
| `deck:event` with `type: "slide.preview"` | Render or replace a live slide preview. |
| `deck:qa` | Show design QA score and auto-fix summary. |
| `deck:version` | Update version history UI. |
| `deck:artifact` | Artifact has been saved; optionally refetch. |
| `deck:done` | Job finished; fetch canonical job result. |
| `deck:error` | Show failure message. |
| `deck:canceled` | Stop working UI. |

`slide.preview` arrives through the normalized `deck:event` channel:

```json
{
  "type": "slide.preview",
  "jobId": "6660...",
  "status": "llm",
  "progress": 35,
  "data": {
    "slideNumber": 1,
    "slideTitle": "Market Opportunity",
    "layoutId": "title_hero",
    "designId": "ydeck.cloud:modern:title_hero",
    "source": "llm_html",
    "status": "rendered",
    "html": "<!doctype html><html>...</html>"
  },
  "at": "2026-06-21T12:00:00.000Z"
}
```

Frontend listener:

```ts
socket.on("deck:event", (event) => {
  if (event.type !== "slide.preview") return;
  const preview = event.data;
  setSlidePreviews((prev) => ({
    ...prev,
    [preview.slideNumber]: preview
  }));
});
```

Always fetch the final job after `deck:done`. Realtime previews are for live UI;
the job response is the canonical persisted result.

## Artifact Shape

Fetch final result:

```http
GET /v1/jobs/:jobId
Authorization: Bearer <accessToken>
```

The final deck is at:

```ts
job.resultMeta.deckArtifact
```

Each slide can contain these visual fields:

```json
{
  "slideNumber": 1,
  "slideType": "title",
  "layoutId": "title_hero",
  "title": "Market Opportunity",
  "subtitle": "Why this market is ready now",
  "bullets": ["Teachers spend hours preparing slides"],
  "speakerNotes": "Optional notes",
  "visual": {
    "designQa": {
      "previousScore": 97,
      "problems": [],
      "fixes": [],
      "repairedAtAttempt": 1
    }
  },
  "html": "<section class=\"ydeck-slide\" style=\"width:1920px;height:1080px;...\">...</section>",
  "previewHtml": "<!doctype html><html>...</html>",
  "preview": {
    "type": "html",
    "slideNumber": 1,
    "layoutId": "title_hero",
    "designId": "ydeck.cloud:modern:title_hero",
    "html": "<!doctype html><html>...</html>"
  }
}
```

Field meanings:

| Field | Meaning | Frontend use |
| --- | --- | --- |
| `slide.html` | The designed slide section only. | Use for editors that need the raw slide section. |
| `slide.previewHtml` | Full iframe-ready HTML document. | Use for preview if `slide.preview.html` is missing. |
| `slide.preview.html` | Preferred full iframe-ready preview document. | Primary preview source. |
| `slide.layoutId` | Backend-selected layout. | Display/debug/filter, not required for rendering. |
| `slide.visual.designQa` | QA metadata from deterministic repair loop. | Optional debug/quality panel. |

Preview source order:

```ts
function previewHtmlForSlide(slide: any): string | null {
  return (
    slide.preview?.html ??
    slide.previewHtml ??
    (slide.html ? wrapSectionForPreview(slide.html) : null)
  );
}
```

## Rendering Previews

Render preview HTML in a sandboxed iframe. The backend targets a fixed
`1920 x 1080` canvas.

```tsx
function SlidePreview({ html, slideNumber }: { html: string; slideNumber: number }) {
  return (
    <div style={{ width: "100%", aspectRatio: "16 / 9", overflow: "hidden" }}>
      <iframe
        title={`Slide ${slideNumber} preview`}
        srcDoc={html}
        sandbox="allow-same-origin"
        scrolling="no"
        style={{
          width: "100%",
          height: "100%",
          border: 0
        }}
      />
    </div>
  );
}
```

If your iframe uses a fixed 1920x1080 inner document and the container does not
scale it automatically, use this pattern:

```tsx
function ScaledSlidePreview({ html, slideNumber }: { html: string; slideNumber: number }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = React.useState(1);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / 1920);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", overflow: "hidden" }}>
      <iframe
        title={`Slide ${slideNumber} preview`}
        srcDoc={html}
        sandbox="allow-same-origin"
        scrolling="no"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1920,
          height: 1080,
          border: 0,
          transform: `scale(${scale})`,
          transformOrigin: "top left"
        }}
      />
    </div>
  );
}
```

Do not parse the backend HTML to rebuild the slide with React. Treat it as the
visual preview output.

## Live Preview State

Recommended frontend state:

```ts
type SlidePreviewPayload = {
  slideNumber: number;
  slideTitle?: string;
  layoutId?: string;
  designId?: string;
  html: string;
};

type DeckGenerationState = {
  jobId: string;
  projectId: string;
  status: "queued" | "llm" | "rendering" | "done" | "error" | "canceled";
  progress: number;
  slidePreviews: Record<number, SlidePreviewPayload>;
  deckArtifact?: any;
  errorMessage?: string;
};
```

During generation:

1. Show placeholders for expected slide count if known.
2. Replace each placeholder as `slide.preview` arrives.
3. Keep listening until terminal status.
4. On `deck:done`, fetch `GET /v1/jobs/:jobId`.
5. Replace live state with `job.resultMeta.deckArtifact`.

If the socket reconnects, re-emit:

```ts
socket.emit("deck:subscribe", { jobId });
```

Then refetch:

```http
GET /v1/jobs/:jobId
```

## Showing Agent Tool Progress

The frontend may show `agent:loop` as a progress log.

Useful mappings:

| Tool/event | Suggested UI text |
| --- | --- |
| `inspect_project` | Reading project context |
| `read_workspace_context` | Loading workspace brand settings |
| `list_packs` | Checking design/layout packs |
| `design_deck` | Designing slides and running QA |
| `slide.preview` | Slide preview ready |
| `deck.artifact` | Deck saved |
| `run.summary` | Generation complete |

Keep this secondary. The main UX should be previews appearing in real time.

## Fallbacks

Frontend fallback order for a slide:

1. Render `slide.preview.html`.
2. Else render `slide.previewHtml`.
3. Else wrap `slide.html` into a basic preview document.
4. Else render a simple text placeholder from `title`, `subtitle`, and
   `bullets`.

Example wrapper:

```ts
function wrapSectionForPreview(sectionHtml: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=1920,height=1080,initial-scale=1" />
  <style>
    html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#111827}
  </style>
</head>
<body>${sectionHtml}</body>
</html>`;
}
```

## Exports

Current main-server MVP returns JSON artifacts and HTML previews. PPTX/PDF export
is not complete in this server yet.

Recommended future frontend behavior:

- For preview: use `slide.preview.html`.
- For screenshot-to-PPTX export: backend should render the same HTML at
  `1920 x 1080`, screenshot it, and place images into PPTX.
- For editable PPTX export: backend should later convert structured slide data
  and HTML layout metadata into PowerPoint shapes.

Do not implement screenshot/export logic in the browser. Keep export on the
server so output is consistent.

## Current MVP Versus Planned Visual QA

Current backend:

- Controlled layout selection.
- HTML/CSS generation.
- Deterministic QA scoring.
- Repair attempts.
- Saved preview HTML.
- Realtime `slide.preview` streaming.

Planned backend additions:

- Playwright render worker.
- PNG screenshots per slide.
- DOM bounding-box overflow checks.
- Vision model critique.
- Score-driven HTML/CSS repair from screenshot feedback.
- Screenshot-to-PPTX export.

The frontend should not need a breaking contract change when those land. The
same `slide.preview` events and `slide.preview.html` artifact fields should
continue to be used.

## Rules For Frontend Implementation

- Use Socket.IO `/realtime`; do not build the primary UX on SSE.
- Do not generate or repair slide design in the browser.
- Do not assume `deck:artifact` means the job is terminal; wait for `deck:done`
  or fetch the job status.
- Do not use `deckId` from the generate response for project navigation. Use
  `projectId`.
- Do not require `designQa` to exist. Older decks may not have it.
- Render previews in sandboxed iframes.
- Treat backend HTML as untrusted display content. Use `srcDoc` plus iframe
  sandboxing, not direct `dangerouslySetInnerHTML` in the app DOM.
