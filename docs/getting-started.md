# Getting started

[Documentation](README.md)

Start the client from source and connect it to an existing instance or a local Gotalk server.

## Table of contents

- [Requirements](#requirements)
- [Start the client](#start-the-client)
- [Connect to a server](#connect-to-a-server)
- [CORS and desktop origins](#cors-and-desktop-origins)
- [Test email locally](#test-email-locally)
- [Voice and video](#voice-and-video)
- [Next steps](#next-steps)

## Requirements

- Node 22.12+ and pnpm 11.
- For desktop development and builds: Rust (stable) and the
  [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.
- For a local server: Docker Compose and a checkout of
  [gotalk-server](https://github.com/parkerbrown98/gotalk-server).

Run the client commands below from the root of this repository. Shell examples that set
environment variables inline use POSIX shell syntax.

## Start the client

Install dependencies, then choose the target you want to run:

```sh
pnpm install
```

| Command | Target |
|---|---|
| `pnpm web` | Web app at <http://localhost:8081> |
| `pnpm dev` | Expo dev server: scan the QR code with Expo Go, or press `a`, `i` or `w` |
| `pnpm desktop` | Tauri window backed by the Expo dev server |

Choose one development command at a time. The desktop command starts the Expo server itself.
Voice on phones requires a development build; see [Voice and video](#voice-and-video).

## Connect to a server

Gotalk Official (`api.gotalk.sh`) is offered first. To use your own instance, choose
**Another server** on the welcome screen and enter its address.

For local development, run this command from your
[gotalk-server checkout](https://github.com/parkerbrown98/gotalk-server):

```sh
GOTALK_PORT=18080 docker compose up -d
```

Finish the server's setup wizard, then enter `localhost:18080` in the client. Local and LAN
hosts try `http://` before `https://`. On a phone, use the server machine's reachable LAN
address instead of `localhost`, which refers to the phone itself.

See the [server getting-started guide](https://github.com/parkerbrown98/gotalk-server/blob/main/docs/getting-started.md)
for first-run setup. [Accounts and instances](accounts-and-instances.md) explains discovery
and how sessions are kept separate.

## CORS and desktop origins

Instances must allow the client's origin in their CORS settings (the default is `*`).
Administrators can change them at runtime under **Account > Server**, where the desktop
origins are one-tap suggestions:

- `tauri://localhost` on macOS and Linux.
- `http://tauri.localhost` on Windows.

## Test email locally

Password resets and email confirmation need email. In the server checkout, start Mailpit:

```sh
GOTALK_PORT=18080 docker compose --profile mail up -d
```

Then, as an administrator, choose SMTP under **Account > Server > Email** with host
`mailpit`, port `1025` and encryption **None**. Messages appear at <http://localhost:8025>.

## Voice and video

Voice and video need the server's LiveKit media server. In the server checkout, start it with:

```sh
GOTALK_PORT=18080 GOTALK_VOICE_LIVEKIT_URL=ws://localhost:7880 docker compose --profile voice up -d
```

That URL works on the same machine. For a phone or another device, configure a LiveKit URL
the device can reach; see the [server voice setup guide](https://github.com/parkerbrown98/gotalk-server/blob/main/docs/getting-started.md#voice-channels).

On phones, voice requires a development build because Expo Go lacks the WebRTC native
modules; the other features can run in Expo Go. From [apps/app](../apps/app), use
`npx expo run:ios` or `npx expo run:android` with the platform's native build prerequisites,
or an EAS development build configured for the app.

## Next steps

- [Development](development.md): tests, builds and API schema generation.
- [Desktop](desktop.md): platform behavior and debugging.
- [Design and theming](design-and-theming.md): shared tokens, components and mockups.
- [Releases](releases.md): desktop downloads and the release process.
