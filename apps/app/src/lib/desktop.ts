import { openUrl } from '@tauri-apps/plugin-opener';
import { Linking, Platform } from 'react-native';

/** Running inside the Tauri shell in apps/desktop, which loads the web build. */
export const isDesktop = Platform.OS === 'web' && typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export type DesktopOS = 'macos' | 'windows' | 'linux';

/** Which desktop the shell runs on, from the user agent apps/desktop/src-tauri sets; null outside the shell. */
export const desktopOS: DesktopOS | null = !isDesktop ? null : /Mac/.test(navigator.userAgent) ? 'macos' : /Windows/.test(navigator.userAgent) ? 'windows' : 'linux';

/** Opens a web, mail or phone link in its default app; the desktop shell must not navigate itself. */
export function openExternal(url: string) {
  if (isDesktop) return void openUrl(url).catch(() => undefined);
  void Linking.openURL(url);
}

// Browser shortcuts WebView2 (Windows) and WebKitGTK still honour, which a native app would not have:
// reload, print, find, view source, downloads, history, save page and caret browsing.
const BROWSER_KEYS = new Set(['r', 'p', 'f', 'g', 'u', 'j', 'h', 's']);
const BROWSER_FUNCTION_KEYS = new Set(['F3', 'F5', 'F7']);

if (isDesktop) {
  // public/index.html styles the shell (no stray text selection, native cursors, scrollbars) under these.
  document.documentElement.classList.add('gotalk-desktop', `gotalk-${desktopOS}`);
  // react-native-web only starts a press for the primary button but ends one on any mouseup, so every
  // right-click (which opens our context menus) would log "touch end without a touch start".
  window.addEventListener('mouseup', (e) => e.button !== 0 && e.stopPropagation(), true);
  if (desktopOS !== 'macos') {
    // Capture and preventDefault only, so the app's own handlers for these keys still run.
    window.addEventListener(
      'keydown',
      (e) => {
        if (BROWSER_FUNCTION_KEYS.has(e.key) || (e.ctrlKey && !e.altKey && BROWSER_KEYS.has(e.key.toLowerCase()))) e.preventDefault();
      },
      true,
    );
  }
}
