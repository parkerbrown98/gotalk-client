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
  - policy text renders with the shared Markdown renderer (added in Phase 3)
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

## Phase 2 — App shell & Places ✅

Goal: sign in, browse and join a place, and invite someone via link on every target.

Delivered:

- **Responsive shell** (`apps/app/src/app/(app)`): from the `tablet` breakpoint (768px) a place rail, the
  open place's sidebar (forums, chat, voice) and the content; on phones a stack with a bottom tab bar.
  The tab bar has Places, Inbox, Search and You (the last two arrived in Phase 3).
- **Places:**
  - discover with debounced search, "Open to join" filter, paging, and one white button on the best match
  - create (the address fills in from the name), view by slug, join and leave
  - settings for name, address, description and visibility; the owner can delete the place
  - invite-only places are listed but joinable only through an invite; private ones are hidden
  - the sidebar lists existing forums and channels, which open placeholder screens until Phases 3 to 5
- **Invites:**
  - create links (expiry and use limits), copy or share them, list them, revoke them
  - `/invite/<code>?instance=<origin>` on the web and `gotalk://invite/<code>?instance=<origin>` in apps;
    it previews the place before sign-in, adds an unfamiliar instance after confirmation, and carries on
    through sign-in or sign-up to joining
- **Permissions:** `hasPermission` in `@gotalk/core` reads the `my_permissions` bitfield with BigInt (bits
  go past 32) against the instance's `GET /permissions` table, with a built-in fallback. It decides which
  menu items, settings tabs and buttons appear; the server stays authoritative.
- **Command palette** (Cmd/Ctrl+K on web and desktop): places, the open place's channels, and a few screens.
- **Tests:** unit tests for permissions, addresses and invite links in `@gotalk/core`.

Verified:

- web export against a local instance, in Chromium at wide and phone widths, with an owner, a member and a
  newcomer: create a place, create and revoke invites, discover and join, leave, see only permitted
  actions, join through an invite link after signing up, join an invite-only place through its invite, and
  jump with the palette
- not yet exercised: iOS, Android and Tauri builds, `gotalk://` links on a device, and share sheets

Known gaps and decisions:

- **Branding:** the API offers place icons and banners but no colors, and DESIGN.md has one white primary
  action, so `ThemeProvider` `overrides` stay unused. Place icons show where places are listed; banners are
  not shown. Per-instance accent colors remain a backend ask.
- Universal and app links for `https://<instance>/invite/<code>` need the server to host the page and
  association files; invite links today open the hosted web client or the `gotalk://` scheme.
- Request-to-join does not exist in the API, so the mockup's "Request to join" became "Invite only".
- The overview shows member, forum and channel counts only: unread counts, pinned items and activity
  summaries need forums and chat.

Mockups: [App shell and places](./mockups/05-shell-places.html) and
[Create and manage places](./mockups/09-places-manage.html) (create, settings, invites, place menu,
delete) are the reference for these screens.

## Phase 3 — Forums ✅

Goal: read, post, reply, react and search a forum on every target.

Mockups: [Forums](./mockups/06-forums.html) (board topic list, flat topic view with accepted solution,
Markdown composer with draft state) and
[Forums: threads, search and inbox](./mockups/10-forums-more.html) (threaded topic, topic menu, edit
history, new topic with tag and mention suggestions, place search with filters, inbox, watch levels, new
forum, and the phone versions) are the reference for these screens.

Delivered:

- **Forum tree:** the sidebar (and the phone place screen) shows categories and nested forums with
  their depth, a Search row, and New forum for people with Manage boards.
- **Topic list** (`boards/[id]`): pinned first, unread dot and heavier title, solved, locked, archived
  and tag badges, replies and last activity, Latest/Unanswered/Solved filters, a tag filter, "Show
  archived" for moderators, paging, and the watch level of the forum.
- **Topic view** (`topics/[id]`): flat and threaded boards (a Flat/Threaded switch on threaded ones),
  post numbers, "replying to #n", reactions with a picker, accepted solutions (author or moderator),
  edit and delete, edit history, and a topic menu (edit title and tags, pin, lock, archive, delete) that
  shows only what the viewer may do. Reading advances the server's read position.
- **Writing:** new topic and reply screens with a toolbar (bold, italic, link, code, quote, mention),
  Write/Preview, `@mention` suggestions from the place's members, tag suggestions from the place's tags,
  Ctrl/Cmd+Enter to post, and drafts saved to the server a moment after typing stops (`topic:<board>`,
  `reply:<topic>[:<post>]`) so they follow the person between devices.
- **Markdown** (`@gotalk/core` `parseMarkdown`, `apps/app` `Markdown`): `marked` lexes the text and the
  result is converted to a closed tree that the renderer walks, so raw HTML is shown as text, only
  http(s) and mailto links open, and images become links. The policy viewer uses it too.
- **Search** (`places/[slug]/search`, phone Search tab): words, phrases and exclusions with author,
  tag, forum, answered state, dates, opening posts only and sort, paging, and highlighted snippets.
- **Inbox:** replies, mentions, accepted answers, reactions and new topics with read and unread, mark
  all read, dismiss, and links into the topic. An unread count shows on the rail bell and the phone tab,
  polled every 60 seconds until the gateway arrives.
- **Watch levels** (watching, normal, muted) for forums and topics.
- **Tests:** Markdown (sanitizing, mentions, links, plain text), composer helpers (formatting,
  mention queries, validation, drafts), relative time and notification wording in `@gotalk/core`.

Verified:

- unit tests and typecheck across the workspace, and the web export
- a scripted Chromium run against a local server at wide (1200px) and phone (390px) widths with an owner
  and a member: compose with tag and mention, draft saved and restored after a reload, preview, post,
  mention notification with unread count, reply, react, accept solution, edit with history, watch level,
  filters, pin and lock (member sees locked), threaded nesting and flattening, search with filters, new
  forum, mark all read and dismiss. HTML and `javascript:` links in a post stay inert.
- not yet exercised: iOS, Android and Tauri builds, keyboard avoidance with the real on-screen
  keyboard, and screen readers.

Known gaps and decisions:

- Pagination is by offset, because that is what the API offers, so the list can shift while someone
  pages through it. Unanswered and Solved narrow the topics loaded so far, since the list endpoint has
  no such filters.
- The sidebar shows no per-forum unread counts: the API reports unread per topic only.
- The watch level opens as a dialog (a sheet on phones) rather than the popover in the mockup, to share
  one control across targets.
- Search covers one place at a time; the instance-wide `/search` is not used yet.
- Reactions offer a fixed set of emoji; the server accepts any Unicode emoji or shortcode.
- Moving a topic to another forum, board overwrites and reordering forums are not in the client yet.
- A forum's edit history shows what each earlier version said; the API has no way to restore one.
- WYSIWYG editing stays a later decision: Markdown input with live preview is what shipped.

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
