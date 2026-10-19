# Places and invites

[Documentation](README.md)

## Table of contents

- [Navigation](#navigation)
- [Permissions](#permissions)
- [Invite links](#invite-links)
- [Place and topic links](#place-and-topic-links)

## Navigation

Signed-in screens live under `(app)` in [apps/app/src/app](../apps/app/src/app).
A place rail and sidebar appear at widths of 768px and up; a tab bar appears below that.

## Permissions

Whether an action is shown comes from `hasPermission` in `@gotalk/core`, which reads the
server's `my_permissions` bitfield. The server still decides whether an action is allowed.

## Invite links

Invite links carry their instance so they work for someone who has not added it yet:

| Target | Link format |
|---|---|
| Web | `https://<web client>/invite/<code>?instance=<origin>` |
| Mobile apps and desktop shell | `gotalk://invite/<code>?instance=<origin>` |

See [Accounts and instances](accounts-and-instances.md) for discovery and saved sessions.

## Place and topic links

Place and topic links follow the same pattern, so the public index's "Open in Gotalk" button works for someone
who has not added the instance yet:

| Target | Web | Mobile apps and desktop shell |
|---|---|---|
| Place | `https://<web client>/places/<slug>?instance=<origin>` | `gotalk://places/<slug>?instance=<origin>` |
| Topic | `https://<web client>/topics/<id>?instance=<origin>` | `gotalk://topics/<id>?instance=<origin>` |

Signed in on that instance, they open the place or topic. Signed out, they open the public reading view. On an
instance not saved here, they show what the link points to and offer to open it, sign in or create an account
first. See [Search engines and the public directory](search-and-directory.md#links-from-the-index).

Places that are in the public index show "Public: visible to search engines" under their name, and members see a
one-time notice the first time they open one.
