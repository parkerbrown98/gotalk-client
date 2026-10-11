# Accounts and instances

[Documentation](README.md)

Each saved instance has its own session. Switching servers does not share credentials
between them.

## Table of contents

- [Instance discovery](#instance-discovery)
- [Session management](#session-management)
- [Token storage](#token-storage)
- [Web security and multiple tabs](#web-security-and-multiple-tabs)

## Instance discovery

Users enter an instance address, and the client discovers the API and gateway using
`/.well-known/gotalk-instance` and `GET /api/v1/instance`. Local and LAN hosts try HTTP
before HTTPS. See [Getting started](getting-started.md#connect-to-a-server) for a local
instance and [Places and invites](places-and-invites.md#invite-links) for instance-aware links.

## Session management

`createAuthManager` in `@gotalk/core` signs in, refreshes and signs out. Refresh is
single-flight, with one retry on a `401`. [apps/app/src/lib/auth.ts](../apps/app/src/lib/auth.ts)
picks token storage for each target.

## Token storage

| Target | Refresh token | Access token |
|---|---|---|
| iOS / Android | `expo-secure-store`: Keychain / Keystore, this device only | Memory |
| Desktop (Tauri) | OS keychain via the `secret_*` commands in [apps/desktop/src-tauri](../apps/desktop/src-tauri) | Memory |
| Web | `localStorage` | Memory |

## Web security and multiple tabs

On the web, any script running on the page can read `localStorage`, so a cross-site
scripting bug would expose the session. Keep third-party scripts out of the web build and
serve it with a strict Content-Security-Policy.

Refresh tokens are single-use and reuse revokes the session. Tabs take a Web Lock before
refreshing and re-read the stored token inside it.
