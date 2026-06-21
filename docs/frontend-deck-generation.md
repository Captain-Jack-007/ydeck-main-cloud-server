# Frontend Deck Generation Integration

This document explains how the frontend should use deck generation in the current
YDeck main server. The current repository is specialized for Cloud Mode: the
browser talks to the hosted API, the API creates a cloud project and job, and the
server-side cloud agent generates a YDeck JSON deck artifact.

For the detailed visual slide design tool and preview contract, see
[Frontend Slide Design Agent Contract](./frontend-slide-design-agent.md).
For the full agentic flow, tool list, realtime events, and frontend state
contract, see [Frontend Agentic Flow Contract](./frontend-agentic-flow.md).

Private/local generation is not implemented by this server. Do not build the
frontend as if it can call a local runtime through these endpoints.

## Current Contract

- Base API prefix: `/v1`
- Realtime socket path: `/realtime`
- Auth: `Authorization: Bearer <accessToken>` on every deck request
- Socket auth: pass the same access token as `auth.token` when connecting
- Required workspace role:
  - Viewer can read projects, jobs, and job events.
  - Editor can create projects, create jobs, patch projects, and cancel jobs.
  - Admin can delete projects.
- Current generated output: a JSON deck artifact stored on the job and project.
- Current cloud pipeline: `agentic` by default, falling back to the mock pipeline
  only when explicitly requested on the lower-level job endpoint.

The frontend should treat deck generation as asynchronous. Never expect deck
content in the create response.

## Recommended Frontend Flow

Use the convenience endpoint for a new deck from a prompt:

```http
POST /v1/cloud/decks/generate
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Request body:

```json
{
  "prompt": "Create a pitch deck for an AI note-taking startup.",
  "workspaceId": "665f...",
  "title": "AI Notes Pitch Deck",
  "deckType": "investor_pitch",
  "designStyle": "modern",
  "language": "en",
  "slideCount": 10
}
```

Fields:

- `prompt` is required.
- `workspaceId` is optional. If omitted, the server uses the user's first
  workspace membership.
- `title`, `deckType`, `designStyle`, `language`, and `slideCount` are optional.
- `fileId` exists in the schema, but there is no public upload endpoint in this
  server yet. Do not expose file upload for cloud generation until that endpoint
  exists.

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

Important: `deckId` is currently the same value as `jobId`. Use `projectId` for
project navigation and `jobId` for realtime subscription and result fetching.

`eventsUrl` is kept for compatibility with the older SSE path. The frontend must
use the socket flow below for realtime generation UX.

## Realtime Socket Updates

Connect a Socket.IO client to the API host using path `/realtime`:

```ts
import { io } from "socket.io-client";

const socket = io(API_ORIGIN, {
  path: "/realtime",
  auth: { token: accessToken },
  transports: ["websocket"]
});
```

After `POST /v1/cloud/decks/generate` returns a `jobId`, subscribe to that job:

```ts
socket.emit("deck:subscribe", { jobId }, (ack) => {
  if (!ack?.ok) {
    // Show ack.error and fall back to GET /v1/jobs/:jobId if needed.
  }
});
```

The server checks the socket token and confirms the user is a member of the job's
workspace before joining the job room.

Socket events:

- `deck:status` for status/progress snapshots.
- `agent:loop` for live cloud-agent loop events.
- `slide.preview` / `deck:event` with `type: "slide.preview"` when a designed
  slide HTML preview is ready.
- `deck:artifact` when the generated deck JSON has been persisted.
- `deck:done` when generation finishes successfully.
- `deck:error` when generation fails or socket subscription fails.
- `deck:canceled` when a job is canceled.
- `deck:event` for a normalized catch-all event stream.

```json
{
  "type": "job.status",
  "jobId": "6660...",
  "status": "llm",
  "progress": 35,
  "at": "2026-06-20T12:00:00.000Z"
}
```

```json
{
  "type": "deck.artifact",
  "jobId": "6660...",
  "data": {
    "slideCount": 10,
    "deckTitle": "AI Notes Pitch Deck"
  },
  "at": "2026-06-20T12:00:00.000Z"
}
```

```json
{
  "type": "agent.loop",
  "jobId": "6660...",
  "data": {
    "type": "tool_result"
  },
  "at": "2026-06-20T12:00:00.000Z"
}
```

```json
{
  "type": "run.summary",
  "jobId": "6660...",
  "status": "done",
  "progress": 100,
  "data": {
    "provider": "deepseek",
    "model": "deepseek-v4-flash",
    "rounds": 2,
    "toolCalls": 1,
    "stoppedReason": "done"
  },
  "at": "2026-06-20T12:00:00.000Z"
}
```

Minimal frontend listener:

```ts
socket.on("deck:status", (event) => {
  setProgress(event.progress);
  setJobStatus(event.status);
});

socket.on("agent:loop", (event) => {
  appendAgentEvent(event.data);
});

socket.on("deck:artifact", (event) => {
  showArtifactSaved(event.data.slideCount);
});

socket.on("deck:event", (event) => {
  if (event.type === "slide.preview") {
    renderSlidePreview(event.data.slideNumber, event.data.html);
  }
});

socket.on("deck:done", async () => {
  const job = await api.getJob(jobId);
  renderDeck(job.resultMeta.deckArtifact);
});

socket.on("deck:error", (event) => {
  showError(event.errorMessage ?? "Deck generation failed");
});

socket.on("deck:canceled", () => {
  setJobStatus("canceled");
});
```

Job statuses:

- `queued`
- `parsing`
- `llm`
- `rendering`
- `exporting`
- `done`
- `error`
- `canceled`

Terminal statuses are `done`, `error`, and `canceled`.

For the agentic cloud path, the final socket event may be `deck:done` carrying a
`run.summary` payload instead of a separate `deck:status` payload with
`status: "done"`. Always fetch the job after `deck:done`, `deck:error`,
`deck:canceled`, or any terminal status.

## Fetching The Result

Fetch the job to get the final artifact:

```http
GET /v1/jobs/:jobId
Authorization: Bearer <accessToken>
```

Successful job response shape:

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
    "cloudModel": "deepseek-v4-flash"
  },
  "resultMeta": {
    "deckArtifact": {
      "deckTitle": "AI Notes Pitch Deck",
      "deckType": "investor_pitch",
      "designStyle": "modern",
      "language": "en",
      "summary": "Short deck summary.",
      "slides": [
        {
          "slideNumber": 1,
          "slideType": "title",
          "title": "AI Notes Pitch Deck",
          "subtitle": "Better notes for every meeting",
          "bullets": ["Fast capture", "Accurate summaries"],
          "body": "Optional slide body.",
          "speakerNotes": "Optional presenter notes.",
          "layoutId": "optional-layout-id",
          "visual": {},
          "html": "<section class=\"ydeck-slide\" style=\"width:1920px;height:1080px;...\">...</section>"
        }
      ],
      "generatedAt": "2026-06-20T12:00:00.000Z",
      "source": "create_deck"
    },
    "slideCount": 10,
    "source": "create_deck",
    "cloudMode": {
      "provider": "deepseek",
      "model": "deepseek-v4-flash",
      "mode": "cloud"
    }
  },
  "errorMessage": null,
  "startedAt": "2026-06-20T12:00:00.000Z",
  "finishedAt": "2026-06-20T12:01:00.000Z",
  "createdAt": "2026-06-20T12:00:00.000Z",
  "updatedAt": "2026-06-20T12:01:00.000Z"
}
```

Render from `resultMeta.deckArtifact`. Prefer each slide's `html` field for the
editable slide section, and prefer `slide.preview.html` or `slide.previewHtml`
for iframe previews because those are full HTML documents. The same artifact is
also copied to the project metadata.

To read the project:

```http
GET /v1/projects/:projectId
Authorization: Bearer <accessToken>
```

Use `project.meta.deckArtifact` when building project detail pages that should
show the latest saved deck without starting from a job id.

## Lower-Level Project Flow

Use these endpoints when the UI already has a project and needs to refine or
export it.

Create a project:

```http
POST /v1/workspaces/:workspaceId/projects
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "title": "AI Notes Pitch Deck",
  "description": "Create a pitch deck for an AI note-taking startup.",
  "templateId": "optional-template-id",
  "meta": {
    "mode": "cloud"
  }
}
```

Create a job for that project:

```http
POST /v1/projects/:projectId/jobs
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "type": "generate",
  "pipeline": "agentic",
  "mode": "cloud",
  "inputParams": {
    "prompt": "Create the first version.",
    "deckType": "investor_pitch",
    "designStyle": "modern",
    "language": "en",
    "slideCount": 10
  }
}
```

Supported job types are `generate`, `refine`, `export`, and `share`.

For the current cloud deck agent, the meaningful content-producing types are
`generate` and `refine`. `export` and `share` only move through status states in
the MVP worker; they do not currently produce downloadable files.

## Canceling A Job

```http
POST /v1/jobs/:jobId/cancel
Authorization: Bearer <accessToken>
```

The server rejects cancel requests for terminal jobs. A running agentic job may
not stop immediately because the current worker does not interrupt an in-flight
LLM call.

## Suggested Frontend State Machine

1. User submits prompt.
2. Disable the submit action and show a queued/working state.
3. Call `POST /v1/cloud/decks/generate`.
4. Store `projectId` and `jobId`.
5. Connect to Socket.IO at `/realtime` with `auth.token`.
6. Emit `deck:subscribe` with the `jobId`.
7. Update progress from `deck:status` events.
8. Treat `deck:artifact` as an early signal that content was saved.
9. Fetch `GET /v1/jobs/:jobId` when `deck:done`, `deck:error`, `deck:canceled`,
   or any terminal status arrives.
10. If `status` is `done`, render `resultMeta.deckArtifact`.
11. If `status` is `error`, show `errorMessage` and allow retry.
12. If `status` is `canceled`, return the UI to an editable state.

## Error Shape

API errors use this format:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Validation failed",
    "details": []
  }
}
```

Common statuses:

- `400` invalid payload or no workspace available.
- `401` missing, invalid, or expired bearer token.
- `403` user is not a workspace member or lacks the required role.
- `404` project/job route target not found.
- `409` conflict on account/workspace resources.
- `429` global or auth rate limit.
- `500` unhandled server error.

## Current Limitations

- Cloud Mode only. This server does not run private/local generation.
- No public cloud file upload route yet, even though `fileId` is accepted by the
  cloud generation schema.
- No PPTX/PDF download endpoint yet. The current completed artifact is JSON.
- The job worker is an in-process MVP worker, not an external durable queue.
- Socket job rooms are in-memory. If the server restarts or the socket
  reconnects, re-emit `deck:subscribe` and poll `GET /v1/jobs/:jobId` for the
  latest snapshot.
- `export` and `share` jobs do not yet produce user-facing artifacts.
