# Main Server Desktop Pairing Contract

This doc is for the main-server/backend owner. It describes what the main
server must provide so a desktop app can pair its local server to an
authenticated YDeck user.

The short version:

- The **main server** owns user login, workspace membership, pairing codes,
  device tokens, context sync, license checks, and revocation.
- The **local server** owns local generation and stores only its paired device
  token.
- The local server must not store the user's password, refresh token, or
  long-lived user JWT.

---

## Required Main-Server Responsibilities

The main server must support these flows:

1. Authenticate the user through normal account auth.
2. Let that authenticated user create a short-lived pairing code.
3. Let a local server exchange that one-time code for a device token.
4. Let the paired local server call back with `X-Device-Token`.
5. Let the user or workspace admin list/revoke paired desktop devices.
6. Return safe profile/workspace/license context to a paired local server.

The local desktop server is treated as a revocable workspace-scoped device.

---

## Required Endpoints

### `POST /api/auth/login` or `POST /v1/auth/login`

Normal user login. The desktop frontend calls this on the main server, not on
the local server.

Response must include a user JWT that can authorize pairing-code creation.

```json
{
  "success": true,
  "token": "USER_JWT",
  "userId": "USER_ID",
  "email": "user@example.com",
  "name": "User Name",
  "role": "user"
}
```

### `GET /api/auth/me` or `GET /v1/auth/me`

Normal signed-in user check. The desktop frontend can use this to validate the
stored main-server JWT and show the account before pairing.

```http
Authorization: Bearer USER_JWT
```

### `POST /v1/devices/pairing-codes`

Creates a short-lived one-time code for a workspace. This endpoint must require
a real user JWT. API keys and device tokens should not be allowed to create
pairing codes.

```http
Authorization: Bearer USER_JWT
Content-Type: application/json
```

```json
{
  "workspaceId": "optional; defaults to current user's workspace"
}
```

Response:

```json
{
  "code": "123456",
  "expiresInSeconds": 600,
  "workspaceId": "WORKSPACE_ID"
}
```

Main-server requirements:

- Check that the JWT is valid.
- Check that the user can access `workspaceId`.
- Generate a 6-digit code or equivalent short setup code.
- Store only a hash of the code.
- Set an expiry, normally `PAIRING_CODE_TTL=600`.
- Mark the code as one-time use.
- Audit `device.pairing_code.create`.

### `POST /v1/devices/activate`

The local server calls this on the main server. It exchanges the pairing code
for a device token.

This endpoint is public from an auth perspective because the code is the
temporary proof, but it should be rate-limited.

```json
{
  "code": "123456",
  "deviceName": "YDeck Desktop Local Server",
  "platform": "darwin",
  "appVersion": "1.0.0",
  "fingerprint": "stable-installation-fingerprint"
}
```

Response:

```json
{
  "deviceId": "DEVICE_ID",
  "deviceToken": "RAW_DEVICE_TOKEN_RETURNED_ONCE",
  "workspaceId": "WORKSPACE_ID",
  "expiresAt": "2026-07-21T00:00:00.000Z"
}
```

Main-server requirements:

- Look up the pairing code by hash.
- Reject expired, unknown, or already-used codes.
- Atomically mark the code used.
- Generate a high-entropy device token.
- Store only a hash of the device token plus a short prefix for display.
- Scope the device to the pairing code's `userId` and `workspaceId`.
- Return the raw device token exactly once.
- Audit `device.activate` or equivalent.

### `GET /v1/devices/context`

The paired local server calls this with its device token to hydrate the desktop
UI and local defaults.

```http
X-Device-Token: RAW_DEVICE_TOKEN
```

Response should include only safe account/workspace context:

```json
{
  "user": {
    "id": "USER_ID",
    "fullName": "User Name",
    "email": "user@example.com",
    "avatarUrl": null
  },
  "workspace": {
    "id": "WORKSPACE_ID",
    "name": "User Workspace",
    "role": "owner"
  },
  "preferences": {
    "language": "en",
    "defaultDeckType": "project_summary",
    "defaultStyle": "minimal_clean",
    "defaultSlideCount": 12
  },
  "branding": {
    "companyName": "YDeck",
    "productName": "YDeck",
    "primaryColor": "#6d28d9",
    "accentColor": "#2563eb",
    "logoUrl": null
  },
  "license": {
    "plan": "local",
    "validUntil": "2026-07-21T00:00:00.000Z",
    "features": {
      "privateAgent": true,
      "cloudDecks": true,
      "advancedTemplates": true
    }
  }
}
```

Do not return:

- User password hashes
- User JWTs or refresh tokens
- Raw device tokens
- Billing secrets
- Provider API keys
- Private local paths from the user's machine

### `POST /v1/devices/heartbeat`

The paired local server periodically proves that it is still active.

```http
X-Device-Token: RAW_DEVICE_TOKEN
```

Response:

```json
{
  "ok": true,
  "serverTime": "2026-06-21T00:00:00.000Z"
}
```

Main-server requirements:

- Reject invalid, expired, or revoked device tokens.
- Update `lastHeartbeatAt`.
- Optionally include server time and minimum client version hints.

### `GET /v1/devices/license-check`

The local server can call this before expensive work.

```http
X-Device-Token: RAW_DEVICE_TOKEN
```

The response should be scoped to the device's workspace. The main server should
not trust a workspace id supplied by the local server for this call.

### `GET /v1/devices/workspaces/:workspaceId`

Lists paired devices for the workspace. This endpoint is for the main web app
or desktop account settings screen.

```http
Authorization: Bearer USER_JWT
```

Main-server requirements:

- Normal users can list only workspaces they belong to.
- Admins can list workspaces they administer.
- Never return `tokenHash` or raw tokens.
- Return display fields such as device name, platform, status, created time,
  expiry, and last heartbeat.

### `DELETE /v1/devices/workspaces/:workspaceId/:deviceId`

Revokes a paired local server without logging out the user.

```http
Authorization: Bearer USER_JWT
```

Response:

```json
{ "success": true }
```

Main-server requirements:

- Verify workspace access/admin rights.
- Mark device status as `revoked`.
- Set `revokedAt` and `revokedBy`.
- Future `X-Device-Token` calls must fail.
- Audit `device.revoke`.

---

## Data Model Requirements

The main server needs two persistent records.

### Pairing Code

Required fields:

```text
codeHash
userId
workspaceId
expiresAt
usedAt
createdAt
```

Recommended indexes:

- unique `codeHash`
- `expiresAt`
- `workspaceId`
- `userId`

### Device

Required fields:

```text
userId
workspaceId
name
platform
appVersion
fingerprint
tokenPrefix
tokenHash
status: active | revoked
expiresAt
lastHeartbeatAt
revokedAt
revokedBy
createdAt
```

Recommended indexes:

- unique `tokenHash`
- `tokenPrefix`
- `workspaceId`
- `userId`
- `status`
- `expiresAt`

---

## Auth Rules

Use three separate credential types:

| Credential | Accepted by main server for | Must not be used for |
| --- | --- | --- |
| User JWT | Account actions, creating pairing codes, listing/revoking devices | Local server job execution after pairing |
| Pairing code | One activation request | Normal API calls |
| Device token | Device context, heartbeat, license, future agent/job sync | User login, creating pairing codes, account settings |

Important boundary:

The device token means "this paired local server may act for this workspace
within the device-auth API surface." It does not mean "this is the user session."

---

## Error Codes The Desktop Expects

Use stable error codes so the desktop frontend can recover cleanly.

| Error | Meaning | Desktop behavior |
| --- | --- | --- |
| `UNAUTHENTICATED` | Missing/invalid user JWT | Ask user to sign in again |
| `FORBIDDEN` | User cannot access workspace/device | Show permission error |
| `INVALID_PAIRING_CODE` | Code is wrong, expired, or used | Create a fresh pairing code |
| `MISSING_DEVICE_TOKEN` | Local server did not send token | Treat local pairing as broken |
| `INVALID_DEVICE_TOKEN` | Token unknown | Forget local pairing and re-pair |
| `DEVICE_TOKEN_EXPIRED` | Token TTL ended | Re-pair |
| `DEVICE_NOT_ACTIVE` | Device was revoked | Re-pair or show revoked message |

Error response shape:

```json
{
  "success": false,
  "error": "INVALID_PAIRING_CODE",
  "message": "Invalid or expired pairing code"
}
```

---

## Security Requirements

Main server must:

- Store hashes of pairing codes and device tokens, never raw values.
- Return raw device tokens only once from activation.
- Rate-limit activation attempts.
- Expire pairing codes quickly.
- Make pairing codes one-time use.
- Allow revocation without affecting normal user sessions.
- Scope every device-token request by the stored device workspace.
- Avoid returning secrets from `/v1/devices/context`.
- Audit pairing-code creation, activation, revoke, and suspicious failures.

Recommended production environment:

```env
AUTH_REQUIRED=true
JWT_SECRET=<strong secret>
JWT_EXPIRES_IN=30d
PAIRING_CODE_TTL=600
DEVICE_TOKEN_TTL=2592000
```

---

## What To Tell The Main Server Team

Use this checklist as the handoff:

- Desktop login happens against the main server.
- Main server must expose `POST /v1/devices/pairing-codes` for signed-in users.
- Local server will call `POST /v1/devices/activate` with the code.
- Main server returns a one-time raw `deviceToken` to the local server.
- Local server will use `X-Device-Token` for `context`, `heartbeat`, and
  `license-check`.
- Main server must let users list and revoke paired desktop/local devices.
- Device revocation must not log the user out of normal web/mobile/desktop
  account sessions.
- Main server remains the source of truth for user profile, workspace, license,
  branding, and synced preferences.
