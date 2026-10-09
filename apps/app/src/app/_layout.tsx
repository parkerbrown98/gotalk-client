import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { theme as baseTheme } from '@gotalk/tokens';
import { ThemeProvider as GotalkThemeProvider, typeStyle, useTheme } from '@gotalk/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  DarkTheme,
  ErrorBoundary as RouterErrorBoundary,
  type ErrorBoundaryProps,
  Stack,
  ThemeProvider as NavigationThemeProvider,
} from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';

import { DesktopContextMenu } from '@/components/context-menu';
import { DesktopFrame } from '@/components/title-bar';
import { shouldRetry } from '@/lib/api';
import { authManager, useAuthHydrated } from '@/lib/auth';
import { FeedSyncHost } from '@/lib/feeds';
import { useInstancesHydrated } from '@/lib/instances';
import { RealtimeHost } from '@/lib/realtime';
import { hideSplash } from '@/lib/splash';

// On web the canvas color and splash come from public/index.html, so they show before this bundle runs.
SplashScreen.preventAutoHideAsync();

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
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
        <Stack.Screen name="invite/[code]" options={{ headerShown: false }} />
        <Stack.Screen name="explore" options={{ headerShown: false }} />
      </Stack>
    </NavigationThemeProvider>
  );
}

/** A failure while starting up must not stay hidden behind the splash. */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  useEffect(() => hideSplash(), []);
  return <RouterErrorBoundary {...props} />;
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
    if (ready && stored) hideSplash();
  }, [ready, stored]);

  if (!ready || !stored) return null;

  return (
    <GotalkThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RealtimeHost />
        <FeedSyncHost />
        <DesktopFrame>
          <Navigation />
        </DesktopFrame>
        <DesktopContextMenu />
      </QueryClientProvider>
    </GotalkThemeProvider>
  );
}
