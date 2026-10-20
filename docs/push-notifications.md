# Push notifications

[Documentation](README.md)

The client gets push notifications from Gotalk instances through a **Gotalk push gateway**
([gotalk-gateway](https://github.com/parkerbrown98/gotalk-gateway)). APNs, FCM and browser push services only take
pushes signed with the app publisher's credentials, so instances send their pushes to the publisher's gateway, which
forwards them. The instance encrypts each notification to a key that only this device holds. The gateway and the
push providers never see the text. See the server's
[push guide](https://github.com/parkerbrown98/gotalk-server/blob/main/docs/push.md) and the gateway's
[protocol](https://github.com/parkerbrown98/gotalk-gateway/blob/main/docs/protocol.md) and
[payload format](https://github.com/parkerbrown98/gotalk-gateway/blob/main/docs/payload.md).

## Table of contents

- [For people using Gotalk](#for-people-using-gotalk)
- [How registration works](#how-registration-works)
- [Receiving a push](#receiving-a-push)
- [Opening a push](#opening-a-push)
- [Building with push](#building-with-push)
- [Limits and known gaps](#limits-and-known-gaps)
- [Where the code lives](#where-the-code-lives)

## For people using Gotalk

**Settings > Notifications** (mockup: [Push notifications](mockups/23-notifications.html)), for the active instance:

| Setting | Scope | Where it is kept |
|---|---|---|
| Push notifications on this device | This device and this instance | On the device |
| What to notify you about (Direct messages, Mentions, Replies, New topics, Reactions, Solutions, Moderation) | The account, on every device | `PUT /users/@me/push-preferences` |
| Devices that get notifications | The account | `GET` and `DELETE /users/@me/push-subscriptions` |

- Turning push on asks for notification permission the first time, then registers the device. Browsers only show
  the prompt in response to a tap, so it is never shown on its own.
- When permission is blocked, the switch is disabled and the page says how to allow it again (phones also get an
  **Open settings** button).
- The page explains why push cannot be turned on:
  - the server has no push, its administrators turned it off, or its gateway has not verified it yet;
  - the desktop app;
  - a browser without Web Push;
  - Safari on iPhone outside a Home Screen web app;
  - Brave's default setting;
  - a gateway that does not serve this app.
- Mutes, quiet hours and Do not disturb are applied by the server. Muted activity never creates a notification.
- Signing out, being signed out remotely, deleting the account or removing the instance from the device all remove
  this device's registration. Signing back in turns it on again, since the choice is kept per device and instance.

## How registration works

[`lib/push.ts`](../apps/app/src/lib/push.ts) keeps one registration per instance. `planPushSync` in
[`@gotalk/core`](../packages/core/src/push.ts) decides what each sync does: register, update the token, refresh,
unregister or nothing. Syncs run on start, when sessions or saved instances change, when the platform token
changes, and when the app comes back to the foreground (at most once a minute).

1. Read `push` from `GET /instance`. Register only when it is `enabled` and `available`, and only with its
   `gateway_url`. A custom build can prefer its own gateway app with `EXPO_PUBLIC_PUSH_APP_ID`.
2. Find this app in the gateway's discovery document (`/.well-known/gotalk-gateway`), by bundle ID or package name
   on phones. Browsers pick the app whose VAPID key both the gateway and the instance (`push.web_apps`) list.
3. Get the platform token: APNs (with its `production` or `sandbox` environment from `expo-application`) or FCM
   through `expo-notifications`, or a browser `PushSubscription`.
4. `POST {gateway}/v1/devices` for the instance's origin. The `subscription_secret` stays on the device and never
   goes to the instance.
5. Generate a P-256 key pair and a 16-byte auth secret with `expo-crypto` randomness (browsers make their own), and
   `POST /users/@me/push-subscriptions` with the subscription ID and the public keys. Encrypted mode is used when
   the instance offers it.
6. Afterwards:
   - refresh the gateway subscription after 7 days (`PUT /v1/devices/{id}`);
   - send a new token or endpoint when it changes (a new browser subscription registers again, since its keys
     change);
   - register again when the session, the gateway URL or the VAPID key changes;
   - check once per launch that the instance still has the subscription (it deletes `gone` ones).

Unregistering deletes the instance's record (while the session is still valid, before sign-out) and the gateway
subscription (with the secret), then the device keys. A browser ends its push subscription once no instance uses it.

**Storage.** On phones the device keys are in the keychain or Keystore through `expo-secure-store`
(`keychainService: "gotalk.push"`, available after first unlock). On iOS they are in the App Group keychain group
`group.<bundle ID>`, which the Notification Service Extension shares. Gateway secrets are in secure storage without
the shared group. Browsers keep their keys inside the push subscription; the secret is in `localStorage`, like the
refresh token. The registration itself (IDs, token, refresh time) is in AsyncStorage under `gotalk.push`.

## Receiving a push

Every platform shows the instance's name with the notification, so one instance cannot pass itself off as another
sender. A notification whose payload is unreadable or from a newer payload version shows "New notification" instead.

| Platform | Who handles it | What it does |
|---|---|---|
| iOS | Notification Service Extension ([`targets/notification-service`](../apps/app/targets/notification-service)) | Finds the keys by `gt.sub`, decrypts the RFC 8291 body with CryptoKit, then sets the title, the instance as subtitle, body, thread and badge. `id_only` pushes are fetched from the instance (see the gaps). Otherwise the generic text stays, with the instance's name when the subscription is known. |
| Android | The `gotalk-push` background task ([`push-task.native.ts`](../apps/app/src/lib/push-task.native.ts)) | FCM data messages run it in every app state. It decrypts in JavaScript (`decryptPushBody` in core, `@noble` crypto), fetches `id_only` pushes with the stored session, and posts to the category's channel. A notification with the same ID replaces the earlier one. |
| Web | Service worker ([`public/push-sw.js`](../apps/app/public/push-sw.js)) | The browser has already decrypted the push. The worker shows it with the instance's name, groups it by thread with `tag`, replaces a duplicate quietly and sets the app badge. |

**Android channels:** Direct messages and Mentions (high importance), Replies and Moderation (default), New topics,
Reactions and Solutions (low), and Other. People can change each one in the system settings.

**Held back while open.** A push for the instance on screen, while its realtime connection is live, is not shown:
the inbox already has it. This uses `setNotificationHandler` on phones, the Android task's own check, and the page's
state that the service worker receives on the web. Pushes for other instances always show.

**Badge.** Pushes carry the account's unread count. While the app is open, the badge follows the active instance's
unread count.

## Opening a push

Tapping a notification opens `/notification?instance=<origin>&notification=…&place=…&channel=…&message=…`
([`app/notification.tsx`](../apps/app/src/app/notification.tsx)). The route:

- switches to that instance and marks the notification read;
- opens the conversation or channel at the message, the topic, or the place, and otherwise the inbox;
- goes to sign in for a signed-out instance, and offers to add an instance that was removed.

On phones, `expo-notifications` hands the tap over, including the one that launched the app. On the web, the service
worker focuses an open tab and asks it to navigate, or opens the route in a new window.

## Building with push

Push needs the publisher's credentials, which are not in the repository. See the gateway's
[accounts and logistics](https://github.com/parkerbrown98/gotalk-gateway/blob/main/docs/accounts-and-logistics.md).

- **iOS:**
  - `expo-notifications` adds the `aps-environment` entitlement.
  - `@bacons/apple-targets` builds the `NotificationService` extension (`sh.gotalk.app.notification-service`) from
    [`targets/notification-service`](../apps/app/targets/notification-service).
  - Both targets get the App Group `group.sh.gotalk.app` from `ios.entitlements`, and EAS signs the extension
    through `extra.eas.build.experimental.ios.appExtensions`, which the plugin sets.
  - Set `ios.appleTeamId` in `app.json` for local Xcode builds. Prebuild warns until it is set.
  - `GT_NEW_NOTIFICATION` ("New notification") ships in `en.lproj/Localizable.strings` through `locales` in
    `app.json`.
- **Android:**
  - FCM needs the publisher's Firebase project. [`app.config.js`](../apps/app/app.config.js) uses
    `GOOGLE_SERVICES_JSON` (an EAS file environment variable) or `apps/app/google-services.json` (ignored by git).
  - Without either, the app builds, and Settings explains that this build isn't set up for notifications.
- **Web:**
  - The export ships `push-sw.js`, `manifest.webmanifest` and icons from `public/`.
  - Serve it over HTTPS (or `localhost`), and serve `push-sw.js` without long caching (`public/_headers` does this
    for hosts that read it).
- **Entry point:** `index.js` loads the push task before Expo Router, because Android can start the JavaScript
  runtime only to run it.

**Local testing.** Run the gateway in development mode with your own VAPID key pair, and point the server at it.

1. In the gateway config, set `instances.allow_http: true`, `instances.allow_private_networks: true` and
   `allowed_ports: [18080]`. Add an app `gotalk` with `ios.bundle_id`/`android.package_name` `sh.gotalk.app` and a
   `web.vapid` key.
2. Start the server with `GOTALK_PUSH_ENABLED=true` and `GOTALK_PUSH_GATEWAY_URL=http://localhost:8090`.
3. Use a normal Chrome profile. Push services reject subscriptions from automated browsers, such as
   Playwright-launched Chrome, with `410 Gone`, and VS Code's browser blocks notifications.
4. The server sends one unread direct-message notification per conversation, so mark it read before expecting a
   second push from the same conversation.

## Limits and known gaps

- **Desktop:** the Tauri app does not receive pushes yet (the client plan's native desktop notifications).
- **One gateway per browser:** a browser has one push subscription, bound to one VAPID key. A second instance whose
  gateway uses another key cannot turn push on until the first is turned off.
- **iOS `id_only`:** the extension cannot refresh a session. It fetches with a short-lived access token that the app
  shares (only for `id_only` registrations) and falls back to the generic text once that token has expired. The
  client registers `encrypted` whenever the instance offers it, which servers do by default.
- **Android grouping:** `expo-notifications` cannot set a notification group, so Android bundles Gotalk's
  notifications by app (its automatic grouping) rather than per conversation.
- **Duplicates on iOS:** a push delivered twice can show twice. Collapse keys from the instance limit this.
- **Not yet tested on real devices:** the iOS extension, APNs and FCM delivery need the publisher's Apple and Firebase
  accounts. The extension's crypto and payload code is checked against RFC 8291 Appendix A with `swift-crypto`, and
  the Xcode and Android projects come from `expo prebuild`.

## Where the code lives

| Path | Contents |
|---|---|
| [`packages/core/src/push.ts`](../packages/core/src/push.ts) | Gateway client, payload and envelope parsing, display text, Android channels, deep-link paths, registration planning, preference helpers |
| [`packages/core/src/push-crypto.ts`](../packages/core/src/push-crypto.ts) | Key generation and RFC 8291 decryption (tested against Appendix A) |
| [`apps/app/src/lib/push.ts`](../apps/app/src/lib/push.ts) | Registrations: enable, disable, sync, sign-out and instance removal |
| [`apps/app/src/lib/push-platform*.ts`](../apps/app/src/lib) | Platform adapters: expo-notifications and secure storage on phones, the service worker on the web |
| [`apps/app/src/lib/push-receive*.ts`](../apps/app/src/lib), [`push-task.native.ts`](../apps/app/src/lib/push-task.native.ts) | Showing pushes, holding them back while open, opening them |
| [`apps/app/src/app/settings/notifications.tsx`](../apps/app/src/app/settings/notifications.tsx) | Settings > Notifications |
| [`apps/app/targets/notification-service`](../apps/app/targets/notification-service) | iOS Notification Service Extension (Swift) |
| [`apps/app/public/push-sw.js`](../apps/app/public/push-sw.js) | Web Push service worker |
