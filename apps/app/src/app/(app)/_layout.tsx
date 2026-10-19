import { useTheme } from '@gotalk/ui';
import { Redirect, Stack, router, useGlobalSearchParams, usePathname, useSegments, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CallMiniBar } from '@/components/call-bar';
import { CommandPalette, useCommandPaletteShortcut } from '@/components/command-palette';
import { ConnectionBanner, useConnectionBannerVisible } from '@/components/connection-banner';
import { MessagesSidebar, PlaceRail, PlaceSidebar, TabBar, useRouteSlug } from '@/components/shell';
import { useConsents } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { consentDismissed } from '@/lib/consent';
import { useActiveInstance } from '@/lib/instances';
import { useWide } from '@/lib/layout';
import { useLinkStep } from '@/lib/links';
import { welcomeHref } from '@/lib/welcome';

/** Signed-in shell: rail and sidebar on wide screens, a tab bar on phones. */
export default function AppLayout() {
  const theme = useTheme();
  const wide = useWide();
  const active = useActiveInstance();
  const session = useSession();
  const slug = useRouteSlug();
  const pathname = usePathname();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const inMessages = pathname === '/messages' || pathname.startsWith('/messages/');
  const banner = useConnectionBannerVisible();
  const consents = useConsents();
  const [palette, setPalette] = useState(false);
  const owesConsent = (consents.data?.outstanding?.length ?? 0) > 0;
  // A place link (`/places/<slug>?instance=<origin>`) names its instance. Already open here, it just drops
  // the parameter; otherwise the link screen switches instances, reads signed out or offers to add it first.
  const { instance: linkInstance } = useGlobalSearchParams<{ instance?: string }>();
  const linkSlug = linkInstance && slug ? slug : undefined;
  const link = useLinkStep(linkSlug ? linkInstance : undefined);
  const linkOpen = !!linkSlug && link.kind === 'open' && active?.id === link.instanceId;
  const linkElsewhere = !!linkSlug && !linkOpen;
  useEffect(() => {
    // The link only carries `instance`, so the path alone is the same screen without it.
    if (linkOpen) router.replace(pathname as Href);
    // Replaced after the navigator mounts: redirecting from a layout that renders no navigator loses the route.
    else if (linkElsewhere) router.replace({ pathname: '/explore/places/[slug]', params: { slug: linkSlug!, instance: linkInstance! } });
  }, [linkOpen, linkElsewhere, linkSlug, linkInstance, pathname]);

  useCommandPaletteShortcut(useCallback(() => wide && setPalette(true), [wide]));
  useEffect(() => {
    if (active && owesConsent && !consentDismissed.has(active.id)) router.push('/consent');
  }, [active, owesConsent]);

  const screens = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.canvas }, animation: wide ? 'none' : 'default' }} />
  );
  // Signed out, a place link or a screen outside the group (a link screen, or signing out from settings)
  // decides where to go: render the bare navigator instead of redirecting to the welcome screen.
  if ((linkElsewhere || segments[0] !== '(app)') && (!active || !session)) return screens;
  if (!active) return <Redirect href="/welcome" />;
  if (!session) return <Redirect href={welcomeHref(active.origin)} />;

  if (!wide) {
    // The banner takes the top inset, so screens below it do not pad for the status bar again.
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
        {banner ? (
          <View style={{ paddingTop: insets.top }}>
            <ConnectionBanner />
          </View>
        ) : null}
        <SafeAreaInsetsContext.Provider value={banner ? { ...insets, top: 0 } : insets}>
          <View style={{ flex: 1 }}>{screens}</View>
        </SafeAreaInsetsContext.Provider>
        <CallMiniBar />
        <TabBar />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.colors.canvas }}>
      <PlaceRail onOpenPalette={() => setPalette(true)} />
      {inMessages ? <MessagesSidebar /> : slug ? <PlaceSidebar slug={slug} /> : null}
      <View style={{ flex: 1 }}>
        {banner ? <ConnectionBanner /> : null}
        <View style={{ flex: 1 }}>{screens}</View>
        {/* Without a sidebar there is no call panel, so the call shows here instead. */}
        {inMessages || slug ? null : <CallMiniBar />}
      </View>
      <CommandPalette visible={palette} onClose={() => setPalette(false)} />
    </View>
  );
}
