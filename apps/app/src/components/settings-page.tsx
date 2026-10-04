import { Stack, Text, useTheme } from '@gotalk/ui';
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { ScreenFrame } from '@/components/screen-frame';
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
