import { Avatar, ListCard, ListRow, Stack, Text } from '@gotalk/ui';
import { Redirect, router } from 'expo-router';

import { ScreenFrame } from '@/components/screen-frame';
import { AttentionDot, useSettingsGroups } from '@/components/settings-page';
import { useMe } from '@/lib/api';
import { signOut, useAuthTarget, useSession } from '@/lib/auth';
import { useSessions } from '@/lib/sessions';
import { useActiveInstance } from '@/lib/instances';
import { goBack, useWide } from '@/lib/layout';

/** Phones get this menu; wide layouts show the same destinations in the sidebar. */
export default function SettingsIndex() {
  const wide = useWide();
  const active = useActiveInstance();
  const session = useSession();
  const target = useAuthTarget();
  const me = useMe().data;
  const sessions = useSessions().data;
  const groups = useSettingsGroups();

  if (wide) return <Redirect href="/settings/profile" />;
  if (!active || !session) return null;
  const host = active.origin.replace(/^https?:\/\//, '');

  return (
    <ScreenFrame title="Account" onBack={() => goBack('/home')}>
      <Stack gap="lg">
        <Stack direction="row" gap="md" align="center">
          <Avatar name={me?.display_name ?? session.displayName} uri={me?.avatar_url ?? session.avatarUrl} size={48} />
          <Stack gap="none" style={{ flex: 1 }}>
            <Text variant="headingSm">{me?.display_name ?? session.displayName}</Text>
            <Text variant="captionMd" tone="muted">
              {session.username} · {host}
            </Text>
          </Stack>
        </Stack>
        <ListCard>
          <ListRow icon="user" title="Profile" chevron onPress={() => router.push('/settings/profile')} />
          <ListRow icon="lock" title="Password" chevron onPress={() => router.push('/settings/password')} />
          <ListRow
            icon="laptop"
            title="Devices"
            chevron
            trailing={sessions ? <Text variant="captionMd" tone="muted">{sessions.length}</Text> : null}
            onPress={() => router.push('/settings/devices')}
          />
        </ListCard>
        <ListCard>
          <ListRow icon="logout" title="Sign out" onPress={() => target && void signOut(target)} />
          <ListRow icon="trash" title="Delete account" tone="danger" onPress={() => router.push('/settings/delete')} />
        </ListCard>
        {groups
          .filter((g) => g.label !== 'Account')
          .map((g) => (
            <Stack key={g.label} gap="sm">
              <Stack direction="row" gap="xs" align="center">
                <Text variant="captionMd" tone="muted">
                  {g.label}
                </Text>
                {g.attention ? <AttentionDot /> : null}
              </Stack>
              <ListCard>
                {g.links.map((l) => (
                  <ListRow key={l.path} icon={l.icon} title={l.label} chevron onPress={() => router.push(l.path)} />
                ))}
              </ListCard>
            </Stack>
          ))}
      </Stack>
    </ScreenFrame>
  );
}
