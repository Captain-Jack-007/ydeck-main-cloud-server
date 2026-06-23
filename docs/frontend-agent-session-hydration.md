# Opening A Single Agent Session

How the Agent Workspace (`src/app/(app)/agent/agent-workspace.tsx`) reconstructs
a thread when the user navigates to `/agent?threadId=…`. Companion to
`docs/frontend-history-and-decks.md`, which documents the server contracts.
For exact live workflow replay after refresh/reconnect, use
`docs/frontend-job-event-replay.md`.

## 1. URL → `threadId` → `target`

The workspace accepts a single `threadId` prop sourced from the URL search
param. Two id shapes flow in:

| Origin                                                                      | Shape                                     | Resolution                                                                              |
| --------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| Created locally in this browser (user submitted a prompt here)              | Short random id from `generateThreadId()` | Look up `getThread(threadId, ownerUserId)` and use `stored.projectId ?? stored.deckId`. |
| Synthesised by the dashboard / decks / threads list from `GET /v1/projects` | `project:<projectId>`                     | `deriveProjectIdFromThreadId(threadId)` strips the prefix. No local row required.       |

The `target` is the canonical server id — `project.id === deckId` per
`frontend-history-and-decks.md` §7 — and is the same value passed to all
three server calls below.

```ts
const target =
  stored?.projectId ?? stored?.deckId ?? deriveProjectIdFromThreadId(threadId);
```

## 2. Three Parallel Server Calls

When `target` resolves, the workspace fires three independent requests via
`Promise.allSettled` so a slow or missing endpoint never blocks the others.

| Call                | Endpoint                                                                             | Library function                | Purpose                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Project metadata    | `GET /v1/projects/:id`                                                               | `getProject` (`src/lib/api.ts`) | Title, status, description, `lastJobId`, `updatedAt` for the topbar + thread seed.                                                         |
| Agent timeline      | `GET /v1/cloud/decks/:id/agent-session`                                              | `getAgentSession`               | Per-job `input.prompt` → user turns, `agents[]` + `errorMessage` → agent turns, `agents.at(-1)` + `status` → resume affordance.            |
| Final deck artifact | `GET /v1/decks/:id/json`                                                             | `getDeckJson`                   | Returns the artifact **directly** — `{ deckTitle, slides: [...], ... }`. Slides are at the top level, **not** nested under `deckArtifact`. |

> **Important — do not call `GET /v1/cloud/decks/:id` for slides.** That
> endpoint returns a _wrapped_ envelope:
>
> ```json
> { "success": true, "mode": "cloud", "project": { ... },
>   "latestJob": { ... }, "deckArtifact": { "slides": [ ... ] } }
> ```
>
> Reading `response.slides` from it yields `undefined` and the deck pane
> stays empty. If you must use the cloud endpoint (e.g. for `latestJob` in
> the same round-trip), unwrap explicitly:
> `const slides = response.deckArtifact?.slides ?? [];`. The dedicated
> `GET /v1/decks/:id/json` endpoint is preferred for `getDeckJson` because
> it returns the artifact directly and 404s cleanly when no artifact
> exists yet.

The agent-session call deliberately omits `?include=artifacts`; per-stage
internals are not needed to render the chat history. If we ever surface the
raw per-stage outputs in the UI, pass `{ include: 'artifacts' }` to
`getAgentSession` — the option already exists.

## 3. Effect Orchestration

Three `useEffect`s in the workspace cooperate on hydration. Each is gated by a
`useRef` so it runs at most once per `threadId`.

1. **Restore from local thread** (`getThread` hit) — fires synchronously via
   `queueMicrotask` to set `turns`, `slidePreviews`, `processSnapshot`,
   `activeDeckId`, `activeProjectId`, etc. No-ops when the thread is unknown
   (the pure server-only path).
2. **Deck hydration** (`deckHydratedRef`) — calls `getDeckJson(target)`.
   Updates `restoredProcessSnapshot.slides` if the response carries any, and
   sets `activeDeckId` / `activeProjectId` using functional updaters so it
   never clobbers values already set by another effect.
3. **Session + project hydration** (`sessionHydratedRef`) — calls
   `getAgentSession(target)` and `getProject(target)` in parallel. Replays
   turns from `session.jobs[].input.prompt` (+ `errorMessage` for failed
   jobs) via `replayTurnsFromAgentSession`. Uses `project.description` for a
   single user turn when the timeline is empty on older records.
   **Also derives the resume affordance from the latest job — see §6.**

The session-hydration effect defers its final `setTurns` past one
`requestAnimationFrame` so the restoration effect's `queueMicrotask`
(`setTurns(stored.turns)`) has already landed and can't clobber the replay.

## 4. Seeding A Local Thread For Future Writes

When the user opens a `project:<id>` URL on a fresh device, there is no local
`Thread` row for the live update effects to write into. Once
`getProject` resolves, the session-hydration effect calls
`createThread(threadId, …)` + `updateThread(threadId, …)` to materialise a
row keyed by the synthetic id, populated from server data:

| Field                      | Source                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `id`                       | The synthetic `project:<id>` threadId                                                                              |
| `title`                    | `project.title`                                                                                                    |
| `prompt`                   | First non-empty of `session.jobs[0]?.input?.prompt`, `session.description`, `project.description`, `stored.prompt` |
| `deckId`                   | `project.lastJobId ?? target`                                                                                      |
| `projectId`                | `project.id`                                                                                                       |
| `status` / `artifactState` | `projectStatusToArtifactAndThread(project.status)`                                                                 |
| `mode`                     | `'cloud'`                                                                                                          |
| `updatedAt`                | `Date.parse(project.updatedAt)`                                                                                    |

> **Why `session.jobs[0].input.prompt` is first:** `session.description` and
> `project.description` both read from the same `DeckProject.description`
> column, so the chain is illusory. The real first user message lives on the
> first job's input. The other entries are kept as fallbacks for older rows.

After seeding, the existing live-stream effects
(`updateCurrentThread({ … })`) work unchanged — every cloud event lands on
the right row.

## 5. Race Discipline

Three rules keep the parallel effects from fighting each other:

- **State updaters are functional where they overlap.** Both deck and session
  hydration set `activeDeckId` / `activeProjectId` / `artifactState`; each
  uses `(prev) => prev ?? next` (or `prev === 'empty' ? next : prev`) so
  whichever lands first wins and the other becomes a no-op.
- **One ref guard per effect per `threadId`.** `deckHydratedRef` and
  `sessionHydratedRef` prevent duplicate fetches across re-renders.
- **Replay is deferred one RAF.** Stops the (empty) `setTurns(stored.turns)`
  from the restoration effect overwriting a freshly replayed timeline.

## 6. Resume From The Last Job

The agent-session payload contains everything the workspace needs to decide
what to show next when a thread reopens. The session-hydration effect derives
a `resume` descriptor from the **latest** job and feeds it to the chat
composer + deck pane.

```ts
const latestJob = session.jobs.at(-1);
const lastAgent = latestJob?.agents.at(-1);

const resume = (() => {
  if (!latestJob) return { kind: 'fresh' };

  switch (latestJob.status) {
    case 'done':
      // Deck is final. Composer should send the next message as an `edit`
      // job: POST /v1/cloud/agent/message with { projectId: target, message }.
      return { kind: 'done', jobId: latestJob.jobId };

    case 'failed':
      // Surface a Retry CTA bound to the failed agent.
      return {
        kind: 'failed',
        jobId: latestJob.jobId,
        failedAgent: lastAgent?.agent ?? 'unknown',
        error: latestJob.errorMessage ?? lastAgent?.error ?? 'Unknown error',
      };

    case 'running':
    case 'queued':
      // Re-attach realtime to the in-flight job (see SSE note below).
      return { kind: 'streaming', jobId: latestJob.jobId };

    default:
      return { kind: 'fresh' };
  }
})();
```

### SSE / Socket.IO re-attach key

Realtime subscription is keyed by **`jobId`, not `projectId`**:

```ts
// CORRECT
socket.emit('deck:subscribe', {
  jobId: latestJob.jobId,
  afterSeq: getLastSeenSeq(latestJob.jobId)
});
// or:
useDeckStream(latestJob.jobId);

// WRONG — produces no events because no job listens on a project id.
useDeckStream(activeDeckId); // activeDeckId is the projectId
```

The job id comes from either:

- `session.jobs.at(-1).jobId` (preferred — fresh from agent-session), or
- `project.lastJobId` (from `getProject`, equivalent for the most recent
  generation).

If the workspace was previously subscribing on `activeDeckId`, that's why
running jobs appeared frozen on reload — the socket was listening to nothing.

### Exact live workflow replay

The agent-session endpoint is a compact session summary, not the exact event
stream. For the live workflow UI, persist the highest `seq` received per job
and reconnect with `afterSeq`. Apply only events whose `seq` is greater than
the stored value for that job.

```ts
socket.emit('deck:subscribe', {
  jobId: latestJob.jobId,
  afterSeq: lastSeenSeq
}, (ack) => {
  if (ack?.ok) setLastSeenSeq(latestJob.jobId, ack.nextSeq ?? lastSeenSeq);
});
```

The backend replays stored events with `seq > afterSeq` through their normal
event names and `deck:event`. The same replay is available over HTTP:

```http
GET /v1/jobs/:jobId/event-log?afterSeq=:lastSeenSeq&limit=200
```

Use this event log to restore the exact agent-workflow panel, repair progress,
slide previews, QA steps, and other transient progress after refresh. Use
`GET /v1/jobs/:jobId` and the project deck artifact for the final saved deck.

### Continuing the conversation

A "done" thread is not closed. The next user message is sent through the
same endpoint used to start a thread:

```http
POST /v1/cloud/agent/message
{ "projectId": "<target>", "message": "<next user message>" }
```

The server detects the existing `projectId`, creates a new `DeckJob` of
`type: 'edit'`, and the SSE/Socket stream for that new job carries the
agent's progress. The frontend should then update `latestJob.jobId` and
re-subscribe.

## 7. Failure Modes

| Symptom                                              | Cause                                                                                                   | Where to look                                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace renders empty when opening a known project | All three fetches rejected (offline or 401)                                                             | Console: `[ydeck] agent-session unavailable`, `[ydeck] project metadata unavailable`, `[ydeck] agent deck hydration failed`.                    |
| Chat shows only the prompt, no agent turns           | Subscribing with the wrong key — SSE is keyed by `jobId`, not `projectId`/`activeDeckId`                | Confirm `useDeckStream` is called with `session.jobs.at(-1).jobId` (or `project.lastJobId`); see §6 _SSE re-attach key_.                        |
| Topbar still says "New chat"                         | `Topbar` not reading `useSearchParams` reactively                                                       | `src/components/shell/topbar.tsx`.                                                                                                              |
| Slides pane empty but chat populated                 | `getDeckJson` is calling `/v1/cloud/decks/:id` and reading top-level `slides` from the wrapped envelope | Switch to `GET /v1/decks/:id/json` (artifact at top level) **or** read `response.deckArtifact?.slides` from the cloud endpoint; see §2 callout. |
| "Retry" / "Continue" button never appears            | Workspace ignores `session.jobs[].agents[]` and `latestJob.status`                                      | Wire the `resume` descriptor from §6 into the composer.                                                                                         |

## 8. Diagnostic Logs

Emitted on every thread open, in order:

1. `[ydeck] agent workspace threadId` — prop received.
2. `[ydeck] agent restore` — outcome of the local-thread lookup.
3. `[ydeck] agent session-hydration check` — `target`, `hasStored`, `hasTurns`.
4. `[ydeck] agent-session replay` — `jobs`, `replayed`, `projectTitle`, `projectStatus`.
5. `[ydeck] agent deck hydration` — `slides`, `deckJsonKeys`.

All five fire even on the pure-server path (no local thread), making it easy
to trace which step is silent when hydration fails.
