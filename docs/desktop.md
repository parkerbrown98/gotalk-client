# Desktop

[Documentation](README.md)

The Tauri shell loads the static web export and shares the mobile/web component tree and
theme. Deep routes fall back to `index.html`, so reloads work.

## Table of contents

- [Launch splash](#launch-splash)
- [Window chrome](#window-chrome)
- [Native-feeling interaction](#native-feeling-interaction)
- [Context menus](#context-menus)
- [User agent and platform behavior](#user-agent-and-platform-behavior)
- [Content-Security-Policy](#content-security-policy)
- [Debugging on Windows](#debugging-on-windows)

## Launch splash

[apps/app/public/index.html](../apps/app/public/index.html) is the HTML shell for the web
export and dev server. It paints the launch splash (glyph and loading bar) before the JS
bundle runs.

`hideSplash` in [apps/app/src/lib/splash.ts](../apps/app/src/lib/splash.ts) fades it out once
fonts and saved sessions load, or the root error boundary renders. The splash must stay
HTML and CSS only because the CSP blocks inline scripts.

## Window chrome

The window has no native title bar. `DesktopFrame` in
[apps/app/src/components/title-bar.tsx](../apps/app/src/components/title-bar.tsx) draws a
40px bar matching the mockups' window chrome: drag to move and double-click to maximize.

macOS keeps its traffic lights over the bar, using `titleBarStyle: Overlay` and
`trafficLightPosition` in [tauri.conf.json](../apps/desktop/src-tauri/tauri.conf.json).
Windows and Linux get web-drawn minimize, maximize and close buttons. The main window has
`create: false` and is built in [src-tauri/src/lib.rs](../apps/desktop/src-tauri/src/lib.rs),
which turns off decorations outside macOS.

## Native-feeling interaction

The app should never feel like a web page.
[apps/app/src/lib/desktop.ts](../apps/app/src/lib/desktop.ts), with `isDesktop` and
`desktopOS`, adds `gotalk-desktop` classes styled by
[the web shell](../apps/app/public/index.html):

- Text is only selectable in inputs and `<Text selectable>`; mark message bodies, codes
  and other content selectable.
- Controls use the arrow cursor.
- Images and links do not drag.
- Windows and Linux get slim scrollbars.

It also swallows WebView2's browser shortcuts, such as reload, print and find. Web links
open in the default browser through `openExternal`, and copy and paste go through the
system clipboard in [apps/app/src/lib/clipboard.ts](../apps/app/src/lib/clipboard.ts).

## Context menus

Right-click never shows the webview's menu. `DesktopContextMenu` in
[apps/app/src/components/context-menu.tsx](../apps/app/src/components/context-menu.tsx)
offers **Cut**, **Copy**, **Paste** and **Select all** in text fields, **Copy** on selected
text, and **Open** or **Copy link** on links marked with `externalLink(url)`.

Components open their own menus at the pointer with
`{...contextMenu((anchor) => ...)}`: messages, feed rows, members, the place header and
channel categories.

## User agent and platform behavior

[src-tauri/src/lib.rs](../apps/desktop/src-tauri/src/lib.rs) appends
`Gotalk/<version> (<os>)` to the webview's user agent, so the server and **Settings > Devices**
see "Gotalk for macOS" rather than a browser. It also turns off link previews on macOS and
form suggestions in WebView2.

## Content-Security-Policy

The CSP allows `connect-src` to any `https:`/`wss:` origin, plus `http:`/`ws:` for local
servers, because users choose their own instance. Scripts are limited to `'self'`.

Styles allow `'unsafe-inline'` because `react-native-web` and `expo-font` add `<style>`
tags at runtime. `dangerousDisableAssetCspModification: ["style-src"]` stops Tauri adding
a nonce there: a nonce makes browsers ignore `'unsafe-inline'`, which left packaged builds
unstyled. See [tauri.conf.json](../apps/desktop/src-tauri/tauri.conf.json) for the policy.

## Debugging on Windows

Launch with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223`, then open
<http://localhost:9223> to debug the webview.

See [Getting started](getting-started.md) for running the shell and
[Releases](releases.md) for installers.
