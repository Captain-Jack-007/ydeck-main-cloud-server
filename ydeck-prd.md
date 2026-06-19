# PRD: YDeck Main Server

## 1. Product Name

**YDeck Main Server**

The YDeck Main Server is the central cloud backend that manages accounts, authentication, licensing, device pairing, cloud agent execution, plugin/template distribution, team workspaces, billing, and integrations with WhatsApp, Telegram, Discord, and the YDeck web app.

This server is **not the same as the local YDeck server**. The local server runs on the user’s device for private/offline deck generation. The main server controls the cloud ecosystem around it.

---

# 2. Product Vision

YDeck should offer users two powerful modes:

```text
Private Mode:
Runs locally on the user’s device.
Files, prompts, and PPT content stay private.

Cloud Mode:
Runs on YDeck cloud.
Accessible from web, WhatsApp, Telegram, Discord, and later API.
```

The Main Server connects both modes under one YDeck account.

The user should be able to:

```text
Create an account
Connect private agent devices
Use cloud agent if enabled
Install templates and plugins
Manage teams and billing
Access YDeck from social platforms
Control privacy and data permissions
```

---

# 3. Main Server Responsibilities

The YDeck Main Server should handle:

```text
1. User authentication
2. Team and workspace management
3. Device pairing for private agents
4. License and subscription validation
5. Cloud agent orchestration
6. Template and plugin distribution
7. Social platform integrations
8. File/project sync, only when user allows
9. Billing and plan limits
10. Admin dashboard
11. API gateway
12. Security, audit logs, and usage tracking
```

The Main Server should **not** directly control the local user’s files unless the user explicitly enables cloud sync.

---

# 4. Core Architecture

```text
YDeck Web App
        ↓
YDeck Main Server
        ↓
Auth / Users / Teams / Billing / Devices / Plugins
        ↓
Cloud Agent Service
        ↓
Storage / Queue / Model Gateway / PPT Renderer
```

For private agent:

```text
User Device
        ↓
Local YDeck Server
        ↓
Private Agent
        ↓
YDeck Main Server
        ↓
License / Device Auth / Plugin Sync
```

For social access:

```text
WhatsApp / Telegram / Discord
        ↓
YDeck Social Gateway
        ↓
YDeck Main Server
        ↓
Cloud Agent
```

---

# 5. Users

## 5.1 Individual User

Example:

```text
Founder
Student
Teacher
Consultant
Investor
Government officer
```

They can use YDeck to generate PPTs from prompts, documents, notes, or structured workflows.

## 5.2 Team User

Example:

```text
Startup team
Company
School
Accelerator
Investment fund
Government department
```

They can invite members, share templates, manage cloud credits, and connect private agents.

## 5.3 Admin User

YDeck internal team member who can manage users, plans, templates, plugins, usage, abuse reports, and support issues.

---

# 6. Product Modes

## 6.1 Private Mode

Private Mode runs through the local YDeck server.

Main Server role:

```text
Authenticate account
Activate license
Pair device
Validate subscription
Sync templates/plugins
Send software updates
Receive optional usage metadata
Allow device revocation
```

Private Mode should not upload:

```text
User files
Slide content
Prompt content
Generated PPT content
Private documents
```

Unless the user turns on cloud sync.

## 6.2 Cloud Mode

Cloud Mode runs directly on YDeck infrastructure.

Main Server role:

```text
Accept user prompt/files
Create deck job
Run cloud agent pipeline
Generate outline
Generate slide content
Render PPTX
Store result
Let user download/share/export
```

Cloud Mode can be accessed from:

```text
YDeck Web
WhatsApp
Telegram
Discord
API later
```

---

# 7. Main Features

# Feature 1: User Authentication

## Description

Users need one YDeck account for web, private agent, cloud agent, social platforms, and team access.

## Supported Auth Methods for MVP

```text
Email + password
Google login
Magic link optional
```

## Later Auth Methods

```text
WeChat login
GitHub login
Enterprise SSO
```

## Requirements

The server should support:

```text
Register
Login
Logout
Refresh token
Forgot password
Email verification
Change password
Session management
Device/session logout
```

## Recommended Token System

```text
Access Token: short-lived JWT
Refresh Token: long-lived, stored securely
Device Token: for private agent
Pairing Code: temporary connection code
```

---

# Feature 2: Team and Workspace Management

## Description

Users can create or join workspaces.

A workspace can represent:

```text
Personal account
Startup team
Company
School
Accelerator
Investment fund
Government organization
```

## Roles

```text
Owner
Admin
Member
Viewer
Billing Manager
```

## Permissions

```text
Create decks
Use cloud agent
Connect private agent
Install plugins
Manage templates
Invite members
Manage billing
View usage
Delete workspace
```

## MVP Requirements

```text
Create workspace
Invite member by email
Accept invitation
Change member role
Remove member
View workspace usage
```

---

# Feature 2.5: Profile & Workspace Context Module

## Description

The Main Server stores account profile, workspace branding, and generation defaults.

After a local device is paired, the local server can fetch a safe profile/settings context using device authentication. This lets the local settings UI show user and workspace defaults without receiving user auth credentials.

## Ownership Rule

```text
Main Server = source of truth for account, workspace, license, devices, cloud access

Local Server = local app settings, local generation defaults, private runtime config
```

For MVP:

```text
Main Server stores account + workspace + license + branding.
Local Server stores runtime + model + offline/private settings.
Local Server can cache profile/preferences/branding after pairing.
```

## Main Server Should Store

User account:

```text
Full name
Email
Avatar
Login/session info
```

Workspace:

```text
Workspace name
Members
Roles
Plan/license
Connected devices
```

Workspace branding:

```text
Company name
Product name
Logo URL
Primary color
Accent color
```

Cloud/default preferences:

```text
Default language
Default deck type
Default style
Default slide count
```

## Local Server Should Store

Local runtime:

```text
Local model choice
Ollama/llama.cpp path
Local storage folder
Offline mode
CPU/GPU preference
Local template cache
Local privacy settings
Local generation history
Local logs
Local server port
```

## Local Settings UI Labels

The local settings UI can show both main-server and local-only fields, but internally each field should be labeled as one of:

```text
Synced from Main Server
Local only
```

Synced from Main Server:

```text
Full name
Email
Language preferences
Default deck type
Default style
Default slide count
Company name
Product name
Primary color
Accent color
Logo URL
```

Local only:

```text
Local model settings
Local file path
Local server port
Offline mode
Local cache
Local logs
Local generation history
Privacy mode
```

## Device Context Endpoint

Recommended endpoint:

```http
GET /v1/devices/context
X-Device-Token: <deviceToken>
```

The response should include only safe context for the paired workspace:

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

## Security Rules

```text
Do not return password hashes.
Do not return refresh tokens.
Do not return user sessions.
Do not return billing provider secrets.
Do not return private local file paths.
Only return context for the workspace attached to the device token.
```

---

# Feature 3: Private Agent Device Pairing

## Description

The private agent should connect to the main server using a secure device pairing system.

The private agent should not ask for the user’s password directly.

## Recommended MVP Flow

```text
1. User logs in to YDeck Web.
2. User opens “Devices”.
3. User clicks “Connect Private Agent”.
4. Server generates a 6-digit pairing code.
5. User opens local YDeck Agent.
6. Agent asks for pairing code.
7. Agent sends pairing code to Main Server.
8. Server verifies code.
9. Server creates a device record.
10. Server returns a device token.
11. Local agent stores device token securely.
12. Device appears in user dashboard.
```

## Pairing Code Rules

```text
Code length: 6 digits
Expiry: 10 minutes
Single use only
Rate limited
Stored as hash, not plain text
```

## Device Dashboard Should Show

```text
Device name
Operating system
App version
Status
Last seen
Private mode enabled
Cloud sync enabled/disabled
Revoke button
```

## Device Token Rules

```text
Long-lived token
Stored securely on device
Can be revoked by user
Can be rotated
Should be hashed in database
```

---

# Feature 4: License and Subscription Validation

## Description

The Main Server controls which users can use YDeck features.

## Plans Example

```text
Free
Pro
Team
Enterprise
Education
Government
```

## Main Server Should Control

```text
Private agent activation
Number of connected devices
Cloud generation credits
Template/plugin access
Cloud storage limit
Team member limit
Export limits
API access
Social platform access
```

## Offline License Logic

Since YDeck’s private agent should work offline, the local agent should not require constant internet.

Recommended logic:

```text
Private Agent can work offline for 7 / 14 / 30 days.
Agent needs to check license again after license window expires.
```

For MVP:

```text
Free: no private agent or limited private agent
Pro: 1 private device
Team: 3–10 private devices
Enterprise: custom devices
```

---

# Feature 5: Cloud Agent Job System

## Description

Cloud Mode needs a job system for generating decks on the server.

## Job Flow

```text
User submits request
        ↓
Main Server creates deck job
        ↓
Queue receives job
        ↓
Cloud Agent processes job
        ↓
PPT renderer generates file
        ↓
Result stored
        ↓
User receives download link
```

## Job Types

```text
Generate deck from prompt
Generate deck from uploaded file
Improve existing deck
Rewrite slide content
Apply new template
Export PPTX
Export PDF
Generate speaker notes
Generate investor pitch version
Generate education version
```

## Job Statuses

```text
queued
planning
generating_outline
generating_slides
rendering
reviewing
completed
failed
cancelled
```

## Job Progress UI

The server should send real-time progress to the frontend.

Recommended:

```text
WebSocket or Server-Sent Events
```

Example progress:

```text
Analyzing request
Creating outline
Writing slide 1 of 10
Applying design
Checking quality
Rendering PPTX
Completed
```

---

# Feature 6: Cloud Agent Pipeline

## Description

The Main Server should orchestrate cloud agents.

Recommended pipeline:

```text
Prompt Understanding Agent
        ↓
Deck Planner Agent
        ↓
Slide Content Agent
        ↓
Design Selection Agent
        ↓
PPT Render Agent
        ↓
Quality Review Agent
        ↓
Export Agent
```

For the future autonomous build system:

```text
Product Agent
Frontend Agent
Backend Agent
Design QA Agent
Test Agent
Code Review Agent
Deploy Agent
```

But for the main YDeck server MVP, focus on PPT generation first.

## Agent Output Should Be Structured

Use JSON schema.

Example:

```json
{
  "deckTitle": "AI Startup Pitch Deck",
  "deckType": "investor_pitch",
  "slides": [
    {
      "slideNumber": 1,
      "sectionLabel": "Problem",
      "title": "Founders waste time creating investor-ready decks",
      "layoutId": "problem_statement_01",
      "bullets": [
        "Pitch decks take days to prepare",
        "Design quality is inconsistent",
        "Generic AI tools do not understand investor logic"
      ],
      "speakerNotes": "Explain why deck creation is still painful for early-stage founders."
    }
  ]
}
```

---

# Feature 7: Template and Plugin System

## Description

The Main Server should distribute official and third-party template/plugin packs.

## Template Pack

A template pack can include:

```text
Slide layouts
Theme colors
Fonts
Design rules
Cover styles
Icon sets
Chart styles
Example decks
```

## Plugin Pack

A plugin can add:

```text
New deck type
New slide layouts
New export format
New agent workflow
New business logic
New data connector
```

## Main Server Responsibilities

```text
List available packs
Check user permission
Install to cloud workspace
Allow local private agent to download packs
Manage versions
Revoke unsafe plugins
Show changelog
```

## MVP Plugin System

For MVP, keep it simple.

```text
Official template packs only
No third-party plugin marketplace yet
Local agent can download official packs after license check
```

Later:

```text
Plugin marketplace
Developer accounts
Plugin review process
Revenue sharing
Enterprise private plugins
```

---

# Feature 8: Social Platform Integration

## Description

Users can access YDeck Cloud Agent from social platforms.

Supported channels:

```text
Telegram
Discord
WhatsApp
```

Recommended launch order:

```text
1. Telegram
2. Discord
3. WhatsApp
```

Reason: Telegram and Discord are easier to test. WhatsApp Business API is more controlled and may require approval.

## Social Account Linking Flow

```text
User logs in to YDeck Web
        ↓
User opens Integrations
        ↓
User selects Telegram / Discord / WhatsApp
        ↓
Server creates linking code
        ↓
User sends code to bot
        ↓
Server connects provider_user_id to YDeck user_id
```

## Social Commands

Example:

```text
/create pitch deck about my AI startup
/status
/templates
/mydecks
/help
```

## Social Account Database

```text
social_accounts
- id
- user_id
- workspace_id
- provider
- provider_user_id
- provider_username
- status
- linked_at
- last_used_at
```

## Security Rule

Social channels should only use Cloud Mode.

Private Mode should not be controlled directly from WhatsApp/Telegram/Discord unless the user installs a secure relay later.

---

# Feature 9: File and Project Storage

## Description

The Main Server should store cloud projects, uploaded files, and generated outputs only for Cloud Mode.

## Storage Types

```text
Uploaded documents
Generated PPTX files
Generated PDF files
Deck JSON
Thumbnail images
Export history
```

## Privacy Modes

Each project should have a privacy setting:

```text
Private local only
Cloud project
Team shared
Public link
```

## Important Rule

For Private Mode:

```text
The server should not store user content by default.
```

For Cloud Mode:

```text
The server stores content because the cloud agent needs it.
```

---

# Feature 10: Billing and Usage Limits

## Description

The Main Server should track plans, subscriptions, credits, and usage.

## Trackable Usage

```text
Cloud deck generations
Cloud storage
Number of private devices
Number of team members
Template downloads
Plugin installs
Social platform requests
API calls
Export count
```

## Example Plans

### Free

```text
3 cloud decks/month
Basic templates
No private agent or limited local trial
Watermark exports
```

### Pro

```text
Unlimited local private mode
1 private device
50 cloud decks/month
Premium templates
No watermark
Telegram access
```

### Team

```text
5 team members
5 private devices
200 cloud decks/month
Shared templates
Team workspace
Discord access
```

### Enterprise

```text
Custom team size
Custom private deployment
Custom plugin packs
Priority support
SSO
Admin controls
Dedicated cloud option
```

---

# Feature 11: Admin Dashboard

## Description

YDeck internal team needs an admin dashboard.

## Admin Features

```text
View users
View workspaces
View devices
View subscriptions
View cloud jobs
View failed jobs
Manage templates
Manage plugins
Manage social integrations
Issue manual credits
Disable abusive accounts
Revoke devices
View system health
```

## Admin Roles

```text
Super Admin
Support Admin
Billing Admin
Content Admin
Developer Admin
```

---

# 8. Database Design

## users

```sql
id
email
password_hash
name
avatar_url
email_verified_at
status
created_at
updated_at
```

## workspaces

```sql
id
name
type
owner_id
plan_id
created_at
updated_at
```

## workspace_branding

```sql
id
workspace_id
company_name
product_name
logo_url
primary_color
accent_color
created_at
updated_at
```

## workspace_preferences

```sql
id
workspace_id
default_language
default_deck_type
default_style
default_slide_count
created_at
updated_at
```

## workspace_members

```sql
id
workspace_id
user_id
role
status
invited_by
joined_at
created_at
```

## sessions

```sql
id
user_id
refresh_token_hash
ip_address
user_agent
expires_at
revoked_at
created_at
```

## devices

```sql
id
user_id
workspace_id
device_name
device_type
os
app_version
device_token_hash
status
last_seen_at
license_valid_until
revoked_at
created_at
updated_at
```

## pairing_codes

```sql
id
user_id
workspace_id
code_hash
expires_at
used_at
created_at
```

## subscriptions

```sql
id
workspace_id
plan
status
billing_provider
billing_customer_id
current_period_start
current_period_end
created_at
updated_at
```

## usage_records

```sql
id
workspace_id
user_id
usage_type
quantity
metadata_json
created_at
```

## deck_projects

```sql
id
workspace_id
user_id
title
deck_type
mode
status
privacy_level
created_at
updated_at
```

## deck_jobs

```sql
id
project_id
workspace_id
user_id
job_type
status
progress
input_json
output_json
error_message
created_at
updated_at
completed_at
```

## files

```sql
id
workspace_id
user_id
project_id
file_type
file_name
file_url
storage_key
size_bytes
created_at
```

## template_packs

```sql
id
name
description
version
visibility
required_plan
status
created_at
updated_at
```

## plugin_packs

```sql
id
name
description
version
developer_id
visibility
required_plan
status
created_at
updated_at
```

## installed_packs

```sql
id
workspace_id
pack_type
pack_id
version
installed_by
installed_at
```

## social_accounts

```sql
id
user_id
workspace_id
provider
provider_user_id
provider_username
status
linked_at
last_used_at
created_at
```

## audit_logs

```sql
id
workspace_id
user_id
action
resource_type
resource_id
ip_address
metadata_json
created_at
```

---

# 9. API Structure

## Auth APIs

```http
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/refresh
POST /api/auth/forgot-password
POST /api/auth/reset-password
POST /api/auth/verify-email
GET  /api/auth/me
```

## Workspace APIs

```http
POST /api/workspaces
GET  /api/workspaces
GET  /api/workspaces/:id
PATCH /api/workspaces/:id
DELETE /api/workspaces/:id

POST /api/workspaces/:id/invite
GET  /api/workspaces/:id/members
PATCH /api/workspaces/:id/members/:memberId
DELETE /api/workspaces/:id/members/:memberId
```

## Device APIs

```http
POST /api/devices/pairing-code
POST /api/devices/activate
GET  /api/devices/context
GET  /api/devices
GET  /api/devices/:id
PATCH /api/devices/:id
POST /api/devices/:id/revoke
POST /api/devices/:id/heartbeat
POST /api/devices/:id/license-check
```

## Cloud Deck APIs

```http
POST /api/decks
GET  /api/decks
GET  /api/decks/:id
PATCH /api/decks/:id
DELETE /api/decks/:id

POST /api/decks/:id/jobs
GET  /api/jobs/:id
POST /api/jobs/:id/cancel
GET  /api/jobs/:id/events
```

## Template and Plugin APIs

```http
GET  /api/templates
GET  /api/templates/:id
POST /api/templates/:id/install

GET  /api/plugins
GET  /api/plugins/:id
POST /api/plugins/:id/install
```

## Social Integration APIs

```http
GET  /api/integrations
POST /api/integrations/:provider/link-code
POST /api/integrations/:provider/unlink
POST /api/webhooks/telegram
POST /api/webhooks/discord
POST /api/webhooks/whatsapp
```

## Billing APIs

```http
GET  /api/billing/plans
GET  /api/billing/subscription
POST /api/billing/checkout
POST /api/billing/cancel
POST /api/billing/webhook
```

## Admin APIs

```http
GET /api/admin/users
GET /api/admin/workspaces
GET /api/admin/devices
GET /api/admin/jobs
GET /api/admin/usage
POST /api/admin/users/:id/disable
POST /api/admin/devices/:id/revoke
```

---

# 10. Privacy Requirements

This is very important for YDeck’s positioning.

## Private Mode Promise

YDeck should clearly say:

```text
In Private Mode, your files, prompts, and generated slides stay on your device.
```

The Main Server may receive:

```text
License check
Device ID
App version
Template/plugin download request
Optional anonymous usage statistics
```

The Main Server should not receive:

```text
Uploaded files
Prompt content
Slide content
Generated PPTX
Local folder paths
Private document text
```

Unless user enables cloud sync.

## Cloud Mode Promise

YDeck should clearly say:

```text
In Cloud Mode, your content is processed on YDeck servers to generate your presentation.
```

---

# 11. Security Requirements

## Authentication Security

```text
Hash passwords with Argon2 or bcrypt
Use short-lived access tokens
Use refresh token rotation
Store refresh tokens hashed
Support email verification
Support password reset securely
```

## Device Security

```text
Store device tokens hashed in database
Allow user to revoke devices
Use pairing codes with short expiry
Rate limit pairing attempts
Rotate device tokens if suspicious
```

## API Security

```text
Rate limiting
Input validation
Audit logging
Role-based access control
Workspace-level authorization
Webhook signature validation
File upload scanning
```

## Admin Security

```text
Admin 2FA
Admin audit logs
Least privilege roles
Sensitive action confirmation
```

---

# 12. MVP Scope

## MVP Must Have

```text
User register/login
JWT auth
Workspace creation
Device pairing code
Private agent activation
License check endpoint
Device heartbeat
Cloud deck job creation
Cloud deck job status
Basic PPTX result storage
Template list/download
Basic admin dashboard
Telegram integration
Usage tracking
```

## MVP Should Not Include Yet

```text
Full plugin marketplace
Enterprise SSO
WhatsApp production integration
Public API marketplace
Advanced team permissions
Third-party template sellers
Complex billing automation
```

---

# 13. Recommended Tech Stack

Because you already have a local YDeck server, the main server should be clean, scalable, and API-first.

## Backend

```text
Node.js + NestJS
or
Node.js + Express/Fastify
```

Recommended:

```text
NestJS
```

Reason:

```text
Good structure
Good for auth modules
Good for microservices later
Good for team development
```

## Database

```text
PostgreSQL
```

Better than MongoDB for:

```text
Users
Teams
Permissions
Billing
Devices
Audit logs
Subscriptions
```

## Queue

```text
Redis + BullMQ
```

Used for:

```text
Cloud deck generation
Export jobs
Email sending
Social message jobs
Plugin/template processing
```

## Storage

```text
S3-compatible storage
```

Options:

```text
AWS S3
Cloudflare R2
Alibaba Cloud OSS
Tencent COS
MinIO for self-hosted
```

## Realtime

```text
WebSocket
or
Server-Sent Events
```

For job progress.

## Auth

```text
JWT access token
Refresh token rotation
Device token
Pairing code
```

## Billing

```text
Stripe for global users
Paddle alternative
Manual invoice for China/enterprise
WeChat Pay/Alipay later
```

---

# 14. System Services

The Main Server can be separated into modules:

```text
Auth Service
User Service
Workspace Service
Device Service
License Service
Deck Job Service
Cloud Agent Gateway
Template Service
Plugin Service
Social Gateway
Billing Service
Admin Service
Notification Service
Audit Log Service
```

For MVP, these can be modules inside one backend.

Later, they can become separate microservices.

---

# 15. Main Server vs Local Server

## Main Server

```text
Cloud-based
Manages users
Manages licenses
Manages devices
Runs cloud agent
Stores cloud projects
Handles billing
Handles social integrations
Distributes templates/plugins
```

## Local YDeck Server

```text
Runs on user device
Generates PPT privately
Uses local LLM
Uses local templates
Reads local files
Works offline
Stores local projects
Connects to Main Server only for license/plugin sync
```

## Communication Between Them

```text
Local Server → Main Server:
License check
Device heartbeat
Template/plugin sync
Version update check
Optional anonymous usage

Main Server → Local Server:
License response
Available template/plugin packs
Software update info
Device revocation signal
```

The Main Server should not directly access the local server unless the user enables remote control in the future.

---

# 16. Example User Flows

## Flow 1: New User Uses Web Cloud Mode

```text
1. User opens YDeck Web.
2. User registers.
3. User creates workspace.
4. User enters prompt: “Create pitch deck for my AI startup.”
5. Main Server creates deck job.
6. Cloud Agent generates deck.
7. User downloads PPTX.
```

## Flow 2: User Connects Private Agent

```text
1. User downloads YDeck Private Agent.
2. User logs in to YDeck Web.
3. User clicks “Connect Private Agent.”
4. Web shows pairing code.
5. User enters code in local app.
6. Main Server validates code.
7. Private Agent is activated.
8. User generates PPT locally.
```

## Flow 3: User Uses Telegram

```text
1. User links Telegram in YDeck Web.
2. User sends message to YDeck bot.
3. Bot sends message to Social Gateway.
4. Main Server identifies user.
5. Cloud Agent creates deck.
6. User receives download link.
```

## Flow 4: User Installs Template Pack

```text
1. User opens Template Store.
2. User chooses “Investor Pitch Pack.”
3. Main Server checks plan.
4. Pack is installed to workspace.
5. Private Agent syncs pack during next online check.
```

---

# 17. Success Metrics

## Product Metrics

```text
Registered users
Activated private agents
Cloud decks generated
Private devices connected
Templates installed
Social accounts linked
Conversion from free to paid
Monthly active users
```

## Technical Metrics

```text
API uptime
Average job completion time
Failed job rate
Average cloud deck generation cost
Queue waiting time
License check latency
Device heartbeat reliability
```

## Privacy Metrics

```text
Percentage of users using Private Mode
Percentage of cloud sync opt-in
Number of device revocations
Number of privacy-related support tickets
```

---

# 18. Risks and Solutions

## Risk 1: Private Mode Confuses Users

Users may not understand the difference between private and cloud mode.

Solution:

```text
Show mode selector clearly:
[Private Agent] Files stay on your device
[Cloud Agent] Faster, accessible anywhere
```

## Risk 2: Local Agent License Abuse

Users may share local activation tokens.

Solution:

```text
Device fingerprint
Device limit
Token rotation
Heartbeat
Revocation
Offline license expiry window
```

## Risk 3: Social Platform Abuse

Users may spam deck generation through bots.

Solution:

```text
Rate limits
Credits
Command limits
Provider verification
Abuse detection
```

## Risk 4: Plugin Security

Plugins may introduce unsafe behavior.

Solution:

```text
Official plugins only for MVP
Signed plugin packages
Plugin review system later
Sandboxing later
```

## Risk 5: Cloud Cost Too High

Cloud generation may become expensive.

Solution:

```text
Queue limits
Credit system
Model routing
Small model for simple tasks
Large model only for premium users
Caching templates
Separate rendering from reasoning
```

---

# 19. Development Phases

## Phase 1: Core Account + Device System

```text
Auth
Users
Workspaces
Device pairing
License check
Device heartbeat
Basic admin dashboard
```

## Phase 2: Cloud Deck Generation

```text
Deck projects
Deck jobs
Queue
Cloud agent
PPT renderer
File storage
Job progress
Download result
```

## Phase 3: Template Distribution

```text
Template pack registry
Install template
Private agent sync
Version control
Plan-based access
```

## Phase 4: Social Gateway

```text
Telegram bot
Discord bot
WhatsApp later
Social account linking
Cloud generation from chat
```

## Phase 5: Billing

```text
Plans
Usage limits
Stripe/Paddle
Manual enterprise billing
Credit system
```

## Phase 6: Plugin Marketplace

```text
Plugin registry
Plugin install
Developer upload
Review system
Revenue share
Enterprise private plugins
```

---

# 20. Final MVP Recommendation

For the first Main Server version, build this exact scope:

```text
1. YDeck account system
2. Workspace system
3. Device pairing for private agent
4. License validation
5. Template sync
6. Cloud deck generation job system
7. Basic cloud storage
8. Telegram bot integration
9. Usage tracking
10. Admin dashboard
```

This gives YDeck a strong foundation:

````text
One account# PRD: YDeck Main Server

## 1. Product Name

**YDeck Main Server**

The YDeck Main Server is the central cloud backend that manages accounts, authentication, licensing, device pairing, cloud agent execution, plugin/template distribution, team workspaces, billing, and integrations with WhatsApp, Telegram, Discord, and the YDeck web app.

This server is **not the same as the local YDeck server**. The local server runs on the user’s device for private/offline deck generation. The main server controls the cloud ecosystem around it.

---

# 2. Product Vision

YDeck should offer users two powerful modes:

```text
Private Mode:
Runs locally on the user’s device.
Files, prompts, and PPT content stay private.

Cloud Mode:
Runs on YDeck cloud.
Accessible from web, WhatsApp, Telegram, Discord, and later API.
````

The Main Server connects both modes under one YDeck account.

The user should be able to:

```text
Create an account
Connect private agent devices
Use cloud agent if enabled
Install templates and plugins
Manage teams and billing
Access YDeck from social platforms
Control privacy and data permissions
```

---

# 3. Main Server Responsibilities

The YDeck Main Server should handle:

```text
1. User authentication
2. Team and workspace management
3. Device pairing for private agents
4. License and subscription validation
5. Cloud agent orchestration
6. Template and plugin distribution
7. Social platform integrations
8. File/project sync, only when user allows
9. Billing and plan limits
10. Admin dashboard
11. API gateway
12. Security, audit logs, and usage tracking
```

The Main Server should **not** directly control the local user’s files unless the user explicitly enables cloud sync.

---

# 4. Core Architecture

```text
YDeck Web App
        ↓
YDeck Main Server
        ↓
Auth / Users / Teams / Billing / Devices / Plugins
        ↓
Cloud Agent Service
        ↓
Storage / Queue / Model Gateway / PPT Renderer
```

For private agent:

```text
User Device
        ↓
Local YDeck Server
        ↓
Private Agent
        ↓
YDeck Main Server
        ↓
License / Device Auth / Plugin Sync
```

For social access:

```text
WhatsApp / Telegram / Discord
        ↓
YDeck Social Gateway
        ↓
YDeck Main Server
        ↓
Cloud Agent
```

---

# 5. Users

## 5.1 Individual User

Example:

```text
Founder
Student
Teacher
Consultant
Investor
Government officer
```

They can use YDeck to generate PPTs from prompts, documents, notes, or structured workflows.

## 5.2 Team User

Example:

```text
Startup team
Company
School
Accelerator
Investment fund
Government department
```

They can invite members, share templates, manage cloud credits, and connect private agents.

## 5.3 Admin User

YDeck internal team member who can manage users, plans, templates, plugins, usage, abuse reports, and support issues.

---

# 6. Product Modes

## 6.1 Private Mode

Private Mode runs through the local YDeck server.

Main Server role:

```text
Authenticate account
Activate license
Pair device
Validate subscription
Sync templates/plugins
Send software updates
Receive optional usage metadata
Allow device revocation
```

Private Mode should not upload:

```text
User files
Slide content
Prompt content
Generated PPT content
Private documents
```

Unless the user turns on cloud sync.

## 6.2 Cloud Mode

Cloud Mode runs directly on YDeck infrastructure.

Main Server role:

```text
Accept user prompt/files
Create deck job
Run cloud agent pipeline
Generate outline
Generate slide content
Render PPTX
Store result
Let user download/share/export
```

Cloud Mode can be accessed from:

```text
YDeck Web
WhatsApp
Telegram
Discord
API later
```

---

# 7. Main Features

# Feature 1: User Authentication

## Description

Users need one YDeck account for web, private agent, cloud agent, social platforms, and team access.

## Supported Auth Methods for MVP

```text
Email + password
Google login
Magic link optional
```

## Later Auth Methods

```text
WeChat login
GitHub login
Enterprise SSO
```

## Requirements

The server should support:

```text
Register
Login
Logout
Refresh token
Forgot password
Email verification
Change password
Session management
Device/session logout
```

## Recommended Token System

```text
Access Token: short-lived JWT
Refresh Token: long-lived, stored securely
Device Token: for private agent
Pairing Code: temporary connection code
```

---

# Feature 2: Team and Workspace Management

## Description

Users can create or join workspaces.

A workspace can represent:

```text
Personal account
Startup team
Company
School
Accelerator
Investment fund
Government organization
```

## Roles

```text
Owner
Admin
Member
Viewer
Billing Manager
```

## Permissions

```text
Create decks
Use cloud agent
Connect private agent
Install plugins
Manage templates
Invite members
Manage billing
View usage
Delete workspace
```

## MVP Requirements

```text
Create workspace
Invite member by email
Accept invitation
Change member role
Remove member
View workspace usage
```

---

# Feature 3: Private Agent Device Pairing

## Description

The private agent should connect to the main server using a secure device pairing system.

The private agent should not ask for the user’s password directly.

## Recommended MVP Flow

```text
1. User logs in to YDeck Web.
2. User opens “Devices”.
3. User clicks “Connect Private Agent”.
4. Server generates a 6-digit pairing code.
5. User opens local YDeck Agent.
6. Agent asks for pairing code.
7. Agent sends pairing code to Main Server.
8. Server verifies code.
9. Server creates a device record.
10. Server returns a device token.
11. Local agent stores device token securely.
12. Device appears in user dashboard.
```

## Pairing Code Rules

```text
Code length: 6 digits
Expiry: 10 minutes
Single use only
Rate limited
Stored as hash, not plain text
```

## Device Dashboard Should Show

```text
Device name
Operating system
App version
Status
Last seen
Private mode enabled
Cloud sync enabled/disabled
Revoke button
```

## Device Token Rules

```text
Long-lived token
Stored securely on device
Can be revoked by user
Can be rotated
Should be hashed in database
```

---

# Feature 4: License and Subscription Validation

## Description

The Main Server controls which users can use YDeck features.

## Plans Example

```text
Free
Pro
Team
Enterprise
Education
Government
```

## Main Server Should Control

```text
Private agent activation
Number of connected devices
Cloud generation credits
Template/plugin access
Cloud storage limit
Team member limit
Export limits
API access
Social platform access
```

## Offline License Logic

Since YDeck’s private agent should work offline, the local agent should not require constant internet.

Recommended logic:

```text
Private Agent can work offline for 7 / 14 / 30 days.
Agent needs to check license again after license window expires.
```

For MVP:

```text
Free: no private agent or limited private agent
Pro: 1 private device
Team: 3–10 private devices
Enterprise: custom devices
```

---

# Feature 5: Cloud Agent Job System

## Description

Cloud Mode needs a job system for generating decks on the server.

## Job Flow

```text
User submits request
        ↓
Main Server creates deck job
        ↓
Queue receives job
        ↓
Cloud Agent processes job
        ↓
PPT renderer generates file
        ↓
Result stored
        ↓
User receives download link
```

## Job Types

```text
Generate deck from prompt
Generate deck from uploaded file
Improve existing deck
Rewrite slide content
Apply new template
Export PPTX
Export PDF
Generate speaker notes
Generate investor pitch version
Generate education version
```

## Job Statuses

```text
queued
planning
generating_outline
generating_slides
rendering
reviewing
completed
failed
cancelled
```

## Job Progress UI

The server should send real-time progress to the frontend.

Recommended:

```text
WebSocket or Server-Sent Events
```

Example progress:

```text
Analyzing request
Creating outline
Writing slide 1 of 10
Applying design
Checking quality
Rendering PPTX
Completed
```

---

# Feature 6: Cloud Agent Pipeline

## Description

The Main Server should orchestrate cloud agents.

Recommended pipeline:

```text
Prompt Understanding Agent
        ↓
Deck Planner Agent
        ↓
Slide Content Agent
        ↓
Design Selection Agent
        ↓
PPT Render Agent
        ↓
Quality Review Agent
        ↓
Export Agent
```

For the future autonomous build system:

```text
Product Agent
Frontend Agent
Backend Agent
Design QA Agent
Test Agent
Code Review Agent
Deploy Agent
```

But for the main YDeck server MVP, focus on PPT generation first.

## Agent Output Should Be Structured

Use JSON schema.

Example:

```json
{
  "deckTitle": "AI Startup Pitch Deck",
  "deckType": "investor_pitch",
  "slides": [
    {
      "slideNumber": 1,
      "sectionLabel": "Problem",
      "title": "Founders waste time creating investor-ready decks",
      "layoutId": "problem_statement_01",
      "bullets": [
        "Pitch decks take days to prepare",
        "Design quality is inconsistent",
        "Generic AI tools do not understand investor logic"
      ],
      "speakerNotes": "Explain why deck creation is still painful for early-stage founders."
    }
  ]
}
```

---

# Feature 7: Template and Plugin System

## Description

The Main Server should distribute official and third-party template/plugin packs.

## Template Pack

A template pack can include:

```text
Slide layouts
Theme colors
Fonts
Design rules
Cover styles
Icon sets
Chart styles
Example decks
```

## Plugin Pack

A plugin can add:

```text
New deck type
New slide layouts
New export format
New agent workflow
New business logic
New data connector
```

## Main Server Responsibilities

```text
List available packs
Check user permission
Install to cloud workspace
Allow local private agent to download packs
Manage versions
Revoke unsafe plugins
Show changelog
```

## MVP Plugin System

For MVP, keep it simple.

```text
Official template packs only
No third-party plugin marketplace yet
Local agent can download official packs after license check
```

Later:

```text
Plugin marketplace
Developer accounts
Plugin review process
Revenue sharing
Enterprise private plugins
```

---

# Feature 8: Social Platform Integration

## Description

Users can access YDeck Cloud Agent from social platforms.

Supported channels:

```text
Telegram
Discord
WhatsApp
```

Recommended launch order:

```text
1. Telegram
2. Discord
3. WhatsApp
```

Reason: Telegram and Discord are easier to test. WhatsApp Business API is more controlled and may require approval.

## Social Account Linking Flow

```text
User logs in to YDeck Web
        ↓
User opens Integrations
        ↓
User selects Telegram / Discord / WhatsApp
        ↓
Server creates linking code
        ↓
User sends code to bot
        ↓
Server connects provider_user_id to YDeck user_id
```

## Social Commands

Example:

```text
/create pitch deck about my AI startup
/status
/templates
/mydecks
/help
```

## Social Account Database

```text
social_accounts
- id
- user_id
- workspace_id
- provider
- provider_user_id
- provider_username
- status
- linked_at
- last_used_at
```

## Security Rule

Social channels should only use Cloud Mode.

Private Mode should not be controlled directly from WhatsApp/Telegram/Discord unless the user installs a secure relay later.

---

# Feature 9: File and Project Storage

## Description

The Main Server should store cloud projects, uploaded files, and generated outputs only for Cloud Mode.

## Storage Types

```text
Uploaded documents
Generated PPTX files
Generated PDF files
Deck JSON
Thumbnail images
Export history
```

## Privacy Modes

Each project should have a privacy setting:

```text
Private local only
Cloud project
Team shared
Public link
```

## Important Rule

For Private Mode:

```text
The server should not store user content by default.
```

For Cloud Mode:

```text
The server stores content because the cloud agent needs it.
```

---

# Feature 10: Billing and Usage Limits

## Description

The Main Server should track plans, subscriptions, credits, and usage.

## Trackable Usage

```text
Cloud deck generations
Cloud storage
Number of private devices
Number of team members
Template downloads
Plugin installs
Social platform requests
API calls
Export count
```

## Example Plans

### Free

```text
3 cloud decks/month
Basic templates
No private agent or limited local trial
Watermark exports
```

### Pro

```text
Unlimited local private mode
1 private device
50 cloud decks/month
Premium templates
No watermark
Telegram access
```

### Team

```text
5 team members
5 private devices
200 cloud decks/month
Shared templates
Team workspace
Discord access
```

### Enterprise

```text
Custom team size
Custom private deployment
Custom plugin packs
Priority support
SSO
Admin controls
Dedicated cloud option
```

---

# Feature 11: Admin Dashboard

## Description

YDeck internal team needs an admin dashboard.

## Admin Features

```text
View users
View workspaces
View devices
View subscriptions
View cloud jobs
View failed jobs
Manage templates
Manage plugins
Manage social integrations
Issue manual credits
Disable abusive accounts
Revoke devices
View system health
```

## Admin Roles

```text
Super Admin
Support Admin
Billing Admin
Content Admin
Developer Admin
```

---

# 8. Database Design

## users

```sql
id
email
password_hash
name
avatar_url
email_verified_at
status
created_at
updated_at
```

## workspaces

```sql
id
name
type
owner_id
plan_id
created_at
updated_at
```

## workspace_members

```sql
id
workspace_id
user_id
role
status
invited_by
joined_at
created_at
```

## sessions

```sql
id
user_id
refresh_token_hash
ip_address
user_agent
expires_at
revoked_at
created_at
```

## devices

```sql
id
user_id
workspace_id
device_name
device_type
os
app_version
device_token_hash
status
last_seen_at
license_valid_until
revoked_at
created_at
updated_at
```

## pairing_codes

```sql
id
user_id
workspace_id
code_hash
expires_at
used_at
created_at
```

## subscriptions

```sql
id
workspace_id
plan
status
billing_provider
billing_customer_id
current_period_start
current_period_end
created_at
updated_at
```

## usage_records

```sql
id
workspace_id
user_id
usage_type
quantity
metadata_json
created_at
```

## deck_projects

```sql
id
workspace_id
user_id
title
deck_type
mode
status
privacy_level
created_at
updated_at
```

## deck_jobs

```sql
id
project_id
workspace_id
user_id
job_type
status
progress
input_json
output_json
error_message
created_at
updated_at
completed_at
```

## files

```sql
id
workspace_id
user_id
project_id
file_type
file_name
file_url
storage_key
size_bytes
created_at
```

## template_packs

```sql
id
name
description
version
visibility
required_plan
status
created_at
updated_at
```

## plugin_packs

```sql
id
name
description
version
developer_id
visibility
required_plan
status
created_at
updated_at
```

## installed_packs

```sql
id
workspace_id
pack_type
pack_id
version
installed_by
installed_at
```

## social_accounts

```sql
id
user_id
workspace_id
provider
provider_user_id
provider_username
status
linked_at
last_used_at
created_at
```

## audit_logs

```sql
id
workspace_id
user_id
action
resource_type
resource_id
ip_address
metadata_json
created_at
```

---

# 9. API Structure

## Auth APIs

```http
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/refresh
POST /api/auth/forgot-password
POST /api/auth/reset-password
POST /api/auth/verify-email
GET  /api/auth/me
```

## Workspace APIs

```http
POST /api/workspaces
GET  /api/workspaces
GET  /api/workspaces/:id
PATCH /api/workspaces/:id
DELETE /api/workspaces/:id

POST /api/workspaces/:id/invite
GET  /api/workspaces/:id/members
PATCH /api/workspaces/:id/members/:memberId
DELETE /api/workspaces/:id/members/:memberId
```

## Device APIs

```http
POST /api/devices/pairing-code
POST /api/devices/activate
GET  /api/devices
GET  /api/devices/:id
PATCH /api/devices/:id
POST /api/devices/:id/revoke
POST /api/devices/:id/heartbeat
POST /api/devices/:id/license-check
```

## Cloud Deck APIs

```http
POST /api/decks
GET  /api/decks
GET  /api/decks/:id
PATCH /api/decks/:id
DELETE /api/decks/:id

POST /api/decks/:id/jobs
GET  /api/jobs/:id
POST /api/jobs/:id/cancel
GET  /api/jobs/:id/events
```

## Template and Plugin APIs

```http
GET  /api/templates
GET  /api/templates/:id
POST /api/templates/:id/install

GET  /api/plugins
GET  /api/plugins/:id
POST /api/plugins/:id/install
```

## Social Integration APIs

```http
GET  /api/integrations
POST /api/integrations/:provider/link-code
POST /api/integrations/:provider/unlink
POST /api/webhooks/telegram
POST /api/webhooks/discord
POST /api/webhooks/whatsapp
```

## Billing APIs

```http
GET  /api/billing/plans
GET  /api/billing/subscription
POST /api/billing/checkout
POST /api/billing/cancel
POST /api/billing/webhook
```

## Admin APIs

```http
GET /api/admin/users
GET /api/admin/workspaces
GET /api/admin/devices
GET /api/admin/jobs
GET /api/admin/usage
POST /api/admin/users/:id/disable
POST /api/admin/devices/:id/revoke
```

---

# 10. Privacy Requirements

This is very important for YDeck’s positioning.

## Private Mode Promise

YDeck should clearly say:

```text
In Private Mode, your files, prompts, and generated slides stay on your device.
```

The Main Server may receive:

```text
License check
Device ID
App version
Template/plugin download request
Optional anonymous usage statistics
```

The Main Server should not receive:

```text
Uploaded files
Prompt content
Slide content
Generated PPTX
Local folder paths
Private document text
```

Unless user enables cloud sync.

## Cloud Mode Promise

YDeck should clearly say:

```text
In Cloud Mode, your content is processed on YDeck servers to generate your presentation.
```

---

# 11. Security Requirements

## Authentication Security

```text
Hash passwords with Argon2 or bcrypt
Use short-lived access tokens
Use refresh token rotation
Store refresh tokens hashed
Support email verification
Support password reset securely
```

## Device Security

```text
Store device tokens hashed in database
Allow user to revoke devices
Use pairing codes with short expiry
Rate limit pairing attempts
Rotate device tokens if suspicious
```

## API Security

```text
Rate limiting
Input validation
Audit logging
Role-based access control
Workspace-level authorization
Webhook signature validation
File upload scanning
```

## Admin Security

```text
Admin 2FA
Admin audit logs
Least privilege roles
Sensitive action confirmation
```

---

# 12. MVP Scope

## MVP Must Have

```text
User register/login
JWT auth
Workspace creation
Device pairing code
Private agent activation
License check endpoint
Device heartbeat
Cloud deck job creation
Cloud deck job status
Basic PPTX result storage
Template list/download
Basic admin dashboard
Telegram integration
Usage tracking
```

## MVP Should Not Include Yet

```text
Full plugin marketplace
Enterprise SSO
WhatsApp production integration
Public API marketplace
Advanced team permissions
Third-party template sellers
Complex billing automation
```

---

# 13. Recommended Tech Stack

Because you already have a local YDeck server, the main server should be clean, scalable, and API-first.

## Backend

```text
Node.js + NestJS
or
Node.js + Express/Fastify
```

Recommended:

```text
NestJS
```

Reason:

```text
Good structure
Good for auth modules
Good for microservices later
Good for team development
```

## Database

```text
PostgreSQL
```

Better than MongoDB for:

```text
Users
Teams
Permissions
Billing
Devices
Audit logs
Subscriptions
```

## Queue

```text
Redis + BullMQ
```

Used for:

```text
Cloud deck generation
Export jobs
Email sending
Social message jobs
Plugin/template processing
```

## Storage

```text
S3-compatible storage
```

Options:

```text
AWS S3
Cloudflare R2
Alibaba Cloud OSS
Tencent COS
MinIO for self-hosted
```

## Realtime

```text
WebSocket
or
Server-Sent Events
```

For job progress.

## Auth

```text
JWT access token
Refresh token rotation
Device token
Pairing code
```

## Billing

```text
Stripe for global users
Paddle alternative
Manual invoice for China/enterprise
WeChat Pay/Alipay later
```

---

# 14. System Services

The Main Server can be separated into modules:

```text
Auth Service
User Service
Workspace Service
Device Service
License Service
Deck Job Service
Cloud Agent Gateway
Template Service
Plugin Service
Social Gateway
Billing Service
Admin Service
Notification Service
Audit Log Service
```

For MVP, these can be modules inside one backend.

Later, they can become separate microservices.

---

# 15. Main Server vs Local Server

## Main Server

```text
Cloud-based
Manages users
Manages licenses
Manages devices
Runs cloud agent
Stores cloud projects
Handles billing
Handles social integrations
Distributes templates/plugins
```

## Local YDeck Server

```text
Runs on user device
Generates PPT privately
Uses local LLM
Uses local templates
Reads local files
Works offline
Stores local projects
Connects to Main Server only for license/plugin sync
```

## Communication Between Them

```text
Local Server → Main Server:
License check
Device heartbeat
Template/plugin sync
Version update check
Optional anonymous usage

Main Server → Local Server:
License response
Available template/plugin packs
Software update info
Device revocation signal
```

The Main Server should not directly access the local server unless the user enables remote control in the future.

---

# 16. Example User Flows

## Flow 1: New User Uses Web Cloud Mode

```text
1. User opens YDeck Web.
2. User registers.
3. User creates workspace.
4. User enters prompt: “Create pitch deck for my AI startup.”
5. Main Server creates deck job.
6. Cloud Agent generates deck.
7. User downloads PPTX.
```

## Flow 2: User Connects Private Agent

```text
1. User downloads YDeck Private Agent.
2. User logs in to YDeck Web.
3. User clicks “Connect Private Agent.”
4. Web shows pairing code.
5. User enters code in local app.
6. Main Server validates code.
7. Private Agent is activated.
8. User generates PPT locally.
```

## Flow 3: User Uses Telegram

```text
1. User links Telegram in YDeck Web.
2. User sends message to YDeck bot.
3. Bot sends message to Social Gateway.
4. Main Server identifies user.
5. Cloud Agent creates deck.
6. User receives download link.
```

## Flow 4: User Installs Template Pack

```text
1. User opens Template Store.
2. User chooses “Investor Pitch Pack.”
3. Main Server checks plan.
4. Pack is installed to workspace.
5. Private Agent syncs pack during next online check.
```

---

# 17. Success Metrics

## Product Metrics

```text
Registered users
Activated private agents
Cloud decks generated
Private devices connected
Templates installed
Social accounts linked
Conversion from free to paid
Monthly active users
```

## Technical Metrics

```text
API uptime
Average job completion time
Failed job rate
Average cloud deck generation cost
Queue waiting time
License check latency
Device heartbeat reliability
```

## Privacy Metrics

```text
Percentage of users using Private Mode
Percentage of cloud sync opt-in
Number of device revocations
Number of privacy-related support tickets
```

---

# 18. Risks and Solutions

## Risk 1: Private Mode Confuses Users

Users may not understand the difference between private and cloud mode.

Solution:

```text
Show mode selector clearly:
[Private Agent] Files stay on your device
[Cloud Agent] Faster, accessible anywhere
```

## Risk 2: Local Agent License Abuse

Users may share local activation tokens.

Solution:

```text
Device fingerprint
Device limit
Token rotation
Heartbeat
Revocation
Offline license expiry window
```

## Risk 3: Social Platform Abuse

Users may spam deck generation through bots.

Solution:

```text
Rate limits
Credits
Command limits
Provider verification
Abuse detection
```

## Risk 4: Plugin Security

Plugins may introduce unsafe behavior.

Solution:

```text
Official plugins only for MVP
Signed plugin packages
Plugin review system later
Sandboxing later
```

## Risk 5: Cloud Cost Too High

Cloud generation may become expensive.

Solution:

```text
Queue limits
Credit system
Model routing
Small model for simple tasks
Large model only for premium users
Caching templates
Separate rendering from reasoning
```

---

# 19. Development Phases

## Phase 1: Core Account + Device System

```text
Auth
Users
Workspaces
Device pairing
License check
Device heartbeat
Basic admin dashboard
```

## Phase 2: Cloud Deck Generation

```text
Deck projects
Deck jobs
Queue
Cloud agent
PPT renderer
File storage
Job progress
Download result
```

## Phase 3: Template Distribution

```text
Template pack registry
Install template
Private agent sync
Version control
Plan-based access
```

## Phase 4: Social Gateway

```text
Telegram bot
Discord bot
WhatsApp later
Social account linking
Cloud generation from chat
```

## Phase 5: Billing

```text
Plans
Usage limits
Stripe/Paddle
Manual enterprise billing
Credit system
```

## Phase 6: Plugin Marketplace

```text
Plugin registry
Plugin install
Developer upload
Review system
Revenue share
Enterprise private plugins
```

---

# 20. Final MVP Recommendation

For the first Main Server version, build this exact scope:

```text
1. YDeck account system
2. Workspace system
3. Device pairing for private agent
4. License validation
5. Template sync
6. Cloud deck generation job system
7. Basic cloud storage
8. Telegram bot integration
9. Usage tracking
10. Admin dashboard
```

This gives YDeck a strong foundation:

```text
One account
Two modes
Private agent for privacy
Cloud agent for convenience
Social access for distribution
Template/plugin system for expansion
```

The Main Server should become the **control center of the YDeck ecosystem**, while the local server remains the **private execution engine**.

Two modes
Private agent for privacy
Cloud agent for convenience
Social access for distribution
Template/plugin system for expansion

```

The Main Server should become the **control center of the YDeck ecosystem**, while the local server remains the **private execution engine**.
```
