import { darkColors, lightColors, type ColorTokens } from './colors.ts';
import { breakpoints, fontFamilies, fontSizes, fontWeights, lineHeights, radii, space } from './scale.ts';

export type ColorScheme = 'light' | 'dark';

export interface Theme {
  scheme: ColorScheme;
  colors: ColorTokens;
  space: typeof space;
  radii: typeof radii;
  fontSizes: typeof fontSizes;
  fontWeights: typeof fontWeights;
  lineHeights: typeof lineHeights;
  fontFamilies: typeof fontFamilies;
  breakpoints: typeof breakpoints;
}

const shared = { space, radii, fontSizes, fontWeights, lineHeights, fontFamilies, breakpoints };

export const lightTheme: Theme = { scheme: 'light', colors: lightColors, ...shared };
export const darkTheme: Theme = { scheme: 'dark', colors: darkColors, ...shared };
export const themes: Record<ColorScheme, Theme> = { light: lightTheme, dark: darkTheme };

/** Per-instance branding an operator (or user) can layer over the base theme. */
export interface ThemeOverrides {
  colors?: Partial<ColorTokens>;
}

export function createTheme(scheme: ColorScheme, overrides?: ThemeOverrides): Theme {
  const base = themes[scheme];
  if (!overrides?.colors) return base;
  return { ...base, colors: { ...base.colors, ...overrides.colors } };
}
