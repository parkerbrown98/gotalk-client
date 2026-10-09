import { channelSections, voiceStatesByChannel } from '@gotalk/core';
import { Icon, NavRow, Text, useTheme } from '@gotalk/ui';
import { router, usePathname } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ChannelFormDialog, ChannelMenu, useChannelMenu } from '@/components/channel-menu';
import { contextMenu } from '@/components/context-menu';
import type { Anchor } from '@/components/menu';
import type { Channel } from '@/lib/chat';
import { useVoiceStates } from '@/lib/voice';

function sectionLabel(label: string, top = 10) {
  return (
    <Text key={`label-${label}`} variant="captionMd" tone="muted" style={{ paddingHorizontal: 10, paddingTop: top, paddingBottom: 2 }}>
      {label}
    </Text>
  );
}

/** A category's label; for people who manage channels it opens the category's menu. */
function CategoryLabel({ category, all, slug, wide }: { category: Channel; all: Channel[]; slug: string; wide: boolean }) {
  const theme = useTheme();
  const menu = useChannelMenu(category, all, slug);
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [open, setOpen] = useState(false);
  const label = (
    <Text variant="captionMd" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
      {category.name}
    </Text>
  );
  if (menu.items.length === 0) return <View style={{ paddingHorizontal: 10, paddingTop: 10, paddingBottom: 2 }}>{label}</View>;
  return (
    <>
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityLabel={`${category.name} category actions`}
        onPress={() => {
          if (!wide) return setOpen(true);
          ref.current?.measureInWindow((x, y, _w, h) => {
            setAnchor({ left: x, top: y + h + 4, flipAt: y });
            setOpen(true);
          });
        }}
        {...contextMenu((at) => {
          setAnchor(at);
          setOpen(true);
        })}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 2 }}
      >
        {label}
        <Icon name="chevronDown" size={12} color={theme.colors.mute} />
      </Pressable>
      {menu.problem ? (
        <Text variant="captionMd" tone="danger" style={{ paddingHorizontal: 10 }}>
          {menu.problem}
        </Text>
      ) : null}
      <ChannelMenu items={menu.items} visible={open} onClose={() => setOpen(false)} anchor={wide ? (anchor ?? undefined) : undefined} />
      {menu.dialogs}
    </>
  );
}

/**
 * A place's chat and voice channels: text channels outside a category first, then each category with
 * its channels, then voice channels outside a category. Voice rows count who is in them. Muted
 * channels step down; people with Manage channels get New channel and category menus.
 */
export function ChannelList({ slug, channels, canManage, wide }: { slug: string; channels: Channel[]; canManage: boolean; wide: boolean }) {
  const pathname = usePathname();
  const [creating, setCreating] = useState(false);
  const sections = channelSections(channels);
  const hasChat = sections.loose.length > 0 || sections.categories.length > 0;
  const hasVoice = channels.some((c) => c.kind === 'voice');
  const voiceStates = useVoiceStates(channels.find((c) => c.place_id)?.place_id ?? undefined, hasVoice).data;
  const inVoice = voiceStatesByChannel(voiceStates ?? []);

  const row = (ch: Channel) => {
    const here = pathname === `/places/${slug}/channels/${ch.id}` || pathname.startsWith(`/places/${slug}/channels/${ch.id}/`);
    if (ch.kind === 'voice') {
      const count = inVoice[ch.id]?.length ?? 0;
      return (
        <NavRow
          key={ch.id}
          label={ch.name}
          icon="volume"
          active={here}
          meta={count > 0 ? String(count) : undefined}
          accessibilityLabel={`${ch.name}, voice channel${count > 0 ? `, ${count} in call` : ''}`}
          onPress={() => router.push({ pathname: '/places/[slug]/channels/[id]', params: { slug, id: ch.id } })}
        />
      );
    }
    return (
      <NavRow
        key={ch.id}
        label={ch.name}
        icon="hash"
        active={here}
        muted={ch.subscription === 'muted'}
        unread={!here && !!ch.unread}
        count={here ? 0 : (ch.read_state?.mention_count ?? 0)}
        onPress={() => router.push({ pathname: '/places/[slug]/channels/[id]', params: { slug, id: ch.id } })}
      />
    );
  };

  return (
    <>
      {hasChat || canManage ? sectionLabel('Chat') : null}
      {sections.loose.map(row)}
      {sections.categories.map(({ category, channels: inside }) => (
        <View key={category.id}>
          <CategoryLabel category={category} all={channels} slug={slug} wide={wide} />
          {inside.map(row)}
        </View>
      ))}
      {canManage ? <NavRow label="New channel" icon="plus" onPress={() => setCreating(true)} /> : null}
      {sections.voice.length > 0 ? sectionLabel('Voice') : null}
      {sections.voice.map(row)}
      <ChannelFormDialog slug={slug} visible={creating} onClose={() => setCreating(false)} categories={channels.filter((c) => c.kind === 'category')} />
    </>
  );
}
