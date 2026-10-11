# Gotalk client documentation

[Back to the README](../README.md)

Run the client, connect it to a Gotalk instance, and learn how the shared mobile, web and
desktop codebase works.

## Table of contents

- [Get started](#get-started)
- [How the client works](#how-the-client-works)
- [Build and contribute](#build-and-contribute)
- [Design and roadmap](#design-and-roadmap)

## Get started

| Guide | Covers |
|---|---|
| [Getting started](getting-started.md) | Requirements, web and mobile development, desktop, a local server, CORS, email and voice |
| [Accounts and instances](accounts-and-instances.md) | Instance discovery, independent sessions, token storage and web security |

To host an instance, use the [Gotalk server documentation](https://github.com/parkerbrown98/gotalk-server/tree/main/docs).

## How the client works

| Guide | Covers |
|---|---|
| [Places and invites](places-and-invites.md) | Responsive navigation, permissions and instance-aware invite links |
| [Forums and feeds](forums-and-feeds.md) | Markdown, drafts, forum paging, ranked feeds, optimistic updates and offline read sync |
| [Real-time and chat](realtime-and-chat.md) | Gateway reconnection, cache updates, channels, threads, offline sends and presence |
| [Desktop](desktop.md) | Tauri window chrome, splash, clipboard, context menus, CSP and debugging |

## Build and contribute

| Guide | Covers |
|---|---|
| [Development](development.md) | Commands, tests, web exports, API schema generation and dependency changes |
| [Architecture](architecture.md) | Workspace layout and the responsibilities of shared packages |
| [Releases](releases.md) | CI, desktop installers, versioning, release tags and unsigned builds |

## Design and roadmap

| Guide | Covers |
|---|---|
| [Design and theming](design-and-theming.md) | Tokens, Inter, instance branding, motion, mockups and brand assets |
| [Design specification](../DESIGN.md) | The full visual design reference |
| [Client plan](client-plan.md) | Feature phases, implementation status and future work |
