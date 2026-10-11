# Real-time and chat

[Documentation](README.md)

## Table of contents

- [Gateway and reconnection](#gateway-and-reconnection)
- [Channels and threads](#channels-and-threads)
- [Sending messages](#sending-messages)
- [Message actions and presence](#message-actions-and-presence)

## Gateway and reconnection

`@gotalk/gateway` keeps one WebSocket per active instance. It identifies with the session's
current access token, heartbeats at the server's interval, and reconnects with jittered
backoff. It reconnects at once on `4007`, and stops on `4010` when the session ended.

The server cannot resume a session. After a reconnect,
[apps/app/src/lib/realtime.ts](../apps/app/src/lib/realtime.ts) asks every loaded channel
for `GET .../messages?after=<last id>` and refreshes the lists that summarize them.

Events write straight into the TanStack Query caches that the screens read, so there is
one source of truth whether data came from a request or the gateway. See the
[server gateway guide](https://github.com/parkerbrown98/gotalk-server/blob/main/docs/gateway.md)
for the wire protocol, events and close codes.

## Channels and threads

Chat lives in `(app)/places/[slug]/channels/[id]` and `(app)/messages` in
[apps/app/src/app](../apps/app/src/app). Threads open beside the channel on wide screens
and as `threads/[thread]` on phones.

People with **Manage channels** create, edit, reorder and delete channels and categories
from the sidebar and [the channel menu](../apps/app/src/components/channel-menu.tsx).

## Sending messages

Sends are optimistic: each carries a nonce the server echoes, so the response and the
`MESSAGE_CREATE` event settle the same pending message. Sends made while offline wait for
the connection; refused ones offer **Retry** and **Delete**.

## Message actions and presence

Message actions appear on hover on wide screens with a hovering pointer, and on a long
press elsewhere.

Presence (online, idle, do not disturb, invisible) is chosen from the account row or the
**You** tab, remembered per instance on the device, and sent when connecting.
