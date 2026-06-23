# Main Server Route Gaps For Web Frontend

This document tracks the browser frontend after the cloud-only cleanup. The app
should talk to the YDeck main server on `http://localhost:2026` in development
and should use `/v1/*` contracts wherever a main-server route exists.

## Scope

- Runtime in scope: browser web app.
- API base in scope: `http://localhost:2026`.
- Generation mode in scope: Cloud Mode only.
- File upload and alternate runtime control are out of scope for the web flow
  until cloud equivalents are explicitly designed.

## Confirmed Main Routes

These are the browser web app's main-server contracts. Protected routes require:

```http
Authorization: Bearer <accessToken>
```

| Method | Route | Observed status |
| --- | --- | --- |
| `GET` | `/v1/auth/me` | implemented |
| `PATCH` | `/v1/auth/me` | implemented |
| `GET` | `/v1/user/settings` | implemented |
| `PATCH` | `/v1/user/settings` | implemented |
| `POST` | `/v1/cloud/decks/generate` | implemented |
| `POST` | `/v1/cloud/agent/message` | implemented |
| `GET` | `/v1/projects` | implemented |
| `GET` | `/v1/decks` | implemented compatibility alias |
| `GET` | `/v1/decks/projects` | implemented compatibility alias |
| `GET` | `/v1/projects/:projectId` | implemented |
| `GET` | `/v1/decks/:deckId` | implemented alias |
| `GET` | `/v1/decks/:deckId/json` | implemented |
| `GET` | `/v1/jobs/:jobId` | implemented |
| `GET` | `/v1/jobs/:jobId/event-log` | implemented |
| `POST` | `/v1/jobs/:jobId/cancel` | implemented |
| `GET` | `/v1/templates` | implemented |
| `GET` | `/v1/design-templates` | implemented |
| `GET` | `/v1/design-templates/:id/preview` | implemented |
| `GET` | `/v1/design-templates/:id/preview/template` | implemented |
| `GET` | `/v1/design-systems` | implemented |
| `GET` | `/v1/design-systems/:id/preview` | implemented |
| `GET` | `/v1/design-systems/:id/preview/:page` | implemented |
| `GET` | `/v1/admin/cloud-providers` | implemented, admin only |
| `POST` | `/v1/admin/cloud-providers/test` | implemented, admin only |
| `POST` | `/v1/cloud/decks/:projectId/export` | implemented |
| `GET` | `/v1/cloud/exports/:fileId/download` | implemented |

These routes are the web frontend's source of truth for auth, cloud deck
generation, project/deck history, job polling, realtime recovery, settings,
templates, and cloud export.
Template and design-system selection use `GET /v1/design-templates` and
`GET /v1/design-systems`. Template previews use
`GET /v1/design-templates/:id/preview` and
`GET /v1/design-templates/:id/preview/template`. Design-system previews use
`GET /v1/design-systems/:id/preview` and
`GET /v1/design-systems/:id/preview/:page`; frontend details are in
`docs/frontend-design-system-selection.md`.

## Frontend State After Cleanup

- New chat and the wizard both call `POST /v1/cloud/decks/generate`.
- Realtime generation uses Socket.IO `/realtime` with `deck:subscribe`.
- Job recovery and final artifacts use `GET /v1/jobs/:jobId`.
- Exact workflow replay uses `GET /v1/jobs/:jobId/event-log` or
  `deck:subscribe` with `afterSeq`.
- The composer and upload wizard no longer expose file upload.
- Settings only exposes cloud/account configuration.

## Fixed Route Gaps

### Latest Server Changes

Added in this pass:

- `GET /v1/decks` as a My Decks compatibility alias.
- Shared pagination/query behavior for `GET /v1/projects`,
  `GET /v1/decks`, and `GET /v1/decks/projects`.
- Direct deck-card fields on project list/detail responses:
  `deckId`, `projectId`, `jobId`, `lastJobId`, `deckTitle`, `slideCount`,
  `deckType`, `designStyle`, `language`, `hasDeckArtifact`, `thumbnailUrl`,
  and `previewHtml`.

This means the frontend can migrate old `/api/decks` list assumptions to
`/v1/projects` or `/v1/decks` without waiting for a separate adapter endpoint.

### Profile Save

Use:

```http
PATCH /v1/auth/me
Content-Type: application/json
```

Request:

```json
{
  "name": "Ada Lovelace"
}
```

The route also accepts `displayName`, `avatarUrl`, and `locale`.

### User Settings

Use:

```http
GET /v1/user/settings
PATCH /v1/user/settings
```

Response:

```json
{
  "language": "en",
  "defaultDeckType": "investor_pitch",
  "defaultDesignStyle": "modern",
  "defaultSlideCount": 10,
  "branding": {
    "companyName": "YDeck",
    "productName": "YDeck",
    "logoPath": null,
    "logoUrl": null,
    "primaryColor": "#111827",
    "accentColor": "#2563eb"
  }
}
```

### Deck And Project List

Use:

```http
GET /v1/projects?workspaceId=:workspaceId&limit=20&cursor=:cursor
```

Compatibility aliases:

```http
GET /v1/decks?workspaceId=:workspaceId&limit=20&cursor=:cursor
GET /v1/decks/projects?workspaceId=:workspaceId&limit=20&cursor=:cursor
```

`GET /v1/projects` returns:

```json
{
  "projects": [
    {
      "id": "project_id",
      "deckId": "project_id",
      "projectId": "project_id",
      "jobId": "job_id",
      "lastJobId": "job_id",
      "title": "AI Notes Pitch Deck",
      "deckTitle": "AI Notes Pitch Deck",
      "status": "done",
      "progress": 100,
      "slideCount": 10,
      "deckType": "investor_pitch",
      "designStyle": "modern",
      "language": "en",
      "hasDeckArtifact": true,
      "thumbnailUrl": null,
      "previewHtml": "<section>...</section>",
      "meta": {
        "deckArtifact": {},
        "slideCount": 10,
        "deckType": "investor_pitch",
        "designStyle": "modern",
        "language": "en"
      }
    }
  ],
  "nextCursor": null
}
```

`GET /v1/decks` returns the same payload plus `decks`, pointing at the same
items as `projects`, for old list adapters.

### Deck Detail And Artifact

Use:

```http
GET /v1/projects/:projectId
GET /v1/decks/:deckId
GET /v1/decks/:deckId/json
```

`GET /v1/projects/:projectId` and `GET /v1/decks/:deckId` include
`meta.deckArtifact` and the same direct deck-card fields as the list route.
`GET /v1/decks/:deckId/json` returns the deck artifact directly.

### Agent Workspace Hydration

There is no `workspace-snapshot` HTTP route in the main server today. A reopened
agent workspace should hydrate from the existing project/session/artifact/event
contracts:

```http
GET /v1/projects/:projectId
GET /v1/cloud/decks/:projectId/agent-session
GET /v1/decks/:deckId/json
GET /v1/jobs/:jobId/event-log?afterSeq=:lastSeenSeq&limit=200
```

`/v1/cloud/decks/:projectId/agent-session` is the canonical session-summary
route. `/v1/decks/:deckId/agent-session` exists as a compatibility alias for
older clients that already address saved decks through `/v1/decks`.

Durable state split:

- `DeckProject.meta.deckArtifact` and `DeckJob.resultMeta.deckArtifact` are the
  final deck/artifact source of truth.
- `DeckJob.resultMeta.productionFlow`, `DeckJob.inputParams`, and audit logs
  provide the compact agent-session summary.
- `DeckJobEvent` rows provide exact ordered live workflow replay with `seq`.

Empty or missing cases:

- Missing project/deck id returns `404`.
- Missing deck artifact returns `404` from `/v1/decks/:deckId/json`.
- A project with no jobs returns an agent-session payload with an empty `jobs`
  array.
- A job event-log request with no newer events returns `events: []`,
  `nextSeq: afterSeq`, and `hasMore: false`.

If the frontend wants a single `PUT`/`GET` workspace-snapshot round trip, that
is a new product/API contract and is not currently implemented.

### Templates

Use:

```http
GET /v1/templates
```

The old `/api/templates` compatibility route is still present, but new frontend
code should prefer `/v1/templates`.

### Export And Download

Use:

```http
POST /v1/cloud/decks/:projectId/export
GET /v1/cloud/exports/:fileId/download
```

Export request:

```json
{
  "format": "pptx"
}
```

Supported formats are `pptx` and `html`.

## Remaining Product Decisions

### Cloud Provider Admin

Implemented read/test routes:

```http
GET /v1/admin/cloud-providers
POST /v1/admin/cloud-providers/test
```

There is intentionally no `PATCH /v1/admin/cloud-providers` today. Runtime LLM
configuration is read from environment variables; the frontend should hide
provider save controls unless the product decides to support database-backed
provider configuration.

### Legacy Local Runtime Routes

Do not migrate these to the main server for cloud-only web:

```http
POST /api/render/html
POST /api/render/export-pptx-editable
GET /api/render/supported-types
GET /api/render/jobs/:exportId
GET /api/render/jobs/:exportId/download
POST /api/files/upload
```

Use the cloud generation, job, project, and export routes listed above instead.

## Implementation Recommendation

1. Point profile save to `PATCH /v1/auth/me`.
2. Point settings load/save to `/v1/user/settings`.
3. Point My Decks to `/v1/projects`, or `/v1/decks` while retiring old
   `/api/decks` assumptions.
4. Point saved deck hydration to `/v1/projects/:projectId` plus
   `/v1/decks/:deckId/json` for the artifact.
5. Point export to `/v1/cloud/decks/:projectId/export`.
6. Hide provider save controls until mutable provider configuration is in scope.
