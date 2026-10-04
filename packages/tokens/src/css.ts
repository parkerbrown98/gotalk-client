import type { Theme } from './theme.ts';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

/** Flattens a theme into `--gt-*` CSS custom properties. */
export function toCssVariables(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(theme.colors)) vars[`--gt-color-${kebab(k)}`] = v;
  for (const [name, g] of Object.entries(theme.gradients)) {
    vars[`--gt-gradient-${kebab(name)}`] = `linear-gradient(${g.start}, ${g.end})`;
  }
  for (const [k, v] of Object.entries(theme.space)) vars[`--gt-space-${kebab(k)}`] = `${v}px`;
  for (const [k, v] of Object.entries(theme.radii)) vars[`--gt-radius-${kebab(k)}`] = `${v}px`;
  for (const [k, v] of Object.entries(theme.sizes)) vars[`--gt-size-${kebab(k)}`] = `${v}px`;
  for (const [k, v] of Object.entries(theme.breakpoints)) vars[`--gt-breakpoint-${kebab(k)}`] = `${v}px`;
  for (const [k, v] of Object.entries(theme.fontFamilies)) vars[`--gt-font-${k}`] = v;
  vars['--gt-font-feature-settings'] = theme.fontFeatures.base;
  for (const [name, s] of Object.entries(theme.typography)) {
    const p = `--gt-type-${kebab(name)}`;
    vars[`${p}-size`] = `${s.fontSize}px`;
    vars[`${p}-weight`] = s.fontWeight;
    vars[`${p}-line-height`] = String(s.lineHeight);
    vars[`${p}-letter-spacing`] = `${s.letterSpacing}px`;
    vars[`${p}-feature-settings`] = s.fontFeature;
  }
  return vars;
}

/** Renders a stylesheet for non-React surfaces (e.g. server-rendered public pages). Dark only. */
export function toCss(theme: Theme): string {
  const body = Object.entries({ ...toCssVariables(theme), 'color-scheme': 'dark' })
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `:root {\n${body}\n}\n`;
}
