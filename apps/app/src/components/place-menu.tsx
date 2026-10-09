import { Button, Dialog, ListCard, ListRow, Notice, Text, useTheme, type IconName } from '@gotalk/ui';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { ChannelFormDialog } from '@/components/channel-menu';
import { CreateInviteDialog } from '@/components/invite-dialog';
import { MenuItem, MenuPopover, MenuSeparator } from '@/components/menu';
import { usePlaceSettings } from '@/components/place-settings';
import { useInstanceInfo } from '@/lib/api';
import { classifyFailure } from '@/lib/failure';
import { resetTo } from '@/lib/layout';
import { useChannels, usePlaceAccess, usePlaceActions, type Place } from '@/lib/places';

export interface PlaceMenuItem {
  key: 'invite' | 'channel' | 'settings' | 'transparency' | 'leave';
  label: string;
  icon: IconName;
  danger?: boolean;
  onPress: () => void;
}

/** What the signed-in user may do from a place's menu, with the dialogs those actions open. */
export function usePlaceMenu(place: Place | undefined): { items: PlaceMenuItem[]; dialogs: ReactNode } {
  const access = usePlaceAccess(place);
  const actions = usePlaceActions();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const canChannels = access.can('MANAGE_CHANNELS');
  const channels = useChannels(place?.slug, access.isMember && canChannels).data ?? [];
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const theme = useTheme();
  const settings = usePlaceSettings(place?.slug);
  const transparency = useInstanceInfo().data?.features.transparency ?? false;

  if (!place || !access.isMember) return { items: [], dialogs: null };

  const items: PlaceMenuItem[] = [];
  if (access.can('CREATE_INVITES')) items.push({ key: 'invite', label: 'Invite people', icon: 'users', onPress: () => setInviteOpen(true) });
  if (canChannels) items.push({ key: 'channel', label: 'Create channel', icon: 'hash', onPress: () => setChannelOpen(true) });
  if (settings.sections.length > 0) {
    items.push({ key: 'settings', label: 'Place settings', icon: 'settings', onPress: () => router.push({ pathname: '/places/[slug]/settings', params: { slug: place.slug } }) });
  }
  if (transparency) {
    items.push({ key: 'transparency', label: 'Transparency report', icon: 'eye', onPress: () => router.push({ pathname: '/places/[slug]/transparency', params: { slug: place.slug } }) });
  }
  // The owner cannot leave; they transfer or delete the place instead.
  if (!access.isOwner) items.push({ key: 'leave', label: 'Leave place', icon: 'logout', danger: true, onPress: () => setLeaveOpen(true) });

  async function leave() {
    if (!place) return;
    setLeaving(true);
    setLeaveError(null);
    try {
      await actions.leave(place.slug);
      setLeaveOpen(false);
      resetTo('/home');
    } catch (e) {
      const f = classifyFailure(e);
      setLeaveError(f.kind === 'rejected' ? f.message : 'Could not leave the place. Try again.');
    } finally {
      setLeaving(false);
    }
  }

  const dialogs = (
    <>
      <CreateInviteDialog place={place} visible={inviteOpen} onClose={() => setInviteOpen(false)} />
      <ChannelFormDialog slug={place.slug} visible={channelOpen} onClose={() => setChannelOpen(false)} categories={channels.filter((c) => c.kind === 'category')} />
      <Dialog visible={leaveOpen} onClose={() => setLeaveOpen(false)}>
        <Text variant="headingMd" accessibilityRole="header">
          Leave {place.name}?
        </Text>
        <Text variant="bodySm" tone="muted">
          {place.visibility === 'public' ? 'You can join again later.' : 'You will need a new invite to come back.'}
        </Text>
        {leaveError ? <Notice tone="danger">{leaveError}</Notice> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
          <Button title="Stay" variant="tertiary" onPress={() => setLeaveOpen(false)} />
          <Button title="Leave place" variant="danger" onPress={leave} loading={leaving} />
        </View>
      </Dialog>
    </>
  );
  return { items, dialogs };
}

/** Phone: the menu as a bottom sheet. */
export function PlaceMenuSheet({ items, visible, onClose }: { items: PlaceMenuItem[]; visible: boolean; onClose: () => void }) {
  return (
    <Dialog visible={visible} onClose={onClose}>
      <ListCard style={{ borderWidth: 0, backgroundColor: 'transparent' }}>
        {items.map((item) => (
          <ListRow
            key={item.key}
            icon={item.icon}
            title={item.label}
            tone={item.danger ? 'danger' : 'default'}
            onPress={() => {
              onClose();
              item.onPress();
            }}
          />
        ))}
      </ListCard>
    </Dialog>
  );
}

/** Wide: a popover under the sidebar header, or at the pointer when right-clicked. */
export function PlaceMenuPopover({ items, visible, anchor, onClose }: { items: PlaceMenuItem[]; visible: boolean; anchor: { left: number; top: number }; onClose: () => void }) {
  return (
    <MenuPopover visible={visible} onClose={onClose} anchor={anchor}>
      {items.map((item) => (
        <View key={item.key}>
          {item.danger ? <MenuSeparator /> : null}
          <MenuItem
            label={item.label}
            icon={item.icon}
            danger={item.danger}
            onPress={() => {
              onClose();
              item.onPress();
            }}
          />
        </View>
      ))}
    </MenuPopover>
  );
}
