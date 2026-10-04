/** Spacing from DESIGN.md. Base unit is 8px; `section` is the vertical gap between page blocks. */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  section: 96,
} as const;

export const radii = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 16,
  full: 9999,
} as const;

/** Fixed component dimensions. */
export const sizes = {
  controlHeight: 36,
  searchHeight: 44,
  keycapHeight: 20,
  iconTile: 48,
  iconTileLarge: 64,
  navHeight: 56,
  /** Content column at desktop widths; outer gutters grow beyond it. */
  contentMaxWidth: 1240,
  /** Hero mockups run wider than the content column. */
  heroMaxWidth: 1080,
} as const;

export type FontWeight = '400' | '500' | '600';

/** Every style enables `calt`, `kern`, `liga` and `ss03`; the display tier swaps `liga` for `ss02`/`ss08`. */
export const fontFeatures = {
  base: '"calt", "kern", "liga", "ss03"',
  display: '"calt", "kern", "ss02", "ss03", "ss08"',
} as const;

export interface TypographyStyle {
  fontSize: number;
  fontWeight: FontWeight;
  /** Unitless multiple of `fontSize`. */
  lineHeight: number;
  /** Pixels. */
  letterSpacing: number;
  fontFeature: string;
}

const t = (
  fontSize: number,
  fontWeight: FontWeight,
  lineHeight: number,
  letterSpacing: number,
  fontFeature: string = fontFeatures.base,
): TypographyStyle => ({ fontSize, fontWeight, lineHeight, letterSpacing, fontFeature });

export const typography = {
  displayXl: t(64, '600', 1.1, 0, fontFeatures.display),
  displayLg: t(56, '500', 1.17, 0.2),
  headingXl: t(24, '500', 1.6, 0.2),
  headingLg: t(22, '500', 1.15, 0),
  headingMd: t(20, '500', 1.4, 0.2),
  headingSm: t(18, '500', 1.4, 0.2),
  bodyLg: t(18, '400', 1.6, 0),
  bodyMd: t(16, '400', 1.6, 0),
  bodyStrong: t(16, '500', 1.4, 0.2),
  bodySm: t(14, '400', 1.6, 0),
  bodySmStrong: t(14, '500', 1.6, 0.2),
  captionMd: t(13, '400', 1.4, 0.1),
  captionSm: t(12, '400', 1.5, 0.4),
  linkMd: t(16, '500', 1.4, 0.3),
  buttonMd: t(14, '500', 1.6, 0.2),
} as const satisfies Record<string, TypographyStyle>;

export type TypographyVariant = keyof typeof typography;

/** Font stacks for web/CSS. Mono is only for inline code chips. */
export const fontFamilies = {
  sans: 'Inter, "Inter Fallback", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono", "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const;

/**
 * Names the app registers Inter's static weights under (`@expo-google-fonts/inter`). React Native
 * has no weight synthesis for custom fonts, so each weight is its own family.
 */
export const fontFaces: Record<FontWeight, string> = {
  '400': 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
};

/** Minimum viewport widths, named after DESIGN.md. */
export const breakpoints = {
  mobileNarrow: 320,
  mobile: 480,
  tablet: 768,
  desktopSmall: 1024,
  desktop: 1280,
  desktopLarge: 1440,
  ultrawide: 1920,
} as const;
