import { describe, expect, it } from 'vitest';

import { createTheme, theme, toCss, toCssVariables, typography } from './index.ts';

describe('theme', () => {
  it('createTheme layers overrides without mutating the base theme', () => {
    const branded = createTheme({ colors: { primary: '#ff0066' } });
    expect(branded.colors.primary).toBe('#ff0066');
    expect(branded.colors.ink).toBe(theme.colors.ink);
    expect(theme.colors.primary).toBe('#ffffff');
  });

  it('createTheme without overrides returns the base theme', () => {
    expect(createTheme()).toBe(theme);
  });

  it('matches the DESIGN.md surface ladder and primary action', () => {
    const c = theme.colors;
    expect([c.canvas, c.surface, c.surfaceElevated, c.surfaceCard, c.surfaceRaised]).toEqual(['#0e0f11', '#151619', '#1c1d21', '#24262a', '#2d2f34']);
    expect(c.primary).toBe('#ffffff');
    expect(c.hairline).toBe('#2e3135');
  });

  it('enables ss03 on every text style', () => {
    for (const style of Object.values(typography)) expect(style.fontFeature).toContain('"ss03"');
  });
});

describe('css', () => {
  it('emits kebab-cased variables and px units', () => {
    const vars = toCssVariables(theme);
    expect(vars['--gt-color-surface-elevated']).toBe('#1c1d21');
    expect(vars['--gt-space-lg']).toBe('16px');
    expect(vars['--gt-radius-md']).toBe('8px');
    expect(vars['--gt-type-body-md-size']).toBe('16px');
    expect(vars['--gt-type-body-md-line-height']).toBe('1.6');
    expect(vars['--gt-gradient-hero-stripe']).toBe('linear-gradient(#ff5757, #a1131a)');
  });

  it('renders a single dark :root block', () => {
    const css = toCss(theme);
    expect(css).toContain(':root {');
    expect(css).toContain('color-scheme: dark;');
    expect(css).not.toContain('prefers-color-scheme');
  });
});
