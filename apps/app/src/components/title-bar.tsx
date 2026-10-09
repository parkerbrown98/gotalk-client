import { Text, useTheme } from '@gotalk/ui';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, View, type ViewProps } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { desktopOS, isDesktop } from '@/lib/desktop';

const isMac = desktopOS === 'macos';

/** Matches the desktop window chrome in docs/mockups. */
const HEIGHT = 40;
// Clears the macOS traffic lights placed by `trafficLightPosition` in apps/desktop/src-tauri/tauri.conf.json.
const TRAFFIC_LIGHTS_INSET = 84;

// Tauri's injected drag script moves the window from any mousedown inside this subtree that does not land
// on a button. react-native-web renders `dataSet` as data-* attributes but React Native does not type it.
const dragRegion = { dataSet: { tauriDragRegion: 'deep' } } as unknown as ViewProps;

type WindowState = { focused: boolean; maximized: boolean; fullscreen: boolean };
type HoverState = { pressed: boolean; hovered?: boolean };

function useWindowState(): WindowState {
  const [state, setState] = useState<WindowState>(() => ({ focused: document.hasFocus(), maximized: false, fullscreen: false }));
  useEffect(() => {
    const win = getCurrentWindow();
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    const keep = (unlisten: () => void) => (disposed ? unlisten() : unlisteners.push(unlisten));
    const syncFrame = async () => {
      const [maximized, fullscreen] = await Promise.all([win.isMaximized(), win.isFullscreen()]);
      if (!disposed) setState((s) => (s.maximized === maximized && s.fullscreen === fullscreen ? s : { ...s, maximized, fullscreen }));
    };
    void syncFrame();
    void win.onResized(syncFrame).then(keep);
    void win.onFocusChanged(({ payload: focused }) => !disposed && setState((s) => ({ ...s, focused }))).then(keep);
    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);
  return state;
}

type GlyphKind = 'minimize' | 'maximize' | 'restore' | 'close';

/** 10px caption glyphs drawn on a 1px grid, like the native Windows and Linux controls. */
function Glyph({ kind, color }: { kind: GlyphKind; color: string }) {
  return (
    <Svg width={10} height={10} viewBox="0 0 10 10" fill="none" stroke={color} strokeWidth={1}>
      {kind === 'minimize' ? <Path d="M0 5.5h10" /> : null}
      {kind === 'maximize' ? <Rect x={0.5} y={0.5} width={9} height={9} /> : null}
      {kind === 'restore' ? (
        <>
          <Rect x={0.5} y={2.5} width={7} height={7} />
          <Path d="M2.5 2.5v-2h7v7h-2" />
        </>
      ) : null}
      {kind === 'close' ? <Path d="M0.5 0.5l9 9M9.5 0.5l-9 9" /> : null}
    </Svg>
  );
}

function WindowControls({ maximized }: { maximized: boolean }) {
  const theme = useTheme();
  const c = theme.colors;
  const win = getCurrentWindow();
  const controls: { kind: GlyphKind; label: string; run: () => Promise<void> }[] = [
    { kind: 'minimize', label: 'Minimize', run: () => win.minimize() },
    { kind: maximized ? 'restore' : 'maximize', label: maximized ? 'Restore' : 'Maximize', run: () => win.toggleMaximize() },
    { kind: 'close', label: 'Close', run: () => win.close() },
  ];
  return (
    <View style={{ flexDirection: 'row', alignSelf: 'stretch' }}>
      {controls.map(({ kind, label, run }) => (
        <Pressable
          key={kind}
          accessibilityRole="button"
          accessibilityLabel={label}
          focusable={false}
          onPress={() => void run()}
          style={({ pressed, hovered }: HoverState) => ({
            width: 46,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: !(pressed || hovered) ? 'transparent' : kind === 'close' ? c.accentRed : pressed ? c.hairlineStrong : c.hairlineSoft,
          })}
        >
          {({ pressed, hovered }: HoverState) => <Glyph kind={kind} color={pressed || hovered ? c.onDark : c.mute} />}
        </Pressable>
      ))}
    </View>
  );
}

function TitleBar() {
  const theme = useTheme();
  const c = theme.colors;
  const { focused, maximized, fullscreen } = useWindowState();
  const bar = useRef<View>(null);

  useEffect(() => {
    // Tauri's drag script swallows the mousedown that starts a drag (and a double-click maximize, except on
    // macOS where it acts on mouseup). Stop the matching mouseup too, or react-native-web warns about a
    // touch end without a start on every drag. WebKit reports the mouseup ending a window drag as detail 0.
    const el = bar.current as unknown as HTMLElement | null;
    const onMouseUp = (e: MouseEvent) => {
      if ((e.target as Element).closest('[role="button"]')) return;
      if (e.detail >= 3 || (isMac && e.detail === 2)) return;
      e.stopPropagation();
    };
    el?.addEventListener('mouseup', onMouseUp);
    return () => el?.removeEventListener('mouseup', onMouseUp);
  }, []);

  return (
    <View
      ref={bar}
      {...dragRegion}
      style={{
        height: HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: c.surface,
        borderBottomWidth: 1,
        borderBottomColor: c.hairline,
        // The traffic lights hide in fullscreen, so the bar reclaims their space.
        paddingLeft: isMac && !fullscreen ? TRAFFIC_LIGHTS_INSET : 0,
        userSelect: 'none',
      }}
    >
      {/* Centered on the window rather than the space left of the controls; clicks fall through to drag. */}
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <Text variant="captionMd" tone={focused ? 'muted' : 'faint'} selectable={false} numberOfLines={1}>
          Gotalk
        </Text>
      </View>
      <View style={{ flex: 1 }} />
      {isMac ? null : <WindowControls maximized={maximized} />}
    </View>
  );
}

/** In the desktop app, replaces the native window title bar; elsewhere renders its children unchanged. */
export function DesktopFrame({ children }: { children: ReactNode }) {
  const theme = useTheme();
  if (!isDesktop) return children;
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <TitleBar />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}
