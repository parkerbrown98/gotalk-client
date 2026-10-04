import type { Theme } from './theme.ts';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

/** Flattens a theme into `--gt-*` CSS custom properties. */
export function toCssVariables(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(theme.colors)) vars[`--gt-color-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(theme.space)) vars[`--gt-space-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(theme.radii)) vars[`--gt-radius-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(theme.fontSizes)) vars[`--gt-font-size-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(theme.fontWeights)) vars[`--gt-font-weight-${k}`] = v;
  for (const [k, v] of Object.entries(theme.lineHeights)) vars[`--gt-line-height-${k}`] = String(v);
  for (const [k, v] of Object.entries(theme.fontFamilies)) vars[`--gt-font-${k}`] = v;
  return vars;
}

function block(selector: string, vars: Record<string, string>, indent = ''): string {
  const body = Object.entries(vars)
    .map(([k, v]) => `${indent}  ${k}: ${v};`)
    .join('\n');
  return `${indent}${selector} {\n${body}\n${indent}}`;
}

/**
 * Renders a stylesheet for non-React surfaces (e.g. server-rendered public pages). Light is
 * the default; dark applies via `prefers-color-scheme` or an explicit `data-theme="dark"`.
 */
export function toCss(light: Theme, dark: Theme): string {
  const lightVars = { ...toCssVariables(light), 'color-scheme': 'light' };
  const darkVars = { ...toCssVariables(dark), 'color-scheme': 'dark' };
  return (
    [
      block(':root', lightVars),
      `@media (prefers-color-scheme: dark) {\n${block(':root:not([data-theme="light"])', darkVars, '  ')}\n}`,
      block(':root[data-theme="dark"]', darkVars),
    ].join('\n\n') + '\n'
  );
}
