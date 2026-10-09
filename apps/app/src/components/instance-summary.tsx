import type { Instance } from '@gotalk/api-client';
import { Badge, Stack, Text, accentFor, useTheme } from '@gotalk/ui';
import { Image } from 'expo-image';
import { View } from 'react-native';

const registrationLabel: Record<string, string> = {
  open: 'Open registration',
  invite_only: 'Invite only',
  closed: 'Registration closed',
};

function resolveIcon(iconUrl: string | null | undefined, origin: string): string | null {
  if (!iconUrl) return null;
  return /^https?:\/\//i.test(iconUrl) ? iconUrl : `${origin}${iconUrl.startsWith('/') ? '' : '/'}${iconUrl}`;
}

export function InstanceIcon({ name, iconUrl, origin, size = 48 }: { name: string; iconUrl?: string | null; origin: string; size?: number }) {
  const theme = useTheme();
  const uri = resolveIcon(iconUrl, origin);
  const box = { width: size, height: size, borderRadius: theme.radii.md };
  // A short fade as the image arrives, instead of it popping in over the placeholder.
  if (uri) return <Image source={{ uri }} style={box} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />;
  const accent = accentFor(theme.colors, name);
  return (
    <View style={[box, { backgroundColor: accent.bg, alignItems: 'center', justifyContent: 'center' }]}>
      <Text variant="headingSm" style={{ color: accent.fg, fontSize: size * 0.38, lineHeight: size * 0.5 }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

export function InstanceSummary({
  instance,
  origin,
  secure,
  iconSize,
  note,
  minimal,
  large,
}: {
  instance: Instance;
  origin: string;
  secure: boolean;
  iconSize?: number;
  /** Replaces the instance description. */
  note?: string;
  /** Registration badge only: no feature chips or member counts. */
  minimal?: boolean;
  /** Larger name, for the sign-in and sign-up column. */
  large?: boolean;
}) {
  const f = instance.features;
  const features = [
    f.forums && 'Forums',
    f.chat && 'Chat',
    f.voice && 'Voice',
    f.search !== 'none' && 'Search',
    f.bots && 'Bots',
  ].filter(Boolean) as string[];

  return (
    <Stack gap="md">
      <Stack direction="row" gap="md" align="center">
        <InstanceIcon name={instance.name} iconUrl={instance.icon_url} origin={origin} size={iconSize} />
        <Stack gap="none" style={{ flex: 1 }}>
          <Text variant={large ? 'headingMd' : 'headingSm'}>{instance.name}</Text>
          <Text variant="captionMd" tone="muted">
            {origin.replace(/^https?:\/\//, '')} · {instance.software.name} {instance.software.version}
          </Text>
        </Stack>
      </Stack>
      {(note ?? instance.description) ? (
        <Text variant="bodySm" tone="muted">
          {note ?? instance.description}
        </Text>
      ) : null}
      <Stack direction="row" gap="sm" wrap>
        <Badge
          label={registrationLabel[instance.registration_mode] ?? instance.registration_mode}
          tone={instance.registration_mode === 'open' ? 'success' : 'neutral'}
        />
        {!secure ? <Badge label="Not encrypted (HTTP)" tone="warning" /> : null}
        {minimal ? null : features.map((name) => <Badge key={name} label={name} />)}
      </Stack>
      {minimal ? null : (
        <Text variant="captionMd" tone="muted">
          {instance.stats.users.toLocaleString()} {instance.stats.users === 1 ? 'member' : 'members'} ·{' '}
          {instance.stats.places.toLocaleString()} {instance.stats.places === 1 ? 'place' : 'places'}
        </Text>
      )}
    </Stack>
  );
}
