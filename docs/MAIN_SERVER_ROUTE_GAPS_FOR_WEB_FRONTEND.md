# Main Server Route Gaps For Web Frontend

This document lists frontend routes that still point at the old local runtime
API shape while the browser app is currently configured to talk to the YDeck
main server on `http://localhost:2026`.

The goal is not to clone every local desktop endpoint on the main server. The
web app should use `/v1/*` main-server contracts for cloud mode, and only the
routes needed by the browser web UX should be added or confirmed.

## Scope

- Runtime in scope: browser web app.
- API base in scope: `http://localhost:2026`.
- Desktop/Electron runtime: out of scope for this pass.
- Local/private generation endpoints: out of scope unless the product decides
  to support them through the main server.

## Probe Results

Probed without a bearer token on 2026-06-21. A `401` means the route exists and
is protected. A `404` with `{"error":{"code":"NOT_FOUND","message":"Route not found"}}`
means the main server does not currently expose that route.

### Existing Protected Main Routes

| Method | Route | Observed status |
| --- | --- | --- |
| `GET` | `/v1/auth/me` | `401` |
| `POST` | `/v1/cloud/decks/generate` | `401` |
| `GET` | `/v1/jobs/:jobId` | `401` |
| `POST` | `/v1/devices/pairing-codes` | `401` |

These routes should remain the web frontend's source of truth for auth, cloud
deck generation, job polling, and desktop pairing.

### Missing Routes Still Referenced By The Web Frontend

| Method | Route | Current frontend use |
| --- | --- | --- |
| `GET` | `/api/auth/me` | legacy auth lookup fallback |
| `PATCH` | `/api/auth/me` | profile/name save |
| `GET` | `/api/user/settings` | settings page initial values |
| `PATCH` | `/api/user/settings` | settings page save |
| `GET` | `/api/decks` | My Decks list |
| `GET` | `/api/decks/:deckId` | deck metadata/detail |
| `GET` | `/api/decks/:deckId/json` | render generated deck JSON |
| `GET` | `/api/decks/:deckId/status` | local generation status fallback |
| `GET` | `/api/decks/:deckId/outline` | outline editor |
| `PATCH` | `/api/decks/:deckId/outline` | outline editor save |
| `POST` | `/api/decks/generate-phased` | old local generation flow |
| `POST` | `/api/decks/detect-intent` | old local prompt intent detection |
| `POST` | `/api/decks/:deckId/approve` | old local generation approval |
| `POST` | `/api/decks/:deckId/cancel` | old local generation cancel |
| `POST` | `/api/decks/:deckId/agent-chat` | local agent chat/refinement |
| `POST` | `/api/decks/:deckId/slides/:slideNumber/rewrite` | local slide rewrite |
| `POST` | `/api/decks/:deckId/slides/:slideNumber/regenerate` | local slide regenerate |
| `POST` | `/api/decks/:deckId/translate` | local deck translation |
| `GET` | `/api/decks/:deckId/events` | old SSE event stream |
| `GET` | `/api/decks/:deckId/download` | old PPTX download |
| `POST` | `/api/files/upload` | file upload for local/file-based generation |
| `POST` | `/api/render/html` | old render job |
| `POST` | `/api/render/export-pptx-editable` | old PPTX export job |
| `GET` | `/api/render/supported-types` | export feature detection |
| `GET` | `/api/render/jobs/:exportId` | export job polling |
| `GET` | `/api/render/jobs/:exportId/download` | export download |
| `GET` | `/api/render/jobs/:exportId/preview` | export preview |
| `GET` | `/api/admin/cloud-providers` | settings cloud provider card |
| `PATCH` | `/api/admin/cloud-providers` | settings cloud provider save |
| `POST` | `/api/admin/cloud-providers/test` | settings provider test |
| `GET` | `/api/templates` | template gallery/options |

## Requested Main Server Contracts

These are the routes the web frontend needs most urgently. Prefer `/v1/*`
routes over adding new `/api/*` routes.

### 1. Profile Save

Needed because the settings UI can load the user through `GET /v1/auth/me`, but
profile edits still call `PATCH /api/auth/me`.

Suggested route:

```http
PATCH /v1/auth/me
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Request:

```json
{
  "name": "Ada Lovelace"
}
```

Alternative accepted field names are fine if documented, for example
`displayName`.

Suggested response:

```json
{
  "success": true,
  "user": {
    "authenticated": true,
    "userId": "user_id",
    "email": "ada@example.com",
    "name": "Ada Lovelace",
    "initials": "AL",
    "role": "user"
  }
}
```

### 2. User Settings Load And Save

Needed because the settings page currently receives `404` from
`/api/user/settings`, so changes cannot be persisted.

Suggested routes:

```http
GET /v1/user/settings
PATCH /v1/user/settings
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Suggested response shape:

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

Suggested patch body:

```json
{
  "language": "en",
  "defaultDeckType": "investor_pitch",
  "defaultDesignStyle": "modern",
  "defaultSlideCount": 10,
  "branding": {
    "companyName": "YDeck"
  }
}
```

Suggested patch response:

```json
{
  "success": true,
  "settings": {
    "language": "en",
    "defaultDeckType": "investor_pitch",
    "defaultDesignStyle": "modern",
    "defaultSlideCount": 10,
    "branding": null
  }
}
```

### 3. Deck/Project List For My Decks

Needed because My Decks currently calls `GET /api/decks`, which is not present
on the main server. In cloud mode, decks should map to main-server projects.

Suggested route:

```http
GET /v1/projects?workspaceId=:workspaceId&limit=20&cursor=:cursor
Authorization: Bearer <accessToken>
```

Suggested response:

```json
{
  "projects": [
    {
      "id": "project_id",
      "title": "AI Notes Pitch Deck",
      "description": "Create a pitch deck...",
      "status": "done",
      "workspaceId": "workspace_id",
      "createdAt": "2026-06-21T00:00:00.000Z",
      "updatedAt": "2026-06-21T00:01:00.000Z",
      "meta": {
        "deckArtifact": {
          "deckTitle": "AI Notes Pitch Deck",
          "slides": []
        },
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

Frontend can adapt this into the existing list shape:

```json
{
  "decks": [
    {
      "deckId": "project_id",
      "title": "AI Notes Pitch Deck",
      "status": "done",
      "slideCount": 10
    }
  ],
  "nextCursor": null
}
```

### 4. Deck/Project Detail And Artifact

The existing cloud contract already documents:

```http
GET /v1/projects/:projectId
GET /v1/jobs/:jobId
Authorization: Bearer <accessToken>
```

The frontend needs one stable way to load a saved deck by id from My Decks.
Preferred behavior:

- `GET /v1/projects/:projectId` returns `project.meta.deckArtifact`.
- `project.meta.deckArtifact` uses the same JSON artifact shape returned from
  `GET /v1/jobs/:jobId` at `resultMeta.deckArtifact`.
- The project response includes enough metadata for the existing deck detail UI:
  title, description, status, language, deck type, design style, slide count,
  created time, and updated time.

If the backend wants to expose a deck-specific alias, use `/v1/decks/:deckId`
as a main-server route and document whether `deckId` is the project id or job id.

## Lower Priority Or Product-Decision Routes

These routes are still referenced by older local-runtime UI, but the current
cloud main server does not need all of them immediately.

### Templates

Current missing route:

```http
GET /api/templates
```

Suggested main-server route if templates should be available on web:

```http
GET /v1/templates
```

Response can match the frontend's existing `templates` array with
`templateId`, `name`, `category`, `description`, `slideCount`, `designStyle`,
optional `supportedDeckTypes`, optional preview, and optional thumbnail URL.

### Cloud Provider Admin

Current missing routes:

```http
GET /api/admin/cloud-providers
PATCH /api/admin/cloud-providers
POST /api/admin/cloud-providers/test
```

If this configuration should be exposed in the web app, suggested main-server
routes are:

```http
GET /v1/admin/cloud-providers
PATCH /v1/admin/cloud-providers
POST /v1/admin/cloud-providers/test
```

These should require admin authorization. If provider configuration is server
operator-only, the frontend should hide this card instead.

### Export And Download

Current missing local routes include:

```http
POST /api/render/html
POST /api/render/export-pptx-editable
GET /api/render/supported-types
GET /api/render/jobs/:exportId
GET /api/render/jobs/:exportId/download
GET /api/decks/:deckId/download
```

The current cloud deck generation contract says there is no PPTX/PDF download
endpoint yet and export jobs do not produce user-facing artifacts. These routes
can wait unless web PPTX export is now in scope.

### File Upload

Current missing route:

```http
POST /api/files/upload
```

The current cloud deck generation contract says `fileId` exists in the schema,
but there is no public cloud upload endpoint yet. Keep file upload hidden until
the server supports a main-server upload flow.

### Local Generation And Editing Endpoints

These are old local/private runtime routes:

```http
POST /api/decks/generate-phased
POST /api/decks/detect-intent
GET /api/decks/:deckId/status
GET /api/decks/:deckId/outline
PATCH /api/decks/:deckId/outline
POST /api/decks/:deckId/approve
POST /api/decks/:deckId/cancel
POST /api/decks/:deckId/agent-chat
POST /api/decks/:deckId/slides/:slideNumber/rewrite
POST /api/decks/:deckId/slides/:slideNumber/regenerate
POST /api/decks/:deckId/translate
GET /api/decks/:deckId/events
```

For cloud mode, prefer existing or new `/v1` job/project operations:

- `POST /v1/cloud/decks/generate` for initial generation.
- Socket.IO `/realtime` plus `deck:subscribe` for realtime progress.
- `GET /v1/jobs/:jobId` for job state and final artifact.
- `POST /v1/jobs/:jobId/cancel` for cancel.
- `POST /v1/projects/:projectId/jobs` with `type: "refine"` for future edit,
  rewrite, translation, or chat-style refinement workflows.

## Frontend Impact Today

- Settings save fails because profile/settings patch routes are missing.
- My Decks cannot reliably load from the main server because `/api/decks` is
  missing.
- Export/download UI should stay disabled or show an unavailable state until
  the main server supports cloud export artifacts.
- Auth-required UI should only appear for `401` or `403`. A `404 NOT_FOUND`
  from these routes means the server contract is missing, not that the user
  needs to sign in again.

## Implementation Recommendation

1. Add the profile/settings routes first, because they unblock saving settings.
2. Add a paginated project list route, or confirm the existing equivalent, so
   My Decks can migrate away from `/api/decks`.
3. Confirm `GET /v1/projects/:projectId` includes `meta.deckArtifact` for deck
   rendering from saved projects.
4. Decide whether templates and cloud-provider admin are web product features.
5. Leave local generation, local render, and file upload routes out of the main
   web flow until cloud equivalents are explicitly in scope.
