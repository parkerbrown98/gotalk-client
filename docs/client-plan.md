# Gotalk — Client Plan

This document lays out the phases for the official Gotalk client in
[`repos/gotalk-client`](../repos/gotalk-client/README.md). It is the client counterpart to
[backend-plan.md](./backend-plan.md); backend phases 1–7 are delivered, so the client can work
against a complete API. Phase 7 (topic feeds) uses backend Phase 6, and Phase 8 (self-hosting
follow-through) takes up what backend Phase 7 changed.

## Architecture (decided)

| Concern | Choice | Why |
|---|---|---|
| Mobile + web | Expo (React Native, Expo Router), web via `react-native-web` exported as an SPA | One component tree for iOS, Android and web |
| Desktop | Tauri v2 wrapping the web export | Small native binaries; shares the web build and its theme |
| Themes | `@gotalk/tokens` (mirrors `DESIGN.md`, dark-only) → typed theme + CSS variables; `@gotalk/ui` primitives read `useTheme()` | One source of truth across every target, plus `tokens.css` for server-rendered pages |
| API access | `openapi-typescript` + `openapi-fetch` generated from the server's OpenAPI 3.1 document | Types stay in lockstep with the server; `pnpm api:sync` refreshes them |
| Server state | TanStack Query | Caching, refetching and optimistic updates; gateway events write into the same per-query caches |
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

- A session ended from another device is noticed at once through the gateway (close code `4010`, added in
  Phase 4). While the gateway is down, the next request, window focus or the 60-second poll of
  `GET /users/@me` still notices it.
- The server records an IP address and user agent per session but no location, so devices show the
  former.
- Sign-in has no "forgot password" flow because the backend had none yet; it arrives in Phase 8 with the
  backend's email support.
- Phone builds identify themselves as `Gotalk/<version> (<os>)`, and the desktop app appends the same
  token to its webview's user agent, so both show as "Gotalk for …"; browsers show as their browser.

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
  The tab bar has Places, Inbox, Search and You (the last two arrived in Phase 3; Phase 7 moved Search
  into the Home tab).
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
  summaries need forums and chat. (Phase 7 put the place's feed under these counts, on the same page.)

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
- **Search** (`places/[slug]/search`, and on phones `/search`, opened from Home since Phase 7): words, phrases and exclusions with author,
  tag, forum, answered state, dates, opening posts only and sort, paging, and highlighted snippets.
- **Inbox:** replies, mentions, accepted answers, reactions and new topics with read and unread, mark
  all read, dismiss, and links into the topic. An unread count shows on the rail bell and the phone tab;
  since Phase 4 the gateway pushes new notifications and the 60-second poll only runs while it is down.
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

## Phase 4 — Real-time gateway & chat ✅

Goal: channels, threads and direct messages that update live on every target, survive a dropped network,
and show what is still on its way.

Mockups: [Chat and direct messages](./mockups/07-chat.html) (channel feed, thread panel, direct messages,
reconnecting and failed sends) and
[Chat: message actions, pins and presence](./mockups/11-chat-more.html) (hover actions and the message
menu, editing in place, deleting with a reason, pinned messages, direct messages on the rail, new message,
presence picker, and the phone versions) and [Manage chat channels](./mockups/12-channels-manage.html)
(categories in the sidebar, new channel, the channel menu, deleting, renaming a group conversation) are
the reference for these screens.

Delivered:

- **Gateway** (`packages/gateway`, framework-agnostic):
  - hello → identify (the current access token from the Phase 1 token storage, and the chosen presence)
    → READY; heartbeats at the server's interval with a jittered first beat, and a missing ack treated as
    a dead connection
  - reconnects with jittered exponential backoff (1 s doubling to 30 s), at once on `4007` with a fresh
    identify (there is nothing to resume), spread over 0.5–2.5 s after `1001`, and no sooner than 10 s
    after `4008`
  - `4010` stops it, and the app confirms the ended session with a request so Phase 1's "another device
    ended this session" notice shows; `4004` asks the app whether the session is still valid first
  - retries right away when the browser comes back online or the app returns to the foreground
  - `catchUp` pages through `GET …/messages?after=<last id>`, 100 at a time; a gap longer than five pages
    reloads the newest page instead
- **Gateway → cache** (`apps/app/src/lib/realtime.ts`): one connection for the active instance, hosted at
  the root so it outlives the settings screens, and stopped before an intentional sign-out so the server
  closing it is not mistaken for a revocation. Events write into the TanStack Query caches: messages
  (keeping the user's own reaction flags, which events lack), reactions (idempotent for the user's own
  optimistic ones), typing, channels, conversation members, read state (`CHANNEL_READ` from other
  sessions, `READ_RECEIPT`), notifications, presence, place membership, and READY's user. After a
  reconnect every loaded channel catches up, the lists that summarize them refresh, and waiting sends go
  out. The 60-second polls of `GET /users/@me` and the notification count only run while the gateway is
  down.
- **Text channels** (`places/[slug]/channels/[id]`):
  - a FlashList feed anchored to the bottom that loads older pages upward by cursor, with day dividers,
    an author's consecutive messages grouped, the white New marker where the read position was when the
    channel opened, and the start of the channel once all history is loaded
  - message actions on hover (wide screens with a pointer that hovers) and on a long press (phones, with
    quick reactions): reply (quote that jumps to the original), threads (started from a message; a panel
    beside the channel on wide screens, their own screen on phones), pins (a strip under the top bar, a
    side panel or phone screen, and Jump), edit in place with edit history, delete (your own, or anyone's
    with Manage messages and an optional reason the author is told), copy text
  - typing indicators; the read position moves when the newest message is on screen and the window has
    attention; unread state and mention counts on channel rows in the sidebar and on the phone place screen
  - a member list with presence on wide screens; choosing someone opens a conversation with them
  - slash commands: suggestions from the bots that can see the channel, `/name value option:value` with
    type checks and `@user`/`#channel` lookups, sent as interactions (bots answer with ordinary messages)
- **Managing channels** (Manage channels): new text channels and categories from the sidebar, the place
  menu and the phone place screen; a channel menu (⋯ in the top bar, a sheet on phones) and category menus
  (from their labels) to edit name, topic, category and the age restriction, move up or down among their
  siblings, and delete, with deleting a category moving its channels to the top level. Anyone can mute a
  text channel from the same menu; muted channels step down in the sidebar. The sidebar and the phone
  place screen group channels under their categories. Other members see every change live, and someone
  reading a deleted channel is told it is gone.
- **Optimistic sends** with the server's client nonces: a message shows as "Sending" until the response or
  its `MESSAGE_CREATE` echo replaces it, whichever comes first. Sends made while offline wait, still
  "Sending", and go out after reconnecting unless the caught-up history shows they already arrived. Refused
  sends show "Not sent." with Retry (same nonce) and Delete.
- **Direct and group messages:** a rail tile and conversation sidebar on wide screens, and a Messages tab on
  phones with search, previews and unread counts; a new-message dialog that finds people in your places
  (one person reopens your conversation with them, several start a group with an optional name); adding
  people to, renaming and leaving groups; "Seen" under your last message in one-to-one conversations; pins.
- **Presence:** online, idle, do not disturb and invisible, picked from the account row in the sidebar or the
  avatar on the You tab, remembered per instance on the device and sent when connecting. Avatars show
  presence, fetched in batches with `GET /presences` and kept current by `PRESENCE_UPDATE`.
- **Reconnecting banner:** one line at the top after 1.5 seconds of reconnecting, or right away when the
  browser reports being offline.
- **Tests:** 20 gateway tests (handshake, heartbeat watchdog, backoff and its cap, `1001`, `4004`, `4007`,
  `4008`, `4010`, frames from abandoned sockets, catch-up paging) plus an opt-in live test, and chat helpers
  in `@gotalk/core` (merging without duplicates, reactions, feed layout, the New marker, typing text,
  conversation titles, previews, slash-command parsing, channel grouping and reordering).

Verified:

- unit tests and typecheck across the workspace, the web export, and `expo lint` clean for the new code
- a scripted Chromium run against a local server with one person on a wide window (1280px) and another on
  a phone-width window (390px) connected through a TCP proxy that could be cut:
  - messages, typing, reactions, replies (from the long-press sheet), edits, pins, threads and deletions
    arrive live on the other side
  - a mention counts on the phone's channel row and the New marker shows on opening it
  - a conversation started on the phone appears live on the wide window with a rail badge; "Seen" follows
    reading, and an open conversation does not count as unread
  - presence changes show in the conversation header; do not disturb confirmed through the API
  - cutting the network: the banner shows, reading continues, a send stays "Sending" and three messages are
    missed; after reconnecting each missed message appears once and the waiting send arrives once on both
    sides
  - an injected server error shows "Not sent." with Retry and Delete working
  - a message posted while the phone's first load of a channel was in flight (response held back) still
    shows, and deleting a message on the oldest loaded page does not stop older history from loading
  - ending the phone's session from another login signs it out through the gateway, with the notice
- a second scripted run with an owner (wide) and a member (phone): creating a channel, a category from the
  place menu and channels inside it, moving a channel up, editing a channel's name and topic, renaming
  and deleting a category, and deleting a channel while the member reads it all show live on the phone;
  the member only gets Mute, and a muted channel stays quiet when a message arrives; a member renames a
  group conversation and the owner sees the new name
- not yet exercised: iOS and Android builds (FlashList and the on-screen keyboard on devices), the Tauri
  shell at runtime (it loads the same export and its CSP allows `ws:`/`wss:`), touch on tablet-width web,
  and screen readers

Known gaps and decisions:

- The exit criterion "two clients on different targets" was met with two web clients at desktop and phone
  widths, which use different layouts and input; a run across the Tauri shell or a device is still to do.
- The catch-up covers missed messages. Edits, deletions and reactions missed while offline appear when the
  channel's history is next fetched: it is marked stale and refetches on the next open or window focus.
- Unsent messages are kept in memory, so a reload drops them.
- The rail shows no per-place unread counts: that needs every place's channel list, and only open places
  load theirs. The mockup's rail count was removed.
- The member list shows the first 100 members, without roles.
- The API has no message search or attachments yet, so the mockups' search icon and composer "+" were
  removed. Reactions offer the same fixed set as forums.
- Threads are reached from their starting message; they are not listed in the sidebar.
- Creating voice channels and setting their user limit arrived with voice in Phase 5; per-role channel
  permissions come with the overwrite editors in Phase 6. Moving a channel into or out of a category is done
  from its settings rather than by dragging.
- Do not disturb changes only how others see you until push notifications arrive (Phase 9).
- Gateway events update the per-query caches directly; a normalized entity cache was not needed.

## Phase 5 — Voice & video

Status: built and verified on the web against a local server with LiveKit. The exit run across the
desktop app and a phone is still to do (see *Known gaps*), so the phase is not closed.

Goal: sit in a voice channel while doing something else, with cameras, screen share and moderation, on
every target.

Mockups: [Voice and video](./mockups/08-voice.html) (before joining, in-call stage with screen share,
cameras on desktop and phone, moderator menu, voice settings with push-to-talk, mini call bar,
connection quality) and the voice type in [Manage chat channels](./mockups/12-channels-manage.html) are
the reference for these screens. Before building, the missing frames were added: before joining (desktop
and phone), camera layouts (desktop and phone) and a new voice channel. Voice settings now use the pill
tabs and checkbox `DESIGN.md` already has, instead of a segmented control and switch it lacks.

Delivered:

- **Media** (`apps/app/src/lib/voice-platform*.ts`): `livekit-client` on web and desktop;
  `@livekit/react-native` with `@livekit/react-native-webrtc` on phones, configured by
  `@livekit/react-native-expo-plugin` and `@config-plugins/react-native-webrtc` (microphone and camera
  usage strings, Android permissions, iOS background audio). The native SDK loads on first join, so the
  rest of the app still runs in Expo Go; voice there says it needs a development build.
- **Call engine** (`apps/app/src/lib/voice.ts`, framework-agnostic store plus React hooks):
  - join with the server-issued token (`POST /channels/{id}/voice`), joining another channel switches,
    leave with `DELETE /users/@me/voice`; mute and deafen carry over to the next call
  - `VOICE_SERVER_UPDATE` (moved by a moderator) reconnects to the new room and the call screen follows;
    being removed, the channel closing or joining elsewhere ends the call with a notice; a "left" event
    while the media connection is still up re-registers the call instead of dropping it
  - a media connection lost for good is rejoined three times (1, 3, 6 s), then the call ends and the
    server's state is cleared only if it is still this call
  - `VOICE_STATE_UPDATE` keeps per-place voice states (`GET /places/{id}/voice-states`) current, and is
    refetched after a gateway gap; `VOICE_SPEAKING` drives indicators outside your own call
  - self mute and deafen (deafening mutes; undeafening unmutes only if deafening did), applied to the
    media at once and reported with `PATCH /users/@me/voice`; server mute/deafen and lost permissions
    take the mic away and show on the control
  - speaking indicators from LiveKit's active speakers, relayed to the gateway at most once per 1.5 s
    (the gateway allows 120 frames a minute)
  - camera (with flip on phones) and screen share with system audio, both behind Share screen; stopping a
    share from the browser's own bar is noticed
  - call-quality telemetry every 30 s from WebRTC stats (packet loss, jitter, round trip, bitrate) to
    `POST /users/@me/voice/telemetry`; the connection quality shows as bars
- **Push to talk:** published muted so talking starts the moment the key goes down; system-wide in the
  desktop app through `tauri-plugin-global-shortcut` (registered only while in a call, falling back to
  the window with a notice when another app holds the key), while the window has focus on the web, and
  not on phones. The key is captured from the next key press and stored by physical key.
- **Screens:**
  - voice channel: before joining (who is here with speaking and mic state, mute/deafen for joining,
    Join, full, no Connect permission, voice not available on the instance, "Joining moves you out of …"),
    then the call: an even grid of tiles with cameras first, or the shared screen on the stage with the
    others in a column (phones: share above a two-column grid); fit and full screen for shares on the web
  - controls: mic, deafen, camera, screen share, settings and Leave; phones put flip camera, share and
    settings behind ⋯ and list everyone behind the people icon
  - moderator menu on a participant (popover on wide screens, sheet on phones): mute and deafen for
    everyone (Mute members), Move to… and Disconnect (Move members)
  - voice settings: microphone and speaker pickers (where the browser can route output), input mode,
    push-to-talk key, noise suppression and a microphone level test
  - the call survives navigation: a panel at the bottom of the wide sidebar, and a mini bar above the tab
    bar on phones (or under wide screens without a sidebar) showing who is talking
  - the sidebar and phone place screen count people in each voice channel; voice channels can be
    created and edited (category and user limit) and sit inside their category
- **Desktop shell:** the global-shortcut plugin and its capability, macOS microphone and camera usage
  strings (`Info.plist`) and entitlements for signed builds.
- **Tests:** voice helpers in `@gotalk/core` (applying voice-state events, grouping, mic state, call
  duration, quality, telemetry from stats, the speaking relay, push-to-talk bindings, tile order and grid
  columns) and voice channels inside categories.

Verified:

- unit tests and typecheck across the workspace, the web export, `expo lint` clean for the new code,
  `expo-doctor` clean, the Expo config adding the iOS and Android permissions, and a Tauri debug bundle
- a scripted Chromium run (fake microphone and camera) against a local server with LiveKit
  (`docker compose --profile voice`), with an owner and a member in wide windows (1280px) and a member in a
  phone-width window (390px):
  - three-way call; speaking shows on the others' tiles; mute, deafen and undeafen show on the others' side
  - screen share from the owner plays on both other clients, phone included; a camera shows in the grid
  - moderator mute takes the member's mic away and back; Move to… takes a member to another channel
    and their screen follows; Disconnect ends the member's call with a notice
  - the sidebar panel while reading a text channel, the phone mini bar and returning to the call
  - lowering a channel's user limit in the edit form makes it show as full to a member at once
  - telemetry samples reach the server's voice sessions; a reload mid-call is noticed through LiveKit's
    webhook and the person leaves everyone's list
  - push to talk in the browser: silent while the key is up, heard while it is held
- not yet exercised: the Tauri app at runtime (microphone, camera and screen capture in WKWebView,
  WebView2 and WebKitGTK, and the global shortcut), iOS and Android development builds, and a dropped
  media connection (the browser test could not cut WebRTC traffic)

Known gaps and decisions:

- **Exit criteria not yet met:** the three-way call ran across three web clients (two layouts). It still
  needs the desktop app sharing its screen and a phone, which needs Xcode or the Android SDK (or EAS).
- Screen share on phones needs a broadcast extension (iOS) and a foreground service (Android); phones
  have camera only for now. Whether WKWebView on macOS offers `getDisplayMedia` to the desktop app is
  unverified; the share button only appears where the browser engine supports it.
- Calls on Android stop in the background until a foreground service is added; iOS keeps audio running.
- Per-person volume, the call timer (it counts from when you joined), video quality choices and noise
  suppression beyond the browser's own are not built. Voice channels list a count, not their members.

## Phase 6 — Moderation, admin & developer tools ✅

Goal: run a place and an instance from the client: work through reports, act on members, shape
permissions, and manage the developer surface (tokens, bots, webhooks) without touching the API by hand.

Mockups: [Moderation](./mockups/13-moderation.html) (reports queue, report dialog, members and member
actions, timeout and ban, bans, audit log, place transparency), [Roles and permissions](./mockups/14-roles-permissions.html)
(roles list, role editor, @everyone, overrides, entry points from the channel menu and forum header),
[Instance administration](./mockups/15-instance-admin.html) (instance settings, policies, publishing,
instance transparency) and [Developer tools](./mockups/16-developer.html) (access tokens, applications,
command editor, adding a bot, webhooks and deliveries, bots) are the reference for these screens.
[Create and manage places](./mockups/09-places-manage.html) was updated: place settings now use a section
nav instead of the General/Invites tabs.

Delivered:

- **Place settings** (`places/[slug]/settings/*`): a section nav beside the content on wide screens and a
  grouped list of pushed screens on phones. Place (General, Invites, Roles, Permissions), Moderation
  (Members, Reports with the open count, Bans, Audit log) and Integrations (Webhooks, Bots) each appear only
  with their permission; the place menu opens settings whenever any section is allowed. The old
  General/Invites screen moved into the first two sections unchanged.
- **Reporting:** "Report message" in the message menu and long-press sheet (place channels only; direct
  messages have no moderators), "Report" on forum posts, and "Report …" from the member list. A reason,
  optional details, and a confirmation that does not reveal who handles it.
- **Reports queue:** Open/Resolved/Dismissed, each report with its reason, where it came from, the reported
  person, the server's snapshot of the content, the reporter's details, Open in context, Act on (opens the
  member actions), and Resolve/Dismiss with an optional note for other moderators.
- **Members and member actions:** prefix search with paging, role dots, Owner/Bot/Timed out badges. The
  member dialog assigns and removes roles (only those below your highest), sets nicknames, warns (reason
  required), times out (60 seconds to a week) or ends a timeout, kicks and bans (permanent, a day, a week,
  30 days), and links to the person's moderation history. The owner, yourself and people ranked at or above
  you cannot be acted on. In chat, choosing someone in the member list offers Send a message, Moderate and
  Report.
- **Bans:** current bans with who, when, why and when they lift; Unban; Ban by username for people who are
  not members.
- **Audit log:** newest first, category filters (members, roles, channels, messages, forums, topics, posts,
  reports, webhooks, place), a filter for one person from Moderation history, and every action the server
  records worded as a sentence (`describeAuditEntry` in `@gotalk/core`). Names come from the place's roles,
  channels and forums, and people are looked up as members, then in bans and loaded reports.
- **Roles editor:** highest first with @everyone last, Move up/Move down (and on the role's own page) within
  your rank, create, rename, a color dot (none or the four accents), grouped permission checkboxes with
  descriptions, a warning for Administrator, permissions you do not hold disabled, and delete with
  confirmation. Permissions the instance defines but the client does not know are listed under Other.
- **Overrides:** a Permissions section listing forums and channels with their override counts, and an
  editor per forum or channel with Deny/Default/Allow for each permission that applies there (forum
  permissions on forums, chat on text channels, voice on voice channels, both on categories), @everyone
  first, Add a role, Remove override. Reached also from the channel menu and a Permissions button in the
  forum header. Bits go past 32, so all of this uses BigInt helpers in `@gotalk/core` (`roles.ts`).
- **Moderation notifications** now read as sentences ("You were timed out until …", "A moderator removed
  your message") with the reason.
- **Transparency:** a place report (from the place menu and settings) and an instance report (account
  settings) with 30-day, 90-day and 12-month periods: reports filed, actions taken, content removed,
  reports by reason and status, and actions by kind.
- **Account settings** gained Developer (Access tokens, Applications) and Instance (Instance settings and
  Policies for instance administrators, Transparency report when the instance publishes it) groups, on wide
  screens and in the phone list.
- **Access tokens:** list with hint, scopes, last use and expiry; create with name, scopes (admin only for
  administrators), and an expiry; the token is shown once; revoke with confirmation; the instance's limit.
- **Applications:** list, create (the bot token is shown once, then the application opens), edit name,
  description, icon and public flag, copy the application ID, reset the bot token, add the bot to places
  where you have Manage place, delete. Slash commands are edited locally (name, description, up to ten
  typed options, required) and saved together, checked with the server's rules first.
- **Webhooks:** list with health (active, failing, disabled), create with events described in plain words
  (events that need View audit log or Manage reports are disabled without them), the signing secret shown
  once, edit, turn off and on, ping, rotate the secret, delete, and a delivery log filtered by status whose
  rows expand to the error and payload, with Redeliver.
- **Bots:** add a bot to the place by application ID or from your own applications.
- **Instance settings:** name, description, icon and who can create an account; the saved instance on the
  device picks up the new name. **Policies:** terms, privacy and guidelines with their versions (in effect,
  scheduled, earlier), each viewable; publishing is a full page that starts from the current text, with
  Write/Preview, a consent checkbox, now or a date up to a year ahead, and a confirmation.
- **UI:** `Checkbox` gained `disabled` and `description`; icons for flag, ban, key, server and code.
- **Tests:** permission groups and bit helpers past 32, overwrite states and scopes, role ranking and
  moves, role colors, durations and countdowns, audit wording (including ban lengths from timestamps and
  server-taken actions), transparency breakdowns, moderation notifications, token and webhook wording,
  webhook event rules and command validation in `@gotalk/core` (137 tests, up from 115).

Verified:

- unit tests and typecheck across the workspace, the web export, and `expo lint` clean for the new code
- three scripted Chromium runs against a local server on fresh data, with an owner (1280px), a moderator
  (1280px and 390px) and a member (390px):
  - the owner sees every settings section; creates Moderator and Helper roles, colors and permissions,
    reorders them; gives the moderator the role and a nickname; warns the member; denies @everyone Add
    reactions in a channel; reaches overrides from the forum header and the channel menu; reports a
    message from its menu
  - the member reports a post from a phone, and gets the warning and later the timeout in the inbox
  - the moderator sees only Members, Reports (count 2), Bans and Audit log; resolves one report with a note
    and dismisses the other; times the member out for an hour; bans them for a day and lifts it; reads it
    all in the audit log with names and lengths, filters it, opens one person's history, and does the same
    from a phone
  - as an instance administrator: creates, sees once and revokes a token; creates an application, saves a
    command with a required integer option, adds the bot to the place and finds it in Members; creates a
    webhook, pings it and expands the delivery; changes the instance name and registration mode and
    restores them; publishes community guidelines (a past date is refused); reads both transparency reports
- not yet exercised: iOS, Android and Tauri builds, screen readers, a webhook delivery that succeeds (the
  server refuses private and loopback URLs, so a local run only sees pending and failed deliveries), and a
  scheduled policy taking effect

Known gaps and decisions:

- The API has no user lookup by ID, so the audit log names someone who has left only if they appear in
  current bans or reports loaded in this session; otherwise they show as "a former member".
- `GET /users/@me/places` has no permissions, so adding a bot loads each joined place to find those you
  manage.
- Role and override changes reach other people's clients when their place and channel data next refresh
  (window focus, reconnect, or `CHANNEL_UPDATE` for channel overrides); there is no gateway event for role
  changes.
- The open-report count on the settings nav counts the first page, so it stops at 50.
- Reporting a person needs the chat member list, which is a wide-screen panel; on phones people can report
  messages and posts. Moderators reach members from place settings on any screen.
- Transferring ownership of a place (`POST /places/{place}/transfer`) is not in the client yet.
- Published policy versions cannot be edited or withdrawn, because the API has no way to; the publish
  confirmation says so.
- Role colors offer none and the four accents from `DESIGN.md`; roles given other colors through the API
  keep them until changed.

## Phase 7 — Topic feeds ✅

Goal: a Reddit-style feed of forum topics for a place and for the whole instance, with several sort orders,
where topics the person has already opened look different from the ones they have not.

Mockups: [Topic feeds](./mockups/17-feeds.html) (Home and place feeds at desktop and phone widths, rows
that are unread, read, and read with new replies, votes, NSFW collapsed, Top with a time window, filters,
pinned topics lifted out, the row menu, mark all as read, the reconnect, empty and loading states, and
signed-out Explore) is the reference for these screens. `DESIGN.md` gained `feed-row` / `feed-row-read`
and `vote-control` / `vote-control-active`, built from existing tokens. It needed no new ones: read titles
drop to `mute` and regular weight, and a vote lifts its square one surface step rather than using an accent
color.

Delivered:

- **Feed screens** (`components/feed.tsx`):
  - **Place page** (`places/[slug]`): the feed and the old overview are one page. The place's header (icon,
    name, description, members / forums / channels / since, Join or the invitation notice, and for members
    Mark all as read and Invite people) sits on top of the place's feed, which covers every forum the person
    can read, with a forum filter (a category includes its forums). Opening a place lands here; the sidebar
    has a single Home row (house icon) for it, and `places/[slug]/feed` redirects here with its filters. Phones have no
    sidebar, so a Feed / Forums and chat switch under the header shows the forum and channel list instead
    of the feed. Members, and anyone in a public place, get the feed; others see the header only.
  - **Home feed** (`/feed`): a Home entry at the top of the rail and a Home tab first on phones. It shows
    topics from the person's places, with a switch to "All of {instance}". Search moved in here: a search
    button in the Home title bar (a Search button in the header on wide screens) opens the place search,
    which keeps the Home tab highlighted and goes back to the feed. That brings the tab bar back to five tabs:
    Home, Places, Messages, Inbox and You.
    Every row names its place.
  - **Explore** (`/explore`, `/explore/topics/[id]`): signed-out browsing of public topics, reached from
    "Browse public topics" on the sign-in screen. The topic view is read-only and ends with Sign in and
    Create an account. Signed-in people are sent to the matching signed-in screen.
  - **Rows:** title, a plain-text excerpt (two lines), forum (and place) names, author, age, reply count,
    and badges (N new, pinned, locked, solved, NSFW, tags). Wide screens put the vote column on the left;
    phones put votes and replies in a footer. NSFW topics only come back when Show NSFW is on, and then stay
    collapsed until tapped.
  - **List:** a virtualized `FlatList` over the cursor pages. Topics already loaded are dropped when a
    score change moves them across the cursor (`feedItemsOf`). More pages load as the end scrolls into view
    (with a Load more button on wide screens), and phones have pull to refresh. Feeds stay mounted under
    the topic in the stack, so going back keeps the scroll position. There is no live insertion of new
    topics.
- **Sorting:** Hot, New, Active, Top, Rising and Controversial as pills (a sideways-scrolling row on
  phones), plus a time-window chip for Top and Controversial. The instance's `feed.sorts` decides what is
  offered. Controversial and every vote control disappear when `features.topic_votes` is missing or the
  place has voting off. The sort and window are kept in the URL (`?sort=top&t=all`) and remembered on the
  device per instance and per feed (home, all, place, explore). A link that names a sort always wins.
- **Filters:** a dialog (a sheet on phones) with forum (place feeds), tag, All/Solved/Unsolved, Hide read
  (signed in), Pinned first (place feeds, which lifts pinned topics above the ranking on the first page)
  and Show NSFW. It applies on Done. Active filters show as removable tags under the sort bar, the Filters
  button counts them, and they live in the URL.
- **Voting** (`VoteControl`): up and down with the score between them (`1.2k` above a thousand). Pressing
  the active arrow clears the vote. Votes apply to every cached copy at once and roll back with a message
  when the server refuses. Your own topics show the score with the arrows off; signed out, the arrows go
  to sign in. The topic view header carries the same control.
- **Read state** (`lib/feeds.ts`):
  - Opening a topic from anywhere records it (`PUT /topics/{id}/read`) when the topic screen mounts, on top
    of the read position Phase 3 already sends. Scrolling past a row never marks it.
  - Opens, votes, Mark as read / unread and server read states are applied to every cached copy of the
    topic (feed pages, forum topic lists, the topic itself) through `patchTopicEverywhere`. The row is
    restyled before the person navigates back.
  - Unread rows keep the white, medium-weight title; read rows drop to the muted title. Read topics with
    replies since the last open add an "N new" badge from the server's `new_reply_count`. The label reads
    "unread", "read" or "read, N new replies" (`describeTopicReadState`).
  - The row menu (the … button, or a long press) offers Mark as unread or Mark as read, Open {forum}, and
    Copy link on the web.
  - **Mark all as read** asks first. On a place feed it calls `POST /places/{place}/feed/read` with the
    first page's `as_of` (and the forum filter), patches the loaded rows, and refetches so topics active
    since then stay unread. On the Home feed it marks the loaded unread topics in batches of
    `feed.read_batch`.
  - The Phase 3 forum topic list reads the same `viewer` object: its dot means not opened yet, plus the same
    "N new" badge.
  - `TOPIC_READ_STATE_UPDATE` events patch the caches (the `all: true` form patches the place and
    refetches). After a gateway gap, feeds and topic lists are refetched with the rest.
  - **Signed out:** opened topics are kept in a per-instance record on the device (`createFeedReadStore`
    in `@gotalk/core`, at most 2,000, oldest dropped) and dim the rows in Explore. After sign-in,
    `FeedSyncHost` imports them with `POST /feed/read` and forgets them.
  - **Offline:** an open that fails for lack of a connection (or a 5xx) is queued on the device and sent
    through `POST /feed/read` once the app is online and signed in. Rate limiting waits for `Retry-After`;
    other refusals drop the queued opens.
- **Place settings:** a Topic voting checkbox in General (Manage place), saved as soon as it changes
  (`voting_enabled`), shown when the instance supports votes.
- **`@gotalk/core`** (`feeds.ts`): sort and filter parsing and URL serialization with defaults left out,
  the API query per scope, offered sorts, score formatting, read-state descriptions, optimistic vote / open
  / unread / all-read transforms, server read states, page patching and de-duplication, the mark-all cut-off,
  and the persisted read record and open queue. `@gotalk/gateway` types `TOPIC_READ_STATE_UPDATE`.
- **Backend addition:** the viewer and read-state objects gained `new_reply_count` (posts since the last
  open), because `unread_count` counts from the read position and overstated "N new". It is covered in the
  server's feed test.
- **Tests:** 17 new in `@gotalk/core`: URL round trips and invalid values, remembered sorts, API queries
  per scope, offered sorts, score formatting, read descriptions (including signed out), every optimistic
  transform, page patching and de-duplication, the mark-all cut-off, the read record cap, the queue, and
  persistence that survives writes made before hydration.

Verified:

- typecheck and unit tests across the workspace (core 154), the web export, and `expo lint` clean for the
  new and changed code
- a scripted Chromium run against a local server with seeded data (two public places, a Q&A forum, an NSFW
  forum, votes, replies and a pinned topic) at 1280px and 390px:
  - signed out: Explore lists public topics without the NSFW forum; votes ask to sign in. Opening a topic
    shows it read-only and dims it on return, and the record survives in local storage. Signing in as a
    member imports it (the topic reads as read on the server) and clears the record.
  - as a member:
    - Hot, New and Top with All time order the seeded topics correctly (every sort's ordering is
      covered by the server's tests). Own topics show the score with disabled arrows.
    - Voting up, switching to down, clearing and voting again match the server, and the arrow press does
      not open the topic.
    - Opening an unread topic restyles it on return, and Mark as unread works.
    - Hide read keeps read topics with new replies. Forum filter and pinned-first lift the pinned topic.
    - NSFW stays collapsed until shown. Sort, window and filters land in the URL, and the remembered sort
      comes back on the next visit.
    - "N new" counts replies since the open. Mark all as read leaves a topic that got a reply after the
      feed loaded as "1 new".
    - Home shows only the member's places; All adds the other public place.
    - A read made in another session restyles the row live through the gateway.
    - An open made while offline is queued on the device and reaches the server after reconnecting.
  - as the owner: turning Topic voting off removes the votes and Controversial from the place feed. The
    board topic list shows the same read, unread and "N new" states as the feed.
- after merging the feed into the place page (1280px and 390px): the owner sees the header with counts,
  Mark all as read and Invite people above the feed, and on a phone switches to Forums and chat.
  `places/[slug]/feed?sort=new&hide_read=1` lands on the place page with both filters. A non-member of a
  public place sees Join above the feed (and no Mark all as read); joining turns on the member header and
  votes. A non-member of an invite-only place sees only the header and the invitation notice.
- not yet exercised: iOS, Android and Tauri builds, pull to refresh and long press on a device, a muted place
  leaving Home in the client (covered by the server's tests), screen readers, and feeds long enough to
  repeat a topic across pages

Known gaps and decisions:

- Only the sort and window are remembered per feed; filters live in the URL.
- Hide read is not offered signed out (the server ignores it without an account), and the local read
  record is per device, not shared between browsers.
- The Home feed's Mark all as read covers the loaded topics only; the API has no instance-wide endpoint.
- Copy link copies the web client's address and is offered on the web only; there are no server-rendered
  topic pages to link to yet.
- Voting stays separate from reactions; the client does not add reactions into the score.
- Per-forum unread counts in the sidebar, live "N new topics" banners, thumbnails, saved topics, custom
  multi-place feeds and a per-forum default sort remain out of scope.

## Phase 8 — Self-hosting follow-through ✅

Goal: take up what the backend's storage and email support made possible and what its new setup, settings and
CORS controls changed. People can reset a forgotten password, confirm their email address and upload
avatars and icons. Administrators can see what is wrong with their instance and fix it without leaving the
app. The app copes with instances that restrict which sites and apps may connect.

Mockups: [Forgot password](./mockups/18-forgot-password.html), [Uploads](./mockups/19-uploads.html) and
[Server settings](./mockups/20-server-settings.html) are new, and [Connect](./mockups/01-connect.html) (setup
needed, the refused-connection hint), [Account settings](./mockups/04-account-settings.html) (the photo picker,
Confirm your email, Resend and Verified) and [Instance administration](./mockups/15-instance-admin.html) (the
Server link, the attention dot and notice, the icon upload) were updated. `DESIGN.md` gained `image-picker` and
`image-picker-banner`, built from existing tokens: the preview is the 64px avatar or app-icon tile with the
initials fallback, the actions are the small tertiary and secondary buttons, and the banner fades into the
canvas on wide screens instead of using a scrim color. The mockups gained an info notice style and `mail`,
`image`, `upload` and `refresh` icons, mirrored in `@gotalk/ui`.

Delivered:

- **Contract sync:** `pnpm api:sync` against a Phase 7 server (127 paths). The hand-built `Instance` fixture in
  the core tests has the new fields. `@gotalk/core` has `instanceCapabilities(instance)` (email, password reset,
  email verification, uploads, the upload limits, awaiting setup, needs attention and the degraded features),
  and every new control is hidden when the instance lacks the feature. Older servers that omit a flag get the
  feature off and the server's default limits.
- **Uploads in `@gotalk/api-client`:** `uploadImage(client, target, blob, type)` and `removeImage` for the
  avatar, place icon and banner, and the instance icon. The image is a `Blob` sent as the raw body with its
  content type, so the auth manager's single 401 retry resends it. Refusals throw `UploadError` with a kind:
  `413` (and a `422` saying "larger than") too large, other `422` unsupported, `503` storage unavailable, `429`
  rate limited. `ApiError` and `unwrap` moved to their own module so the upload helper has no import cycle.
- **Forgot password** (`/forgot-password`): a "Forgot your password?" link under the sign-in password when the
  instance has `password_reset`, otherwise a hint to ask the administrator. The request screen always answers
  "If an account uses that address, we've sent it a link", Resend waits 60 seconds, `429` shows the countdown,
  `503` says the instance can't send email, and the link opens the instance's own `/reset-password` page. The
  signed-out notice now reads "This session was ended, from another device or by a password reset".
- **Confirm your email** (Profile): the address with a Verified or Not confirmed badge, and on instances that
  confirm addresses a notice with Resend (`409` already confirmed refreshes the profile, `409` within the minute
  and `429` show the wait, `503` says email is down). The profile is refetched when the window or app regains
  focus (`useOnAppFocus`), so the badge appears on return from the browser. Signing up on such an instance
  shows "Your account is ready. We sent a link to {email}" before continuing. Nothing is gated on it.
- **Image pickers** (`components/image-picker.tsx`): the avatar in Profile, the place icon and banner in General
  (Manage place) and the instance icon, which replaces the URL field. Web and desktop use a file input and a
  canvas; phones use `expo-image-picker` and `expo-image-manipulator` (installed with `npx expo install`, with
  the photo library permission in `app.json`). `planImageUpload` center-crops avatars and icons to a 512px
  square, fits banners to 1920px wide, re-encodes formats the instance doesn't take but the device can decode
  (HEIC, AVIF) as JPEG, and sends GIFs as they are. Type and size are checked against `limits` before sending.
  "Uploading…" replaces a progress bar. Without uploads the pickers become image URL fields.
- **Stale images:** `Avatar` and `InstanceIcon` fall back to the initials when the image fails, through
  `useImageFallback`, which remembers failed URLs for ten minutes so every copy of a deleted avatar switches
  at once. A changed own avatar or display name is patched into every cached copy (`patchUserDeep` over the
  instance's queries), the profile and the stored session. Saved instances pick up a new name or icon whenever
  `GET /instance` is fetched (`instancesStore.refresh`), not only after the administrator's own save.
- **Banners:** the place page shows `banner_url` as a 96px strip above the header on phones and a 168px band
  behind the header on wide screens, faded into the canvas.
- **Health and setup:** the connect screen keys off `awaiting_setup` and offers "Open setup page"
  (`{origin}/setup`). Administrators see the degraded features as a notice at the top of Instance settings
  (with "Open server settings") and a dot on the Instance group in the settings sidebar and phone menu.
- **Refused connections:** on the web, a failed lookup (connect screen), a failed request (`FailureNotice`,
  `failureMessage`) or a gateway that never connects (the connection banner) to an instance on another origin
  and not on this machine adds "This instance may not allow connections from {origin}. Its administrator can
  allow it in the server settings" (`refusedConnectionHint`). Phones send no origin and never show it.
- **Server settings** (`/settings/server`, instance administrators): the live checks (`GET /instance/checks`)
  with status, detail and hint, and Re-run; then Email, Storage, Voice and CORS as tabs. Field lists per driver
  live in `@gotalk/core` (`MAIL_DRIVERS`, `STORAGE_DRIVERS`, `VOICE_FIELDS`, `CORS_FIELDS`); a driver the client
  doesn't know points to `{origin}/setup`. Each section says where its settings come from: config-managed
  sections are read-only and name the variable (`GOTALK_MAIL_DRIVER`), saved ones show when and offer Reset to
  defaults. Secrets show "Set · leave empty to keep it" and empty secrets are left out of the request. Save
  runs the live check; a `422` shows the failing check and Save anyway (`?force=true`). Send test email goes to
  the administrator's address. The result says changes reach every server within 15 seconds, and `/instance`
  is refetched then and after 15 seconds. Guard rails: a CORS list that leaves out the page in use warns and
  confirms, `*` with credentials is explained and blocked, the desktop origins and the page are one-tap
  suggestions, and changing storage warns that files are not moved (`gotalk backup` and `restore`).
- **Tests:** 36 new in `@gotalk/core` (190): capabilities with and without each feature and on older servers,
  degraded copy, upload checks and hints, the resize plan and conversions, upload failure copy, the resend wait,
  email error mapping, the never-says-no-account copy, provider field lists, form loading, secrets (empty keeps,
  set shows), required fields, the config variable name, the failed-check parser, CORS matching, the lock-out
  and credentials checks, suggestions, the refused-connection hint, `patchUserDeep`, the instances store
  refresh, and a 401 refresh that resends an uploaded image. 10 new in `@gotalk/api-client` (14): content type,
  raw body and path, `413`/`422`/`503`/`429` mapping and removal. `@gotalk/ui` gained tests (5) for the image
  fallback memory that `Avatar` and `InstanceIcon` use.

Verified:

- typecheck and unit tests across the workspace, `expo lint` clean for the new and changed code, and the web
  export
- a scripted Chromium run against a local server (Compose with the `mail` profile) at 1280px and 390px:
  - without email: no forgot-password link but the hint, the forgot screen says the instance can't send email,
    no confirmation notice, and the needs-attention notice and dot for administrators
  - Server settings: the health list; Email with an unreachable host fails its check, Save anyway saves it,
    Reset to defaults restores the defaults; Email through Mailpit, Send test email arrives, Save makes the
    instance healthy and clears the dot; Voice saved with a secret, then again with the secret left empty, keeps
    it (`secrets_set`); a broken S3 storage warns that files are not moved, and uploads then show the storage
    message (`503`); an environment-managed storage section is read-only with `GOTALK_STORAGE_DRIVER`
  - uploads: a 1600×1000 JPEG becomes a 512px instance icon, a 900×1200 PNG a 512px avatar, an 800px icon and a
    3000×900 banner become 512px and 1920×576; replacing the avatar deletes the old file (`404`) and the stored
    session follows; a broken place icon falls back to the initials in the rail and header after one failed
    request; an unsupported file and a 9 MB GIF are refused before sending; the banner shows behind the header
    at 1280px and as a strip at 390px
  - email: Resend sends the confirmation through Mailpit and waits 60 seconds; confirming in the browser and
    returning flips the badge to Verified; sign-up on the instance shows where the link went
  - password reset: a reset completed on the instance's page signs the open app out with the new copy, and an
    API session gets `401`; the app's forgot screen sends the link (a second request inside the minute sends
    nothing, matching the server), Resend after the wait sends it, and signing in with the new password works
  - CORS: the lock-out warning and confirmation, `*` with credentials blocked, one-tap origins; after saving a
    list without the page, a lookup of the instance by host name adds the hint, and a signed-in page whose
    gateway handshake is refused (`403`) shows it in the connection banner
- not yet exercised: iOS, Android and Tauri builds, the native image picker and manipulator, an instance whose
  storage cannot open at all (the server refuses such configurations at boot, so the URL fallback was not seen
  against a live server), the setup-needed connect state against a fresh server, a second replica picking up a
  change, and S3 storage that works

Known gaps and decisions:

- Re-encoding before upload was kept (the open question): the server only strips metadata, and serving phone
  photos at full size to every viewer was the worse cost. There is no crop editor.
- Uploads cover avatars, place icons and banners, and the instance icon. Images in posts and chat, link
  previews and thumbnails wait for backend attachments (the `ATTACH_FILES` flows, still deferred). Application
  icons also stay URLs.
- Uploaded files are served by URL without a sign-in, so the icon of a private place is not secret.
- No change-email flow: the backend has no endpoint, so a mistyped address cannot be corrected from the app.
- No gateway event announces a changed avatar or display name, so others see it on their next refetch.
- No native setup wizard, and no deep-linking of reset or confirmation links into the app.
- The refused-connection hint is a guess: browsers hide why a cross-origin request failed, so the hint shows
  for any failure to reach another site's instance from the web, and never for one on this machine.
- Backups, restore and `gotalk setup --reset` are command-line tools; the app only mentions them in the
  warnings above.
- Data export, retention, email digests and push notifications are still not in the backend. Push stays in
  Phase 9.

## Phase 9 — Distribution & polish

- **Push notifications:** a small Gotalk-operated push relay (APNs/FCM), web push for the web app, and
  native notifications on desktop. Blocked on backend push subscription endpoints, which are not yet in the
  backend plan (backend Phase 7 delivered email, not push).
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
  - attachments for posts and chat (avatar, place and instance image upload shipped with backend Phase 7;
    application icon upload and a gateway event for changed avatars and display names are still missing)
  - a change-email endpoint (email confirmation exists, but an address cannot be changed)
  - OAuth/OIDC with PKCE for native clients when backend auth providers land
- **Decisions still open:**
  - styling stays on plain `StyleSheet` + tokens, or moves to Unistyles/Tamagui (revisit when
    responsive variants get heavy)
  - Markdown renderer/editor library
  - final app identifiers (`sh.gotalk.app` / `sh.gotalk.desktop` are placeholders)
