import { Button, Dialog, Icon, ListCard, ListRow, Notice, Text, useTheme, type IconName } from '@gotalk/ui';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { ChannelFormDialog } from '@/components/channel-menu';
import { CreateInviteDialog } from '@/components/invite-dialog';
import { classifyFailure } from '@/lib/failure';
import { resetTo } from '@/lib/layout';
import { useChannels, usePlaceAccess, usePlaceActions, type Place } from '@/lib/places';

export interface PlaceMenuItem {
  key: 'invite' | 'channel' | 'settings' | 'leave';
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

  if (!place || !access.isMember) return { items: [], dialogs: null };

  const items: PlaceMenuItem[] = [];
  if (access.can('CREATE_INVITES')) items.push({ key: 'invite', label: 'Invite people', icon: 'users', onPress: () => setInviteOpen(true) });
  if (canChannels) items.push({ key: 'channel', label: 'Create channel', icon: 'hash', onPress: () => setChannelOpen(true) });
  if (access.can('MANAGE_PLACE') || access.can('MANAGE_INVITES')) {
    items.push({ key: 'settings', label: 'Place settings', icon: 'settings', onPress: () => router.push({ pathname: '/places/[slug]/settings', params: { slug: place.slug } }) });
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

/** Wide: a popover under the sidebar header. */
export function PlaceMenuPopover({ items, visible, onClose }: { items: PlaceMenuItem[]; visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close menu" onPress={onClose} style={{ flex: 1 }}>
        <View
          style={{
            position: 'absolute',
            left: 72,
            top: 44,
            width: 232,
            padding: 6,
            gap: 2,
            backgroundColor: c.surfaceElevated,
            borderColor: c.hairlineStrong,
            borderWidth: 1,
            borderRadius: theme.radii.lg,
          }}
        >
          {items.map((item) => (
            <View key={item.key}>
              {item.danger ? <View style={{ height: 1, backgroundColor: c.hairline, marginVertical: 4 }} /> : null}
              <Pressable
                accessibilityRole="menuitem"
                onPress={() => {
                  onClose();
                  item.onPress();
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: theme.radii.sm,
                  backgroundColor: pressed ? c.surfaceCard : 'transparent',
                })}
              >
                <Icon name={item.icon} size={16} color={item.danger ? c.accentRed : c.mute} />
                <Text variant="bodySm" tone={item.danger ? 'danger' : 'default'}>
                  {item.label}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}
