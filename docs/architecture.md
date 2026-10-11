# Architecture

[Documentation](README.md)

One codebase targets mobile, web and desktop. Shared packages are consumed as TypeScript
source; there is no separate shared-package build step.

## Table of contents

- [Platforms](#platforms)
- [Workspace layout](#workspace-layout)
- [Design assets](#design-assets)

## Platforms

| Target | How |
|---|---|
| iOS / Android | [Expo](https://expo.dev), React Native and Expo Router in [apps/app](../apps/app) |
| Web | The same Expo app exported as a single-page app with `react-native-web` |
| Desktop (Windows/macOS/Linux) | [Tauri v2](https://tauri.app) in [apps/desktop](../apps/desktop), wrapping the web export |

The app is not tied to one server. Users enter an instance address, and the client discovers
it via `/.well-known/gotalk-instance` and `GET /api/v1/instance`. See
[Accounts and instances](accounts-and-instances.md).

## Workspace layout

| Path | Contents |
|---|---|
| [packages/tokens](../packages/tokens) | Design tokens from [DESIGN.md](../DESIGN.md): colors, spacing, radii, Inter type scale and breakpoints. Exports a typed dark theme and `dist/tokens.css` with `--gt-*` CSS variables for non-React surfaces, including server-rendered pages |
| [packages/ui](../packages/ui) | `ThemeProvider`, `useTheme` and React Native primitives: `Text`, `Button`, `TextField`, `Card`, `Stack`, `Screen`, `Badge` |
| [packages/api-client](../packages/api-client) | Typed REST client generated from the server's OpenAPI document with `openapi-typescript` and `openapi-fetch` |
| [packages/core](../packages/core) | Framework-agnostic instance discovery, API compatibility checks, saved-instance store, auth, Markdown, chat and feed helpers |
| [packages/gateway](../packages/gateway) | Framework-agnostic WebSocket client: identify, heartbeats, reconnects, close codes and catch-up after a gap |
| [apps/app](../apps/app) | Expo Router app for mobile and web |
| [apps/desktop](../apps/desktop) | Tauri shell |

## Design assets

| Path | Contents |
|---|---|
| [docs/mockups](mockups) | Static HTML mockups of each flow for web, desktop and phone, built from the tokens. Open [the mockup index](mockups/index.html) after `pnpm build` |
| [docs/brand](brand) | SVG masters for app icons, Android adaptive layers, favicon and splash glyph |

See [Design and theming](design-and-theming.md) for the design process and generated image assets.
