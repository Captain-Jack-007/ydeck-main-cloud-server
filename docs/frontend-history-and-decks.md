# Frontend History And Deck Retrieval

This document explains how the web frontend should load:

- current user and workspaces
- chat/deck history
- all deck projects
- a single deck
- deck versions
- agent session timeline for a deck thread
- deleting a deck/chat thread
- job status and realtime events

All requests require:

```http
Authorization: Bearer <accessToken>
```

Use `POST /v1/auth/refresh` when the access token expires.

## 1. Current User And Workspaces

After login or refresh, load the current user:

```http
GET /v1/auth/me
```

Response:

```json
{
  "user": {
    "id": "6a...",
    "email": "user@example.com",
    "displayName": "Serdar"
  },
  "workspaces": [
    {
      "id": "6a...",
      "name": "Serdar's workspace",
      "plan": "free",
      "role": "owner",
      "isPersonal": true
    }
  ]
}
```

You can also load only workspaces:

```http
GET /v1/workspaces
```

The frontend should keep a selected `workspaceId`. If the user has multiple
workspaces, show a workspace switcher. History is workspace-scoped.

## 2. My Deck History

Canonical endpoint:

```http
GET /v1/projects?workspaceId=<optional>&limit=20&cursor=<optional>&includeShared=false
```

Compatibility endpoint:

```http
GET /v1/decks/projects?workspaceId=<optional>&limit=20&cursor=<optional>&includeShared=false
```

Both return the same shape:

```json
{
  "projects": [
    {
      "id": "6a...",
      "workspaceId": "6a...",
      "ownerId": "6a...",
      "title": "Chinese History",
      "description": "I need a presentation about Chinese history",
      "status": "done",
      "progress": 100,
      "lastJobId": "6a...",
      "meta": {
        "deckArtifact": {
          "deckTitle": "Chinese History",
          "deckType": "educational_history",
          "designStyle": "modern",
          "language": "en",
          "slides": []
        },
        "slideCount": 6,
        "deckType": "educational_history",
        "designStyle": "modern",
        "language": "en"
      },
      "createdAt": "2026-06-22T10:00:00.000Z",
      "updatedAt": "2026-06-22T10:05:00.000Z"
    }
  ],
  "nextCursor": null
}
```

Use this endpoint for:

- sidebar history
- dashboard deck grid
- “recent decks”
- restoring user sessions after refresh

By default this returns decks owned by the authenticated user. This is important
for account-specific history. If the UI is showing a team/shared workspace and
should include other members' decks, pass:

```http
includeShared=true
```

Do not call `GET /v1/decks/:deckId` to list history. That route is for one
specific deck.

## 3. Workspace-Specific Deck History

Canonical endpoint:

```http
GET /v1/workspaces/:workspaceId/projects?includeShared=false
```

Compatibility endpoint:

```http
GET /v1/decks/workspaces/:workspaceId/projects?includeShared=false
```

Response is an array of raw project records:

```json
[
  {
    "id": "6a...",
    "workspaceId": "6a...",
    "title": "Uzbekistan Presentation",
    "description": "...",
    "meta": {},
    "createdAt": "2026-06-20T17:50:00.000Z",
    "updatedAt": "2026-06-20T17:56:00.000Z"
  }
]
```

Prefer `GET /v1/projects?workspaceId=...` for polished history cards because it
includes latest job status and artifact metadata.

Like the main history endpoint, these routes are owner-only by default and use
`includeShared=true` for shared workspace views.

## 4. Single Deck

Canonical endpoint:

```http
GET /v1/projects/:projectId
```

Deck alias:

```http
GET /v1/decks/:deckId
```

Cloud-specific endpoint:

```http
GET /v1/cloud/decks/:projectId
```

Use `GET /v1/cloud/decks/:projectId` when the frontend wants the cloud artifact
shape directly:

```json
{
  "success": true,
  "mode": "cloud",
  "projectId": "6a...",
  "deckId": "6a...",
  "project": {
    "id": "6a...",
    "title": "Chinese History",
    "description": "I need a presentation about Chinese history",
    "templateId": null
  },
  "latestJob": {
    "id": "6a...",
    "status": "done",
    "progress": 100
  },
  "deckArtifact": {
    "deckTitle": "Chinese History",
    "slides": []
  }
}
```

Use `deckArtifact.slides[].preview.html` or `deckArtifact.slides[].html` for
HTML slide preview.

## 5. Deck Artifact JSON

For only the deck artifact:

```http
GET /v1/decks/:deckId/json
```

Returns:

```json
{
  "deckTitle": "Chinese History",
  "deckType": "educational_history",
  "designStyle": "modern",
  "language": "en",
  "slides": [
    {
      "slideNumber": 1,
      "title": "Chinese History",
      "preview": {
        "html": "<section class=\"ydeck-slide\">...</section>"
      }
    }
  ]
}
```

If this returns `404`, the deck has no saved artifact yet or generation failed
before saving.

## 6. Deck Versions

Use:

```http
GET /v1/cloud/decks/:projectId/versions
```

Response:

```json
{
  "success": true,
  "mode": "cloud",
  "projectId": "6a...",
  "currentVersion": {
    "versionId": "v_...",
    "createdAt": "2026-06-22T10:05:00.000Z"
  },
  "versions": [
    {
      "versionId": "v_...",
      "jobId": "6a...",
      "status": "done",
      "source": "cloud_production"
    }
  ]
}
```

Use this for version history and “restore previous version” UI.

## 7. Agent Session (Per-Thread Agent Timeline)

For a sessions-history view that shows what the agent did on a given deck/chat
thread, use:

```http
GET /v1/decks/:deckId/agent-session
GET /v1/cloud/decks/:projectId/agent-session
```

Both accept an optional `include` query param to opt into heavy stage
artifacts (plan, outline, content, layout, design, qa):

```http
GET /v1/decks/:deckId/agent-session?include=artifacts
```

Without `include=artifacts` the response is lean enough to load for a list of
sessions. The cloud variant wraps the body with `{ success: true, mode: "cloud", ... }`.

Response shape:

```json
{
  "projectId": "6a...",
  "title": "create a slide about uzbekistan with 2 pages",
  "description": "...",
  "createdAt": "2026-06-22T10:00:00.000Z",
  "jobCount": 1,
  "jobs": [
    {
      "jobId": "6a...",
      "type": "generate",
      "status": "done",
      "progress": 100,
      "pipeline": "agentic",
      "createdAt": "...",
      "startedAt": "...",
      "finishedAt": "...",
      "errorMessage": null,
      "input": {
        "prompt": "create a slide about uzbekistan with 2 pages",
        "deckType": "general",
        "designStyle": "modern",
        "language": "en",
        "slideCount": 2,
        "cloudProvider": "deepseek",
        "cloudModel": "deepseek-chat"
      },
      "agents": [
        {
          "agent": "planner",
          "status": "completed",
          "startedAt": "...",
          "completedAt": "...",
          "durationMs": 842,
          "promptChars": 1240,
          "responseChars": 620,
          "error": null,
          "events": [
            {
              "at": "...",
              "phase": "started",
              "meta": { "promptChars": 1240 }
            },
            {
              "at": "...",
              "phase": "completed",
              "meta": { "responseChars": 620 }
            }
          ]
        },
        {
          "agent": "content_writer",
          "status": "completed",
          "durationMs": 1820
        },
        {
          "agent": "html_designer",
          "status": "errored",
          "error": "schema validation failed"
        }
      ],
      "toolUsage": [
        {
          "stage": "context_loading",
          "agent": "context",
          "name": "read_workspace_context",
          "kind": "db",
          "ok": true,
          "at": "..."
        }
      ]
    }
  ]
}
```

Field notes:

- `jobs[]` is ordered oldest → newest. A thread may have multiple jobs
  (initial generate, retries, edits).
- `agents[]` is reconstructed from audit logs of LLM-agent calls (`planner`,
  `outliner`, `content_writer`, `html_designer`, `vision_qa`, `repair`, etc.).
  `status` reflects the latest terminal phase (`completed` or `errored`).
- `toolUsage[]` is a flat list of every tool call made during the job
  (DB reads, file extraction, web search, image search, exports, etc.).
- `artifacts` is omitted unless `?include=artifacts` is set. When present, it
  contains the raw per-stage outputs of the production pipeline.

Caveat: decks generated before per-agent audit logging shipped will return
empty `agents[]` (toolUsage still appears because it's persisted on the job
itself).

## 8. Deleting A Thread

Three equivalent endpoints, all cascading (project + its jobs + project-scoped
asset/export files):

```http
DELETE /v1/projects/:projectId
DELETE /v1/decks/:deckId
DELETE /v1/cloud/decks/:projectId
```

All require `editor` role in the owning workspace. Response is `200` with a
JSON body (not `204`):

```json
{
  "success": true,
  "projectId": "6a...",
  "projectDeleted": true,
  "jobsDeleted": 2,
  "filesDeleted": 5
}
```

The cloud variant additionally includes `"mode": "cloud"`. Do not assert on
`status === 204`; check `res.ok` instead.

## 9. Jobs And Realtime

Load one job:

```http
GET /v1/jobs/:jobId
```

Subscribe to realtime with Socket.IO:

```txt
socket.emit("deck:subscribe", { jobId })
```

Important events:

```txt
deck:status
deck:plan
deck:outline
deck:content
deck:asset
slide.preview
deck:qa
deck:repair
deck:export
deck:done
deck:error
```

When a job is terminal, fetch:

```http
GET /v1/jobs/:jobId
GET /v1/cloud/decks/:projectId
```

The final artifact is canonical.

## 10. Chat History

YDeck does not currently have a separate `Conversation` collection. Chat/deck
history is represented by:

- `DeckProject` records
- `DeckJob` records
- project `description`
- job `inputParams.prompt`
- job `resultMeta`
- deck artifact/version metadata

For frontend “chat history”, use:

```http
GET /v1/projects
```

Then show each project as one conversation/deck thread. For a selected thread,
load:

```http
GET /v1/cloud/decks/:projectId
GET /v1/cloud/decks/:projectId/versions
```

If the frontend needs true message-by-message chat history later, backend should
add a `ConversationMessage` model. Do not fake message history from local state
only, because it disappears after refresh.

## 11. Common Frontend Pitfalls

Do not use stale tokens after switching profiles. On profile switch:

```txt
clear accessToken
clear refreshToken
clear selectedWorkspaceId unless it exists in the new /v1/auth/me response
clear cached project list
login again
load /v1/auth/me
load /v1/projects?workspaceId=<selectedWorkspaceId>
```

If `/v1/projects` returns empty but `/v1/workspaces` returns multiple
workspaces, the selected workspace may be wrong. Either omit `workspaceId` to
show all owned projects, switch to the workspace that owns the projects, or pass
`includeShared=true` for team/shared workspace history.

If `/v1/decks/projects` returns `Project not found`, the backend is missing the
compatibility alias. Current backend supports this alias.
