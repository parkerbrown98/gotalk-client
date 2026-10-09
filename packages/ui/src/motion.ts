import { useEffect, useState } from 'react';
import { Platform, type ViewStyle } from 'react-native';
import { cubicBezier, Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown, type CSSAnimationProperties } from 'react-native-reanimated';

/**
 * Motion is quiet and quick. Hover and press feedback stay under 150ms, surfaces open in about 200ms
 * (sheets 300ms), exits are faster than entrances, and nothing eases in. Frequent actions such as tab
 * switches and screen changes in the shell do not animate at all.
 */
export const motion = {
  press: 120,
  open: 200,
  sheet: 300,
  close: 150,
} as const;

/** Strong ease-out for Reanimated CSS transitions and animations. */
export const CSS_EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
/** The same curve for layout animations and `withTiming`. */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** The iOS sheet curve, for bottom sheets. */
export const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);

/** What `Pressable` passes to `style` and `children` functions; react-native-web adds `hovered`. */
export interface PressState {
  pressed: boolean;
  hovered?: boolean;
}

/**
 * Hover and press colors fade rather than snap on web and desktop, where react-native-web turns these
 * into a CSS transition. Native presses stay instant, as the platform's own rows do.
 */
export const hoverTransition = (
  Platform.OS === 'web'
    ? { transitionProperty: 'background-color, border-color, color, opacity', transitionDuration: `${motion.press}ms`, transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)' }
    : {}
) as ViewStyle;

/**
 * Menus and popovers: a short fade with a slight scale. Spread into an `Animated.View` style, where it
 * plays once on mount. These are Reanimated CSS animations rather than `Keyframe` layout animations: on
 * web a custom `Keyframe` rewrites the element's position and size when it finishes, which left menus
 * collapsed and invisible (but still open) in the desktop app. Leave them out with reduced motion.
 */
export const popoverIn = {
  animationName: { from: { opacity: 0, transform: [{ scale: 0.97 }] }, to: { opacity: 1, transform: [{ scale: 1 }] } },
  animationDuration: 140,
  animationTimingFunction: CSS_EASE_OUT,
} satisfies CSSAnimationProperties;

/** A centered dialog settles in from slightly smaller. Same approach as `popoverIn`. */
export const dialogIn = {
  animationName: { from: { opacity: 0, transform: [{ scale: 0.96 }] }, to: { opacity: 1, transform: [{ scale: 1 }] } },
  animationDuration: motion.open,
  animationTimingFunction: CSS_EASE_OUT,
} satisfies CSSAnimationProperties;

// Built-in presets are safe as layout animations: only custom keyframes get repositioned on web.
export const sheetEntering = SlideInDown.duration(motion.sheet).easing(EASE_SHEET);
export const sheetExiting = SlideOutDown.duration(motion.close + 50).easing(EASE_OUT);
export const fadeEntering = FadeIn.duration(motion.open).easing(EASE_OUT);
export const fadeExiting = FadeOut.duration(motion.close).easing(EASE_OUT);

/**
 * Keeps a modal mounted for `ms` after `visible` turns false, so what is inside can animate out
 * before the modal itself goes away.
 */
export function usePresence(visible: boolean, ms: number = motion.close + 50): boolean {
  const [lingering, setLingering] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    setLingering(!visible);
  }
  useEffect(() => {
    if (!lingering) return;
    const timer = setTimeout(() => setLingering(false), ms);
    return () => clearTimeout(timer);
  }, [lingering, ms]);
  return visible || lingering;
}
