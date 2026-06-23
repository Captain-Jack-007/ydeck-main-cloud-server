# Frontend Job Event Replay

This document is the frontend contract for resuming an in-progress deck
generation exactly where the UI left off.

The short version:

- The final deck lives on the job/project artifact.
- The compact agent timeline lives on the agent-session response.
- The exact live workflow UI is rebuilt from ordered `DeckJobEvent` rows.

## Why This Exists

Socket.IO events are realtime transport messages. They are useful while the tab
is open, but the frontend needs a durable stream when the user refreshes,
switches devices, reconnects, or reopens a running deck.

The backend now records every emitted job event before sending it to Socket.IO.
Each event receives a per-job `seq` number:

```txt
job A: seq 1, seq 2, seq 3, ...
job B: seq 1, seq 2, seq 3, ...
```

The frontend stores the highest `seq` it has applied for each `jobId`. On
reconnect, it asks for events after that number.

## Durable Sources

Use these sources for different UI needs:

| UI need | Durable source |
| --- | --- |
| Final saved deck | `DeckJob.resultMeta.deckArtifact` and `DeckProject.meta.deckArtifact` |
| Job status and final result | `GET /v1/jobs/:jobId` |
| Compact chat/agent timeline | `GET /v1/cloud/decks/:projectId/agent-session` |
| Exact live workflow replay | `GET /v1/jobs/:jobId/event-log` or Socket.IO `deck:subscribe` with `afterSeq` |

`DeckJobEvent` is the event-log collection. It stores the normalized job event
payload, its channel/type, status, progress, timestamp, and ordered `seq`.

## HTTP Replay

Use HTTP replay when rebuilding the workflow panel after page load, or when the
frontend wants a deterministic catch-up request before reattaching realtime.

```http
GET /v1/jobs/:jobId/event-log?afterSeq=:lastSeenSeq&limit=200
Authorization: Bearer <accessToken>
```

Query params:

| Param | Meaning |
| --- | --- |
| `afterSeq` | Return only events with `seq > afterSeq`. Use `0` for the beginning. |
| `limit` | Max events to return. Default `200`, max `500`. |

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
      "data": {
        "action": "slide_started",
        "slideNumber": 2
      },
      "at": "2026-06-23T12:00:00.000Z"
    }
  ],
  "nextSeq": 43,
  "hasMore": false
}
```

Empty result:

```json
{
  "jobId": "6660...",
  "projectId": "665f...",
  "workspaceId": "665e...",
  "afterSeq": 43,
  "events": [],
  "nextSeq": 43,
  "hasMore": false
}
```

The route requires access to the job's workspace. Missing or inaccessible jobs
return the normal protected route error.

## Socket.IO Replay

Realtime connection:

```ts
import { io } from "socket.io-client";

const socket = io(API_ORIGIN, {
  path: "/realtime",
  auth: { token: accessToken },
  transports: ["websocket"]
});
```

Subscribe:

```ts
socket.emit("deck:subscribe", {
  jobId,
  afterSeq: getLastSeenSeq(jobId)
}, (ack) => {
  if (!ack?.ok) {
    showError(ack?.error ?? "Realtime subscription failed");
    return;
  }

  setLastSeenSeq(jobId, ack.nextSeq ?? getLastSeenSeq(jobId));
});
```

On subscribe, the server:

1. Verifies the socket user belongs to the job workspace.
2. Joins the socket to the job room.
3. Emits a current `deck:status` snapshot.
4. Replays stored events with `seq > afterSeq`.
5. Sends future live events as they are produced.

Replayed and live events are emitted through both:

```txt
<event.eventName>
deck:event
```

For example, a stored `deck.repair` event is emitted as `deck:repair` and as
`deck:event`.

## Frontend Apply Rule

Apply events idempotently:

```ts
function applyJobEvent(event: JobEvent) {
  if (typeof event.seq !== "number") {
    applySnapshotOrLegacyEvent(event);
    return;
  }

  const currentSeq = getLastSeenSeq(event.jobId);
  if (event.seq <= currentSeq) return;

  applyEventToWorkflowUi(event);
  setLastSeenSeq(event.jobId, event.seq);
}
```

This rule handles:

- Socket reconnect duplicates.
- HTTP replay followed by live Socket.IO delivery.
- A refresh that receives the current status snapshot before replay events.

Store `lastSeenSeq` by `jobId`, not by `projectId`.

## Resume Algorithm

When opening `/agent?threadId=project:<projectId>`:

1. Load project metadata:

```http
GET /v1/projects/:projectId
```

2. Load the compact agent session:

```http
GET /v1/cloud/decks/:projectId/agent-session
```

3. Find the latest job:

```ts
const latestJob = session.jobs.at(-1);
```

4. If a final artifact is needed, load it:

```http
GET /v1/decks/:projectId/json
```

5. If the latest job is `queued` or `running`, replay workflow events:

```http
GET /v1/jobs/:jobId/event-log?afterSeq=:lastSeenSeq&limit=200
```

6. Subscribe to realtime with the same `lastSeenSeq`:

```ts
socket.emit("deck:subscribe", { jobId, afterSeq: lastSeenSeq });
```

7. If `hasMore` is true, keep paging HTTP replay until it is false:

```ts
let afterSeq = lastSeenSeq;

while (true) {
  const page = await api.getJobEventLog(jobId, { afterSeq, limit: 500 });
  for (const event of page.events) applyJobEvent(event);
  afterSeq = page.nextSeq;
  if (!page.hasMore) break;
}
```

## Event Shapes

All replayed events use the same normalized shape:

```ts
type ClientJobEvent = {
  seq: number;
  eventName: string;
  type: string;
  jobId: string;
  status: string;
  progress: number;
  errorMessage?: string | null;
  data?: unknown;
  at: string;
};
```

Common `eventName` values:

```txt
deck:status
deck:plan
deck:context
deck:file
deck:research
deck:outline
deck:content
deck:asset
deck:qa
deck:repair
deck:artifact
deck:export
deck:done
deck:error
deck:canceled
agent:loop
```

`slide.preview` events are delivered through the `deck:event` catch-all with
`type: "slide.preview"`.

## What To Render From Events

Use the event log for transient and progressive UI:

- Current agent step.
- Plan, outline, research, content-writing progress.
- Slide preview stream.
- QA score and issue list.
- Per-slide repair progress.
- Export progress.
- Terminal error messages.

Use `GET /v1/jobs/:jobId` for canonical final state:

- `status`
- `progress`
- `errorMessage`
- `resultMeta.deckArtifact`
- `resultMeta.productionFlow`

Use the project routes for saved history:

- `GET /v1/projects`
- `GET /v1/projects/:projectId`
- `GET /v1/decks/:projectId/json`

## Notes For Repair UI

Repair is intentionally granular. The backend identifies problem slides from QA
issues and repairs one slide at a time. The frontend should expect:

```txt
deck:qa
deck:repair action=started
deck:repair action=slide_started
deck:repair action=slide_completed
deck:repair action=completed
deck:done
```

The UI can show which slide is being repaired and why from the event `data`.

## Implementation Files

Backend implementation lives in:

| File | Role |
| --- | --- |
| `src/models/DeckJobEvent.ts` | Mongoose event and counter models |
| `src/modules/decks/jobEventLog.service.ts` | Persist and list replayable events |
| `src/modules/decks/jobs.events.ts` | Emits events after assigning ordered `seq` |
| `src/modules/realtime/socket.ts` | Socket.IO subscribe and replay |
| `src/modules/decks/decks.routes.ts` | `GET /v1/jobs/:jobId/event-log` |

