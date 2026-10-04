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
