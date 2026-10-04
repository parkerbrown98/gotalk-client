/**
 * Raw palette. Components should not use these directly; they read semantic colors from a
 * {@link Theme} so light/dark mode and per-instance branding work everywhere.
 */
export const palette = {
  white: '#ffffff',
  black: '#000000',
  gray: {
    50: '#f8f9fb',
    100: '#f0f1f4',
    200: '#e1e3e9',
    300: '#c9ccd6',
    400: '#9a9fae',
    500: '#6b7080',
    600: '#4c5160',
    700: '#33363f',
    800: '#212329',
    900: '#16171b',
    950: '#0e0f12',
  },
  indigo: {
    300: '#a5a8f5',
    400: '#8487ee',
    500: '#5b5bd6',
    600: '#4a48c2',
    700: '#3b39a3',
  },
  green: { 400: '#4ade80', 600: '#16a34a' },
  amber: { 400: '#fbbf24', 600: '#d97706' },
  red: { 400: '#f87171', 600: '#dc2626' },
} as const;

export interface ColorTokens {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  textInverse: string;
  accent: string;
  accentHover: string;
  accentText: string;
  success: string;
  warning: string;
  danger: string;
  focusRing: string;
}

export const lightColors: ColorTokens = {
  background: palette.gray[50],
  surface: palette.white,
  surfaceRaised: palette.gray[100],
  border: palette.gray[200],
  text: palette.gray[900],
  textMuted: palette.gray[500],
  textInverse: palette.white,
  accent: palette.indigo[500],
  accentHover: palette.indigo[600],
  accentText: palette.white,
  success: palette.green[600],
  warning: palette.amber[600],
  danger: palette.red[600],
  focusRing: palette.indigo[400],
};

export const darkColors: ColorTokens = {
  background: palette.gray[950],
  surface: palette.gray[900],
  surfaceRaised: palette.gray[800],
  border: palette.gray[700],
  text: palette.gray[50],
  textMuted: palette.gray[400],
  textInverse: palette.gray[900],
  accent: palette.indigo[400],
  accentHover: palette.indigo[300],
  accentText: palette.gray[950],
  success: palette.green[400],
  warning: palette.amber[400],
  danger: palette.red[400],
  focusRing: palette.indigo[300],
};
