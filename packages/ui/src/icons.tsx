import { createContext, useContext } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

// Paths are the 24px stroke icons used in docs/mockups/icons.js.
type Shape = string | { circle: [number, number, number] } | { rect: [number, number, number, number, number] };

const shapes = {
  user: [{ circle: [12, 8, 4] }, 'M4 20c1-4 4-6 8-6s7 2 8 6'],
  lock: [{ rect: [5, 11, 14, 9, 2] }, 'M8 11V8a4 4 0 0 1 8 0v3'],
  laptop: [{ rect: [5, 5, 14, 10, 1.5] }, 'M2.5 19h19'],
  phone: [{ rect: [7, 2.5, 10, 19, 2.5] }, 'M11 18.5h2'],
  globe: [{ circle: [12, 12, 9] }, 'M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18'],
  trash: ['M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6'],
  logout: ['M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9'],
  chevronLeft: ['m15 6-6 6 6 6'],
  chevronRight: ['m9 6 6 6-6 6'],
  check: ['m5 12.5 4.5 4.5L19 7.5'],
  alert: ['M12 4 2.5 20h19L12 4Z', 'M12 10v4.5M12 17.5v.01'],
  info: [{ circle: [12, 12, 9] }, 'M12 11v5M12 8v.01'],
  clock: [{ circle: [12, 12, 9] }, 'M12 7v5l3 2'],
  plus: ['M12 5v14M5 12h14'],
  home: ['m3 11 9-7 9 7v9h-6v-6H9v6H3v-9Z'],
  compass: [{ circle: [12, 12, 9] }, 'm15.5 8.5-2 5-5 2 2-5 5-2Z'],
  hash: ['M5 9h14M5 15h14M10 4 8 20M16 4l-2 16'],
  forum: ['M4 5h16v11H9l-5 4V5Z'],
  volume: ['M11 5 6 9H3v6h3l5 4V5Z', 'M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13'],
  users: [{ circle: [9, 8, 3.5] }, 'M2.5 19c.8-3.5 3.3-5 6.5-5s5.7 1.5 6.5 5', 'M16 5a3.5 3.5 0 0 1 0 7M18 14.5c1.8.6 3 2.2 3.5 4.5'],
  settings: [{ circle: [12, 12, 3] }, 'M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8'],
  more: ['M5 12v.01M12 12v.01M19 12v.01'],
  search: [{ circle: [11, 11, 6.5] }, 'm20 20-4.2-4.2'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  chevronDown: ['m6 9 6 6 6-6'],
  shield: ['M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z'],
} as const satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof shapes;

export function Icon({ name, size = 16, color }: { name: IconName; size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {(shapes[name] as readonly Shape[]).map((s, i) =>
        typeof s === 'string' ? (
          <Path key={i} d={s} />
        ) : 'circle' in s ? (
          <Circle key={i} cx={s.circle[0]} cy={s.circle[1]} r={s.circle[2]} />
        ) : (
          <Rect key={i} x={s.rect[0]} y={s.rect[1]} width={s.rect[2]} height={s.rect[3]} rx={s.rect[4]} />
        ),
      )}
    </Svg>
  );
}

/** Dialogs and sheets sit on the elevated surface, so controls inside them step one notch further up. */
export const ElevationContext = createContext(false);
export const useElevated = () => useContext(ElevationContext);
