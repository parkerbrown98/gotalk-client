# Design and theming

[Documentation](README.md)

[DESIGN.md](../DESIGN.md) is the visual source of truth. The client shares its dark canvas,
surface ladder, Inter typography and Gotalk brand assets across all targets.

## Table of contents

- [Theme and typography](#theme-and-typography)
- [Motion and interaction](#motion-and-interaction)
- [Account and community chrome](#account-and-community-chrome)
- [Updating the design](#updating-the-design)
- [Mockups](#mockups)
- [Brand assets and README banner](#brand-assets-and-readme-banner)

## Theme and typography

Every color, spacing and type value comes from `@gotalk/tokens`, which mirrors
[DESIGN.md](../DESIGN.md). The system is dark-only: there is no light theme and no shadows;
depth comes from the surface ladder.

Components read the active theme through `useTheme()` from `@gotalk/ui`.
`ThemeProvider` accepts `overrides` for per-instance branding. Text is Inter, registered in
[the root layout](../apps/app/src/app/_layout.tsx), with `ss03` enabled via `fontVariant` on
native and `font-feature-settings` on web. The desktop app is the web build, so it shares
the theme automatically. `tokens.css` makes the same values available to plain HTML/CSS.

## Motion and interaction

Motion lives in [packages/ui/src/motion.ts](../packages/ui/src/motion.ts) and uses Reanimated.
Hover on web and desktop lifts a row or control one surface step, the same as pressing it.
Add `hoverTransition` and read `hovered` from `PressState` so the color fades instead of
snapping.

Buttons shrink slightly while pressed, dialogs and sheets animate in and out, and menus
fade in quickly. Frequent actions, such as tab and screen switches in the shell, do not
animate. Every animation respects the system's reduced-motion setting.

On iOS, a menu must finish dismissing its native modal before presenting another dialog
or navigating away. Use `useModalDismissal(onClose)` for menu selections, pass its
`onDismiss` to `Dialog` or `MenuPopover`, and run the selection through
`dismissWithAction`. Keep the source menu mounted while it closes. Do not substitute a
fixed timeout: `Dialog` has an exit animation, and UIKit dismissal completes separately.
Web and Android selections continue to run immediately after requesting close.

## Account and community chrome

Wide app screens have one account/status control at the bottom of the place rail, not a
second avatar in each sidebar. Its menu links to the You account hub and account settings.
The You hub shares settings groups and their feature/administrator gates with the settings
sidebar, and keeps status, sign-out and instance switching together. Phone `/settings`
links open this hub; individual editors return there when no navigation history exists.

Rail selection uses a visible left-edge bar and an outline on the active place tile.
Web/desktop labels appear on hover or keyboard focus, and dismiss on blur, scroll or Escape.
Selection changes are immediate, not animated.

Web and desktop scrollbars use the shared dark surface palette in
[the web shell](../apps/app/public/index.html). Standard scrollbar properties cover Firefox
and modern engines; WebKit pseudo-elements cover older webviews. Intentionally hidden
scrollbars stay hidden. Forced-colors mode restores system colors and sizing. Native
iOS/Android scroll indicators are unchanged.

Author names in place chat, topic lists, posts, feeds and member lists use the highest-ranked
**colored** assigned role; uncolored higher roles are skipped and the implicit `@everyone`
role is the last fallback. DMs, former members and public places the viewer has not joined
remain neutral. Names keep their existing typography; role badges still use color dots.
Role resolution is shared in `@gotalk/core`. Author lookups reuse member-list/moderation
data and the typing-indicator cache, and only fetch missing members when a colored role
exists. Cache keys include instance and place. Local moderation changes invalidate these
queries; one foreground-only timer refreshes active role/member queries every minute
because the gateway does not currently emit role-change events. Decoration failures keep content usable and
are reported in the console/accessibility hint (and inline in member lists and mention suggestions).

## Updating the design

When [DESIGN.md](../DESIGN.md) changes, update:

1. [packages/tokens/src](../packages/tokens/src).
2. [packages/ui](../packages/ui).
3. The native configuration in [apps/app/app.json](../apps/app/app.json) and
   [tauri.conf.json](../apps/desktop/src-tauri/tauri.conf.json).
4. The web shell in [apps/app/public/index.html](../apps/app/public/index.html).

The native configuration and web shell hold the canvas color as a literal. Rebuild
`tokens.css` and re-check the mockups after token changes.

## Mockups

[docs/mockups](mockups) contains static HTML mockups for web, desktop and phone. Open
[the mockup index](mockups/index.html) after `pnpm build` to load the generated tokens.
These describe intended screens and states; they are not shipped UI.

See the [design process](client-plan.md#design-process) for how the specification, tokens,
primitives, mockups and screens stay in sync.

## Brand assets and README banner

[docs/brand](brand) contains SVG masters for the rounded app icon, full-bleed iOS icon,
macOS grid icon, Android adaptive layers, favicon and splash glyph. The PNGs in
[apps/app/assets/images](../apps/app/assets/images) and
[apps/desktop/src-tauri/icons](../apps/desktop/src-tauri/icons), via `tauri icon`, are rendered
from these masters.

The [README banner](brand/banner.svg) uses the same app icon, near-black canvas and red
brand glow as the server banner, with client platform labels. Its Inter text is outlined
so it renders consistently without external fonts or scripts.
