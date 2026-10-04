import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useTheme } from '@gotalk/ui';

/** True from the tablet breakpoint up, where screens use the split and sidebar layouts. */
export function useWide(): boolean {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  return width >= theme.breakpoints.tablet;
}

/** Back where the user came from, or to `fallback` when this screen was opened directly (deep link, reload). */
export function goBack(fallback: Href): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

/** Starts a fresh navigation stack at `href`, so earlier screens (for example a stale home) are not left mounted underneath. */
export function resetTo(href: Href): void {
  if (router.canDismiss()) router.dismissAll();
  router.replace(href);
}
