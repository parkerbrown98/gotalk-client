import * as SplashScreen from 'expo-splash-screen';
import { Platform } from 'react-native';

// Matches the opacity transition on #gotalk-splash in public/index.html.
const FADE_MS = 220;

/**
 * Hides the launch splash. Native builds use expo-splash-screen; the web build and the desktop app
 * (which loads it) paint their own splash in public/index.html, which this fades out and removes.
 */
export function hideSplash() {
  SplashScreen.hideAsync();
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const splash = document.getElementById('gotalk-splash');
  if (!splash || splash.classList.contains('gotalk-splash-hidden')) return;
  // Wait a frame so the first app frame is painted underneath before the fade starts.
  requestAnimationFrame(() => {
    splash.classList.add('gotalk-splash-hidden');
    // A timer rather than transitionend, which never fires when reduced motion disables the transition.
    setTimeout(() => splash.remove(), FADE_MS + 50);
  });
}
