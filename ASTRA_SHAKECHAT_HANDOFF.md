# ShakeChat — GPT-6 Astra Handoff

We already have a working project. Do NOT rebuild it from scratch.
Treat the existing repository as the source of truth and continue incrementally.

## Project
Name: ShakeChat

Private communication app for a small friend group. It can have similar functions to Discord, but the UI/visual identity must NOT copy Discord. Keep ShakeChat visually distinct:
- dark graphite / forest tones
- warm amber + mint accents
- card-based navigation
- original sidebar geometry
- terminology such as Alan / Akış / Bölüm
- do not introduce Discord blurple, Discord-like exact rail/sidebar proportions, or copied Discord menu/selection patterns

## Current stack
- React + TypeScript + Vite frontend
- NestJS backend
- Prisma ORM
- PostgreSQL
- Docker Compose
- Redis
- MinIO
- LiveKit
- JWT authentication
- Windows 11 development environment

Local project path:
C:\Users\shake\Downloads\shakechat-mvp-0.1\shakechat

## Infrastructure
Docker services:
- PostgreSQL 16
- Redis 7
- MinIO
- LiveKit

Known local ports:
- Web: http://localhost:5173
- API: http://localhost:4000/api
- LiveKit WebSocket: ws://localhost:7880
- LiveKit TCP: 7881
- LiveKit UDP mux: 7882/udp
- PostgreSQL: 5432
- Redis: 6379
- MinIO: 9000/9001

LiveKit local networking was fixed to advertise 127.0.0.1 and use UDP 7882.
Do not casually change working LiveKit networking.

## Important data safety
The existing PostgreSQL database contains working project data.

Never run destructive reset commands unless the owner explicitly asks to wipe the database.

Do NOT run:
- prisma migrate reset
- docker compose down -v

Prefer non-destructive migrations such as prisma migrate deploy / existing migration scripts.
If Prisma asks to reset the database, stop and explain why instead of accepting.

## Implemented development history

### v0.1–v0.2 Core
- Docker infrastructure
- PostgreSQL / Redis / MinIO / LiveKit
- registration / login / JWT
- server creation
- channel creation
- persisted channel messages
- Socket.IO realtime messaging
- reconnect
- typing
- presence
- permission/access checks
- multi-browser tests

### v0.3 Membership / invites
- invite code/link
- join
- member list
- leave
- kick
- invalid / expired / revoked / max-use invite checks

### v0.4–v0.4.1 Friends + 1:1 DM
- friend requests
- accept/reject/cancel/remove
- friend online/offline
- home/friends view
- 1:1 DMs
- persisted DM history
- realtime DM
- DM typing/reconnect
- backend DM access control
- request rate limiting

### v0.5–v0.5.2 Roles / permissions
- Owner / Admin / Moderator / Member
- custom roles
- role assignment
- channel permission overrides
- backend + WebSocket enforcement
- channel deletion
- message deletion
- moderation hierarchy

Permissions include:
ADMINISTRATOR, MANAGE_SERVER, MANAGE_CHANNELS, MANAGE_ROLES,
KICK_MEMBERS, MANAGE_MESSAGES, MANAGE_INVITES,
VIEW_CHANNEL, SEND_MESSAGES, CONNECT_VOICE, SPEAK
and later BAN_MEMBERS.

### v0.6–v0.6.1 Voice
Implemented with LiveKit:
- voice join/leave
- backend token endpoint
- VIEW_CHANNEL + CONNECT_VOICE enforcement
- SPEAK controls publish
- listen-only users
- mute/unmute
- deafen
- speaking indicator
- participant list
- microphone selection
- speaker selection where supported
- remote audio
- voice persists while navigating
- permission refresh while connected
- disconnect after kick/leave/CONNECT_VOICE loss

Real two-account voice test succeeded.

### v0.7 Camera / screen sharing
- camera on/off
- camera device selection
- screen/window/tab share
- screen-share audio where supported
- multi-video grid
- larger screen-share view
- media controls in voice dock
- camera/screen indicators
- browser-side stop-share synchronization

### v0.8–v0.8.4 Files + advanced messages
Server text channels:
- real MinIO upload
- image preview
- video playback
- PDF/ZIP/file cards
- drag & drop
- paste image upload
- 10 files/message
- 25 MB/file
- MIME/size validation
- randomized object keys
- reply
- edit
- edited indicator
- reactions
- pin
- realtime updates
- attachment cleanup when message deleted

Tests were reported clean after hotfixes.

### v0.9 Product UX + original identity
- @username mentions + suggestions
- unread counts
- mention counters
- optional desktop notifications
- server-wide message search
- display name
- avatar
- short status
- profile/presence state
- channel/section flow organization/sorting
- distinct ShakeChat design language

User reported zero errors after v0.9 tests.

### v1.0 Product settings / media profiles
- application settings
- original appearance profiles
- interface density
- reduced motion
- camera quality profiles
- screen-share quality profiles
- noise suppression
- echo cancellation
- automatic gain control
- loading state
- initial connection retry/error state

No migration for v1.0.

### v1.0.1–v1.0.3 Screen-share quality work
Goal: make high-quality screen share affect capture/publish/receive rather than only menu labels.

Added/attempted:
- capture + publish encoding profiles
- Source/Native
- 720p / 1080p / 1440p
- 30 / 60 / 120 / 144 FPS targets
- higher bitrate targets
- receiver-side quality preference
- actual resolution/FPS/bitrate stats display
- reduce receiver falling onto low simulcast layer

Observed issue before latest fixes:
sender selected 2560×1440 @ 144 FPS, receiver showed 1280×720 @ ~25 FPS.

v1.0.2 attempted receiver/simulcast fixes.
v1.0.3 fixed a frontend build issue caused by a missing screenReceiveFor export.

Do not assume 144 FPS is guaranteed. Browser/WebRTC/GPU may cap real FPS. Inspect sender/receiver WebRTC stats before changing more code.

### v1.1–v1.1.1 Moderation + DM completion
Implemented/intended:
- block/unblock user
- blocking clears friendship/pending requests
- existing DM history remains, new messages blocked
- server bans
- ban reason
- ban list
- unban
- banned user removed immediately
- banned users cannot rejoin with invite
- BAN_MEMBERS permission
- group DM
- 3–9 total users
- optional group name
- DM reply/edit/reaction/pin/delete
- DM file/media upload via MinIO
- drag/drop/paste
- realtime DM edit/delete/reaction

A frontend build error was found because Users icon was used but not imported in App.tsx.
v1.1.1 hotfix added the missing import.

IMPORTANT: final v1.1.1 test confirmation has not been provided in this handoff.
Verify the actual repository state before new work.

## First thing Astra should do
Do not immediately edit code.

1. Inspect the repository.
2. Read:
   - root package.json
   - README.md
   - Prisma schema
   - latest migrations
   - apps/api/src
   - apps/web/src
   - Docker Compose
   - LiveKit config
3. Determine actual current version from files.
4. Run non-destructive validation:

npm install
npm run db:generate
npm run typecheck
npm run build
npm test

Only run a migration command if the repo contains a pending migration and you understand it.

5. Report:
   - current version
   - build/test status
   - failures
   - likely root cause
   - exact files you plan to edit

Then continue from the existing codebase.

## Working rules
- Continue incrementally; do not rewrite working systems without a strong reason.
- Preserve existing APIs/data where possible.
- Keep changes small and testable.
- Backend is authoritative for permissions/security.
- Never trust frontend-only permission checks.
- Never expose secrets to frontend code.
- Preserve existing data.
- Add migrations only when schema genuinely changes.
- Validate meaningful upgrades with typecheck, build, backend tests, frontend tests.
- For realtime/media changes, include a manual two-browser test plan.
- Keep ShakeChat visually original; do not turn it into a Discord visual clone.

## Current owner intent
Continue developing ShakeChat. Later, return to detailed screen-share/media-quality optimization.
