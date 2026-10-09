import {
  activeFilterCount,
  describeTopicReadState,
  feedSortLabels,
  feedWindowLabels,
  FEED_WINDOWS,
  formatScore,
  shortTime,
  sortUsesWindow,
  DEFAULT_FEED_WINDOW,
  type FeedFilters,
  type FeedSort,
  type FeedTopic,
} from '@gotalk/core';
import { Badge, Button, Checkbox, Dialog, hoverTransition, Icon, Notice, PillTabs, RadioOptions, Text, TextField, useTheme, type PressState } from '@gotalk/ui';
import { router } from 'expo-router';
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { contextMenu } from '@/components/context-menu';
import { ActionList, Chip, Empty, messageFor, TagBadges } from '@/components/forum';
import type { Anchor } from '@/components/menu';
import { TitleBar } from '@/components/screen-frame';
import { useSession } from '@/lib/auth';
import { copyText } from '@/lib/clipboard';
import { isDesktop } from '@/lib/desktop';
import { useFeedActions, useFeedCapabilities } from '@/lib/feeds';
import { type BoardNode } from '@/lib/forums';
import { useWide } from '@/lib/layout';

type Topic = Pick<FeedTopic, 'id' | 'score' | 'upvotes' | 'downvotes' | 'viewer' | 'author' | 'unread_count' | 'last_read_post_number'>;

export type VoteMode =
  /** Votes can be cast. */
  | 'on'
  /** Visible, but pressing asks to sign in. */
  | 'signin'
  /** The caller's own topic: the score shows, the arrows are off. */
  | 'own'
  /** The place or instance has no votes: nothing is drawn. */
  | 'off';

/** How the vote control behaves for a topic, from the instance, the place and who is looking. */
export function useVoteMode(): (topic: { author: { id: string }; place?: { voting_enabled: boolean } }, placeVoting?: boolean) => VoteMode {
  const caps = useFeedCapabilities();
  const session = useSession();
  return (topic, placeVoting) => {
    if (!caps.votes || !(placeVoting ?? topic.place?.voting_enabled ?? false)) return 'off';
    if (!session) return 'signin';
    return topic.author.id === session.userId ? 'own' : 'on';
  };
}

/** Up and down arrows with the score between them; vote-control in DESIGN.md. */
export function VoteControl({ topic, mode, horizontal, onError }: { topic: Topic; mode: VoteMode; horizontal?: boolean; onError?: (message: string) => void }) {
  const theme = useTheme();
  const c = theme.colors;
  const actions = useFeedActions();
  const [busy, setBusy] = useState(false);
  if (mode === 'off') return null;
  const mine = topic.viewer?.vote ?? 0;

  const press = (value: 1 | -1) => {
    if (mode === 'signin') return router.push('/sign-in');
    if (mode !== 'on' || busy) return;
    setBusy(true);
    actions
      .vote(topic as FeedTopic, mine === value ? 0 : value)
      .catch((e) => onError?.(messageFor(e, 'Could not vote. Try again.')))
      .finally(() => setBusy(false));
  };
  const arrow = (value: 1 | -1) => {
    const on = mine === value;
    const label = value === 1 ? (on ? 'Remove up vote' : 'Vote up') : on ? 'Remove down vote' : 'Vote down';
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={mode === 'signin' ? `${label}. Sign in to vote` : mode === 'own' ? `${label}. You cannot vote on your own topic` : label}
        accessibilityState={{ selected: on, disabled: mode === 'own' }}
        disabled={mode === 'own'}
        hitSlop={4}
        onPress={() => press(value)}
        style={({ pressed, hovered }: PressState) => ({
          ...hoverTransition,
          width: 28,
          height: 28,
          borderRadius: theme.radii.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: on || ((pressed || hovered) && mode === 'on') ? c.surfaceElevated : 'transparent',
          opacity: mode === 'own' ? 0.5 : 1,
        })}
      >
        <Icon name={value === 1 ? 'arrowUp' : 'arrowDown'} size={16} color={on ? c.onDark : c.mute} />
      </Pressable>
    );
  };
  return (
    <View style={horizontal ? { flexDirection: 'row', alignItems: 'center', gap: 4 } : { width: 40, alignItems: 'center', gap: 2 }}>
      {arrow(1)}
      <Text variant="bodySmStrong" tone="onDark" accessibilityLabel={`Score ${topic.score}`} style={{ minWidth: 24, textAlign: 'center' }}>
        {formatScore(topic.score)}
      </Text>
      {arrow(-1)}
    </View>
  );
}

function ReplyCount({ count }: { count: number }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name="forum" size={14} color={theme.colors.mute} />
      <Text variant="captionMd" tone="muted">
        {count}
      </Text>
    </View>
  );
}

export interface FeedCardProps {
  item: FeedTopic;
  wide: boolean;
  /** Name the place, for feeds that span places. */
  showPlace: boolean;
  vote: VoteMode;
  /** Signed out: this device remembers opening it. */
  locallyRead?: boolean;
  onOpen: () => void;
  /** Absent when there is nothing to offer (signed out). Right-click on desktop passes where to open it. */
  onMenu?: (anchor?: Anchor) => void;
}

/** One topic in a feed: feed-row and feed-row-read in DESIGN.md. */
export function FeedCard({ item, wide, showPlace, vote, locallyRead, onOpen, onMenu }: FeedCardProps) {
  const theme = useTheme();
  const c = theme.colors;
  const [showNsfw, setShowNsfw] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const read = describeTopicReadState(item, locallyRead);
  const unread = read.state === 'unread';
  const hidden = item.is_nsfw && !showNsfw;
  const solved = !!item.solution_post_id;
  const replies = `${item.reply_count} ${item.reply_count === 1 ? 'reply' : 'replies'}`;

  const meta = [showPlace ? item.place.name : null, item.board.name, item.author.display_name, shortTime(item.created_at)].filter(Boolean).join(' · ');
  const badges =
    read.state === 'new' || item.is_pinned || item.is_locked || solved || item.tags?.length || item.is_nsfw ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.space.sm }}>
        {read.state === 'new' ? <Badge label={`${read.newCount} new`} tone="info" /> : null}
        {item.is_pinned ? <Badge label="Pinned" /> : null}
        {item.is_locked ? <Badge label="Locked" /> : null}
        {solved ? <Badge label="Solved" tone="success" /> : null}
        {item.is_nsfw ? <Badge label="NSFW" tone="warning" /> : null}
        <TagBadges tags={item.tags} />
      </View>
    ) : null;

  const more = onMenu ? (
    <Pressable accessibilityRole="button" accessibilityLabel={`More for ${item.title}`} hitSlop={8} onPress={() => onMenu()} style={({ pressed, hovered }: PressState) => ({ ...hoverTransition, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radii.sm, backgroundColor: pressed || hovered ? c.surfaceElevated : 'transparent' })}>
      <Icon name="more" size={16} color={c.mute} />
    </Pressable>
  ) : null;

  const title = hidden ? (
    <Pressable accessibilityRole="button" accessibilityLabel="NSFW topic hidden. Show it" onPress={() => setShowNsfw(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, paddingHorizontal: 12, borderRadius: theme.radii.md, borderWidth: 1, borderColor: c.hairline, backgroundColor: c.surface, alignSelf: 'flex-start' }}>
      <Icon name="eye" size={16} color={c.mute} />
      <Text variant="bodySm" tone="muted">
        NSFW topic hidden · <Text variant="bodySm" tone="onDark" style={{ textDecorationLine: 'underline' }}>Show</Text>
      </Text>
    </Pressable>
  ) : (
    <Text
      variant={unread ? 'bodyStrong' : 'bodyMd'}
      tone={unread ? 'onDark' : 'muted'}
      numberOfLines={3}
      style={unread ? { fontFamily: theme.fontFaces['500'] } : undefined}
    >
      {item.title}
    </Text>
  );

  const body = (
    <View style={{ flex: 1, gap: 4 }}>
      {title}
      {!hidden && item.excerpt ? (
        <Text variant="bodySm" tone="muted" numberOfLines={2}>
          {item.excerpt}
        </Text>
      ) : null}
      <Text variant="captionMd" tone="muted" numberOfLines={1}>
        {meta}
      </Text>
      {badges}
      {problem ? (
        <Text variant="captionMd" tone="danger">
          {problem}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${hidden ? 'NSFW topic' : item.title}, ${read.label}, ${replies}${vote !== 'off' ? `, score ${item.score}` : ''}`}
      onPress={onOpen}
      onLongPress={onMenu ? () => onMenu() : undefined}
      {...(onMenu ? contextMenu(onMenu) : {})}
      style={({ pressed, hovered }: PressState) => ({ ...hoverTransition, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.hairline, backgroundColor: pressed || hovered ? c.surface : 'transparent' })}
    >
      {wide ? (
        <>
          <VoteControl topic={item} mode={vote} onError={setProblem} />
          {body}
          <View style={{ paddingTop: 2 }}>
            <ReplyCount count={item.reply_count} />
          </View>
          {more}
        </>
      ) : (
        <View style={{ flex: 1, gap: 8 }}>
          {body}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
            <VoteControl topic={item} mode={vote} horizontal onError={setProblem} />
            <ReplyCount count={item.reply_count} />
            <View style={{ marginLeft: 'auto' }}>{more}</View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

/** Sort pills, the time window for top and controversial, and the Filters button. */
export function SortBar({
  sorts,
  filters,
  onChange,
  onFilters,
  trailing,
}: {
  sorts: FeedSort[];
  filters: FeedFilters;
  onChange: (next: FeedFilters) => void;
  /** Absent when the feed has no filters to offer. */
  onFilters?: () => void;
  trailing?: ReactNode;
}) {
  const theme = useTheme();
  const wide = useWide();
  const [windowOpen, setWindowOpen] = useState(false);
  const count = activeFilterCount(filters);
  const pills = <PillTabs options={sorts.map((s) => ({ value: s, label: feedSortLabels[s] }))} value={filters.sort} onChange={(sort) => onChange({ ...filters, sort, window: sortUsesWindow(sort) ? filters.window : undefined })} />;
  const windowChip = sortUsesWindow(filters.sort) ? (
    <Chip icon="clock" label={feedWindowLabels[filters.window ?? DEFAULT_FEED_WINDOW]} on accessibilityLabel={`Time window: ${feedWindowLabels[filters.window ?? DEFAULT_FEED_WINDOW]}. Change`} onPress={() => setWindowOpen(true)} />
  ) : null;
  const filtersButton = onFilters ? <Button title={count ? `Filters · ${count}` : 'Filters'} variant="tertiary" size="sm" onPress={onFilters} /> : null;
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.hairline }}>
      {wide ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.space.sm, paddingHorizontal: 16, paddingVertical: 10 }}>
          {pills}
          {windowChip}
          <View style={{ flex: 1 }} />
          {trailing}
          {filtersButton}
        </View>
      ) : (
        <View style={{ paddingVertical: 10, gap: theme.space.sm }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
            {pills}
          </ScrollView>
          {windowChip || filtersButton || trailing ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, paddingHorizontal: 16 }}>
              {windowChip}
              <View style={{ flex: 1 }} />
              {trailing}
              {filtersButton}
            </View>
          ) : null}
        </View>
      )}
      <Dialog visible={windowOpen} onClose={() => setWindowOpen(false)}>
        <Text variant="headingMd" accessibilityRole="header">
          Time window
        </Text>
        <RadioOptions
          options={FEED_WINDOWS.map((w) => ({ value: w, label: feedWindowLabels[w] }))}
          value={filters.window ?? DEFAULT_FEED_WINDOW}
          onChange={(window) => {
            setWindowOpen(false);
            onChange({ ...filters, window });
          }}
        />
      </Dialog>
    </View>
  );
}

/** Filters that are on, each removable, under the sort bar. */
export function ActiveFilters({ filters, boards, onChange }: { filters: FeedFilters; boards?: BoardNode[]; onChange: (next: FeedFilters) => void }) {
  const theme = useTheme();
  const tags: { key: string; label: string; clear: Partial<FeedFilters> }[] = [];
  const board = filters.board ? boards?.find((b) => b.board.id === filters.board)?.board : undefined;
  if (filters.board) tags.push({ key: 'board', label: `forum: ${board?.name ?? 'one forum'}`, clear: { board: undefined } });
  if (filters.tag) tags.push({ key: 'tag', label: `tag: ${filters.tag}`, clear: { tag: undefined } });
  if (filters.solved) tags.push({ key: 'solved', label: filters.solved === 'true' ? 'Solved' : 'Unsolved', clear: { solved: undefined } });
  if (filters.hideRead) tags.push({ key: 'read', label: 'Hide read', clear: { hideRead: false } });
  if (filters.pinnedFirst) tags.push({ key: 'pinned', label: 'Pinned first', clear: { pinnedFirst: false } });
  if (filters.nsfw) tags.push({ key: 'nsfw', label: 'NSFW shown', clear: { nsfw: false } });
  if (!tags.length) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.space.sm, paddingHorizontal: 16, paddingVertical: 8 }}>
      {tags.map((t) => (
        <Pressable key={t.key} accessibilityRole="button" accessibilityLabel={`Remove filter ${t.label}`} onPress={() => onChange({ ...filters, ...t.clear })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Badge label={t.label} tone="info" />
          <Icon name="x" size={14} color={theme.colors.mute} />
        </Pressable>
      ))}
      {tags.length > 1 ? (
        <Pressable accessibilityRole="button" onPress={() => onChange({ ...filters, board: undefined, tag: undefined, solved: undefined, hideRead: false, pinnedFirst: false, nsfw: false })}>
          <Text variant="captionMd" tone="muted" style={{ textDecorationLine: 'underline' }}>
            Clear filters
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

interface FiltersDialogProps {
  visible: boolean;
  onClose: () => void;
  filters: FeedFilters;
  onChange: (next: FeedFilters) => void;
  /** Place feeds: forums to narrow to. */
  boards?: BoardNode[];
  /** Hide read needs a signed-in reader. */
  canHideRead: boolean;
  showPinned: boolean;
}

/** Forum, tag, answered state, Hide read, Pinned first and NSFW. Changes apply on Done. */
export function FiltersDialog(props: FiltersDialogProps) {
  // The form mounts with each opening, so it starts from the filters in effect.
  return (
    <Dialog visible={props.visible} onClose={props.onClose}>
      {props.visible ? <FiltersForm {...props} /> : null}
    </Dialog>
  );
}

function FiltersForm({ onClose, filters, onChange, boards, canHideRead, showPinned }: FiltersDialogProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState(filters);
  const [tag, setTag] = useState(filters.tag ?? '');
  const set = (patch: Partial<FeedFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const cleanTag = tag.trim().toLowerCase().replace(/^#/, '');
  const tagOk = !cleanTag || /^[a-z0-9][a-z0-9-]{0,31}$/.test(cleanTag);
  return (
    <>
      <Text variant="headingMd" accessibilityRole="header">
        Filters
      </Text>
      <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ gap: theme.space.lg }}>
        {boards ? (
          <View style={{ gap: theme.space.sm }}>
            <Text variant="bodySmStrong" tone="onDark">
              Forum
            </Text>
            <RadioOptions
              options={[{ value: '', label: 'Every forum' }, ...boards.map((n) => ({ value: n.board.id, label: `${'  '.repeat(n.depth)}${n.board.name}`, description: n.board.kind === 'category' ? 'Category: every forum in it' : undefined }))]}
              value={draft.board ?? ''}
              onChange={(v) => set({ board: v || undefined })}
            />
          </View>
        ) : null}
        <TextField label="Tag" value={tag} onChangeText={setTag} placeholder="Any tag" autoCapitalize="none" autoCorrect={false} error={tagOk ? undefined : 'Tags use lowercase letters, numbers and dashes.'} />
        <View style={{ gap: theme.space.sm }}>
          <Text variant="bodySmStrong" tone="onDark">
            Answers
          </Text>
          <PillTabs
            options={[
              { value: 'any', label: 'All' },
              { value: 'true', label: 'Solved' },
              { value: 'false', label: 'Unsolved' },
            ]}
            value={draft.solved ?? 'any'}
            onChange={(v) => set({ solved: v === 'any' ? undefined : v })}
          />
        </View>
        <View style={{ gap: theme.space.md }}>
          {canHideRead ? (
            <Checkbox checked={draft.hideRead} onChange={(v) => set({ hideRead: v })} description="Topics you opened leave the feed until someone replies.">
              Hide read topics
            </Checkbox>
          ) : null}
          {showPinned ? (
            <Checkbox checked={draft.pinnedFirst} onChange={(v) => set({ pinnedFirst: v })} description="Pinned topics sit above the ranking.">
              Pinned topics first
            </Checkbox>
          ) : null}
          <Checkbox checked={draft.nsfw} onChange={(v) => set({ nsfw: v })} description="Include forums and places marked NSFW. Their topics stay collapsed until you open one.">
            Show NSFW
          </Checkbox>
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
        <Button
          title="Clear"
          variant="tertiary"
          onPress={() => {
            setDraft((d) => ({ ...d, board: undefined, tag: undefined, solved: undefined, hideRead: false, pinnedFirst: false, nsfw: false }));
            setTag('');
          }}
        />
        <Button
          title="Done"
          disabled={!tagOk}
          onPress={() => {
            onChange({ ...draft, tag: cleanTag || undefined });
            onClose();
          }}
        />
      </View>
    </>
  );
}

/** The row menu: mark read or unread, open the forum, copy the link (web). A popover at `anchor` when right-clicked. */
export function FeedItemMenu({ item, visible, anchor, onClose, onError }: { item: FeedTopic | null; visible: boolean; anchor?: Anchor; onClose: () => void; onError: (message: string) => void }) {
  const actions = useFeedActions();
  if (!item) return null;
  const read = item.viewer?.read ?? false;
  const path = `/places/${item.place.slug}/topics/${item.id}`;
  // Only a hosted web build has an address of its own to link to; the desktop app's (Windows serves it from http://tauri.localhost) is not one.
  const web = Platform.OS === 'web' && !isDesktop && /^https?:$/.test(globalThis.location?.protocol ?? '');
  const items = [
    read
      ? { key: 'unread', label: 'Mark as unread', icon: 'eye' as const, onPress: () => void actions.markUnread(item).catch((e) => onError(messageFor(e, 'Could not mark it unread. Try again.'))) }
      : { key: 'read', label: 'Mark as read', icon: 'check' as const, onPress: () => void actions.markRead(item).catch((e) => onError(messageFor(e, 'Could not mark it read. Try again.'))) },
    { key: 'forum', label: `Open ${item.board.name}`, icon: 'forum' as const, onPress: () => router.push({ pathname: '/places/[slug]/boards/[id]', params: { slug: item.place.slug, id: item.board_id } }) },
    ...(web ? [{ key: 'copy', label: 'Copy link', icon: 'link' as const, onPress: () => void copyText(`${globalThis.location.origin}${path}`) }] : []),
  ];
  return <ActionList items={items} visible={visible} anchor={anchor} onClose={onClose} />;
}

/** A feed screen's frame: safe area and, on phones, a title bar. The list scrolls itself. */
export function FeedFrame({ title, onBack, end, children }: { title: string; onBack?: () => void; end?: ReactNode; children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas, paddingTop: insets.top }}>
      {wide ? null : <TitleBar title={title} onBack={onBack} end={end} />}
      {children}
    </View>
  );
}

type Row = { kind: 'label'; key: string; text: string } | { kind: 'topic'; key: string; item: FeedTopic };

export interface FeedListProps {
  feed: {
    pinned: FeedTopic[];
    items: FeedTopic[];
    isPending: boolean;
    isError: boolean;
    isSuccess: boolean;
    isRefetching: boolean;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => unknown;
    refetch: () => unknown;
  };
  header: ReactElement;
  renderCard: (item: FeedTopic) => ReactElement;
  empty: ReactNode;
  /** Shown above the ranked items when pinned topics come separately. */
  rankedLabel?: string;
}

/** Virtualized feed: pinned topics, ranked topics, more as the end comes into view. */
export function FeedList({ feed, header, renderCard, empty, rankedLabel }: FeedListProps) {
  const theme = useTheme();
  const wide = useWide();
  const rows = useMemo<Row[]>(() => {
    if (!feed.pinned.length) return feed.items.map((item) => ({ kind: 'topic', key: item.id, item }));
    return [
      { kind: 'label', key: 'pinned', text: 'Pinned' },
      ...feed.pinned.map((item): Row => ({ kind: 'topic', key: `p:${item.id}`, item })),
      ...(feed.items.length ? [{ kind: 'label' as const, key: 'ranked', text: rankedLabel ?? 'Topics' }] : []),
      ...feed.items.map((item): Row => ({ kind: 'topic', key: item.id, item })),
    ];
  }, [feed.pinned, feed.items, rankedLabel]);

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.key}
      renderItem={({ item: r }) =>
        r.kind === 'label' ? (
          <Text variant="captionMd" tone="muted" style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
            {r.text}
          </Text>
        ) : (
          renderCard(r.item)
        )
      }
      ListHeaderComponent={header}
      ListEmptyComponent={
        feed.isPending ? (
          <ActivityIndicator style={{ marginTop: 32 }} accessibilityLabel="Loading topics" />
        ) : feed.isError ? (
          <View style={{ padding: theme.space.lg, gap: theme.space.md }}>
            <Notice tone="danger" title="The feed could not be loaded.">
              Check your connection and try again.
            </Notice>
            <Button title="Try again" variant="tertiary" onPress={() => void feed.refetch()} />
          </View>
        ) : feed.isSuccess ? (
          <Empty>{empty}</Empty>
        ) : null
      }
      ListFooterComponent={
        feed.isFetchingNextPage ? (
          <ActivityIndicator style={{ marginVertical: 16 }} accessibilityLabel="Loading more topics" />
        ) : feed.hasNextPage && wide ? (
          <View style={{ padding: theme.space.lg, alignItems: 'center' }}>
            <Button title="Load more topics" variant="tertiary" onPress={() => void feed.fetchNextPage()} />
          </View>
        ) : null
      }
      onEndReached={() => {
        if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
      }}
      onEndReachedThreshold={0.6}
      refreshControl={Platform.OS === 'web' ? undefined : <RefreshControl refreshing={feed.isRefetching && !feed.isFetchingNextPage} onRefresh={() => void feed.refetch()} tintColor={theme.colors.mute} />}
      contentContainerStyle={wide ? { width: '100%', maxWidth: 880, alignSelf: 'center' } : undefined}
      keyboardShouldPersistTaps="handled"
    />
  );
}

/** Confirms "Mark all as read". `description` says what it covers. */
export function MarkAllDialog({ visible, onClose, description, onConfirm }: { visible: boolean; onClose: () => void; description: string; onConfirm: () => Promise<unknown> }) {
  return (
    <Dialog visible={visible} onClose={onClose}>
      {visible ? <MarkAllForm onClose={onClose} description={description} onConfirm={onConfirm} /> : null}
    </Dialog>
  );
}

function MarkAllForm({ onClose, description, onConfirm }: { onClose: () => void; description: string; onConfirm: () => Promise<unknown> }) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Text variant="headingMd" accessibilityRole="header">
        Mark everything here as read?
      </Text>
      <Text variant="bodySm" tone="muted">
        {description}
      </Text>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
        <Button title="Cancel" variant="tertiary" onPress={onClose} />
        <Button
          title="Mark as read"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              await onConfirm();
              onClose();
            } catch (e) {
              setError(messageFor(e, 'Could not mark the topics read. Try again.'));
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    </>
  );
}
