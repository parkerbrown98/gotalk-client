import { Stack, Text, useTheme } from '@gotalk/ui';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { InstanceIcon, InstanceSummary } from '@/components/instance-summary';
import { ScreenFrame } from '@/components/screen-frame';
import { useInstanceInfo } from '@/lib/api';
import { goBack, useWide } from '@/lib/layout';
import { useActiveInstance } from '@/lib/instances';

export interface AuthLayoutProps {
  /** Title bar text on phones. */
  appbarTitle: string;
  /** Form heading on wide layouts, where there is no title bar. */
  heading: string;
  /** Replaces the instance description in the left column (for example "Anyone can join"). */
  note?: string;
  /** Left column shows only the registration badge, without feature chips and counts. */
  minimalAbout?: boolean;
  /** Shown at the right of the instance row on phones. */
  phoneBadge?: ReactNode;
  children: ReactNode;
}

/**
 * Sign-in and sign-up shell. Wide screens keep the instance in a left column so people always know
 * which server they are talking to; phones collapse it to one line under the title.
 */
export function AuthLayout({ appbarTitle, heading, note, minimalAbout, phoneBadge, children }: AuthLayoutProps) {
  const theme = useTheme();
  const wide = useWide();
  const active = useActiveInstance();
  const info = useInstanceInfo().data;
  if (!active) return null;
  const origin = active.origin.replace(/^https?:\/\//, '');

  if (!wide) {
    return (
      <ScreenFrame title={appbarTitle} onBack={() => goBack('/connect')}>
        <Stack gap="lg">
          <Stack direction="row" gap="md" align="center">
            <InstanceIcon name={active.name} iconUrl={active.iconUrl} origin={active.origin} size={36} />
            <Stack gap="none" style={{ flex: 1 }}>
              <Text variant="bodySmStrong" tone="onDark">
                {active.name}
              </Text>
              <Text variant="captionMd" tone="muted">
                {origin}
              </Text>
            </Stack>
            {phoneBadge}
          </Stack>
          {children}
        </Stack>
      </ScreenFrame>
    );
  }

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.colors.canvas }}>
      <View
        style={{
          width: 400,
          backgroundColor: theme.colors.surface,
          borderRightWidth: 1,
          borderRightColor: theme.colors.hairline,
          paddingVertical: theme.space.xxl,
          paddingHorizontal: theme.space.xl,
          gap: theme.space.lg,
        }}
      >
        {info ? (
          <InstanceSummary instance={info} origin={active.origin} secure={active.apiBaseUrl.startsWith('https://')} iconSize={64} note={note} minimal={minimalAbout} large />
        ) : (
          <Stack direction="row" gap="md" align="center">
            <InstanceIcon name={active.name} iconUrl={active.iconUrl} origin={active.origin} size={64} />
            <Stack gap="none" style={{ flex: 1 }}>
              <Text variant="headingMd">{active.name}</Text>
              <Text variant="captionMd" tone="muted">
                {origin}
              </Text>
            </Stack>
          </Stack>
        )}
        <Pressable accessibilityRole="link" onPress={() => router.replace('/connect')} style={{ marginTop: 'auto' }}>
          <Text variant="bodySm" tone="onDark">
            Use a different instance
          </Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: theme.space.xl }} keyboardShouldPersistTaps="handled">
        <View style={{ width: 380, maxWidth: '100%', gap: theme.space.xl }}>
          <Text variant="headingXl" accessibilityRole="header">
            {heading}
          </Text>
          {children}
        </View>
      </ScrollView>
    </View>
  );
}
