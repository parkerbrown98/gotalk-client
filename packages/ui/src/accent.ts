import type { Theme } from '@gotalk/tokens';

/** A stable soft accent for a name, used for avatars and icon tiles when there is no image. */
export function accentFor(colors: Theme['colors'], seed: string): { bg: string; fg: string } {
  const accents = [
    { bg: colors.accentYellowSoft, fg: colors.accentYellow },
    { bg: colors.accentGreenSoft, fg: colors.accentGreen },
    { bg: colors.accentBlueSoft, fg: colors.accentBlue },
    { bg: colors.accentRedSoft, fg: colors.accentRed },
  ];
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return accents[hash % accents.length]!;
}
