/**
 * Colors from DESIGN.md. The system is dark-only: elevation comes from the surface ladder
 * (canvas → surface → surfaceElevated → surfaceCard → surfaceRaised), never from shadows. Saturated accents are
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

  /** Surface ladder, darkest to lightest. Hover and active fills step one rung up from their container. */
  canvas: string;
  surface: string;
  surfaceElevated: string;
  surfaceCard: string;
  /** Top rung: hover over controls that already sit on `surfaceCard` (e.g. inside dialogs). */
  surfaceRaised: string;
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
  primaryPressed: '#d9d9db',
  onPrimary: '#000000',

  ink: '#f4f4f6',
  body: '#d4d4d6',
  charcoal: '#dadadc',
  mute: '#a8a9ab',
  ash: '#808184',
  stone: '#515256',
  onDark: '#ffffff',
  onDarkMute: 'rgba(255,255,255,0.78)',

  canvas: '#0e0f11',
  surface: '#151619',
  surfaceElevated: '#1c1d21',
  surfaceCard: '#24262a',
  surfaceRaised: '#2d2f34',
  buttonFg: '#292a2e',

  hairline: '#2e3135',
  hairlineSoft: 'rgba(255,255,255,0.09)',
  hairlineStrong: 'rgba(255,255,255,0.24)',

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
  keycap: { start: '#24262a', end: '#151619' },
} as const;
