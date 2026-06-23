# Frontend Agentic Flow Contract

This document explains what the YDeck agentic backend does, which tools it can
use, and what the web frontend receives from that flow.

YDeck is currently **cloud-first**. The web frontend should integrate with cloud
jobs, cloud realtime events, cloud previews, and cloud artifacts. Local/private
runtime behavior is future scope and should not shape the web contract today.

For the backend slide-generation rules YDeck keeps from Open Design, see
[Open Design Slide Generation Principles](./open-design-slide-generation-principles.md).
For the frontend design-system picker and payload contract, see
[Frontend Design System Selection](./frontend-design-system-selection.md).

The frontend does not call agent tools directly. The frontend starts a job,
subscribes to realtime events, renders backend previews, and fetches the final
artifact.

## Short Version

```txt
Frontend sends prompt
Backend creates project + job
Agent reads context
Agent calls tools
Design tool saves deck artifact
Backend streams previews/status
Frontend renders previews and fetches final job
```

The main frontend responsibilities are:

- Start generation with `POST /v1/cloud/decks/generate`.
- Connect to Socket.IO at `/realtime`.
- Subscribe with `deck:subscribe`.
- Show visible cloud-agent stages from `deck:plan`, `deck:outline`,
  `deck:content`, `deck:asset`, `deck:qa`, `deck:repair`, and `deck:export`
  when present.
- Render `slide.preview` HTML as it arrives.
- Fetch `GET /v1/jobs/:jobId` when the job is terminal.
- Render `job.resultMeta.deckArtifact`.

## Entry Point

For a chat-style agent input box, use the intent-aware endpoint first:

```http
POST /v1/cloud/agent/message
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "message": "hello",
  "workspaceId": "665f...",
  "projectId": "optional-current-project-id"
}
```

If the user is only chatting, the backend returns immediately and does not
create a deck job:

```json
{
  "success": true,
  "mode": "cloud",
  "type": "chat",
  "intent": {
    "intent": "chat",
    "confidence": 0.98,
    "reason": "casual_chat_or_help"
  },
  "message": "Hello! I can help you create a new deck...",
  "actions": [
    { "type": "create_deck", "label": "Create a deck" }
  ]
}
```

If the user asks for a deck or an edit, the same endpoint returns a normal job
response:

```json
{
  "success": true,
  "mode": "cloud",
  "type": "job",
  "intent": {
    "intent": "create_deck",
    "confidence": 0.9,
    "reason": "deck_creation_keywords"
  },
  "projectId": "665f...",
  "jobId": "6660...",
  "status": "processing",
  "pipeline": "agentic",
  "eventsUrl": "/v1/jobs/6660.../events"
}
```

Use this endpoint for free-form chat boxes. Use direct generation only when the
UI action is explicitly "generate deck".

The intent endpoint is multilingual. The backend first uses deterministic
intent rules, then calls the configured cloud LLM when the message is ambiguous
or written in another language. This means messages like `создай презентацию о
Китае`, `中国についてのPPTを作って`, or `JD.com haqida taqdimot kerak` should be
routed as `create_deck`, while simple greetings stay as `chat`.

When the backend can infer the user's language, `intent.inferredLanguage` is
included and used as the job language unless the frontend sends an explicit
`language` value. The frontend should display the returned `intent` for debug
or agent timeline UI, but should not reclassify the message client-side.

Use this endpoint for a new prompt-to-deck flow:

```http
POST /v1/cloud/decks/generate
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "prompt": "Create a pitch deck for an AI teaching tool.",
  "workspaceId": "665f...",
  "title": "AI Teaching Tool Pitch",
  "deckType": "investor_pitch",
  "designStyle": "modern",
  "language": "en",
  "slideCount": 10,
  "researchMode": "auto"
}
```

Response:

```json
{
  "success": true,
  "mode": "cloud",
  "projectId": "665f...",
  "deckId": "6660...",
  "jobId": "6660...",
  "status": "processing",
  "pipeline": "agentic",
  "eventsUrl": "/v1/jobs/6660.../events"
}
```

Use `projectId` for project routes/navigation. Use `jobId` for realtime and job
result fetching. `deckId` is currently the job id for compatibility.

Other cloud deck endpoints:

```http
GET  /v1/cloud/agent/tools
GET  /v1/cloud/decks/:projectId
GET  /v1/cloud/decks/:projectId/versions
POST /v1/cloud/decks/:projectId/export
GET  /v1/cloud/exports/:fileId/download
POST /v1/jobs/:jobId/cancel
POST /v1/cloud/jobs/:jobId/continue
POST /v1/cloud/jobs/:jobId/retry
```

Development server note: in `NODE_ENV !== "production"`, the worker will not
auto-resume stale non-terminal jobs older than `DEV_JOB_RESUME_MAX_AGE_MINUTES`
(default `10`). It marks them `canceled` with `canContinue: true` so the
frontend can show a Continue action instead of unexpectedly regenerating a deck
after a server restart.

Export request:

```json
{
  "format": "html"
}
```

Tool discovery endpoint:

```http
GET /v1/cloud/agent/tools
GET /v1/cloud/agent/tools?agent=html_designer
GET /v1/cloud/agent/tools?role=design
```

This endpoint is for debug/admin/frontend timeline configuration. It returns the
registered internal tool metadata grouped by category. The frontend should not
execute these tools directly.

Example response shape:

```json
{
  "success": true,
  "mode": "cloud",
  "totalAdvancedTools": 80,
  "returnedTools": 15,
  "filter": {
    "agent": "html_designer",
    "mappedRole": "design"
  },
  "groups": {
    "Design and Layout": 8,
    "Image and Visual Asset": 2
  },
  "tools": [
    {
      "name": "design_slide_html",
      "risk": "read",
      "group": "Design and Layout",
      "agents": ["design"],
      "maturity": "adapter"
    }
  ]
}
```

Supported formats now:

| Format | Behavior |
| --- | --- |
| `html` | Saves a real downloadable HTML artifact containing slide previews. |
| `pptx` | Saves a real downloadable PPTX package with editable text-only slide content. Rich screenshot-to-PPTX export is still a render-service upgrade. |

Research modes:

| Mode | Behavior |
| --- | --- |
| `auto` | Default. Research Agent uses live web research only when the classifier decides the prompt needs it. |
| `required` | Always run live web research. |
| `off` | Never use live web research. |
| `file_only` | Use uploaded files/context only; no web search. |

## Backend Flow

The current cloud implementation runs a staged production orchestrator. It uses
separate cloud agent steps, validates structured outputs, saves intermediate
artifacts, emits realtime events per stage, and saves the final deck through the
same visual `design_deck` artifact format used by the preview UI.

Current production generation path:

```txt
1. Worker picks queued cloud job
2. Request Classifier creates DeckBrief
3. Planner emits deck.plan
4. Context Agent loads project/workspace/brand/packs
5. File Extraction runs when fileId exists
6. Research Agent runs when classifier marks research needed
7. Outline Agent emits deck.outline
8. Content Agent emits deck.content
9. Layout Agent emits deck.content with layout decisions
10. HTML Designer designs slides one by one with one LLM call per slide
11. Backend emits `slide.preview` as each slide is designed
12. QA Agent emits deck.qa
13. Repair Agent emits deck.repair and new previews if QA is weak
14. Final artifact is saved to resultMeta.deckArtifact
15. Export Agent emits deck.export metadata
16. Delivery stage emits deck.done and run.summary
```

Cloud architecture:

```txt
Cloud API Gateway
  -> Job Service
  -> Cloud Multi-Agent Orchestrator
  -> Specialist Agents
  -> Render + QA + Export Services
  -> Cloud Storage
  -> Realtime Events / Delivery
```

Implemented specialist flow:

```txt
Request Classifier
  -> Planner
  -> Context
  -> File Extraction / Research when needed
  -> Outline
  -> Content
  -> Layout
  -> HTML Designer
  -> Screenshot Renderer
  -> Vision QA
  -> Repair
  -> Export
  -> Delivery
```

Important implementation note:

```txt
The production system should not be one giant LLM request. The orchestrator
should run deterministic code between specialist LLM/tool steps, validate each
stage, save artifacts, emit events, retry/fallback when needed, and only run
agents that the job actually needs.
```

The backend now follows that rule. Each specialist step is a separate prompt or
deterministic service step. If a model response fails validation, the
orchestrator uses a deterministic fallback for that stage instead of leaving the
frontend without a deck.

Live web research is owned only by the Research Agent. Other production agents
consume the resulting `ResearchArtifact`; they should not call web search
directly. This keeps sources controlled and makes the UI/debug trail clearer.

Slide HTML design is also staged per slide. The HTML Designer Agent receives one
slide at a time, designs that slide, validates/falls back if needed, and emits
`slide.preview` immediately. The frontend should expect previews to arrive
incrementally: slide 1, then slide 2, then slide 3, rather than waiting for one
large full-deck design response.

Backend search providers:

```env
TAVILY_WEB_SEARCH_API=...
PEXELS_IMAGE_SEARCH_API=...
```

`TAVILY_WEB_SEARCH_API` powers text/web research. If it is missing, the backend
falls back to DuckDuckGo HTML search. `PEXELS_IMAGE_SEARCH_API` powers stock
image search and asset import.

Before LLM/tool work starts, the backend emits user-facing `deck.plan` and
`deck.outline` events. When the design artifact is saved, it emits
`deck.version`, `slide.preview`, `deck.qa`, and `deck.artifact`.

Important guarantee:

```txt
If the LLM exits without saving a deck artifact, the backend creates a
deterministic fallback deck and runs design_deck so the frontend still gets a
previewable artifact.
```

Provider/API failures can still produce an error job, but a normal no-tool or
no-save LLM response should not leave the frontend without an artifact.

## Agent Tools

These tools are backend-internal. They may appear in `agent:loop` events and in
`job.resultMeta.agent.toolCalls`.

The backend now registers the full advanced YDeck tool surface: **80 internal
tools across 10 groups**. Specialist agents do not see all tools at once. The
orchestrator selects a small permissioned set per role, such as Research Agent
tools, Design Agent tools, QA tools, or Export tools.

Tool groups:

| Group | Examples |
| --- | --- |
| Project and workspace | `inspect_project`, `read_workspace_context`, `read_brand_kit`, `read_deck_history` |
| File and document | `list_files`, `read_file`, `extract_pdf`, `extract_docx`, `ocr_image`, `summarize_file` |
| Research and source | `web_search`, `web_fetch`, `trigger_research`, `verify_sources`, `create_citation_list` |
| Deck planning | `create_deck_brief`, `create_deck_plan`, `create_outline`, `validate_outline` |
| Content writing | `write_slide_content`, `rewrite_slide`, `translate_deck`, `check_content_quality` |
| Design and layout | `choose_design_pack`, `choose_layouts`, `design_slide_html`, `design_deck_html` |
| Image and visual asset | `detect_visual_needs`, `search_images`, `create_chart`, `create_diagram` |
| QA and repair | `run_design_qa`, `vision_review_slide`, `repair_slide_design`, `final_deck_review` |
| Export and delivery | `save_deck_artifact`, `export_pptx`, `export_pdf`, `create_share_link` |
| Memory and analytics | `search_workspace_memory`, `list_skills`, `save_user_feedback`, `admin_audit_log` |

Some advanced tools are adapters around current production services. OCR is
connected through the backend `ocr_image` tool using Google Vision first and
Tencent OCR as fallback when configured. Browser screenshot rendering is
connected through Playwright Chromium with `render_slide_screenshot` and
`render_deck_screenshots`. Vision review is connected through
`vision_review_slide` and `vision_review_deck` with OpenAI vision as primary and
Tencent Hunyuan as fallback when the cloud account has Hunyuan activated. The
frontend should treat tool calls as progress/debug information, not as the
canonical deck state.

Runtime tool prompts are permissioned by role. For example, an HTML Designer
prompt receives Design Agent tools, while a Research Agent prompt receives
Research Agent tools. The legacy loop also receives a bounded prompt-to-deck
tool set instead of the full registry.

Every production-stage event should expose tool usage for that stage:

```json
{
  "toolUsage": {
    "stage": "designing",
    "toolsUsed": 7,
    "uniqueToolsUsed": 2,
    "toolNames": ["design_deck_html", "design_slide_html"]
  }
}
```

The frontend should show `toolsUsed` on each visible agent step when present.

When OCR runs, the backend may emit:

```json
{
  "type": "agent.tool.ocr",
  "tool": "ocr_image",
  "provider": "tencent_ocr",
  "fallbackFrom": "google_vision",
  "textLength": 1840,
  "blockCount": 12,
  "source": {
    "type": "file",
    "fileId": "6a...",
    "mimeType": "image/png",
    "bytes": 424000
  }
}
```

The frontend can render this as a file-processing step such as “Extracted text
from image.” Do not display service account paths or credential details.

When screenshots render, the backend may emit:

```json
{
  "type": "agent.tool.render",
  "tool": "render_slide_screenshot",
  "slideNumber": 5,
  "screenshotUrl": "/v1/cloud/exports/6a.../download",
  "width": 1920,
  "height": 1080,
  "format": "png",
  "bytes": 418220,
  "renderedAt": "2026-06-22T10:00:00.000Z",
  "metadata": {
    "renderer": "playwright_chromium",
    "deviceScaleFactor": 1,
    "selector": ".ydeck-slide"
  }
}
```

If `screenshotUrl` is a `/v1/cloud/exports/.../download` URL, request it with
the normal auth session. In local smoke tests without workspace context, the URL
may be a `data:image/png;base64,...` URL.
Use `toolNames` for expandable debug detail. The final `run.summary` and job
`resultMeta.productionFlow.toolUsage` include total usage and `byStage` counts.

| Tool | Category | What it does | What frontend gets |
| --- | --- | --- | --- |
| `inspect_project` | Read | Reads project title, prompt, template, and previous artifact. | `agent:loop` progress only. |
| `read_workspace_context` | Read | Reads branding/preferences such as colors, language, deck type, and style. | Better generated artifact; optional progress UI. |
| `list_packs` | Read | Reads installed template/plugin packs and available design hints. | Better layout/style choices. |
| `design_deck` | Write | Main deck design/save tool. Selects layouts, generates HTML, QA checks, repairs, saves artifact, streams previews. | `slide.preview`, `deck.artifact`, final `deckArtifact`. |
| `design_slide` | Read | Designs one slide for targeted repair/preview. | Future single-slide edit flows; not normally called by initial generation. |
| `create_deck` | Write | Saves a deck artifact without the explicit design loop. | Final `deckArtifact`; fallback/legacy path. |
| `update_deck` | Write | Saves a refined full deck. | Final `deckArtifact`; fallback/refinement path. |
| `create_document` | Write | Creates/replaces one slide from text body. | May emit slide completion/refetch events in future edit flows. |
| `update_document` | Write | Updates one slide or outline. | Future edit/refine flows. |
| `edit_document` | Write | Applies find/replace style edits. | Future edit/refine flows. |
| `suggest_document` | Read | Stages suggestions without mutation. | Future review flows. |
| `list_files` | Read | Lists available project files. | Future file-grounded generation. |
| `read_file` | Read | Reads uploaded/attached file text. | Future file-grounded generation. |
| `write_file` | Write | Writes file content. | Not part of normal deck generation UI. |
| `search_images` | External | Searches licensed Pexels image candidates. | Backend-only asset search; frontend may show `deck:asset` after selection. |
| `select_image` | External | Downloads, stores, and attaches a selected image candidate. | `deck:asset`; stored image may appear in slide preview HTML. |
| `upload_user_image` | Write | Converts an uploaded image file into a safe deck asset. | `deck:asset`; useful for logos/product photos. |
| `list_image_assets` | Read | Lists stored image assets for the workspace/project. | Future asset tray/gallery UI. |
| `web_search` | External | Searches the web when selected. | Better sourced content; progress only. |
| `web_fetch` | External | Fetches a URL/page. | Better sourced content; progress only. |
| `trigger_research` | External | Starts research-style gathering. | Future research/deep deck flows. |
| `search_chats` | Read | Searches previous chats/history. | Future memory/context flows. |
| `manage_memory` | Write | Stores/updates memory. | Future personalization flows. |
| `manage_skills` | Write | Manages reusable skills/workflows. | Future advanced agent flows. |
| `ask_user` | Read | Requests missing info. | Future interactive agent turn. |
| `update_plan` | Read | Publishes plan/status updates. | Optional progress timeline. |

Normal prompt-to-deck generation should usually show these tool calls:

```json
[
  { "name": "inspect_project", "ok": true },
  { "name": "read_workspace_context", "ok": true },
  { "name": "list_packs", "ok": true },
  { "name": "design_deck", "ok": true }
]
```

Do not hard-code that exact sequence. The agent may skip, add, or fallback based
on prompt, config, and future capabilities.

## Realtime Socket Contract

Canonical replay/resume contract: `docs/frontend-job-event-replay.md`.

Connect:

```ts
import { io } from "socket.io-client";

const socket = io(API_ORIGIN, {
  path: "/realtime",
  auth: { token: accessToken },
  transports: ["websocket"]
});

socket.emit("deck:subscribe", { jobId }, (ack) => {
  if (!ack?.ok) {
    showError(ack?.error ?? "Realtime subscription failed");
  }
});
```

The socket token must belong to a user who is a member of the job workspace.
Live event payloads include `seq` once they have been written to the durable job
event log. Store the highest `seq` seen per `jobId`, and ignore any replayed or
live event whose `seq` is less than or equal to the stored value.

To replay missed events after a tab refresh, network reconnect, or process
restart:

```ts
socket.emit("deck:subscribe", { jobId, afterSeq: lastSeenSeq }, (ack) => {
  if (!ack?.ok) {
    showError(ack?.error ?? "Realtime subscription failed");
    return;
  }
  saveLastSeenSeq(jobId, ack.nextSeq ?? lastSeenSeq);
});
```

The server first sends a current `deck:status` snapshot, then replays stored
events with `seq > afterSeq` through both their named event and the normalized
`deck:event` catch-all. If the frontend prefers HTTP for recovery, call:

```http
GET /v1/jobs/:jobId/event-log?afterSeq=:lastSeenSeq&limit=200
```

Response:

```json
{
  "jobId": "6660...",
  "projectId": "665f...",
  "workspaceId": "665e...",
  "afterSeq": 42,
  "events": [
    {
      "seq": 43,
      "eventName": "deck:repair",
      "type": "deck.repair",
      "jobId": "6660...",
      "status": "llm",
      "progress": 86,
      "data": { "action": "slide_started", "slideNumber": 2 },
      "at": "2026-06-23T12:00:00.000Z"
    }
  ],
  "nextSeq": 43,
  "hasMore": false
}
```

Use the event log for exact live UI replay. Use `GET /v1/jobs/:jobId` and
`resultMeta.deckArtifact` as the canonical final deck state.

## Events The Frontend Receives

Additional user-facing events:

| Event | Use |
| --- | --- |
| `deck:plan` | Show the visible agent plan. |
| `deck:context` | Show that workspace/project/brand context is loading. |
| `deck:file` | Show uploaded file extraction progress and summaries. |
| `deck:research` | Show optional research progress and sources. |
| `deck:outline` | Show the proposed deck outline/timeline. |
| `deck:content` | Show content-writing/layout progress when emitted. |
| `slide.preview` through `deck:event` | Render live HTML slide previews. |
| `deck:qa` | Show design quality score and repairs. |
| `deck:repair` | Show repair loop progress for weak slides. |
| `deck:asset` | Show backend-selected image assets and attribution. |
| `deck:export` | Show PPTX/PDF/PNG/HTML export progress when implemented. |
| `deck:version` | Update version history UI. |
| `deck:done` | Fetch and render the canonical final job artifact. |
| `deck:error` | Show terminal failure and retry options. |

These events are also emitted through the normalized `deck:event` catch-all.
For example, `deck.plan` is emitted as both `deck:plan` and `deck:event` with
`type: "deck.plan"`.

Current backend emits `deck:plan`, `deck:context`, `deck:file` when files are
present, `deck:research` when research is needed, `deck:outline`,
`deck:content`, `deck:asset` when image assets are selected, `slide.preview`
via `deck:event`, `deck:qa`, `deck:repair` when repair is needed,
`deck:version`, `deck:artifact`, `deck:export`, `deck:done`, and
`run.summary`.

`agent:loop` belongs to the legacy single-loop agent path. The frontend may keep
the handler for backwards compatibility, but the production cloud flow should be
rendered primarily from the deck events above.

### `deck:plan`

Use this for the visible "agent is planning" panel.

```json
{
  "type": "deck.plan",
  "jobId": "6660...",
  "status": "llm",
  "progress": 35,
  "data": {
    "deckTitle": "AI Teaching Tool Pitch",
    "deckType": "investor_pitch",
    "audience": "investors",
    "language": "en",
    "slideCount": 10,
    "style": "modern",
    "summary": "Creating a 10-slide investor pitch deck in modern style.",
    "steps": [
      "Analyze prompt",
      "Create outline",
      "Write slide content",
      "Choose layouts",
      "Generate visual previews",
      "Run design QA",
      "Save final deck"
    ]
  }
}
```

### `deck:research`

Use this for the visible research stage. In production cloud flow, only the
Research Agent owns live web search. The Outline and Content agents consume this
artifact; they should not invent statistics or recent claims without a source.

```json
{
  "type": "deck.research",
  "jobId": "6660...",
  "data": {
    "researchId": "rsch_123",
    "status": "complete",
    "summary": "Research completed with 5 useful sources and 12 extracted facts.",
    "sourceCount": 5,
    "factsCount": 12,
    "queryPlan": [
      {
        "query": "AI education market size statistics trends",
        "purpose": "Find market size, trend, or statistical context."
      }
    ],
    "sources": [
      {
        "title": "Example Source",
        "publisher": "example.com",
        "url": "https://example.com/report",
        "used": true
      }
    ],
    "warnings": [
      "Some market size estimates vary between sources."
    ]
  }
}
```

Suggested UI:

- Show "Researching..." while status/progress is `researching`.
- Show source and fact counts when the event arrives.
- Let users expand a source list for investor/research-heavy decks.
- The backend hides individual fetch failures and keeps trying alternative
  sources. Show only the returned useful sources and generic warnings.
- Do not treat source snippets as slide content by themselves; final slide
  content comes through `slide.preview` and `deckArtifact`.

### `deck:outline`

Use this for the outline and slide timeline. In the current MVP this is a draft
outline emitted before generation. Future `outline_first` approval can use this
same shape.

```json
{
  "type": "deck.outline",
  "jobId": "6660...",
  "data": {
    "title": "AI Teaching Tool Pitch",
    "deckType": "investor_pitch",
    "language": "en",
    "slideCount": 10,
    "status": "draft",
    "slides": [
      {
        "slideNumber": 1,
        "slideType": "title",
        "title": "AI Teaching Tool Pitch",
        "purpose": "Introduce the deck and positioning."
      }
    ]
  }
}
```

### `deck:content`

Use this for slide-writing and layout-selection progress. The backend writes
content one slide at a time, then chooses layouts one slide at a time; it does
not ask the LLM to produce the whole deck content or all layouts in one response.

Slide content written:

```json
{
  "type": "deck.content",
  "jobId": "6660...",
  "data": {
    "stage": "content_writing",
    "action": "slide_completed",
    "slideNumber": 3,
    "slideTitle": "Practice: Choose Am, Is, or Are",
    "writtenSlides": 3,
    "slideCount": 6
  }
}
```

Slide layout selected:

```json
{
  "type": "deck.content",
  "jobId": "6660...",
  "data": {
    "stage": "layouting",
    "action": "slide_layout_selected",
    "slideNumber": 3,
    "layoutId": "exercise_cards",
    "laidOutSlides": 3,
    "slideCount": 6
  }
}
```

The frontend can show these as progress rows before `slide.preview` events begin.

### `deck:status`

Use for progress and high-level state:

```json
{
  "type": "job.status",
  "jobId": "6660...",
  "projectId": "665f...",
  "workspaceId": "665e...",
  "status": "llm",
  "progress": 35,
  "errorMessage": null,
  "at": "2026-06-21T12:00:00.000Z"
}
```

Statuses:

```txt
queued
parsing
llm
rendering
exporting
done
error
canceled
```

Production cloud stage labels may be more granular:

```txt
queued
planning
context_loading
file_processing
researching
outlining
awaiting_user_approval
content_writing
layouting
designing
qa_checking
repairing
rendering
exporting
delivering
done
error
canceled
```

The database status still uses compact values such as `llm`, `rendering`, and
`exporting` for compatibility. Detailed production stage is available in status
events as `data.productionStage` and in `job.resultMeta.productionStage`.

### `agent:loop`

Use for optional live agent logs. These are not the source of truth for final
deck content.

Common payloads:

```json
{
  "type": "agent.loop",
  "jobId": "6660...",
  "data": {
    "type": "plan",
    "data": {
      "tools": ["inspect_project", "read_workspace_context", "list_packs", "design_deck"],
      "reasons": {
        "design_deck": "keyword:generate"
      }
    }
  },
  "at": "2026-06-21T12:00:00.000Z"
}
```

```json
{
  "type": "agent.loop",
  "jobId": "6660...",
  "data": {
    "type": "tool.call",
    "round": 1,
    "data": {
      "name": "design_deck",
      "dialect": "fenced"
    }
  }
}
```

```json
{
  "type": "agent.loop",
  "jobId": "6660...",
  "data": {
    "type": "tool.result",
    "round": 1,
    "data": {
      "name": "design_deck",
      "ok": true,
      "content": "Saved deck artifact with 10 slides.\nDesign QA: 10/10 slides accepted, average score 94"
    }
  }
}
```

Suggested UI mapping:

| Agent event | Suggested UI |
| --- | --- |
| `plan` | "Planning deck generation" |
| `llm.start` | "Thinking through the deck" |
| `llm.end` | "Draft response received" |
| `tool.call inspect_project` | "Reading project context" |
| `tool.call read_workspace_context` | "Loading brand settings" |
| `tool.call list_packs` | "Checking design packs" |
| `tool.call design_deck` | "Designing slides" |
| `tool.result design_deck` | "Slides designed and saved" |
| `done` | "Agent loop complete" |
| `error` | Show error state or retry |

### `deck:event` with `type: "slide.preview"`

Use this to render live slide previews.

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

Frontend:

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

### `deck:artifact`

This means the backend saved a deck artifact. It is an early signal, not a
terminal signal.

```json
{
  "type": "deck.artifact",
  "jobId": "6660...",
  "data": {
    "slideCount": 10,
    "deckTitle": "AI Teaching Tool Pitch",
    "deckArtifact": {}
  },
  "at": "2026-06-21T12:00:00.000Z"
}
```

The payload may include `deckArtifact`, but the frontend should still fetch the
job on terminal events for the canonical result.

### `deck:qa`

Use this for visible design QA and auto-fix messaging.

```json
{
  "type": "deck.qa",
  "jobId": "6660...",
  "data": {
    "source": "vision_qa",
    "provider": "openai_vision",
    "averageScore": 94,
    "approved": true,
    "deckSummary": "The deck is polished and visually consistent.",
    "acceptedSlides": 10,
    "repairedSlides": 2,
    "slideCount": 10,
    "issues": [
      {
        "slideNumber": 5,
        "slideTitle": "Market Opportunity",
        "problem": "Too much text",
        "fix": "Reduced bullet count and increased whitespace"
      }
    ]
  }
}
```

### `deck:repair`

Use this to show repair progress after QA finds weak or blocking slides. The
backend repairs one problem slide at a time and emits progress through the same
event name with an `action` field.

Started:

```json
{
  "type": "deck.repair",
  "jobId": "6660...",
  "data": {
    "action": "started",
    "message": "Repairing 1 slide after QA.",
    "totalSlides": 1,
    "repairedSlides": 0,
    "slides": [
      {
        "slideNumber": 2,
        "issueCount": 1,
        "issues": [
          {
            "slideNumber": 2,
            "severity": "error",
            "problem": "Unsafe or remote HTML detected.",
            "repairInstruction": "Remove scripts, iframes, and remote URLs."
          }
        ]
      }
    ]
  }
}
```

Per-slide progress:

```json
{
  "type": "deck.repair",
  "jobId": "6660...",
  "data": {
    "action": "slide_started",
    "message": "Repairing slide 2.",
    "slideNumber": 2,
    "slideTitle": "Present Forms: Am, Is, Are",
    "repairIndex": 1,
    "totalSlides": 1,
    "repairedSlides": 0,
    "issues": []
  }
}
```

The backend emits `action: "slide_completed"` after each repaired slide and
`action: "completed"` after all targeted slides are merged. The frontend should
show these as transient progress, then keep rendering updated `slide.preview`
events and use the final `deck:done`/job artifact as the source of truth.

### `deck:asset`

Use this to show image asset selection, attribution, or an asset tray. The
frontend should not search Pexels directly. The backend searches Pexels,
downloads the chosen image, stores it as a YDeck `FileModel` asset, and only
then exposes the safe stored URL to the design agent and frontend.

During the image-agent stage, the backend first emits candidate images. This is
temporary working UI, not final deck content. A good frontend pattern is a
compact 3x4 grid with optional auto-carousel/highlight while the agent is
choosing.

```json
{
  "type": "deck.asset",
  "jobId": "6660...",
  "data": {
    "stage": "image_candidates",
    "type": "image_candidates",
    "slideNumber": 3,
    "query": "teacher preparing lesson slides laptop classroom",
    "layout": "grid_3x4",
    "carousel": true,
    "candidates": [
      {
        "assetCandidateId": "pexels_123456_abcd",
        "source": "pexels",
        "previewUrl": "https://images.pexels.com/photos/...",
        "width": 1920,
        "height": 1080,
        "photographerName": "Jane Doe",
        "photographerUrl": "https://www.pexels.com/@jane",
        "sourceUrl": "https://www.pexels.com/photo/...",
        "licenseSummary": "pexels_free_to_use",
        "orientation": "landscape"
      }
    ]
  }
}
```

Recommended UI:

- Show up to 12 candidates in a 3x4 grid.
- Highlight or auto-cycle candidates while the image agent is working.
- Treat `previewUrl` as temporary preview only.
- Do not insert `previewUrl` into slide HTML or saved deck state.
- Replace the candidate grid with the selected image once `stage:
  "image_selected"` arrives.

Selected/stored image event:

```json
{
  "type": "deck.asset",
  "jobId": "6660...",
  "data": {
    "stage": "image_selected",
    "type": "image",
    "slideNumber": 3,
    "imageAsset": {
      "id": "66aa...",
      "source": "pexels",
      "sourceImageId": "123456",
      "sourceUrl": "https://www.pexels.com/photo/...",
      "photographerName": "Jane Doe",
      "photographerUrl": "https://www.pexels.com/@jane",
      "attributionText": "Photo by Jane Doe on Pexels",
      "licenseType": "pexels_free_to_use",
      "storedUrl": "data:image/jpeg;base64,...",
      "thumbnailUrl": "https://images.pexels.com/photos/...",
      "width": 1920,
      "height": 1080,
      "orientation": "landscape",
      "query": "teacher preparing lesson slides laptop classroom",
      "slideNumber": 3,
      "selectedBy": "agent"
    }
  }
}
```

Rules:

- Render only backend-provided `storedUrl` or preview HTML generated by the
  backend.
- Show `attributionText`/Pexels source link when presenting the asset outside
  the slide preview, such as in an asset tray or details panel.
- Do not call Pexels from the browser.
- Do not replace backend asset URLs with remote search-result URLs.

### `deck:version`

Use this to update version history UI.

```json
{
  "type": "deck.version",
  "jobId": "7770...",
  "data": {
    "versionId": "v2",
    "versionNumber": 2,
    "parentVersionId": "v1",
    "reason": "Edited slide 4 based on user instruction",
    "createdAt": "2026-06-21T12:00:00.000Z",
    "jobId": "7770..."
  }
}
```

### `deck:done`

Fetch the final job:

```ts
socket.on("deck:done", async () => {
  const job = await api.getJob(jobId);
  renderDeck(job.resultMeta.deckArtifact);
});
```

### `deck:error`

Show `errorMessage`, then allow retry.

```json
{
  "type": "job.status",
  "jobId": "6660...",
  "status": "error",
  "progress": 85,
  "errorMessage": "DeepSeek request failed: ...",
  "at": "2026-06-21T12:00:00.000Z"
}
```

### `deck:canceled`

Stop the working UI and return to editable state.

If the job was canceled by the user, show a **Continue** action:

```http
POST /v1/cloud/jobs/:jobId/continue
Authorization: Bearer <accessToken>
```

Response:

```json
{
  "success": true,
  "mode": "cloud",
  "action": "continue",
  "projectId": "665f...",
  "jobId": "6660...",
  "status": "processing",
  "eventsUrl": "/v1/jobs/6660.../events"
}
```

If the job ended with `status: "error"`, show a **Retry** action:

```http
POST /v1/cloud/jobs/:jobId/retry
Authorization: Bearer <accessToken>
```

Response:

```json
{
  "success": true,
  "mode": "cloud",
  "action": "retry",
  "projectId": "665f...",
  "previousJobId": "6660...",
  "jobId": "7770...",
  "status": "processing",
  "eventsUrl": "/v1/jobs/7770.../events"
}
```

Frontend rules:

- User presses stop/cancel: call `POST /v1/jobs/:jobId/cancel`; terminal UI
  should show **Continue**.
- System/provider/tool error: terminal UI should show **Retry**.
- Continue requeues the same job id.
- Retry creates a new job id linked to the failed job.
- After either action, subscribe to the returned `jobId`.

## Final Job Result

Fetch:

```http
GET /v1/jobs/:jobId
Authorization: Bearer <accessToken>
```

Important fields:

```json
{
  "id": "6660...",
  "projectId": "665f...",
  "workspaceId": "665e...",
  "type": "generate",
  "status": "done",
  "progress": 100,
  "inputParams": {
    "prompt": "Create a pitch deck...",
    "deckType": "investor_pitch",
    "designStyle": "modern",
    "language": "en",
    "slideCount": 10,
    "pipeline": "agentic",
    "mode": "cloud",
    "cloudProvider": "deepseek",
    "cloudModel": "deepseek-chat"
  },
  "resultMeta": {
    "source": "design_deck",
    "slideCount": 10,
    "deckArtifact": {
      "version": {
        "versionId": "v1",
        "versionNumber": 1,
        "parentVersionId": null,
        "reason": "design_deck",
        "createdAt": "2026-06-21T12:00:00.000Z",
        "jobId": "6660..."
      }
    },
    "cloudMode": {
      "provider": "deepseek",
      "model": "deepseek-chat",
      "mode": "cloud"
    },
    "agent": {
      "rounds": 2,
      "stoppedReason": "no_calls",
      "selectedTools": ["inspect_project", "read_workspace_context", "list_packs", "design_deck"],
      "toolCalls": [
        { "name": "design_deck", "ok": true, "error": null }
      ]
    }
  }
}
```

`resultMeta.source` values:

| Source | Meaning |
| --- | --- |
| `design_deck` | Preferred path. Deck went through visual design tool. |
| `create_deck` | Legacy/fallback save path. Still render artifact fields. |
| `update_deck` | Full deck refinement saved. |
| `create_document`, `update_document`, `edit_document` | Document-style slide edit path. |

## Deck Artifact Fields

The frontend should render from:

```ts
const artifact = job.resultMeta.deckArtifact;
```

Each slide may include:

```json
{
  "slideNumber": 1,
  "slideType": "title",
  "layoutId": "title_hero",
  "title": "Market Opportunity",
  "subtitle": "Why this market is ready now",
  "bullets": ["Teachers spend hours preparing slides"],
  "body": "Optional body",
  "speakerNotes": "Optional notes",
  "visual": {
    "designQa": {
      "previousScore": 97,
      "problems": [],
      "fixes": [],
      "repairedAtAttempt": 1
    }
  },
  "html": "<section class=\"ydeck-slide\">...</section>",
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

Render preview HTML in a sandboxed iframe. See
[Frontend Slide Design Agent Contract](./frontend-slide-design-agent.md) for the
full iframe/scaling examples.

## Recommended Frontend State Machine

```txt
idle
  -> submitting
  -> subscribed
  -> generating
  -> previews_arriving
  -> artifact_saved
  -> done
```

Implementation steps:

1. User submits prompt.
2. Call `POST /v1/cloud/decks/generate`.
3. Store `projectId` and `jobId`.
4. Connect/reuse Socket.IO connection.
5. Emit `deck:subscribe`.
6. Show status from `deck:status`.
7. Show optional logs from `agent:loop`.
8. Render each `slide.preview`.
9. Treat `deck:artifact` as "saved", not "done".
10. On `deck:done`, fetch `GET /v1/jobs/:jobId`.
11. Replace live preview state with final `deckArtifact`.
12. On `deck:error`, fetch job once and show `errorMessage`.

## Targeted Edit Flow

After generation, start an agentic edit/refine job:

```http
POST /v1/cloud/decks/:projectId/edit
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "instruction": "Make slide 4 more visual and reduce text.",
  "target": {
    "type": "slide",
    "slideNumber": 4
  }
}
```

Response:

```json
{
  "success": true,
  "mode": "cloud",
  "projectId": "665f...",
  "deckId": "665f...",
  "jobId": "7770...",
  "status": "processing",
  "pipeline": "agentic_edit",
  "eventsUrl": "/v1/jobs/7770.../events"
}
```

Subscribe to the returned `jobId` exactly like generation. The final artifact is
again available at `GET /v1/jobs/:jobId -> resultMeta.deckArtifact`, and the
project's `meta.deckArtifact` points at the newest version.

## Reconnect And Refresh

Socket rooms are in-memory, but workflow events are durable. If the socket
reconnects:

```ts
socket.emit("deck:subscribe", { jobId, afterSeq: lastSeenSeq });
const job = await api.getJob(jobId);
```

If `job.status === "done"`, render `job.resultMeta.deckArtifact` immediately.
If the job is still running, replay events after `lastSeenSeq` and keep
listening for live events.

## What The Frontend Should Not Do

- Do not call agent tools directly.
- Do not generate slide HTML in the browser.
- Do not repair backend HTML in the browser.
- Do not treat `agent:loop` as canonical deck content.
- Do not treat `deck:artifact` as terminal.
- Do not put backend HTML directly into the React DOM with
  `dangerouslySetInnerHTML`.
- Do not use `deckId` for project navigation; use `projectId`.
- Do not require `visual.designQa`; older/fallback artifacts may omit it.

## Debug Logging

For local backend debugging, the server can log what the agentic flow sends and
receives:

```env
AGENT_FLOW_LOG_OUTPUT=true
```

This logs:

- Job input received by the agent.
- LLM prompts sent.
- LLM responses received.
- Tool calls sent.
- Tool results received.
- Fallback `design_deck` saves.
- Final job completion summary.

Logs are written to the backend console, truncated for huge payloads, and redact
token/API-key-looking values. These logs are not sent to the frontend unless the
same information also appears as normal realtime `agent:loop` events.

## Current Limitations

- Agent tools are server-side only.
- The current design QA loop is deterministic, not screenshot/vision-based yet.
- PPTX/PDF export is not complete in this main server.
- Job worker and socket rooms are in-process MVP infrastructure.
- File upload/research flows are not fully exposed for the web frontend yet.

The frontend contract should remain stable when Playwright screenshots, DOM
inspection, vision critique, and screenshot-to-PPTX export are added later.
