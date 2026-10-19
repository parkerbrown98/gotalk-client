# Search engines and the public directory

[Documentation](README.md)

A Gotalk instance can list itself in the public Gotalk directory at
[gotalk.sh/explore](https://gotalk.sh/explore). The index then shows the public forums of places that allow it in
search engines and the directory, and its "Open in Gotalk" button links back into the client. Nothing is indexed
by default. The server decides what is indexed; the client explains its rules and lets each level opt in or out.
See the server's [public index](https://github.com/parkerbrown98/gotalk-server/blob/main/docs/api-index.md)
documentation for the API and the rules.

## Table of contents

- [Who decides](#who-decides)
- [Links from the index](#links-from-the-index)
- [Instance administrators](#instance-administrators)
- [Places and forums](#places-and-forums)
- [Members](#members)
- [Where the code lives](#where-the-code-lives)

## Who decides

| Level | Setting | Where in the client | Default |
|---|---|---|---|
| Instance | List this instance in the public Gotalk directory | **Settings > Server > Public directory** (administrators) | Off |
| Place | Allow this place to appear in search engines | **Place settings > General** (Manage place) | Off |
| Forum | Exclude from search engines | **Settings** on the forum's page (Manage boards) | Not excluded |
| Person | Don't show my posts in public search results | **Settings > Privacy** | Off |

Private, invite-only and NSFW places, and NSFW forums, are never indexed. Their switches are shown disabled with
the reason. Removals reach the index within an hour. Each screen shows the server's `index_notice` as it is.

## Links from the index

Place and topic links carry their instance, like [invite links](places-and-invites.md#invite-links):

| Target | Web | Apps and desktop |
|---|---|---|
| Place | `https://<web client>/places/<slug>?instance=<origin>` | `gotalk://places/<slug>?instance=<origin>` |
| Topic | `https://<web client>/topics/<id>?instance=<origin>` | `gotalk://topics/<id>?instance=<origin>` |

`placeLink`, `topicLink` and `buildInviteLink` in `@gotalk/core` build them. `parseGotalkLink` reads all three
kinds in either form, or as an app path. It accepts only an `http` or `https` instance origin with no path or
credentials, lowercases it, and strips trailing slashes. It also checks the invite code, place address or topic
ID, and returns null for anything else.

What opening a link does depends on what the device knows about its instance (`linkStep`):

| The instance is | Place link | Topic link |
|---|---|---|
| Saved and signed in | Switches to it and opens `/places/<slug>` | Switches to it, looks up the topic's place and opens `/places/<slug>/topics/<id>` |
| Saved, signed out | Switches to it and opens the public reading view, `/explore/places/<slug>` | Opens `/explore/topics/<id>` |
| Not saved | Looks it up and shows the place, then offers **Open**, **Sign in** or **Create an account** | The same, with the topic's title |

Nothing is saved until one of those buttons is chosen, as with invites. Signing in or creating an account carries
on to the place or topic (`pendingLink` in [pending-invite.ts](../apps/app/src/lib/pending-invite.ts)). The Sign in
buttons on the public reading views do the same. An unreachable or incompatible instance, a bad link and a topic
that doesn't exist or isn't public each get their own notice.

Routing:

- **Web:** `/topics/[id]` is a top-level route. A place link opens the signed-in `/places/[slug]` route. When its
  `instance` is already open there, the `(app)` layout drops the parameter. Otherwise it replaces the link with
  `/explore/places/[slug]?instance=…`, which switches instances, reads signed out or offers to add the instance.
- **iOS and Android:** the `gotalk` scheme is in [app.json](../apps/app/app.json), and Expo Router maps
  `gotalk://places/…` to `/places/…`. [+native-intent.tsx](../apps/app/src/app/+native-intent.tsx) rewrites
  recognized links through `parseGotalkLink` so the `instance` arrives clean.
- **Desktop:** see [Desktop](desktop.md#gotalk-links).

## Instance administrators

**Settings > Server > Public directory** works like the other sections. It shows where the settings come from and
is read-only when the config file or environment sets `directory.listed`. Saving runs the directory check, which
warns about local and plain-HTTP addresses. The fields are the listing switch and the contact email. Under
**Advanced** are the index URL, **Don't ping the index**, and a write-only signing key. Advanced opens by itself
when one of them has a value.

Below the form, from `GET /instance/directory`:

- the server's notice, shown as it is. It includes the "[Pending legal review …]" placeholder; the client never
  claims a license.
- **This instance:** whether the well-known document announces the listing, the number of indexed places, and pings.
- **How the index sees it:** the platform's status (`pending`, `listed`, `stale`, `suspended`, `blocked` or
  `removed`), indexed counts and the last crawl, from `platform_status_url`. A `404` reads "Not registered with
  the index yet". If the index can't be reached, for example because it refuses this page, a quiet line says so.
- **Signing keys:** the published keys, **Rotate key**, and **Stop publishing previous key**, each with a confirmation.
- **Suggested policy text:** collapsed by default. Each section has Copy and a link to its editor in Policies.
- **Recent changes:** directory entries from the instance audit log.
- A link to the operator guide.

## Places and forums

Place owners with Manage place see **Search engines** in **Place settings > General**. It shows a status badge
(In search engines, Not in search engines, Allowed, or Waiting for the instance when the instance isn't listed),
the switch, what is and isn't indexed, and the server's notice. The switch saves right away.

Forums can now be edited after they are created: **Settings** on a forum's page (Manage boards) edits its name and
description and has **Exclude from search engines**. NSFW forums show the switch on and disabled.

## Members

- **The indicator:** an indexed place shows "Public: visible to search engines" under its name in the sidebar,
  on its page, and on the link and public reading screens.
- **The first-time notice:** the first time a member opens an indexed place, the place page explains that its
  public forums appear in search engines and links to **Settings > Privacy**. **Got it** hides it for that place
  on this device. Dismissals are kept in `AsyncStorage` under `gotalk.indexNotices`, per instance.
- **Settings > Privacy:** "Don't show my posts in public search results" sets `exclude_from_index`. It covers
  past and future posts and takes effect within an hour.

Older servers without the public directory don't send these fields. The client hides the Privacy page, the place
and forum switches, and the Public directory section for them.

## Where the code lives

| Path | Contents |
|---|---|
| [packages/core/src/links.ts](../packages/core/src/links.ts) | Link builders and parser, `linkStep` |
| [packages/core/src/directory.ts](../packages/core/src/directory.ts) | Why a switch is disabled, status labels, the platform lookup, audit lines |
| [packages/core/src/server-config.ts](../packages/core/src/server-config.ts) | The Public directory section's fields |
| [apps/app/src/lib/links.ts](../apps/app/src/lib/links.ts) | Link previews, topic look-ups, destinations, desktop deep links |
| [apps/app/src/lib/search-index.ts](../apps/app/src/lib/search-index.ts) | Directory status, keys, the platform view, and the place, forum and account mutations |
| [apps/app/src/components/link-landing.tsx](../apps/app/src/components/link-landing.tsx) | The screen for an instance that isn't saved |
| [apps/app/src/components/search-index.tsx](../apps/app/src/components/search-index.tsx) | Indicator, member notice, place setting and forum settings |
| [apps/app/src/components/directory-settings.tsx](../apps/app/src/components/directory-settings.tsx) | The administrator panel |

The [Public directory mockups](mockups/22-public-directory.html) show the intended screens.
