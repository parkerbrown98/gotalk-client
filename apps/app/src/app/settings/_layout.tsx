import { NavRow, Text, useTheme } from '@gotalk/ui';
import { Redirect, Stack, router, usePathname } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { AttentionDot, useSettingsGroups } from '@/components/settings-page';
import { signOut, useAuthTarget, useSession } from '@/lib/auth';
import { useActiveInstance } from '@/lib/instances';
import { useWide } from '@/lib/layout';
import { welcomeHref } from '@/lib/welcome';

function SettingsNav() {
  const theme = useTheme();
  const pathname = usePathname();
  const active = useActiveInstance();
  const target = useAuthTarget();
  const groups = useSettingsGroups();
  return (
    <View
      style={{
        width: 248,
        backgroundColor: theme.colors.surface,
        borderRightWidth: 1,
        borderRightColor: theme.colors.hairline,
        paddingVertical: theme.space.lg,
        paddingHorizontal: theme.space.sm,
        gap: 2,
      }}
    >
      <View style={{ marginBottom: theme.space.sm }}>
        <NavRow label={`Back to ${active?.name ?? 'home'}`} icon="chevronLeft" onPress={() => router.replace('/home')} />
      </View>
      <ScrollView contentContainerStyle={{ gap: 2 }}>
        {groups.map((g) => (
          <View key={g.label} style={{ gap: 2, marginBottom: theme.space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 2 }}>
              <Text variant="captionMd" tone="muted">
                {g.label}
              </Text>
              {g.attention ? <AttentionDot /> : null}
            </View>
            {g.links.map((p) => (
              <NavRow key={p.path} label={p.label} icon={p.icon} active={pathname === p.path || pathname.startsWith(`${p.path}/`)} onPress={() => router.replace(p.path)} />
            ))}
          </View>
        ))}
      </ScrollView>
      <View style={{ marginTop: 'auto', borderTopWidth: 1, borderTopColor: theme.colors.hairline, paddingTop: theme.space.sm }}>
        <NavRow label="Sign out" icon="logout" onPress={() => target && void signOut(target)} />
      </View>
    </View>
  );
}

export default function SettingsLayout() {
  const theme = useTheme();
  const wide = useWide();
  const active = useActiveInstance();
  const session = useSession();
  if (!active) return <Redirect href="/welcome" />;
  if (!session) return <Redirect href={welcomeHref(active.origin)} />;

  const screens = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.canvas }, animation: wide ? 'none' : 'default' }} />
  );
  if (!wide) return screens;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.colors.canvas }}>
      <SettingsNav />
      <View style={{ flex: 1 }}>{screens}</View>
    </View>
  );
}
