# Gotalk — Client Plan

This document lays out the phases for the official Gotalk client in
[`repos/gotalk-client`](../repos/gotalk-client/README.md). It is the client counterpart to
[backend-plan.md](./backend-plan.md); backend phases 1–5 are already delivered, so the client can work
against a complete API.

## Architecture (decided)

| Concern | Choice | Why |
|---|---|---|
| Mobile + web | Expo (React Native, Expo Router), web via `react-native-web` exported as an SPA | One component tree for iOS, Android and web |
| Desktop | Tauri v2 wrapping the web export | Small native binaries; shares the web build and its theme |
| Themes | `@gotalk/tokens` (mirrors `DESIGN.md`, dark-only) → typed theme + CSS variables; `@gotalk/ui` primitives read `useTheme()` | One source of truth across every target, plus `tokens.css` for server-rendered pages |
| API access | `openapi-typescript` + `openapi-fetch` generated from the server's OpenAPI 3.1 document | Types stay in lockstep with the server; `pnpm api:sync` refreshes them |
| Server state | TanStack Query | Caching, refetching and optimistic updates; the gateway will write into the same cache |
| Client state | zustand (vanilla stores in `@gotalk/core`) | Framework-agnostic and works the same on every target |
| Monorepo | pnpm workspaces + Turborepo | Isolated installs (supported by Expo SDK 54+), cached tasks |

Constraints that come from the backend design:

- **Bring your own server.** Everything (tokens, caches, settings) is scoped to an instance ID, which is
  the instance's origin. Multiple saved instances per device.
- **SEO is not the client's job.** A client hosted at one origin cannot make another instance's content
  crawlable. Public, indexable pages should be rendered by `gotalk-server` itself. It can use
  `tokens.css` so the pages match the app (see *Cross-cutting tracks*).
- **Mobile push needs a relay we operate.** Operators cannot hold the official app's APNs/FCM
  credentials (same model as Mastodon/Matrix push gateways).

## Phase 0 — Foundation ✅

Delivered:

- Workspace with `packages/{tokens,ui,api-client,core}`, `apps/app` (Expo SDK 57) and `apps/desktop`
  (Tauri 2).
- Design tokens from `DESIGN.md` (dark-only), a branding override (`createTheme(overrides)`), and a
  generated `tokens.css`.
- Themed UI primitives, and navigation chrome that follows the active theme.
- Generated API client (109 operations) that sends the `Gotalk-Api-Version` header and an optional
  bearer token, and converts problem-details errors into `ApiError`.
- Instance discovery:
  - parses user input (bare domain, URL, `localhost:port`, LAN hosts) and follows `.well-known`, falling
    back to `/api/v1`
  - confirms the server is Gotalk and checks API version compatibility
  - flags plain-HTTP connections and handles instances where setup is still required
- Saved-instance store persisted with AsyncStorage (localStorage on web and desktop).
- Screens: connect (look up, preview, save, saved-instance list) and an instance home with live metadata,
  switching and forgetting.
- Tests: 30 unit tests plus an opt-in live discovery test (`GOTALK_TEST_INSTANCE`).
- Verified:
  - web export, and the web app against a local instance
  - Tauri debug build, including cross-origin calls under the production CSP and deep-route reloads
  - `expo-doctor` clean

## Phase 1 — Accounts & sessions

Goal: a person can register, sign in, stay signed in, and sign out on every target, against any instance.

- **Auth flows:**
  - login (username or email) and registration
  - registration respects `registration_mode`: open, invite code for `invite_only`, explanation for `closed`
  - policy acceptance at sign-up (`accept_policies`), with outstanding-consent prompts from
    `GET /users/@me/consents`
- **Token storage per instance:**
  - `expo-secure-store` on iOS/Android
  - the OS keychain on desktop (Tauri keyring/Stronghold plugin, behind a small storage interface in
    `core`)
  - on web: access token in memory, refresh token in storage, with the XSS trade-off documented
- **Refresh handling:**
  - Refresh tokens are single-use and reuse revokes the session, so refresh must be single-flight.
  - On web it must also be coordinated across tabs (Web Locks / `BroadcastChannel`); otherwise two
    concurrent refreshes log the user out.
  - Retry once on 401 after refreshing.
- **Account settings:** profile edit, password change, active sessions list/revoke, sign out, delete
  account.
- **Error handling:** treat `400` with an API-version mismatch and `429` (`Retry-After`, `X-RateLimit-*`)
  as first-class states.
- **Exit criteria:**
  - sign in on all three targets
  - kill the app, reopen, and still be signed in
  - two web tabs refreshing at once stay signed in
  - revoking a session elsewhere signs this device out

## Phase 2 — App shell & Places

- Responsive shell: a persistent sidebar (place rail + channel/board list) at the `tablet` breakpoint (768px) and
  above, which covers desktop and tablets; stack plus drawer on phones.
- Places: discover (search, member counts), view by slug, join/leave, create, settings, invites.
- Invite and deep links: the `gotalk://` scheme now, and universal/app links for
  `https://<instance>/invite/<code>` later.
- A shared permission helper built on the `GET /permissions` bitfield, used to hide actions the user
  cannot take. The server stays authoritative.
- Per-place and per-instance branding feeding `ThemeProvider` `overrides`.
- **Exit criteria:** sign in, browse and join a place, and invite someone via link on every target.

## Phase 3 — Forums

- Board tree, then topic lists with cursor pagination, unread counts, and pinned/locked state.
- Topic view in flat and threaded modes, with post numbers, reactions, accepted solutions, and edit
  history.
- **Markdown:**
  - one shared renderer for posts and chat, with sanitized links and mentions
  - a composer with a formatting toolbar, `@mention`/tag autocomplete, and server-synced drafts
  - WYSIWYG editing is a later decision; start with Markdown input plus live preview
- Search with filters (author, tag, board, solved, date) and highlighted snippets.
- Notification center with unread counts and watch/normal/mute preferences.
- **Exit criteria:** read, post, reply, react, and search a forum on every target.

## Phase 4 — Real-time gateway & chat

- **`packages/gateway`:** a framework-agnostic WebSocket client.
  - Handles hello → identify → READY, heartbeats, and backoff reconnect.
  - Follows the server's close codes, including `4007`: reconnect without resuming.
  - Catches up through `GET …/messages?after=<last id>`, because the server has no resume.
  - Uses the same token storage as Phase 1.
- Gateway events write into the TanStack Query cache: messages, reactions, read state, presence,
  membership, notifications.
- Text channels:
  - virtualized message list (FlashList or equivalent) with cursor history
  - optimistic sends using the server's client nonces
  - edits, deletes, pins, replies, and threads
  - typing indicators and read state with mention counts
- Direct and group messages, and presence (online/idle/dnd/invisible).
- **Exit criteria:**
  - two clients on different targets chat in real time
  - after a network drop, the client reconnects and backfills without duplicates

## Phase 5 — Voice & video

- LiveKit: `livekit-client` on web/desktop, `@livekit/react-native` on mobile. Mobile needs a development
  build (`expo prebuild` / EAS) with the LiveKit config plugin, not Expo Go.
- Join/leave/move flows using the server-issued token, plus `VOICE_STATE_UPDATE`,
  `VOICE_SERVER_UPDATE`, and `VOICE_SPEAKING` handling.
- Self mute/deafen, push-to-talk (global shortcut on desktop via a Tauri plugin), and speaking indicators.
- Screen share and camera: web/desktop first, then mobile.
- Call-quality telemetry reporting, and moderator controls (server mute/deafen, move, disconnect).
- **Exit criteria:** a three-way call across web, desktop, and one mobile platform, with screen share
  from desktop.

## Phase 6 — Moderation, admin & developer tools

- Reports queue, audit log, warnings/timeouts/bans, and transparency pages.
- Roles editor (ordering, permission bits) and board/channel overwrite editors.
- Instance admin: policy publishing, registration mode, and instance settings.
- Developer settings: personal access tokens, applications/bots, slash commands (invocation in chat
  comes in Phase 4), and webhooks with a delivery log.

## Phase 7 — Distribution & polish

- **Push notifications:** a small Gotalk-operated push relay (APNs/FCM), web push for the web app, and
  native notifications on desktop. Blocked on the backend's push subscription endpoints (backend
  Phase 6).
- **Release pipeline:**
  - CI runs typecheck, tests, and the web export on every change
  - Tauri build matrix (Windows/macOS/Linux) with signing
  - EAS Build/Submit for the stores, and EAS Update for OTA fixes
  - desktop auto-update with `tauri-plugin-updater`
- **Hosting the official web client:** any static host with SPA fallback. Operators may also serve it
  from their own instance.
- **Quality:**
  - E2E tests: Playwright for web/desktop, Maestro for mobile
  - accessibility audit (screen readers, focus order, contrast in both themes) and i18n
  - offline cache persistence for read-only browsing, and error reporting

## Cross-cutting tracks

- **Server-rendered public pages (in `gotalk-server`):** Go templates for public places, boards, and
  topics, with OpenGraph/JSON-LD and sitemaps. They are styled with `tokens.css` and link "Open in app"
  to the client. This is the plan's answer to SEO and can start any time.
- **Backend asks raised by the client:**
  - instance branding (accent color, logo variants) in `GET /instance`
  - an optional HttpOnly refresh-token cookie mode for same-site web deployments
  - push subscription endpoints and the relay contract
  - attachments/media (blocks image posts and avatars upload)
  - OAuth/OIDC with PKCE for native clients when backend auth providers land
- **Decisions still open:**
  - styling stays on plain `StyleSheet` + tokens, or moves to Unistyles/Tamagui (revisit when
    responsive variants get heavy)
  - Markdown renderer/editor library
  - normalized entity cache vs. per-query caches for gateway updates
  - final app identifiers (`io.gotalk.app` / `io.gotalk.desktop` are placeholders)
