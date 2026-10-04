/**
 * Colors from DESIGN.md. The system is dark-only: elevation comes from the surface ladder
 * (canvas → surface → surfaceElevated → surfaceCard), never from shadows. Saturated accents are
 * for status and illustrations, not for chrome.
 */
export interface ColorTokens {
  /** The one primary action: a white pill with black text. */
  primary: string;
  primaryPressed: string;
  onPrimary: string;

  /** Text, brightest to dimmest. */
  ink: string;
  body: string;
  charcoal: string;
  mute: string;
  ash: string;
  stone: string;
  onDark: string;
  onDarkMute: string;

  /** Surface ladder, darkest to lightest. */
  canvas: string;
  surface: string;
  surfaceElevated: string;
  surfaceCard: string;
  buttonFg: string;

  /** 1px borders. */
  hairline: string;
  hairlineSoft: string;
  hairlineStrong: string;

  accentBlue: string;
  accentBlueSoft: string;
  accentRed: string;
  accentRedSoft: string;
  accentGreen: string;
  accentGreenSoft: string;
  accentYellow: string;
  accentYellowSoft: string;
}

export const colors: ColorTokens = {
  primary: '#ffffff',
  primaryPressed: '#e8e8e8',
  onPrimary: '#000000',

  ink: '#f4f4f6',
  body: '#cdcdcd',
  charcoal: '#d3d3d4',
  mute: '#9c9c9d',
  ash: '#6a6b6c',
  stone: '#434345',
  onDark: '#ffffff',
  onDarkMute: 'rgba(255,255,255,0.72)',

  canvas: '#07080a',
  surface: '#0d0d0d',
  surfaceElevated: '#101111',
  surfaceCard: '#121212',
  buttonFg: '#18191a',

  hairline: '#242728',
  hairlineSoft: 'rgba(255,255,255,0.08)',
  hairlineStrong: 'rgba(255,255,255,0.16)',

  accentBlue: '#57c1ff',
  accentBlueSoft: 'rgba(87,193,255,0.15)',
  accentRed: '#ff6161',
  accentRedSoft: 'rgba(255,97,97,0.15)',
  accentGreen: '#59d499',
  accentGreenSoft: 'rgba(89,212,153,0.15)',
  accentYellow: '#ffc533',
  accentYellowSoft: 'rgba(255,197,51,0.15)',
};

/** Two-stop gradients. The hero stripe is allowed once per page; the keycap gradient is subtle depth. */
export const gradients = {
  heroStripe: { start: '#ff5757', end: '#a1131a' },
  keycap: { start: '#121212', end: '#0d0d0d' },
} as const;
