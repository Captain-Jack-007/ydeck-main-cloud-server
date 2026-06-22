# Frontend User Settings Contract

This document explains how the frontend should load and save per-user workspace
settings for language, default slide generation behavior, and branding.

All requests require:

```http
Authorization: Bearer <accessToken>
```

Use `POST /v1/auth/refresh` when the access token expires.

## What The Server Supports

The server supports these settings today:

```json
{
  "workspaceId": "6a...",
  "language": "en",
  "defaultDeckType": "educational",
  "defaultDesignStyle": "modern",
  "defaultSlideCount": 10,
  "branding": {
    "companyName": null,
    "productName": null,
    "logoPath": null,
    "logoUrl": null,
    "primaryColor": "#111827",
    "accentColor": "#2563eb"
  }
}
```

Supported fields:

- `language`: examples `en`, `ru`, `uz`
- `defaultDeckType`: examples `educational`, `pitch_deck`, `summary`, `training`
- `defaultDesignStyle`: examples `modern`, `minimal`, `corporate`, `creative`
- `defaultSlideCount`: integer from `1` to `100`
- `branding.companyName`: nullable string
- `branding.productName`: nullable string
- `branding.logoUrl`: nullable URL
- `branding.primaryColor`: nullable hex color, for example `#111827`
- `branding.accentColor`: nullable hex color, for example `#2563eb`

Important: if the user did not provide a company or product name, the server
returns `null`. The frontend should show an empty input, not the user's email or
workspace name.

## Load Settings

Use:

```http
GET /v1/user/settings
```

Optional workspace-specific load:

```http
GET /v1/user/settings?workspaceId=<workspaceId>
```

Response:

```json
{
  "workspaceId": "6a...",
  "language": "en",
  "defaultDeckType": "educational",
  "defaultDesignStyle": "modern",
  "defaultSlideCount": 10,
  "branding": {
    "companyName": null,
    "productName": null,
    "logoPath": null,
    "logoUrl": null,
    "primaryColor": "#111827",
    "accentColor": "#2563eb"
  }
}
```

## Save Settings

Use:

```http
PATCH /v1/user/settings
Content-Type: application/json
```

Body:

```json
{
  "workspaceId": "6a...",
  "language": "en",
  "defaultDeckType": "educational",
  "defaultDesignStyle": "modern",
  "defaultSlideCount": 12,
  "branding": {
    "companyName": "Acme Education",
    "productName": "History Tutor",
    "logoUrl": "https://example.com/logo.png",
    "primaryColor": "#111827",
    "accentColor": "#2563eb"
  }
}
```

Response:

```json
{
  "success": true,
  "settings": {
    "workspaceId": "6a...",
    "language": "en",
    "defaultDeckType": "educational",
    "defaultDesignStyle": "modern",
    "defaultSlideCount": 12,
    "branding": {
      "companyName": "Acme Education",
      "productName": "History Tutor",
      "logoPath": null,
      "logoUrl": "https://example.com/logo.png",
      "primaryColor": "#111827",
      "accentColor": "#2563eb"
    }
  }
}
```

To clear a branding field, send `null`:

```json
{
  "branding": {
    "companyName": null,
    "productName": null,
    "logoUrl": null
  }
}
```

## Workspace-Specific Routes

The frontend can also use workspace-specific endpoints:

```http
GET /v1/workspaces/:workspaceId/preferences
PATCH /v1/workspaces/:workspaceId/preferences
GET /v1/workspaces/:workspaceId/branding
PATCH /v1/workspaces/:workspaceId/branding
```

Use these when the UI is clearly editing a selected workspace. Use
`/v1/user/settings` for the simple account settings page.

Workspace preference patch:

```json
{
  "language": "ru",
  "defaultDeckType": "training",
  "defaultStyle": "corporate",
  "defaultSlideCount": 15
}
```

Workspace branding patch:

```json
{
  "companyName": "Acme",
  "productName": "YDeck",
  "logoUrl": "https://example.com/logo.png",
  "primaryColor": "#4f46e5",
  "accentColor": "#06b6d4"
}
```

## How Settings Affect Generation

During generation, the agent reads workspace context through the
`read_workspace_context`, `read_user_preferences`, and `read_brand_kit` tools.
These settings guide:

- deck language
- default deck type
- default style/design system
- default slide count when the prompt does not specify one
- company/product naming
- brand colors
- logo usage

The user's explicit prompt always wins. For example, if settings say
`defaultSlideCount: 10` but the prompt says "make 5 slides", the generation flow
should use 5 slides.
