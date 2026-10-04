import { useTheme } from '@gotalk/ui';
import { Redirect, Stack, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { CommandPalette, useCommandPaletteShortcut } from '@/components/command-palette';
import { PlaceRail, PlaceSidebar, TabBar, useRouteSlug } from '@/components/shell';
import { useConsents } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { consentDismissed } from '@/lib/consent';
import { useActiveInstance } from '@/lib/instances';
import { useWide } from '@/lib/layout';

/** Signed-in shell: rail and sidebar on wide screens, a tab bar on phones. */
export default function AppLayout() {
  const theme = useTheme();
  const wide = useWide();
  const active = useActiveInstance();
  const session = useSession();
  const slug = useRouteSlug();
  const consents = useConsents();
  const [palette, setPalette] = useState(false);
  const owesConsent = (consents.data?.outstanding?.length ?? 0) > 0;

  useCommandPaletteShortcut(useCallback(() => wide && setPalette(true), [wide]));
  useEffect(() => {
    if (active && owesConsent && !consentDismissed.has(active.id)) router.push('/consent');
  }, [active, owesConsent]);

  if (!active) return <Redirect href="/connect" />;
  if (!session) return <Redirect href="/sign-in" />;

  const screens = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.canvas }, animation: wide ? 'none' : 'default' }} />
  );
  if (!wide) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
        <View style={{ flex: 1 }}>{screens}</View>
        <TabBar />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.colors.canvas }}>
      <PlaceRail onOpenPalette={() => setPalette(true)} />
      {slug ? <PlaceSidebar slug={slug} /> : null}
      <View style={{ flex: 1 }}>{screens}</View>
      <CommandPalette visible={palette} onClose={() => setPalette(false)} />
    </View>
  );
}
