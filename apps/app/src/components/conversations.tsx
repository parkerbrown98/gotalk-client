import { conversationTitle, previewText, shortTime } from '@gotalk/core';
import { unwrap, type Schemas } from '@gotalk/api-client';
import { Avatar, Button, Dialog, hoverTransition, Icon, NavRow, Notice, Text, TextField, typeStyle, useTheme, type PressState } from '@gotalk/ui';
import { useQueries } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, TextInput, View, type TextStyle } from 'react-native';

import { PresenceAvatar } from '@/components/presence';
import { useApiClient } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { useChatActions, useLastMessage, type Channel, type User } from '@/lib/chat';
import { failureMessage } from '@/lib/failure';
import { useActiveInstance } from '@/lib/instances';
import { useMyPlaces } from '@/lib/places';

/** Group conversations hold up to ten people, the creator included. */
const GROUP_LIMIT = 10;

/** The other person's avatar with presence, or the size of the group. */
export function ConversationAvatar({ channel, size, ring }: { channel: Channel; size: number; ring?: string }) {
  const theme = useTheme();
  const myId = useSession()?.userId;
  const others = (channel.recipients ?? []).filter((u) => u.id !== myId);
  if (channel.kind === 'dm' && others[0]) return <PresenceAvatar user={others[0]} size={size} ring={ring} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceCard, borderWidth: 1, borderColor: theme.colors.hairline }}>
      <Text variant="captionMd" tone="onDark" style={{ fontSize: Math.round(size * 0.36), lineHeight: Math.round(size * 0.5) }}>
        {others.length + 1}
      </Text>
    </View>
  );
}

/** A conversation in the sidebar. */
export function ConversationNavRow({ channel, active }: { channel: Channel; active: boolean }) {
  const theme = useTheme();
  const myId = useSession()?.userId;
  const unread = channel.read_state?.mention_count ?? 0;
  return (
    <NavRow
      label={conversationTitle(channel, myId)}
      leading={<ConversationAvatar channel={channel} size={24} ring={active ? theme.colors.surfaceCard : theme.colors.surface} />}
      active={active}
      unread={unread > 0}
      count={unread}
      onPress={() => router.push({ pathname: '/messages/[id]', params: { id: channel.id } })}
    />
  );
}

/** A conversation in the phone list: who, when, and the latest message. */
export function ConversationListRow({ channel }: { channel: Channel }) {
  const theme = useTheme();
  const c = theme.colors;
  const myId = useSession()?.userId;
  const last = useLastMessage(channel, true);
  const unread = channel.read_state?.mention_count ?? 0;
  const title = conversationTitle(channel, myId);
  const who = !last ? '' : last.author?.id === myId ? 'You: ' : channel.kind === 'group_dm' ? `${last.author?.display_name.split(/\s+/)[0] ?? 'Someone'}: ` : '';
  const preview = last ? `${who}${previewText(last.content, 80)}` : channel.last_message_id ? '' : 'No messages yet';
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}${unread ? `, ${unread} unread` : ''}`}
      onPress={() => router.push({ pathname: '/messages/[id]', params: { id: channel.id } })}
      style={({ pressed, hovered }: PressState) => ({ ...hoverTransition, flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md, backgroundColor: pressed || hovered ? c.surface : 'transparent' })}
    >
      <ConversationAvatar channel={channel} size={44} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Text variant="bodySmStrong" tone="onDark" numberOfLines={1} style={{ flexShrink: 1 }}>
            {title}
          </Text>
          {channel.last_message_at ? (
            <Text variant="captionMd" tone="faint">
              {shortTime(channel.last_message_at)}
            </Text>
          ) : null}
        </View>
        <Text variant="bodySm" tone={unread ? 'onDark' : 'muted'} numberOfLines={1}>
          {preview || ' '}
        </Text>
      </View>
      {unread > 0 ? (
        <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="captionSm" tone="inverse" style={{ fontFamily: theme.fontFaces['500'], lineHeight: 16 }}>
            {unread > 99 ? '99+' : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

type Member = Schemas['Member'];

interface Candidate {
  user: User;
  place: string;
}

/** People to message: members of the places the user shares with them whose names start with the text. */
function useCandidates(q: string): Candidate[] {
  const active = useActiveInstance();
  const client = useApiClient();
  const places = useMyPlaces().data;
  const shared = useMemo(() => (places ?? []).slice(0, 8), [places]);
  const [text, setText] = useState(q.trim());
  useEffect(() => {
    const t = setTimeout(() => setText(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const combine = useCallback(
    (results: { data?: Member[] }[]) => {
      const seen = new Map<string, Candidate>();
      results.forEach((r, i) => {
        for (const m of r.data ?? []) if (!seen.has(m.user.id)) seen.set(m.user.id, { user: m.user, place: shared[i]?.name ?? '' });
      });
      return [...seen.values()];
    },
    [shared],
  );
  return useQueries({
    queries: shared.map((p) => ({
      queryKey: ['member-suggest', active?.id, p.slug, text, 'dm'],
      enabled: !!client && text.length > 0,
      staleTime: 30_000,
      queryFn: async () => unwrap(await client!.GET('/places/{place}/members', { params: { path: { place: p.slug }, query: { q: text, limit: 6 } } })).items ?? [],
    })),
    combine,
  });
}

/**
 * Start a conversation (one person opens your existing one with them; several start a group), or
 * add people to a group.
 */
export function NewConversationDialog({ visible, onClose, addTo }: { visible: boolean; onClose: () => void; addTo?: Channel }) {
  // Each opening starts empty; the content stays put while the dialog fades out.
  const [opened, setOpened] = useState({ visible, count: 0 });
  if (visible !== opened.visible) setOpened({ visible, count: opened.count + (visible ? 1 : 0) });
  return (
    <Dialog visible={visible} onClose={onClose}>
      {opened.count > 0 ? <NewConversationBody key={opened.count} onClose={onClose} addTo={addTo} /> : null}
    </Dialog>
  );
}

function NewConversationBody({ onClose, addTo }: { onClose: () => void; addTo?: Channel }) {
  const theme = useTheme();
  const c = theme.colors;
  const myId = useSession()?.userId;
  const actions = useChatActions();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const candidates = useCandidates(q);
  const present = new Set([...(addTo?.recipients ?? []).map((u) => u.id), ...picked.map((u) => u.id), myId]);
  const room = GROUP_LIMIT - (addTo ? (addTo.recipients ?? []).length : 1) - picked.length;
  const shown = candidates.filter((cand) => !present.has(cand.user.id)).slice(0, 6);

  async function submit() {
    if (!actions || picked.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      if (addTo) {
        for (const u of picked) await actions.addRecipient(addTo.id, u.id);
        onClose();
      } else {
        const channel = await actions.openConversation(
          picked.map((u) => u.id),
          picked.length > 1 ? name : undefined,
        );
        onClose();
        router.push({ pathname: '/messages/[id]', params: { id: channel.id } });
      }
    } catch (e) {
      setError(failureMessage(e, 'Could not start the conversation. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Text variant="headingMd" accessibilityRole="header">
        {addTo ? 'Add people' : 'New message'}
      </Text>
      <View style={{ gap: theme.space.xs }}>
        <Text variant="bodySmStrong" tone="onDark">
          To
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 8, paddingVertical: 6, borderRadius: theme.radii.md, borderWidth: 1, borderColor: c.hairlineStrong, backgroundColor: c.surface }}>
          {picked.map((u) => (
            <Pressable key={u.id} accessibilityRole="button" accessibilityLabel={`Remove ${u.display_name}`} onPress={() => setPicked((p) => p.filter((x) => x.id !== u.id))} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingLeft: 8, paddingRight: 4, borderRadius: theme.radii.full, backgroundColor: c.surfaceCard }}>
              <Text variant="captionMd" tone="onDark">
                {u.display_name}
              </Text>
              <Icon name="x" size={12} color={c.mute} />
            </Pressable>
          ))}
          <TextInput
            accessibilityLabel="Find people"
            autoFocus
            value={q}
            onChangeText={setQ}
            placeholder={picked.length ? '' : 'Name or username'}
            placeholderTextColor={c.ash}
            style={[typeStyle(theme, 'bodyMd'), { flex: 1, minWidth: 80, color: c.onDark, paddingVertical: 2 } as TextStyle, Platform.OS === 'web' ? ({ outlineWidth: 0, outlineStyle: 'none' } as unknown as TextStyle) : null]}
          />
        </View>
        <Text variant="captionMd" tone="muted">
          {room > 0 ? `People you share a place with. ${addTo ? `Up to ${room} more can join.` : `Add up to ${GROUP_LIMIT - 1} for a group.`}` : 'This group is full.'}
        </Text>
      </View>
      {shown.length > 0 && room > 0 ? (
        <View style={{ borderRadius: theme.radii.md, borderWidth: 1, borderColor: c.hairline, backgroundColor: c.surface, overflow: 'hidden' }}>
          {shown.map((cand, i) => (
            <Pressable
              key={cand.user.id}
              accessibilityRole="button"
              accessibilityLabel={`Add ${cand.user.display_name}`}
              onPress={() => {
                setPicked((p) => [...p, cand.user]);
                setQ('');
              }}
              style={({ pressed, hovered }: PressState) => ({ ...hoverTransition, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.hairline, backgroundColor: pressed || hovered ? c.surfaceElevated : 'transparent' })}
            >
              <Avatar name={cand.user.display_name} uri={cand.user.avatar_url} size={32} />
              <View style={{ flex: 1 }}>
                <Text variant="bodySmStrong" tone="onDark">
                  {cand.user.display_name}
                </Text>
                <Text variant="captionMd" tone="muted" numberOfLines={1}>
                  @{cand.user.username} · {cand.place}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : q.trim().length > 0 && candidates.length === 0 ? (
        <Text variant="bodySm" tone="muted">
          No one by that name in your places.
        </Text>
      ) : null}
      {!addTo && picked.length > 1 ? <TextField label="Group name" placeholder="Optional" value={name} onChangeText={setName} maxLength={100} /> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
        <Button title="Cancel" variant="tertiary" onPress={onClose} />
        <Button title={addTo ? 'Add people' : 'Start conversation'} disabled={picked.length === 0} loading={busy} onPress={() => void submit()} />
      </View>
    </>
  );
}
