import { describe, expect, it } from 'vitest';

import { createTheme, darkTheme, lightTheme, toCss, toCssVariables } from './index.ts';

describe('themes', () => {
  it('light and dark define the same color tokens', () => {
    expect(Object.keys(darkTheme.colors).sort()).toEqual(Object.keys(lightTheme.colors).sort());
  });

  it('createTheme layers overrides without mutating the base theme', () => {
    const branded = createTheme('dark', { colors: { accent: '#ff0066' } });
    expect(branded.colors.accent).toBe('#ff0066');
    expect(branded.colors.text).toBe(darkTheme.colors.text);
    expect(darkTheme.colors.accent).not.toBe('#ff0066');
  });

  it('createTheme without overrides returns the base theme', () => {
    expect(createTheme('light')).toBe(lightTheme);
  });
});

describe('css', () => {
  it('emits kebab-cased color variables and px units', () => {
    const vars = toCssVariables(lightTheme);
    expect(vars['--gt-color-text-muted']).toBe(lightTheme.colors.textMuted);
    expect(vars['--gt-space-4']).toBe('16px');
    expect(vars['--gt-radius-md']).toBe('8px');
  });

  it('renders light by default with a dark media query and an explicit override', () => {
    const css = toCss(lightTheme, darkTheme);
    expect(css).toContain(':root {');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain(`--gt-color-background: ${darkTheme.colors.background};`);
  });
});
