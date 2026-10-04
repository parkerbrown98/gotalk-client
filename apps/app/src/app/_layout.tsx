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

import { shouldRetry } from '@/lib/api';
import { authManager, useAuthHydrated } from '@/lib/auth';
import { useInstancesHydrated } from '@/lib/instances';

SplashScreen.preventAutoHideAsync();

// The SPA export has no custom HTML shell, so paint the canvas from JS to avoid overscroll flashes.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.style.backgroundColor = baseTheme.colors.canvas;
  document.documentElement.style.colorScheme = 'dark';
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: shouldRetry } } });

// A session that ends takes that instance's account data with it; instance metadata is public and stays.
authManager.store.subscribe((state, previous) => {
  for (const id of Object.keys(previous.sessions)) {
    if (state.sessions[id]) continue;
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'instance' && q.queryKey[1] === id });
  }
});

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
        <Stack.Screen name="connect" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="consent" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="policy/[kind]" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
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
  // Route guards read the saved instance and session, so nothing renders until both have loaded.
  const instancesReady = useInstancesHydrated();
  const authReady = useAuthHydrated();
  const stored = instancesReady && authReady;

  useEffect(() => {
    if (ready && stored) SplashScreen.hideAsync();
  }, [ready, stored]);

  if (!ready || !stored) return null;

  return (
    <GotalkThemeProvider>
      <QueryClientProvider client={queryClient}>
        <Navigation />
      </QueryClientProvider>
    </GotalkThemeProvider>
  );
}
