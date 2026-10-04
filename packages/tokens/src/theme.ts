import { colors, gradients, type ColorTokens } from './colors.ts';
import { breakpoints, fontFaces, fontFamilies, fontFeatures, radii, sizes, space, typography } from './scale.ts';

export interface Theme {
  colors: ColorTokens;
  gradients: typeof gradients;
  space: typeof space;
  radii: typeof radii;
  sizes: typeof sizes;
  typography: typeof typography;
  fontFamilies: typeof fontFamilies;
  fontFaces: typeof fontFaces;
  fontFeatures: typeof fontFeatures;
  breakpoints: typeof breakpoints;
}

/** The only theme. DESIGN.md defines no light variant. */
export const theme: Theme = {
  colors,
  gradients,
  space,
  radii,
  sizes,
  typography,
  fontFamilies,
  fontFaces,
  fontFeatures,
  breakpoints,
};

/** Per-instance branding an operator can layer over the base theme. */
export interface ThemeOverrides {
  colors?: Partial<ColorTokens>;
}

export function createTheme(overrides?: ThemeOverrides): Theme {
  if (!overrides?.colors) return theme;
  return { ...theme, colors: { ...theme.colors, ...overrides.colors } };
}
