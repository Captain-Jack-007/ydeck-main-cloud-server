# AI Agent Auth And LLM Provider Integration

This document describes how the YDeck main server authenticates paired agent runtimes and how the hosted deck agent is configured to use an external LLM provider such as OpenAI, Gemini, or DeepSeek.

The target behavior is:

- The hosted deck agent uses a server-side LLM API key, selected by `LLM_PROVIDER`.
- Any separate paired runtime must be paired by an authenticated YDeck user before it can run workspace-scoped jobs.
- A paired runtime is scoped to one workspace.
- A paired runtime never stores the user's password or refresh token.
- The main server can revoke a paired runtime without affecting the user's normal web or app login session.

## Current Server Auth Model

The current main server already has two auth layers:

| Auth type | Used by | Credential | Server check |
| --- | --- | --- | --- |
| User auth | Web app, dashboard, account actions | `Authorization: Bearer <accessToken>` | `requireUser` verifies the JWT access token |
| Device auth | Paired runtimes, desktop agents, connected clients | `X-Device-Token: <deviceToken>` | `requireDevice` hashes the token and checks the `Device` record |

Relevant current endpoints:

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /v1/auth/register` | Public | Create user, personal workspace, and session |
| `POST /v1/auth/login` | Public | Login and receive access/refresh tokens |
| `POST /v1/auth/refresh` | Public | Rotate refresh token and receive a new access token |
| `GET /v1/auth/me` | User | Return user and workspace membership |
| `POST /v1/devices/pairing-codes` | User | Create a short-lived one-time pairing code for a workspace |
| `POST /v1/devices/activate` | Public, rate-limited | Exchange pairing code for a device token |
| `POST /v1/devices/heartbeat` | Device | Prove the paired runtime is still online |
| `GET /v1/devices/license-check` | Device | Check workspace plan and enabled features |
| `GET /v1/devices/context` | Device | Fetch safe profile, workspace, preference, branding, and license context |
| `GET /v1/devices/workspaces/:workspaceId` | User | List paired devices for a workspace |
| `DELETE /v1/devices/workspaces/:workspaceId/:deviceId` | User admin | Revoke a paired device |

## LLM Provider Configuration

The main server owns the API key for the primary cloud LLM. The agent loop should call the provider through the server-side LLM abstraction, not from a browser or user device. DeepSeek is the preferred default provider; OpenAI and Gemini remain supported alternatives.

Supported values:

| Variable | Purpose |
| --- | --- |
| `LLM_PROVIDER=openai` | Use OpenAI Chat Completions-compatible API with `OPENAI_API_KEY` and `OPENAI_MODEL` |
| `LLM_PROVIDER=gemini` | Use Gemini `generateContent` with `GEMINI_API_KEY` and `GEMINI_MODEL` |
| `LLM_PROVIDER=deepseek` | Use DeepSeek Chat Completions-compatible API with `DEEPSEEK_API_KEY` and `DEEPSEEK_MODEL` |
| `LLM_PROVIDER=openai-compatible` | Use an OpenAI-compatible endpoint with `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` |
| `LLM_PROVIDER=mock` | Use deterministic mock output for non-production testing |

Production should set exactly one active provider and keep provider API keys in server-side secret storage. These keys are not user credentials and must not be returned through device context, auth responses, logs, or client-facing APIs.

For local debugging, `LLM_STREAM_OUTPUT=true` and `LLM_LOG_OUTPUT=true` print provider output to server stdout as it arrives. Disable `LLM_LOG_OUTPUT` in environments where prompts or generated deck content may contain private customer data.

## Recommended Architecture

Treat any separate agent runtime as a YDeck device.

A paired runtime should not receive user JWTs after pairing. It should only receive and store its own `deviceToken`. That token represents "this runtime is allowed to act for this workspace", not "this runtime is the user".

```
YDeck Web/App          YDeck Main Server             Paired Agent Runtime
     |                         |                              |
     | login/register          |                              |
     |------------------------>|                              |
     | accessToken             |                              |
     |<------------------------|                              |
     |                         |                              |
     | create pairing code     |                              |
     |------------------------>|                              |
     | 6-digit code            |                              |
     |<------------------------|                              |
     |                         | user enters/pastes code      |
     |                         |----------------------------->|
     |                         |                              |
     |                         | activate with code           |
     |                         |<-----------------------------|
     |                         | deviceToken                  |
     |                         |----------------------------->|
     |                         |                              |
     |                         | heartbeat/license/API calls  |
     |                         |<-----------------------------|
```

If all deck generation happens inside the hosted main server, no paired runtime is required for generation. The device flow remains useful for desktop apps, private runners, or future customer-controlled execution.

## Pairing Flow

### 1. User logs in to YDeck

The user logs in through the normal auth endpoint.

```http
POST /v1/auth/login
Content-Type: application/json
```

```json
{
  "email": "user@example.com",
  "password": "correct-password"
}
```

The main server returns:

```json
{
  "user": {
    "id": "USER_ID",
    "email": "user@example.com"
  },
  "accessToken": "USER_ACCESS_TOKEN",
  "refreshToken": "USER_REFRESH_TOKEN",
  "expiresIn": 900
}
```

The web app or desktop app should use `accessToken` to create the pairing code.

### 2. User chooses a workspace

The client can call:

```http
GET /v1/auth/me
Authorization: Bearer USER_ACCESS_TOKEN
```

The response includes the workspaces the user belongs to. The user must select the workspace that the paired runtime is allowed to access.

### 3. Client creates a pairing code

```http
POST /v1/devices/pairing-codes
Authorization: Bearer USER_ACCESS_TOKEN
Content-Type: application/json
```

```json
{
  "workspaceId": "WORKSPACE_ID"
}
```

The main server checks:

- The user access token is valid.
- The user is a member of `workspaceId`.
- The pairing code is stored as a hash.
- The code expires after `PAIRING_CODE_TTL`.

Response:

```json
{
  "code": "123456",
  "expiresInSeconds": 600,
  "workspaceId": "WORKSPACE_ID"
}
```

The user now enters this code into the paired runtime UI, CLI, or setup screen.

### 4. Paired runtime activates itself

The paired runtime sends the code to the main server:

```http
POST /v1/devices/activate
Content-Type: application/json
```

```json
{
  "code": "123456",
  "deviceName": "MacBook YDeck Agent",
  "platform": "darwin",
  "appVersion": "1.0.0",
  "fingerprint": "stable-machine-or-installation-fingerprint"
}
```

The main server checks:

- The code exists by hash.
- The code was not already used.
- The code is not expired.

Response:

```json
{
  "deviceId": "DEVICE_ID",
  "deviceToken": "RAW_DEVICE_TOKEN_RETURNED_ONCE",
  "workspaceId": "WORKSPACE_ID",
  "expiresAt": "2026-07-08T00:00:00.000Z"
}
```

The paired runtime must store:

- `deviceId`
- `deviceToken`
- `workspaceId`
- `mainServerBaseUrl`
- `expiresAt`

The paired runtime must not store:

- User password
- User refresh token
- User access token, unless only temporarily during a first-party desktop login flow

## Running A Paired Runtime After Pairing

Once paired, the runtime authenticates with:

```http
X-Device-Token: RAW_DEVICE_TOKEN_RETURNED_ONCE
```

### Heartbeat

The runtime should periodically call:

```http
POST /v1/devices/heartbeat
X-Device-Token: RAW_DEVICE_TOKEN_RETURNED_ONCE
```

Response:

```json
{
  "ok": true,
  "serverTime": "2026-06-08T12:00:00.000Z"
}
```

Suggested interval:

- Every 30-60 seconds while actively running.
- Every 5-15 minutes while idle, if the process remains alive.

### License check

Before expensive AI work, the runtime should call:

```http
GET /v1/devices/license-check
X-Device-Token: RAW_DEVICE_TOKEN_RETURNED_ONCE
```

Response:

```json
{
  "workspaceId": "WORKSPACE_ID",
  "plan": "free",
  "subscriptionStatus": "active",
  "validUntil": "2026-06-09T12:00:00.000Z",
  "features": {
    "cloudDecks": true,
    "advancedTemplates": false,
    "teamWorkspaces": false,
    "sso": false
  }
}
```

The runtime should cache the license response only until `validUntil` or a shorter max TTL.

### Synced profile and workspace context

After activation, the runtime can fetch safe synced settings from the main server:

```http
GET /v1/devices/context
X-Device-Token: RAW_DEVICE_TOKEN_RETURNED_ONCE
```

Response:

```json
{
  "user": {
    "id": "USER_ID",
    "fullName": "Sardorbek Sirojov",
    "email": "user@example.com",
    "avatarUrl": "https://example.com/avatar.png"
  },
  "workspace": {
    "id": "WORKSPACE_ID",
    "name": "YDeck Workspace",
    "role": "owner"
  },
  "preferences": {
    "language": "en",
    "defaultDeckType": "educational",
    "defaultStyle": "modern",
    "defaultSlideCount": 12
  },
  "branding": {
    "companyName": "YDeck",
    "productName": "YDeck",
    "primaryColor": "#6d28d9",
    "accentColor": "#2563eb",
    "logoUrl": "https://example.com/logo.png"
  },
  "license": {
    "plan": "pro",
    "validUntil": "2026-07-08T00:00:00.000Z",
    "features": {
      "privateAgent": true,
      "cloudDecks": true,
      "advancedTemplates": true
    }
  }
}
```

This endpoint should not return user auth credentials, refresh tokens, password hashes, billing secrets, or private local paths. It should only return context for the workspace attached to the device token.

The runtime may cache this context so its settings UI can still render while disconnected.

## Optional Paired Runtime Contract

If YDeck ships a separate desktop or private agent runtime, it should expose a small control API for its own UI or CLI.

Recommended local endpoints:

| Runtime endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /health` | Runtime control auth | Confirm the agent process is running |
| `POST /setup/activate` | Runtime setup auth | Accept a pairing code and call YDeck `POST /v1/devices/activate` |
| `GET /setup/status` | Runtime control auth | Return paired/unpaired status, workspace id, device id, and token expiry |
| `POST /setup/logout` | Runtime setup auth | Forget the device token and stop accepting jobs |
| `POST /jobs` | Runtime app auth | Start an AI job only if the runtime is paired |

Example `POST /setup/activate` request to the runtime:

```json
{
  "mainServerBaseUrl": "https://api.ydeck.example",
  "code": "123456",
  "deviceName": "MacBook YDeck Agent"
}
```

The runtime should then call the main server activation endpoint and persist the returned device token.

## Settings Ownership

Use this separation for a paired runtime settings UI:

```text
Main Server = source of truth for account, workspace, license, devices, cloud LLM access

Paired Runtime = runtime settings, generation defaults, private execution config
```

Main Server stores and syncs:

- Full name.
- Email.
- Avatar.
- Workspace name and role.
- Language preferences.
- Default deck type.
- Default style.
- Default slide count.
- Company name.
- Product name.
- Primary color.
- Accent color.
- Logo URL.
- Plan, license status, and enabled features.

Paired runtime stores only:

- Runtime model settings, if private execution is supported.
- Local storage folder, if running on a user's machine.
- Runtime control port, if exposing a local control API.
- Offline mode.
- CPU/GPU preference.
- Template cache.
- Runtime logs.
- Generation history.
- Privacy mode.

The runtime UI can show both groups, but fields should be internally labeled as `Synced from Main Server` or `Runtime only`.

For MVP, a paired runtime should cache synced profile, preference, and branding context after pairing, but the main server remains the source of truth for those values.

## Main Server To Paired Runtime Calls

There are two possible ways to connect job execution:

### Option A: Paired runtime pulls jobs

This is easiest behind NAT and firewalls.

1. The runtime authenticates to the main server with `X-Device-Token`.
2. The runtime polls or opens a stream for pending jobs.
3. The main server only returns jobs for the token's workspace.
4. The runtime uploads job status and output back to the main server.

Recommended future endpoints:

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /v1/agent/jobs/next` | Device | Get next job for the paired workspace |
| `POST /v1/agent/jobs/:jobId/start` | Device | Mark job as running |
| `POST /v1/agent/jobs/:jobId/events` | Device | Stream progress or logs |
| `POST /v1/agent/jobs/:jobId/complete` | Device | Upload result metadata |
| `POST /v1/agent/jobs/:jobId/fail` | Device | Mark job failed |

### Option B: Main server calls paired runtime

This only works when the main server can reach the runtime URL, such as a tunnel, LAN, or hosted private agent.

If this model is used, the runtime should require a separate inbound secret. Do not reuse `deviceToken` as the inbound runtime API password.

Recommended approach:

- During activation, the runtime generates `agentInboundSecret`.
- The runtime stores it privately.
- The agent sends only a hash or public registration metadata to the main server.
- Main server calls the runtime with `Authorization: Bearer <short-lived signed command token>` or an HMAC signature.
- Runtime verifies the command before running any AI work.

For most users, Option A is safer and simpler.

## Authorization Rules

The device token should only authorize workspace-scoped agent actions.

Allowed:

- Heartbeat.
- License check.
- Fetch safe profile, workspace, preference, branding, and license context.
- Pull jobs for the paired workspace.
- Upload job status and artifacts for jobs assigned to that workspace.
- Read templates or packs available to that workspace, if required for generation.

Not allowed:

- Changing user email, password, or profile.
- Reading user refresh tokens or sessions.
- Creating new workspaces.
- Managing billing directly.
- Managing workspace members.
- Accessing another workspace.
- Acting as an admin user.

## Revocation

A workspace admin can revoke a paired runtime:

```http
DELETE /v1/devices/workspaces/:workspaceId/:deviceId
Authorization: Bearer USER_ACCESS_TOKEN
```

After revocation:

- The `Device.status` becomes `revoked`.
- `requireDevice` rejects the old `deviceToken`.
- The runtime should show an unpaired or revoked state after its next failed heartbeat.

The runtime should delete its stored token when it receives:

- `401 Invalid device token`
- `401 Device token expired`
- `403 Device not active`

## Token Storage Requirements

The main server stores only hashes of secrets:

- User passwords are bcrypt hashes.
- Refresh tokens are SHA-256 hashes in `Session.refreshTokenHash`.
- Device tokens are SHA-256 hashes in `Device.tokenHash`.
- Pairing codes are SHA-256 hashes in `PairingCode.codeHash`.

A paired runtime stores the raw `deviceToken`, so it must protect local storage.

Recommended local storage:

| OS | Storage |
| --- | --- |
| macOS | Keychain |
| Windows | Credential Manager or DPAPI-backed storage |
| Linux | Secret Service, KWallet, or encrypted config with strict file permissions |

If a simple config file is used during development:

- Store it outside the project repo.
- Use permissions like `0600`.
- Never log the token.
- Never include the token in crash reports.

## Error Handling

The paired runtime should handle these auth failures:

| Status | Meaning | Runtime action |
| --- | --- | --- |
| `401 Missing device token` | Token was not sent | Treat as local config bug |
| `401 Invalid device token` | Token is unknown | Delete token and require re-pairing |
| `401 Device token expired` | Token TTL ended | Require re-pairing |
| `403 Device not active` | Device revoked or disabled | Show revoked state and require admin action |
| `429 Too Many Requests` | Rate limit hit | Back off and retry later |

## Environment Variables

Current relevant main server environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `2026` | Main server HTTP port for local/development runs |
| `LLM_PROVIDER` | `deepseek` | Main LLM provider: `deepseek`, `openai`, `gemini`, `openai-compatible`, or `mock` |
| `OPENAI_API_KEY` | none | OpenAI API key when `LLM_PROVIDER=openai` |
| `OPENAI_MODEL` | `gpt-4.1-mini` | OpenAI model used by the cloud deck agent |
| `GEMINI_API_KEY` | none | Gemini API key when `LLM_PROVIDER=gemini` |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model used by the cloud deck agent |
| `DEEPSEEK_API_KEY` | none | DeepSeek API key when `LLM_PROVIDER=deepseek` |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` | DeepSeek model used by the cloud deck agent |
| `LLM_STREAM_OUTPUT` | `true` | Requests streaming output from supported providers |
| `LLM_LOG_OUTPUT` | `true` | Prints raw LLM output to server stdout for debugging |
| `AGENT_FLOW_LOG_OUTPUT` | `true` in non-production | Prints agentic send/receive traces for job input, LLM prompts/responses, tool calls/results, fallback saves, and job completion |
| `LLM_BASE_URL` | none | Base URL for `openai-compatible` providers |
| `LLM_API_KEY` | none | API key for `openai-compatible` providers |
| `LLM_MODEL` | `ydeck-cloud-agent` | Model name for `openai-compatible` providers |
| `AGENT_LOOP_ENABLED` | `true` | Enables the agentic deck generation pipeline |
| `AGENT_LOOP_MAX_ROUNDS` | `4` | Maximum LLM/tool loop rounds per job |
| `AGENT_LOOP_MAX_TOOLS` | `8` | Maximum selected tools exposed to the agent prompt |
| `JWT_ACCESS_TTL` | `900` | User access token TTL in seconds |
| `JWT_REFRESH_TTL` | `2592000` | User refresh token/session TTL in seconds |
| `DEVICE_TOKEN_TTL` | `2592000` | Paired runtime token TTL in seconds |
| `PAIRING_CODE_TTL` | `600` | Pairing code TTL in seconds |
| `JWT_ACCESS_SECRET` | Development fallback | Signs user access tokens |
| `JWT_REFRESH_SECRET` | Development fallback | Signs user refresh tokens |

Production must set strong unique values for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.
Production must also set the API key for the selected `LLM_PROVIDER`.

## Implementation Checklist

Main server:

- Already supports user login, refresh, and logout.
- Already supports user-scoped pairing code creation.
- Already supports paired runtime activation through the device flow.
- Already supports heartbeat and license check with device auth.
- Supports OpenAI, Gemini, DeepSeek, OpenAI-compatible, and mock LLM providers through environment config.
- Should add dedicated `/v1/agent/*` job endpoints if a paired runtime will pull work.
- Supports `GET /v1/devices/context` for safe profile, workspace, preference, branding, and license sync.
- Should add audit logs for pair, heartbeat failure, revoke, and job execution events.

Optional paired runtime:

- Add setup endpoint or UI for entering a 6-digit pairing code.
- Call `POST /v1/devices/activate` from the runtime.
- Store only the returned device credentials.
- Fetch and cache `GET /v1/devices/context` after pairing.
- Require the device token before starting AI jobs.
- Call heartbeat periodically.
- Call license check before expensive work.
- Stop work and require re-pairing when token is invalid, expired, or revoked.
- Never ask the user for their YDeck password inside the runtime unless this is a trusted first-party desktop app flow.

## Security Notes

- Pairing codes are short-lived and one-time use.
- Device tokens are returned only once during activation.
- Device tokens are revocable independently from user sessions.
- LLM provider API keys stay server-side and are never exposed to paired runtimes or clients.
- User access tokens should stay in the web app or first-party client.
- A local runtime should never be trusted only because it runs on `localhost`.
- Any local control API should bind to `127.0.0.1` by default, not `0.0.0.0`.
- If browser pages call a local runtime, configure strict local CORS and avoid wildcard origins.
- For hosted or tunneled runtimes, add signed command requests or mutual TLS.

## Recommended Default Flow

Use this flow for a paired runtime MVP:

1. User logs in to YDeck.
2. User selects a workspace.
3. YDeck creates a 6-digit pairing code with `POST /v1/devices/pairing-codes`.
4. User enters the code in the paired runtime.
5. Runtime activates with `POST /v1/devices/activate`.
6. Runtime stores `deviceToken` securely.
7. Runtime uses `X-Device-Token` for heartbeat, license checks, and future agent job endpoints.
8. Workspace admins can revoke the runtime from the device list.

This keeps user identity, workspace authorization, LLM provider secrets, and paired runtime authentication separated cleanly.
