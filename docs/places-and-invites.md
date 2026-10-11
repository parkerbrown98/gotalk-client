# Places and invites

[Documentation](README.md)

## Table of contents

- [Navigation](#navigation)
- [Permissions](#permissions)
- [Invite links](#invite-links)

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
