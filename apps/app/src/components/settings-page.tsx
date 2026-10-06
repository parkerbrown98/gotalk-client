import { Stack, Text, useTheme, type IconName } from '@gotalk/ui';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { ScreenFrame } from '@/components/screen-frame';
import { useInstanceInfo, useMe } from '@/lib/api';
import { goBack, useWide } from '@/lib/layout';

export interface SettingsPageProps {
  title: string;
  subtitle?: string;
  /** Width of the content column on wide layouts. */
  width?: number;
  children: ReactNode;
}

/** One account-settings screen: a sidebar-adjacent column on wide layouts, a pushed screen with a title bar on phones. */
export function SettingsPage({ title, subtitle, width = 640, children }: SettingsPageProps) {
  const theme = useTheme();
  const wide = useWide();

  if (!wide) {
    return (
      <ScreenFrame title={title} onBack={() => goBack('/settings')}>
        <Stack gap="lg">
          {subtitle ? (
            <Text variant="bodySm" tone="muted">
              {subtitle}
            </Text>
          ) : null}
          {children}
        </Stack>
      </ScreenFrame>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingVertical: theme.space.xxl, paddingHorizontal: 40 }} keyboardShouldPersistTaps="handled">
      <Stack gap="xl" style={{ width, maxWidth: '100%' }}>
        <Stack gap="xs">
          <Text variant="headingXl" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="bodySm" tone="muted">
              {subtitle}
            </Text>
          ) : null}
        </Stack>
        {children}
      </Stack>
    </ScrollView>
  );
}

export interface SettingsLink {
  path: Extract<Href, string>;
  label: string;
  icon: IconName;
}

const account: SettingsLink[] = [
  { path: '/settings/profile', label: 'Profile', icon: 'user' },
  { path: '/settings/password', label: 'Password', icon: 'lock' },
  { path: '/settings/devices', label: 'Devices', icon: 'laptop' },
  { path: '/settings/delete', label: 'Delete account', icon: 'trash' },
];

/**
 * Account settings beyond the account itself: developer tools when the instance offers them, and
 * instance administration for administrators. The transparency report is public.
 */
export function useSettingsGroups(): { label: string; links: SettingsLink[] }[] {
  const features = useInstanceInfo().data?.features;
  const admin = useMe().data?.is_instance_admin ?? false;
  const developer: SettingsLink[] = [
    ...(features?.api_tokens !== false ? [{ path: '/settings/tokens', label: 'Access tokens', icon: 'key' } as const] : []),
    ...(features?.bots !== false ? [{ path: '/settings/applications', label: 'Applications', icon: 'command' } as const] : []),
  ];
  const instance: SettingsLink[] = [
    ...(admin ? [{ path: '/settings/instance', label: 'Instance settings', icon: 'server' } as const] : []),
    ...(admin && features?.policies !== false ? [{ path: '/settings/policies', label: 'Policies', icon: 'shield' } as const] : []),
    ...(features?.transparency ? [{ path: '/settings/transparency', label: 'Transparency report', icon: 'eye' } as const] : []),
  ];
  return [
    { label: 'Account', links: account },
    ...(developer.length ? [{ label: 'Developer', links: developer }] : []),
    ...(instance.length ? [{ label: 'Instance', links: instance }] : []),
  ];
}
