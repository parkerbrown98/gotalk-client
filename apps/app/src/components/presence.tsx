import type { PresenceStatus, VisibleStatus } from '@gotalk/gateway';
import { Avatar, Dialog, Icon, ListCard, ListRow, Text, useTheme } from '@gotalk/ui';
import { View } from 'react-native';

import { MenuItem } from '@/components/menu';
import { useActiveInstance } from '@/lib/instances';
import { setMyStatus, useMyStatus, usePresence } from '@/lib/realtime';

export const presenceLabels: Record<PresenceStatus | VisibleStatus, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do not disturb',
  invisible: 'Invisible',
  offline: 'Offline',
};

const choices: readonly { status: PresenceStatus; description?: string }[] = [
  { status: 'online' },
  { status: 'idle' },
  { status: 'dnd' },
  { status: 'invisible', description: 'You appear offline' },
];

/** Green, yellow, red or a grey ring; invisible is an empty ring so it reads as "off, by choice". */
export function PresenceDot({ status, size = 10, ring }: { status: PresenceStatus | VisibleStatus | undefined; size?: number; ring?: string }) {
  const theme = useTheme();
  const c = theme.colors;
  const fill = status === 'online' ? c.accentGreen : status === 'idle' ? c.accentYellow : status === 'dnd' ? c.accentRed : status === 'invisible' ? 'transparent' : c.stone;
  const border = status === 'invisible' || ring ? 2 : 0;
  const outer = size + border * 2;
  return (
    <View
      style={{
        width: outer,
        height: outer,
        borderRadius: outer / 2,
        backgroundColor: fill,
        borderWidth: border,
        borderColor: status === 'invisible' ? c.stone : ring,
      }}
    />
  );
}

export interface PresenceUser {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

/** An avatar with the person's live presence in the corner. */
export function PresenceAvatar({ user, size = 32, ring, hidePresence }: { user: PresenceUser; size?: number; ring?: string; hidePresence?: boolean }) {
  const theme = useTheme();
  const status = usePresence(hidePresence ? undefined : user.id);
  const dot = size >= 40 ? 12 : size >= 28 ? 10 : 8;
  return (
    <View style={{ width: size, height: size }}>
      <Avatar name={user.display_name} uri={user.avatar_url} size={size} />
      {hidePresence || !status ? null : (
        <View style={{ position: 'absolute', right: -2, bottom: -2 }}>
          <PresenceDot status={status} size={dot} ring={ring ?? theme.colors.canvas} />
        </View>
      )}
    </View>
  );
}

/** Presence choices for a popover menu. */
export function PresenceMenuItems({ onDone }: { onDone: () => void }) {
  const inst = useActiveInstance()?.id;
  const mine = useMyStatus();
  return (
    <>
      {choices.map((ch) => (
        <MenuItem
          key={ch.status}
          label={presenceLabels[ch.status]}
          description={ch.description}
          leading={<PresenceDot status={ch.status} />}
          checked={mine === ch.status}
          onPress={() => {
            if (inst) setMyStatus(inst, ch.status);
            onDone();
          }}
        />
      ))}
    </>
  );
}

/** The same choices as a dialog (a sheet on phones). */
export function PresenceSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const inst = useActiveInstance()?.id;
  const mine = useMyStatus();
  return (
    <Dialog visible={visible} onClose={onClose}>
      <Text variant="headingMd" accessibilityRole="header">
        Status
      </Text>
      <ListCard style={{ backgroundColor: theme.colors.surface }}>
        {choices.map((ch) => (
          <ListRow
            key={ch.status}
            title={presenceLabels[ch.status]}
            subtitle={ch.description}
            leading={<PresenceDot status={ch.status} />}
            trailing={mine === ch.status ? <Icon name="check" size={16} color={theme.colors.onDark} /> : undefined}
            onPress={() => {
              if (inst) setMyStatus(inst, ch.status);
              onClose();
            }}
          />
        ))}
      </ListCard>
    </Dialog>
  );
}
