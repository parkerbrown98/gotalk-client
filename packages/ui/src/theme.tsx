import { createTheme, type Theme, type ThemeOverrides } from '@gotalk/tokens';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

const ThemeContext = createContext<Theme | null>(null);

export interface ThemeProviderProps {
  /** Branding layered over the base theme (e.g. an instance's colors). */
  overrides?: ThemeOverrides;
  children: ReactNode;
}

/** The design system is dark-only, so there is no scheme preference to follow. */
export function ThemeProvider({ overrides, children }: ThemeProviderProps) {
  const theme = useMemo(() => createTheme(overrides), [overrides]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}
