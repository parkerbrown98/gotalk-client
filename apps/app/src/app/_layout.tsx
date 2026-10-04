import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { theme as baseTheme } from '@gotalk/tokens';
import { ThemeProvider as GotalkThemeProvider, typeStyle, useTheme } from '@gotalk/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';

SplashScreen.preventAutoHideAsync();

// The SPA export has no custom HTML shell, so paint the canvas from JS to avoid overscroll flashes.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.style.backgroundColor = baseTheme.colors.canvas;
  document.documentElement.style.colorScheme = 'dark';
}

const queryClient = new QueryClient();

function Navigation() {
  const theme = useTheme();
  const navTheme = useMemo(() => {
    const c = theme.colors;
    return {
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        primary: c.primary,
        background: c.canvas,
        card: c.canvas,
        text: c.onDark,
        border: c.hairline,
        notification: c.accentRed,
      },
    };
  }, [theme]);

  return (
    <NavigationThemeProvider value={navTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShadowVisible: true,
          headerTitleStyle: typeStyle(theme, 'bodySmStrong'),
          contentStyle: { backgroundColor: theme.colors.canvas },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="connect" options={{ title: 'Connect to an instance' }} />
        <Stack.Screen name="home" options={{ title: 'Gotalk' }} />
      </Stack>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [baseTheme.fontFaces['400']]: Inter_400Regular,
    [baseTheme.fontFaces['500']]: Inter_500Medium,
    [baseTheme.fontFaces['600']]: Inter_600SemiBold,
  });
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GotalkThemeProvider>
      <QueryClientProvider client={queryClient}>
        <Navigation />
      </QueryClientProvider>
    </GotalkThemeProvider>
  );
}
