import { NavRow, Text, useTheme } from '@gotalk/ui';
import { Redirect, Stack, router, usePathname } from 'expo-router';
import { View } from 'react-native';

import { authManager, useAuthTarget, useSession } from '@/lib/auth';
import { useActiveInstance } from '@/lib/instances';
import { useWide } from '@/lib/layout';

const pages = [
  { path: '/settings/profile', label: 'Profile', icon: 'user' },
  { path: '/settings/password', label: 'Password', icon: 'lock' },
  { path: '/settings/devices', label: 'Devices', icon: 'laptop' },
  { path: '/settings/delete', label: 'Delete account', icon: 'trash' },
] as const;

function SettingsNav() {
  const theme = useTheme();
  const pathname = usePathname();
  const active = useActiveInstance();
  const target = useAuthTarget();
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
      <Text variant="captionMd" tone="muted" style={{ paddingHorizontal: 10, paddingTop: 6, paddingBottom: 2 }}>
        Account
      </Text>
      {pages.map((p) => (
        <NavRow key={p.path} label={p.label} icon={p.icon} active={pathname === p.path} onPress={() => router.replace(p.path)} />
      ))}
      <View style={{ marginTop: 'auto', borderTopWidth: 1, borderTopColor: theme.colors.hairline, paddingTop: theme.space.sm }}>
        <NavRow label="Sign out" icon="logout" onPress={() => target && void authManager.signOut(target)} />
      </View>
    </View>
  );
}

export default function SettingsLayout() {
  const theme = useTheme();
  const wide = useWide();
  const active = useActiveInstance();
  const session = useSession();
  if (!active) return <Redirect href="/connect" />;
  if (!session) return <Redirect href="/sign-in" />;

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
