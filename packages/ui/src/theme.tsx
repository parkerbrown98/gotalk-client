import { createTheme, type ColorScheme, type Theme, type ThemeOverrides } from '@gotalk/tokens';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

export type SchemePreference = ColorScheme | 'system';

const ThemeContext = createContext<Theme | null>(null);

export interface ThemeProviderProps {
  /** Defaults to following the OS. */
  scheme?: SchemePreference;
  /** Branding layered over the base theme (e.g. an instance's accent color). */
  overrides?: ThemeOverrides;
  children: ReactNode;
}

export function ThemeProvider({ scheme = 'system', overrides, children }: ThemeProviderProps) {
  const system = useColorScheme();
  const resolved: ColorScheme = scheme === 'system' ? (system === 'dark' ? 'dark' : 'light') : scheme;
  const theme = useMemo(() => createTheme(resolved, overrides), [resolved, overrides]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}
