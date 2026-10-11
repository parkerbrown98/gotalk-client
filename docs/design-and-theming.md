# Design and theming

[Documentation](README.md)

[DESIGN.md](../DESIGN.md) is the visual source of truth. The client shares its dark canvas,
surface ladder, Inter typography and Gotalk brand assets across all targets.

## Table of contents

- [Theme and typography](#theme-and-typography)
- [Motion and interaction](#motion-and-interaction)
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
