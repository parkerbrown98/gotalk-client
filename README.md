# Gotalk client

Official client for [Gotalk](../gotalk-server/README.md) instances. One codebase ships to iOS, Android,
web and desktop:

| Target | How |
|---|---|
| iOS / Android | [Expo](https://expo.dev) (React Native, Expo Router) in [`apps/app`](apps/app) |
| Web | The same Expo app exported as a single-page app (`react-native-web`) |
| Desktop (Windows/macOS/Linux) | [Tauri v2](https://tauri.app) in [`apps/desktop`](apps/desktop), wrapping the web export |

Like Mastodon or Matrix clients, the app is not tied to one server: users enter an instance address and
the client discovers it via `/.well-known/gotalk-instance` and `GET /api/v1/instance`.

## Layout

| Path | Contents |
|---|---|
| `packages/tokens` | Design tokens from [DESIGN.md](DESIGN.md) (colors, spacing, radii, Inter type scale, breakpoints) → one typed dark theme and `dist/tokens.css` (`--gt-*` CSS variables for non-React surfaces such as server-rendered pages) |
| `packages/ui` | `ThemeProvider`/`useTheme` and primitives (`Text`, `Button`, `TextField`, `Card`, `Stack`, `Screen`, `Badge`) built on React Native |
| `packages/api-client` | Typed REST client generated from the server's OpenAPI document (`openapi-typescript` + `openapi-fetch`) |
| `packages/core` | Framework-agnostic client logic: instance discovery, API compatibility checks, saved-instance store, auth, Markdown, chat and feed helpers |
| `packages/gateway` | Framework-agnostic WebSocket client for the real-time gateway: identify, heartbeats, reconnects, close codes, catch-up after a gap |
| `apps/app` | Expo Router app (mobile + web) |
| `apps/desktop` | Tauri shell |
| `docs/mockups` | Static HTML mockups of each flow for web, desktop and phone, built from the tokens (see the [design process](docs/client-plan.md#design-process)). Open `docs/mockups/index.html` after `pnpm build` |
| `docs/brand` | SVG masters for the app icon (rounded, full-bleed iOS, macOS grid), Android adaptive layers, favicon and splash glyph; the PNGs in `apps/app/assets/images` and `apps/desktop/src-tauri/icons` (via `tauri icon`) are rendered from these |

Shared packages are consumed as TypeScript source; there is no separate package build step.

## Getting started

Requirements: Node 22.12+, pnpm 11, and for desktop builds Rust (stable) plus the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```sh
pnpm install
pnpm web          # web app at http://localhost:8081
pnpm dev          # Expo dev server (scan the QR code with Expo Go, or press a/i/w)
pnpm desktop      # Tauri window backed by the Expo dev server
```

Run a local server from [`../gotalk-server`](../gotalk-server) with `GOTALK_PORT=18080 docker compose up -d`, then
enter `localhost:18080` on the connect screen. Local and LAN hosts try `http://` before `https://`.
Instances must allow the client's origin in their CORS settings (the default is `*`). Administrators can change
them at runtime under Account → Server, where the desktop app's origins (`tauri://localhost`,
`http://tauri.localhost`) are one-tap suggestions.

Password resets and email confirmation need email. For local testing, start Mailpit with
`GOTALK_PORT=18080 docker compose --profile mail up -d`, then as an administrator choose SMTP under Account →
Server → Email with host `mailpit`, port `1025` and encryption None. Messages appear at http://localhost:8025.

Voice and video need the server's LiveKit media server: start it with
`GOTALK_PORT=18080 GOTALK_VOICE_LIVEKIT_URL=ws://localhost:7880 docker compose --profile voice up -d`.
On phones, voice needs a development build (`npx expo run:ios|android` or `eas build --profile
development`) because Expo Go lacks the WebRTC native modules; everything else still runs in Expo Go.

## Commands

| Command | Purpose |
|---|---|
| `pnpm typecheck` | Type-check every package |
| `pnpm test` | Unit tests (Vitest). Set `GOTALK_TEST_INSTANCE=localhost:18080` to also run discovery and the gateway against a live server |
| `pnpm build` | Web export to `apps/app/dist` and `packages/tokens/dist/tokens.css` |
| `pnpm desktop:build` | Desktop installers (runs the web export first) |
| `pnpm api:sync` | Refresh `packages/api-client/openapi.json` from a running instance and regenerate types (`GOTALK_OPENAPI_URL` overrides the default `http://localhost:18080/api/v1/openapi.json`) |
| `pnpm api:generate` | Regenerate `src/schema.ts` from the committed spec |

Inside `apps/app`, add dependencies with `npx expo install <pkg>` so versions match the Expo SDK, and
run `npx expo-doctor` after dependency changes.

## Theming

Every color, spacing, and type value comes from `@gotalk/tokens`, which mirrors [DESIGN.md](DESIGN.md).
The system is dark-only: there is no light theme and no shadows (depth comes from the surface ladder).
Components read the active theme through `useTheme()` from `@gotalk/ui`; nothing hard-codes colors.
`ThemeProvider` accepts `overrides` for per-instance branding. Text is Inter (registered in
`apps/app/src/app/_layout.tsx`) with `ss03` enabled: via `fontVariant` on native and
`font-feature-settings` on web. The desktop app is the web build, so it shares the theme
automatically. `tokens.css` makes the same values available to plain HTML/CSS.

Motion lives in `packages/ui/src/motion.ts` and uses Reanimated. Hover (web and desktop) lifts a row or
control one surface step, the same as pressing it; add `hoverTransition` and read `hovered` from
`PressState` so the color fades instead of snapping. Buttons shrink slightly while pressed, dialogs and
sheets animate in and out, menus fade in quickly, and frequent actions (tab and screen switches in the
shell) do not animate. Every animation respects the system's reduced-motion setting.

When DESIGN.md changes, update `packages/tokens/src`, then `packages/ui`, then the native config
(`apps/app/app.json`, `apps/desktop/src-tauri/tauri.conf.json`) and the web shell
(`apps/app/public/index.html`), which hold the canvas color as a literal.

## Accounts and token storage

Each saved instance has its own session. `createAuthManager` in `@gotalk/core` signs in, refreshes
(single-flight, one retry on 401) and signs out; `apps/app/src/lib/auth.ts` picks the storage per target:

| Target | Refresh token | Access token |
|---|---|---|
| iOS / Android | `expo-secure-store` (Keychain / Keystore, this device only) | memory |
| Desktop (Tauri) | OS keychain via the `secret_*` commands in `apps/desktop/src-tauri` | memory |
| Web | `localStorage` | memory |

On the web, any script running on the page can read `localStorage`, so a cross-site scripting bug would
expose the session. Keep third-party scripts out of the web build and serve it with a strict
Content-Security-Policy. Refresh tokens are single-use and reuse revokes the session, so tabs take a Web
Lock before refreshing and re-read the stored token inside it.

## Places and invite links

Signed-in screens live in `apps/app/src/app/(app)`: a place rail and sidebar from 768px up, a tab bar
below. Whether an action is shown comes from `hasPermission` in `@gotalk/core`, which reads the server's
`my_permissions` bitfield; the server still decides. Invite links carry their instance so they work for
someone who has not added it yet: `https://<web client>/invite/<code>?instance=<origin>` on the web and
`gotalk://invite/<code>?instance=<origin>` in apps and the desktop shell.

## Forums and Markdown

Forums live under `apps/app/src/app/(app)/places/[slug]` (`boards/[id]`, `topics/[id]`, `search`) and the
inbox at `(app)/inbox`. Data hooks and mutations are in `apps/app/src/lib/forums.ts`; they use offset
paging because that is what the API provides. Post text goes through `parseMarkdown` in `@gotalk/core`
(`marked` lexer, converted to a closed tree) and the `Markdown` component renders that tree, so raw HTML
is shown as text and only http(s) and mailto links open. Drafts are stored on the server under
`topic:<board id>` and `reply:<topic id>[:<post id>]` and are removed once the post is sent.

## Topic feeds

Feeds live at `(app)/feed` (Home: the person's places, or every public topic with `?scope=all`),
each place's own page `(app)/places/[slug]` (its header on top of its feed; `…/feed` redirects there), and `explore` for signed-out visitors. They use the server's cursor paging in a
virtualized list. Sort, window and filters are kept in the URL; the sort is also remembered per instance
and feed. `apps/app/src/lib/feeds.ts` holds the queries and every feed mutation. Votes and read changes
are applied first to every cached copy of the topic (feeds, forum lists, the topic itself) and rolled
back if the server refuses. Opening a topic from anywhere records it as read. Signed out, opened topics
are remembered on the device and imported after sign-in. Opens that fail offline are queued and sent
later (`FeedSyncHost`). The pure parts (URL parsing, optimistic transforms, page patching, the read record
and queue) are in `@gotalk/core` `feeds.ts`.

## Real-time and chat

`@gotalk/gateway` keeps one WebSocket per active instance. It identifies with the session's current
access token, heartbeats at the server's interval, and reconnects with jittered backoff (at once on
`4007`; it stops on `4010`, when the session ended). The server cannot resume a session, so after a
reconnect `apps/app/src/lib/realtime.ts` asks every loaded channel for `GET …/messages?after=<last id>`
and refreshes the lists that summarize them. Events write straight into the TanStack Query caches that
the screens read, so there is one source of truth whether data came from a request or the gateway.

Chat lives in `(app)/places/[slug]/channels/[id]` (threads open beside it on wide screens and as
`threads/[thread]` on phones) and `(app)/messages`. People with Manage channels create, edit, reorder and
delete channels and categories from the sidebar and the channel menu (`components/channel-menu.tsx`). Sends are optimistic: each carries a nonce the server
echoes, so the response and the `MESSAGE_CREATE` event settle the same pending message. Sends made while
offline wait for the connection; refused ones offer Retry and Delete. Message actions appear on hover on
wide screens with a hovering pointer and on a long press elsewhere. Presence (online, idle, do not
disturb, invisible) is chosen from the account row or the You tab, remembered per instance on the device,
and sent when connecting.

## Releases

CI (`.github/workflows/ci.yml`) type-checks, tests and builds the web export, and lints the
Tauri crate with `cargo clippy`, on every pull request and push to `main`.

Pushing a `v*` tag runs `.github/workflows/release.yml`: it re-runs CI, builds desktop installers
for macOS (arm64, x64), Linux and Windows, and publishes them to a GitHub release. Tags with a
suffix (`v0.1.0-beta.1`) are marked as pre-releases. Bump `version` in
`apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/Cargo.toml` and
`apps/desktop/package.json` first; the workflow fails if the tag's version does not match
`tauri.conf.json`. Installers are currently unsigned, so macOS and Windows show a warning on first launch.

## Desktop notes

- The window loads the static web export. Deep routes fall back to `index.html`, so reloads work.
- `apps/app/public/index.html` is the HTML shell for the web export and dev server. It paints the
  launch splash (glyph and loading bar) before the JS bundle runs, and `hideSplash` in
  `apps/app/src/lib/splash.ts` fades it out once fonts and saved sessions load (or the root error
  boundary renders). It must stay HTML and CSS only, because the CSP blocks inline scripts.
- The window has no native title bar. `DesktopFrame` in `apps/app/src/components/title-bar.tsx` draws a
  40px bar (drag to move, double-click to maximize) matching the mockups' window chrome. macOS keeps its
  traffic lights over the bar (`titleBarStyle: Overlay` and `trafficLightPosition` in `tauri.conf.json`);
  Windows and Linux get web-drawn minimize, maximize and close buttons. The main window has
  `create: false` and is built in `src-tauri/src/lib.rs`, which turns off decorations outside macOS.
- The app should never feel like a web page. `apps/app/src/lib/desktop.ts` (`isDesktop`, `desktopOS`)
  adds `gotalk-desktop` classes that `public/index.html` styles: text is only selectable in inputs and
  `<Text selectable>` (mark message bodies, codes and other content selectable), controls use the arrow
  cursor, images and links do not drag, and Windows and Linux get slim scrollbars. It also swallows
  WebView2's browser shortcuts (reload, print, find and so on). Web links open in the default browser
  through `openExternal`, and copy and paste go through the system clipboard (`src/lib/clipboard.ts`).
- Right-click never shows the webview's menu. `DesktopContextMenu` in
  `apps/app/src/components/context-menu.tsx` offers Cut, Copy, Paste and Select all in text fields, Copy
  on selected text, and Open or Copy link on links marked with `externalLink(url)`. Components open their
  own menus at the pointer with `{...contextMenu((anchor) => …)}` (messages, feed rows, members, the
  place header, channel categories).
- `src-tauri/src/lib.rs` appends `Gotalk/<version> (<os>)` to the webview's user agent, so the server and
  Settings → Devices see "Gotalk for macOS" rather than a browser. It also turns off link previews
  (macOS) and form suggestions (WebView2).
- The CSP allows `connect-src` to any `https:`/`wss:` origin (plus `http:`/`ws:` for local servers),
  because users choose their own instance. Scripts are limited to `'self'`. Styles allow
  `'unsafe-inline'` because react-native-web and expo-font add `<style>` tags at runtime, so
  `dangerousDisableAssetCspModification: ["style-src"]` stops Tauri adding a nonce there (a nonce makes
  browsers ignore `'unsafe-inline'`, which left packaged builds unstyled).
- Debug the webview on Windows by launching with
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223` and opening `http://localhost:9223`.

See [`docs/client-plan.md`](../../docs/client-plan.md) for the roadmap.
