# Forums and feeds

[Documentation](README.md)

## Table of contents

- [Forums and Markdown](#forums-and-markdown)
- [Drafts](#drafts)
- [Topic feeds](#topic-feeds)
- [Optimistic updates and read sync](#optimistic-updates-and-read-sync)

## Forums and Markdown

Forums live under `(app)/places/[slug]` in [apps/app/src/app](../apps/app/src/app), with
`boards/[id]`, `topics/[id]` and `search` routes. The inbox is at `(app)/inbox`.
Data hooks and mutations are in [apps/app/src/lib/forums.ts](../apps/app/src/lib/forums.ts);
they use offset paging because that is what the forum API provides.

Post text goes through `parseMarkdown` in `@gotalk/core`, which converts the `marked` lexer
output to a closed tree. The `Markdown` component renders that tree, so raw HTML is shown
as text and only HTTP(S) and `mailto` links open.

## Drafts

Drafts are stored on the server under `topic:<board id>` and
`reply:<topic id>[:<post id>]`. They are removed once the post is sent.

## Topic feeds

Feeds live at:

- `(app)/feed`: Home shows the person's places, or every public topic with `?scope=all`.
- `(app)/places/[slug]`: the place header above its feed; the `.../feed` route redirects here.
- `explore`: public topics for signed-out visitors.

Feeds use the server's cursor paging in a virtualized list. Sort, window and filters are
kept in the URL; sort is also remembered per instance and feed.
[apps/app/src/lib/feeds.ts](../apps/app/src/lib/feeds.ts) holds the queries and every feed
mutation.

## Optimistic updates and read sync

Votes and read changes are applied first to every cached copy of the topic: feeds, forum
lists and the topic itself. They are rolled back if the server refuses.

Opening a topic from anywhere records it as read. Signed out, opened topics are remembered
on the device and imported after sign-in. Opens that fail offline are queued and sent
later by `FeedSyncHost`.

The pure parts live in [packages/core/src/feeds.ts](../packages/core/src/feeds.ts): URL
parsing, optimistic transforms, page patching, the read record and queue.
