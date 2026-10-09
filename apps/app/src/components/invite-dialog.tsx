import { buildInviteLink } from '@gotalk/core';
import { Button, Dialog, Notice, PillTabs, Stack, Text, useTheme } from '@gotalk/ui';
import { useEffect, useState } from 'react';
import { Platform, Share, View } from 'react-native';

import { copyText } from '@/lib/clipboard';
import { isDesktop } from '@/lib/desktop';
import { classifyFailure } from '@/lib/failure';
import { useActiveInstance } from '@/lib/instances';
import { useWide } from '@/lib/layout';
import { usePlaceActions, type Invite, type Place } from '@/lib/places';

const EXPIRY = [
  { value: '86400', label: '1 day' },
  { value: '604800', label: '7 days' },
  { value: '2592000', label: '30 days' },
  { value: '0', label: 'Never' },
] as const;
const USES = [
  { value: '0', label: 'Unlimited' },
  { value: '1', label: '1' },
  { value: '5', label: '5' },
  { value: '25', label: '25' },
  { value: '100', label: '100' },
] as const;

/** A link people can open to join. Web builds hosted over http(s) link to themselves; everything else, the desktop app included, uses gotalk://. */
export function useInviteLink(invite: Pick<Invite, 'code'> | null): string | null {
  const active = useActiveInstance();
  if (!invite || !active) return null;
  const hosted = Platform.OS === 'web' && !isDesktop && /^https?:$/.test(globalThis.location?.protocol ?? '') ? globalThis.location.origin : null;
  return buildInviteLink({ code: invite.code, instanceOrigin: active.origin, webClientOrigin: hosted });
}

function expiryText(seconds: string) {
  return seconds === '0' ? 'It never expires' : `It works for ${EXPIRY.find((e) => e.value === seconds)?.label ?? 'a while'}`;
}

export interface CreateInviteDialogProps {
  place: Place;
  visible: boolean;
  onClose: () => void;
}

/** Choose how long a link lasts and how often it can be used, then copy or share it. */
export function CreateInviteDialog({ place, visible, onClose }: CreateInviteDialogProps) {
  const theme = useTheme();
  const wide = useWide();
  const active = useActiveInstance();
  const actions = usePlaceActions();
  const [expiry, setExpiry] = useState<string>('604800');
  const [uses, setUses] = useState<string>('0');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Invite | null>(null);
  const [copied, setCopied] = useState(false);
  const link = useInviteLink(created);

  useEffect(() => {
    if (visible) return;
    setCreated(null);
    setError(null);
    setCopied(false);
  }, [visible]);

  async function create() {
    setPending(true);
    setError(null);
    try {
      setCreated(await actions.createInvite(place.slug, { maxAgeSeconds: Number(expiry), maxUses: Number(uses) }));
    } catch (e) {
      const f = classifyFailure(e);
      setError(f.kind === 'rejected' ? f.message : 'The invite could not be created. Try again.');
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!link) return;
    await copyText(link);
    setCopied(true);
  }

  return (
    <Dialog visible={visible} onClose={onClose}>
      {created && link ? (
        <>
          <Text variant="headingMd" accessibilityRole="header">
            Invite link ready
          </Text>
          <Text variant="bodySm" tone="muted">
            Share it anywhere. {expiryText(expiry)}, {uses === '0' ? 'with no limit on uses' : `and can be used ${uses === '1' ? 'once' : `${uses} times`}`}.
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space.sm,
              paddingVertical: 6,
              paddingLeft: theme.space.md,
              paddingRight: 6,
              borderRadius: theme.radii.md,
              borderWidth: 1,
              borderColor: theme.colors.hairline,
              backgroundColor: theme.colors.surface,
            }}
          >
            <Text variant="bodySm" tone="onDark" numberOfLines={1} selectable style={{ flex: 1 }}>
              {link}
            </Text>
            {wide ? <Button title={copied ? 'Copied' : 'Copy link'} size="sm" onPress={copy} /> : null}
          </View>
          <Text variant="captionMd" tone="muted">
            Code {created.code} on {active?.origin.replace(/^https?:\/\//, '')}, if someone prefers to type it.
          </Text>
          {wide ? (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <Button title="Done" variant="tertiary" onPress={onClose} />
            </View>
          ) : (
            <Stack gap="sm">
              {Platform.OS !== 'web' ? <Button title="Share link" onPress={() => Share.share({ message: link })} /> : null}
              <Button title={copied ? 'Copied' : 'Copy link'} variant={Platform.OS === 'web' ? 'primary' : 'tertiary'} onPress={copy} />
              <Button title="Done" variant="tertiary" onPress={onClose} />
            </Stack>
          )}
        </>
      ) : (
        <>
          <Text variant="headingMd" accessibilityRole="header">
            Invite people to {place.name}
          </Text>
          <Stack gap="xs">
            <Text variant="bodySmStrong" tone="onDark">
              Link expires
            </Text>
            <PillTabs options={EXPIRY} value={expiry} onChange={setExpiry} />
          </Stack>
          <Stack gap="xs">
            <Text variant="bodySmStrong" tone="onDark">
              Uses
            </Text>
            <PillTabs options={USES} value={uses} onChange={setUses} />
          </Stack>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
            <Button title="Cancel" variant="tertiary" onPress={onClose} />
            <Button title="Create link" onPress={create} loading={pending} />
          </View>
        </>
      )}
    </Dialog>
  );
}
