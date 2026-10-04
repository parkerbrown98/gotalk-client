import type { Instance } from '@gotalk/api-client';
import { Badge, Stack, Text, useTheme } from '@gotalk/ui';
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
  if (uri) return <Image source={{ uri }} style={box} contentFit="cover" accessibilityIgnoresInvertColors />;
  return (
    <View style={[box, { backgroundColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: theme.colors.accentText, fontSize: size * 0.45, fontWeight: theme.fontWeights.bold }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

export function InstanceSummary({ instance, origin, secure }: { instance: Instance; origin: string; secure: boolean }) {
  const f = instance.features;
  const features = [
    f.forums && 'Forums',
    f.chat && 'Chat',
    f.voice && 'Voice',
    f.search !== 'none' && 'Search',
    f.bots && 'Bots',
  ].filter(Boolean) as string[];

  return (
    <Stack gap={3}>
      <Stack direction="row" gap={3} align="center">
        <InstanceIcon name={instance.name} iconUrl={instance.icon_url} origin={origin} />
        <Stack gap={0} style={{ flex: 1 }}>
          <Text variant="heading">{instance.name}</Text>
          <Text variant="caption" tone="muted">
            {origin.replace(/^https?:\/\//, '')} · {instance.software.name} {instance.software.version}
          </Text>
        </Stack>
      </Stack>
      {instance.description ? <Text tone="muted">{instance.description}</Text> : null}
      <Stack direction="row" gap={2} wrap>
        <Badge
          label={registrationLabel[instance.registration_mode] ?? instance.registration_mode}
          tone={instance.registration_mode === 'open' ? 'success' : 'neutral'}
        />
        {!secure ? <Badge label="Not encrypted (HTTP)" tone="warning" /> : null}
        {features.map((name) => (
          <Badge key={name} label={name} tone="accent" />
        ))}
      </Stack>
      <Text variant="caption" tone="muted">
        {instance.stats.users.toLocaleString()} {instance.stats.users === 1 ? 'member' : 'members'} ·{' '}
        {instance.stats.places.toLocaleString()} {instance.stats.places === 1 ? 'place' : 'places'}
      </Text>
    </Stack>
  );
}
