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

## Design process

Design decisions flow one way: [`DESIGN.md`](../DESIGN.md) → `@gotalk/tokens` → `@gotalk/ui` →
[mockups](./mockups/index.html) → screens in `apps/app`.

- **Mockups** are static HTML in [`docs/mockups`](./mockups/index.html), one file per flow, with web/desktop
  windows and phone frames side by side. They use the generated `tokens.css` (run `pnpm build` once), so
  they stay tied to the real tokens. They show intent and states, including errors, empty and offline
  cases; they are not shipped UI.
- **Before a phase starts:** review its mockups against the phase scope. Anything in scope without a
  frame gets one first. Each phase below lists what is covered and what is not yet mocked.
- **While building:** implement screens from the mockups using `@gotalk/ui` primitives. If a mockup needs
  a value or component that `DESIGN.md` lacks, change `DESIGN.md` and the tokens first, then the mockup.
  Never add one-off colors or sizes to a mockup or a screen.
- **Before closing a phase:** compare every screen with its mockup at phone and desktop widths. Each
  difference is either fixed in the code or recorded by updating the mockup in the same change, so the
  mockups keep describing what ships.
- **When `DESIGN.md` changes:** update tokens and `ui`, rebuild `tokens.css`, and re-check the mockups.

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

Mockups: [Connect](./mockups/01-connect.html) shows the delivered flow (empty, found, plain HTTP,
incompatible version, saved instances) and is the reference for the connect screen.

## Phase 1 — Accounts & sessions ✅

Goal: a person can register, sign in, stay signed in, and sign out on every target, against any instance.

Delivered:

- **Auth flows:**
  - sign in with username or email, and sign up that follows the instance's `registration_mode`
    (open form, invite code for `invite_only`, an explanation for `closed`)
  - policy acceptance at sign-up (`accept_policies`), and a prompt for outstanding consent from
    `GET /users/@me/consents` after sign-in ("Not now" skips it until the next launch)
  - policy text opens in a plain-text viewer until the shared Markdown renderer lands in Phase 3
- **Token storage, per instance** (`SecretStorage` in `@gotalk/core`):
  - iOS/Android: `expo-secure-store` (Keychain/Keystore, this device only)
  - desktop: the OS keychain through `secret_get/secret_set/secret_delete` commands in
    `apps/desktop/src-tauri` (the `keyring` crate), limited to `gotalk.session.*` keys
  - web: refresh token in `localStorage`, access token in memory only. Any script on the page can read
    `localStorage`, so a cross-site scripting bug exposes the session; the strict CSP in the desktop shell
    and the absence of third-party scripts are the mitigations. An HttpOnly cookie mode is on the backend
    asks list.
  - only the refresh token is persisted; after a restart the first request refreshes
- **Refresh handling** (`createAuthManager`):
  - single-flight per instance; on the web also serialized across tabs with Web Locks, re-reading the
    stored token inside the lock; `BroadcastChannel` carries sign-in, sign-out and revocation between tabs
  - one retry of a 401 after refreshing; a refresh rejected with 401 ends the session, while being
    offline or throttled never signs anyone out
  - `Retry-After` pauses refreshing for that instance instead of hammering it
- **Account settings:** profile (display name, pronouns, bio), password change, devices (named from the
  session's user agent, with IP address and last use) with per-device and "all other devices" sign-out,
  sign out, and delete account (the server asks for the password)
- **First-class error states:** `429` with a countdown from `Retry-After`, `400` API-version mismatch,
  wrong credentials, unreachable instance, and server messages mapped onto form fields
- **Phone and wide layouts** from the Phase 1 mockups: instance column beside the form, settings sidebar,
  dialogs on wide screens and bottom sheets on phones
- **Tests:** unit tests in `@gotalk/core` covering sign-in, restart, single-flight refresh, 401 replay,
  revocation, offline and throttled refresh, simulated token-reuse detection, and two tabs refreshing at
  once with and without a shared lock

Verified:

- web export against a local instance, in Chromium at wide and phone widths: sign up, reload and stay
  signed in, edit profile, change password, devices, sign out and back in, wrong password, delete account
- two tabs of one browser refreshing at once after the access token expired, both staying signed in
- a session ended from a second browser signing that device out, with the explanation and username kept
- the outstanding-consent prompt and policy viewer at both widths, with the instance's policy endpoints
  mocked because the local instance publishes none
- the rate-limited state (hit by accident against the instance's 10-per-minute auth limit): the notice,
  countdown, and a refresh that was throttled without signing anyone out
- not yet exercised: iOS and Android devices, the Tauri keychain commands at runtime (`cargo check` only),
  Windows and Linux keychains, and the API-version-mismatch screen against a real instance (it is covered
  by `ApiError` unit tests only)

Known gaps and decisions:

- A session ended from another device is noticed on the next request, window focus, or the 60-second poll
  of `GET /users/@me`, until the gateway (Phase 4) pushes it.
- The server records an IP address and user agent per session but no location, so devices show the
  former.
- Sign-in has no "forgot password" flow because the backend has none yet.
- Phone builds identify themselves as `Gotalk/<version> (<os>)`; browsers and the desktop shell show as
  their browser.

Mockups: [Sign in](./mockups/02-sign-in.html) (default, wrong credentials, rate limited, session revoked,
API version mismatch), [Create an account](./mockups/03-register.html) (open, invite-only and closed
registration, policy acceptance, outstanding consent) and
[Account settings](./mockups/04-account-settings.html) (profile, password change, devices, sign out,
delete account) are the reference for these screens.

## Phase 2 — App shell & Places

Mockups: [App shell and places](./mockups/05-shell-places.html) (place rail and sidebar, command palette,
discover, phone tab bar, invite link). Not yet mocked: create place, place settings, invite management.
Mock those before starting them.

- Responsive shell: a persistent sidebar (place rail + channel/board list) at the `tablet` breakpoint (768px) and
  above, which covers desktop and tablets; stack plus drawer on phones.
- Places: discover (search, member counts), view by slug, join/leave, create, settings, invites.
- Invite and deep links: the `gotalk://` scheme now, and universal/app links for
  `https://<instance>/invite/<code>` later.
- A shared permission helper built on the `GET /permissions` bitfield, used to hide actions the user
  cannot take. The server stays authoritative.
- Per-place and per-instance branding feeding `ThemeProvider` `overrides`.
- **Exit criteria:** sign in, browse and join a place, and invite someone via link on every target, with
  the shell matching the Phase 2 mockups at phone and desktop widths.

## Phase 3 — Forums

Mockups: [Forums](./mockups/06-forums.html) (board topic list, flat topic view with accepted solution,
Markdown composer with draft state). Not yet mocked: threaded mode, edit history, search results with
filters, notification center. Mock those before starting them.

- Board tree, then topic lists with cursor pagination, unread counts, and pinned/locked state.
- Topic view in flat and threaded modes, with post numbers, reactions, accepted solutions, and edit
  history.
- **Markdown:**
  - one shared renderer for posts and chat, with sanitized links and mentions
  - a composer with a formatting toolbar, `@mention`/tag autocomplete, and server-synced drafts
  - WYSIWYG editing is a later decision; start with Markdown input plus live preview
- Search with filters (author, tag, board, solved, date) and highlighted snippets.
- Notification center with unread counts and watch/normal/mute preferences.
- **Exit criteria:** read, post, reply, react, and search a forum on every target, with screens matching
  the Phase 3 mockups.

## Phase 4 — Real-time gateway & chat

Mockups: [Chat and direct messages](./mockups/07-chat.html) (channel feed, thread panel, direct messages,
reconnecting and failed sends). Not yet mocked: message edit/delete, pinned messages, presence picker.
Mock those before starting them.

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
  - pending and failed sends look and behave like the offline mockup

## Phase 5 — Voice & video

Mockups: [Voice and video](./mockups/08-voice.html) (in-call stage with screen share, moderator menu,
voice settings with push-to-talk, mini call bar, connection quality). Not yet mocked: camera layouts.

- LiveKit: `livekit-client` on web/desktop, `@livekit/react-native` on mobile. Mobile needs a development
  build (`expo prebuild` / EAS) with the LiveKit config plugin, not Expo Go.
- Join/leave/move flows using the server-issued token, plus `VOICE_STATE_UPDATE`,
  `VOICE_SERVER_UPDATE`, and `VOICE_SPEAKING` handling.
- Self mute/deafen, push-to-talk (global shortcut on desktop via a Tauri plugin), and speaking indicators.
- Screen share and camera: web/desktop first, then mobile.
- Call-quality telemetry reporting, and moderator controls (server mute/deafen, move, disconnect).
- **Exit criteria:** a three-way call across web, desktop, and one mobile platform, with screen share
  from desktop, and call screens matching the Phase 5 mockups.

## Phase 6 — Moderation, admin & developer tools

Mockups: none yet. Reports queue, roles editor, instance admin and developer settings need frames in
`docs/mockups` before this phase starts.

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
  - accessibility audit (screen readers, focus order, contrast) and i18n; the mockups' flows are the
    checklist for the screens to audit
  - a final pass comparing every shipped screen with its mockup
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
