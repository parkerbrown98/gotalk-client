import type { Instance } from '@gotalk/api-client';
import { instanceDisplayName, isOfficialInstance, OFFICIAL_INSTANCE } from '@gotalk/core';
import { Badge, Button, Stack, Text, useTheme } from '@gotalk/ui';
import { Image } from 'expo-image';
import { useId, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import appMark from '@/assets/images/splash-icon.png';
import { ServerIcon } from '@/components/instance-summary';
import { TitleBar } from '@/components/screen-frame';
import { useWide } from '@/lib/layout';

export { ServerIcon };

/** The wordmark: the app icon's bubble beside "Gotalk", small, in the corner like app chrome. */
export function AppMark() {
  return (
    <View accessibilityRole="header" accessibilityLabel="Gotalk" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Image source={appMark} style={{ width: 22, height: 22 }} contentFit="contain" accessibilityIgnoresInvertColors />
      <Text variant="bodyStrong" tone="onDark" style={{ fontSize: 15 }}>
        Gotalk
      </Text>
    </View>
  );
}

/** The app icon's red, faded out from behind the icon. Only Gotalk Official uses it. */
export function BrandGlow({ x = 48, y = 44, radius = 320 }: { x?: number; y?: number; radius?: number }) {
  const theme = useTheme();
  const id = 'glow' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const { start, end } = theme.gradients.brandGlow;
  return (
    <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }} width="100%" height="100%" aria-hidden>
      <Defs>
        <RadialGradient id={id} cx={x} cy={y} rx={radius} ry={radius * 0.55} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={start} />
          <Stop offset="1" stopColor={end} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

const registrationLabel: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  open: { label: 'Open registration', tone: 'success' },
  invite_only: { label: 'Invite only', tone: 'warning' },
  closed: { label: 'Registration closed', tone: 'danger' },
};

export interface ServerCardProps {
  origin: string;
  /** What the server calls itself; Gotalk Official is always named as such. */
  name: string;
  iconUrl?: string | null;
  /** Present once the server has answered; adds the description and badges for servers people may not know. */
  instance?: Instance;
  secure?: boolean;
  onChange?: () => void;
}

/**
 * The server chosen on the welcome screen, pinned above the account step. Gotalk Official is a single line
 * on its glow; other servers also show their description, registration and size.
 */
export function ServerCard({ origin, name, iconUrl, instance, secure = true, onChange }: ServerCardProps) {
  const theme = useTheme();
  const official = isOfficialInstance(origin);
  const host = origin.replace(/^https?:\/\//, '');
  const reg = instance ? registrationLabel[instance.registration_mode] : undefined;
  const description = official ? undefined : instance?.description;
  return (
    <View style={{ borderWidth: 1, borderColor: theme.colors.hairline, borderRadius: theme.radii.md, backgroundColor: theme.colors.surface, overflow: 'hidden' }}>
      {official ? <BrandGlow x={30} y={30} radius={260} /> : null}
      <Stack gap="md" style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
        <Stack direction="row" gap="md" align="center">
          <ServerIcon origin={origin} name={name} iconUrl={iconUrl ?? instance?.icon_url} size={36} />
          <Stack gap="none" style={{ flex: 1 }}>
            <Text variant="bodySmStrong" tone="onDark" numberOfLines={1}>
              {instanceDisplayName(origin, name)}
            </Text>
            <Text variant="captionMd" tone="muted" numberOfLines={1}>
              {host}
            </Text>
          </Stack>
          {onChange ? <Button title="Change" variant="tertiary" size="sm" onPress={onChange} accessibilityLabel="Choose a different server" /> : null}
        </Stack>
        {description ? (
          <Text variant="bodySm" tone="muted">
            {description}
          </Text>
        ) : null}
        {!official && instance ? (
          <Stack direction="row" gap="sm" wrap>
            {reg ? <Badge label={reg.label} tone={reg.tone} /> : null}
            {!secure ? <Badge label="Not encrypted (HTTP)" tone="warning" /> : null}
            <Badge label={`${instance.stats.users.toLocaleString()} ${instance.stats.users === 1 ? 'member' : 'members'}`} />
          </Stack>
        ) : null}
      </Stack>
    </View>
  );
}

/** Gotalk Official as the first choice on first run: the full app icon on its glow, with the one white button. */
export function OfficialFeature({ action }: { action: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ borderWidth: 1, borderColor: theme.colors.hairline, borderRadius: theme.radii.lg, backgroundColor: theme.colors.surface, overflow: 'hidden' }}>
      <BrandGlow />
      <Stack gap="lg" style={{ padding: 20 }}>
        <Stack direction="row" gap="md" align="center">
          <ServerIcon origin={OFFICIAL_INSTANCE.origin} name={OFFICIAL_INSTANCE.name} size={56} />
          <Stack gap="none" style={{ flex: 1 }}>
            <Stack direction="row" gap="sm" align="center" wrap>
              <Text variant="headingSm">{OFFICIAL_INSTANCE.name}</Text>
              <Badge label="Run by Gotalk" />
            </Stack>
            <Text variant="captionMd" tone="muted">
              {OFFICIAL_INSTANCE.host}
            </Text>
          </Stack>
        </Stack>
        <Text variant="bodySm">{OFFICIAL_INSTANCE.description}</Text>
        {action}
      </Stack>
    </View>
  );
}

export interface WelcomeFrameProps {
  /** Phones show a title bar with this title and a back chevron; without it the wordmark heads the screen. */
  title?: string;
  onBack?: () => void;
  children: ReactNode;
}

/**
 * The welcome screen's frame: one 440px column, left-aligned and centred in the window, with the wordmark
 * in the corner. Phones scroll a single column under the wordmark or a title bar.
 */
export function WelcomeFrame({ title, onBack, children }: WelcomeFrameProps) {
  const theme = useTheme();
  const wide = useWide();
  const insets = useSafeAreaInsets();

  if (wide) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingBottom: 40, paddingHorizontal: theme.space.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ width: 440, maxWidth: '100%' }}>{children}</View>
        </ScrollView>
        <View style={{ position: 'absolute', top: 20, left: 24 }}>
          <AppMark />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.colors.canvas, paddingTop: insets.top }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {title ? <TitleBar title={title} onBack={onBack} /> : null}
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: theme.space.lg, paddingBottom: theme.space.xl + insets.bottom }} keyboardShouldPersistTaps="handled">
        {title ? null : (
          <View style={{ marginBottom: theme.space.xl }}>
            <AppMark />
          </View>
        )}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
