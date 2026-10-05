import { QUICK_REACTIONS, relativeTime, shortTime, validatePost } from '@gotalk/core';
import { Avatar, Badge, Button, Dialog, Icon, ListCard, ListRow, Notice, RadioOptions, Text, useTheme, type IconName } from '@gotalk/ui';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Composer } from '@/components/composer';
import { Markdown } from '@/components/markdown';
import { failureMessage } from '@/lib/failure';
import { useForumActions, usePostRevisions, type Post, type Topic, type WatchLevel } from '@/lib/forums';

export const messageFor = failureMessage;

/** A bordered pill that either shows a count or acts as a small button. */
export function Chip({ label, icon, on, onPress, accessibilityLabel }: { label?: string; icon?: IconName; on?: boolean; onPress?: () => void; accessibilityLabel?: string }) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={on === undefined ? undefined : { selected: on }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 28,
        paddingHorizontal: 10,
        borderRadius: theme.radii.full,
        borderWidth: 1,
        borderColor: on ? c.hairlineStrong : c.hairline,
        backgroundColor: on || pressed ? c.surfaceElevated : 'transparent',
      })}
    >
      {icon ? <Icon name={icon} size={14} color={on ? c.onDark : c.body} /> : null}
      {label ? (
        <Text variant="captionMd" tone={on ? 'onDark' : 'default'}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function TagBadges({ tags }: { tags: string[] | null | undefined }) {
  if (!tags?.length) return null;
  return (
    <>
      {tags.map((t) => (
        <Badge key={t} label={t} />
      ))}
    </>
  );
}

const watchLabels: Record<WatchLevel, string> = { watching: 'Watching', normal: 'Normal', muted: 'Muted' };
const watchText: Record<'board' | 'topic' | 'place', Record<WatchLevel, string>> = {
  board: {
    watching: 'Notify me about every new topic here.',
    normal: 'Notify me when someone replies to me or mentions me.',
    muted: 'Only notify me when someone mentions me.',
  },
  topic: {
    watching: 'Notify me about every new reply.',
    normal: 'Notify me when someone replies to me or mentions me.',
    muted: 'Only notify me when someone mentions me.',
  },
  place: {
    watching: 'Notify me about every new topic in this place.',
    normal: 'Notify me when someone replies to me or mentions me.',
    muted: 'Only notify me when someone mentions me.',
  },
};

/** Shows the watch level and opens the three choices. The most specific level (topic, board, place) wins. */
export function WatchButton({ scope, level, onChange }: { scope: 'board' | 'topic' | 'place'; level: WatchLevel; onChange: (level: WatchLevel) => Promise<void> }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button title={watchLabels[level]} variant="tertiary" size="sm" accessibilityLabel={`Notifications: ${watchLabels[level]}. Change`} onPress={() => setOpen(true)} />
      <Dialog visible={open} onClose={() => setOpen(false)}>
        <Text variant="headingMd" accessibilityRole="header">
          Notifications
        </Text>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <RadioOptions
          value={level}
          onChange={(next) => {
            setError(null);
            onChange(next).then(
              () => setOpen(false),
              (e) => setError(messageFor(e, 'Could not change the setting. Try again.')),
            );
          }}
          options={(['watching', 'normal', 'muted'] as const).map((v) => ({ value: v, label: watchLabels[v], description: watchText[scope][v] }))}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
          <Button title="Close" variant="tertiary" onPress={() => setOpen(false)} />
        </View>
      </Dialog>
    </>
  );
}

/** A topic in a board's list: unread dot, title, tags, replies and last activity. */
export function TopicRow({ topic, wide, onPress }: { topic: Topic; wide: boolean; onPress: () => void }) {
  const theme = useTheme();
  const c = theme.colors;
  const unread = (topic.unread_count ?? 0) > 0;
  const solved = !!topic.solution_post_id;
  const meta = (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.space.sm }}>
      <Text variant="captionMd" tone="muted">
        {topic.author.display_name}
      </Text>
      {topic.is_pinned ? <Badge label="Pinned" /> : null}
      {topic.is_locked ? <Badge label="Locked" /> : null}
      {topic.is_archived ? <Badge label="Archived" /> : null}
      {solved ? <Badge label="Solved" tone="success" /> : null}
      <TagBadges tags={topic.tags} />
    </View>
  );
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${topic.title}, ${topic.reply_count} ${topic.reply_count === 1 ? 'reply' : 'replies'}`}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.md, paddingHorizontal: wide ? 24 : theme.space.lg, paddingVertical: 12, backgroundColor: pressed ? c.surface : 'transparent' })}
    >
      <View style={{ width: 8, height: 8, marginTop: 8, borderRadius: 4, backgroundColor: unread ? c.primary : 'transparent' }} />
      {wide ? <Avatar name={topic.author.display_name} uri={topic.author.avatar_url} size={32} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant={unread ? 'bodyStrong' : 'bodyMd'} tone={unread ? 'onDark' : 'default'} numberOfLines={2} style={{ fontFamily: unread ? theme.fontFaces['500'] : undefined }}>
          {topic.title}
        </Text>
        {meta}
        {wide ? null : (
          <Text variant="captionMd" tone="muted">
            {topic.reply_count} {topic.reply_count === 1 ? 'reply' : 'replies'} · {shortTime(topic.last_post_at)}
          </Text>
        )}
      </View>
      {wide ? (
        <>
          <Text variant="bodySm" style={{ width: 72, textAlign: 'right' }}>
            {topic.reply_count}
          </Text>
          <Text variant="bodySm" tone="muted" style={{ width: 120, textAlign: 'right' }}>
            {relativeTime(topic.last_post_at)}
          </Text>
        </>
      ) : null}
    </Pressable>
  );
}

function RevisionsDialog({ post, visible, onClose }: { post: Post; visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const c = theme.colors;
  const revisions = usePostRevisions(visible ? post.id : undefined);
  const card = (key: string, title: string, subtitle: string, content: string, current?: boolean) => (
    <View key={key} style={{ gap: 6, padding: theme.space.md, borderRadius: theme.radii.md, borderWidth: 1, borderColor: current ? c.hairlineStrong : c.hairline, backgroundColor: c.surface }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.space.md }}>
        <Text variant="bodySmStrong" tone="onDark">
          {title}
        </Text>
        <Text variant="captionMd" tone="muted" style={{ flexShrink: 1, textAlign: 'right' }}>
          {subtitle}
        </Text>
      </View>
      <Markdown source={content} compact />
    </View>
  );
  const items = revisions.data ?? [];
  return (
    <Dialog visible={visible} onClose={onClose}>
      <Text variant="headingMd" accessibilityRole="header">
        Edit history
      </Text>
      <Text variant="bodySm" tone="muted">
        Edited {post.edit_count} {post.edit_count === 1 ? 'time' : 'times'}. Earlier versions are kept so a change cannot rewrite what people replied to.
      </Text>
      {revisions.isPending ? <ActivityIndicator /> : null}
      {revisions.isError ? <Notice tone="danger">The history could not be loaded.</Notice> : null}
      <View style={{ gap: theme.space.sm }}>
        {card('current', 'Current', `${post.author.display_name} · ${relativeTime(post.edited_at ?? post.created_at)}`, post.content, true)}
        {items.map((r) => card(r.id, 'Earlier version', `edited by ${r.editor.display_name} · ${relativeTime(r.created_at)}`, r.content))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Button title="Close" variant="tertiary" onPress={onClose} />
      </View>
    </Dialog>
  );
}

function ReactionPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (emoji: string) => void }) {
  const theme = useTheme();
  return (
    <Dialog visible={visible} onClose={onClose}>
      <Text variant="headingMd" accessibilityRole="header">
        React
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
        {QUICK_REACTIONS.map((e) => (
          <Pressable
            key={e}
            accessibilityRole="button"
            accessibilityLabel={`React with ${e}`}
            onPress={() => {
              onClose();
              onPick(e);
            }}
            style={({ pressed }) => ({ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radii.md, backgroundColor: pressed ? theme.colors.surfaceCard : theme.colors.surface })}
          >
            <Text variant="headingMd">{e}</Text>
          </Pressable>
        ))}
      </View>
    </Dialog>
  );
}

export interface PostItemProps {
  post: Post;
  topic: Topic;
  /** Visual nesting in threaded boards, already clamped. */
  indent?: number;
  wide: boolean;
  userId: string | undefined;
  canModerate: boolean;
  canReact: boolean;
  canReply: boolean;
  solutionsEnabled: boolean;
  slug: string;
  onReply: (post: Post) => void;
  /** Shown above the post, e.g. "replying to #2". */
  note?: string;
}

/** One post: header, Markdown body, reactions and the actions the viewer may take. */
export function PostItem({ post, topic, indent = 0, wide, userId, canModerate, canReact, canReply, solutionsEnabled, slug, onReply, note }: PostItemProps) {
  const theme = useTheme();
  const c = theme.colors;
  const actions = useForumActions();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const [picker, setPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const mine = !!userId && post.author.id === userId;
  const isTopicAuthor = !!userId && topic.author.id === userId;
  const accepted = topic.solution_post_id === post.id;
  const deleted = post.deleted;
  const canEdit = !deleted && (mine || canModerate);
  const canDelete = !deleted && post.post_number > 1 && (mine || canModerate);
  const canAccept = !deleted && solutionsEnabled && post.post_number > 1 && (isTopicAuthor || canModerate);
  const small = !wide || indent > 0;

  async function run(work: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await work();
      return true;
    } catch (e) {
      setError(messageFor(e, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const problem = validatePost(draft);
    if (problem) return setError(problem.message);
    if (await run(() => actions.editPost(post, draft), 'Could not save the edit. Try again.')) setEditing(false);
  }

  const linkAction = (label: string, onPress: () => void, danger?: boolean) => (
    <Pressable key={label} accessibilityRole="button" disabled={busy} onPress={onPress} hitSlop={6}>
      <Text variant="captionMd" tone={danger ? 'danger' : 'muted'}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View
      accessibilityLabel={`Post ${post.post_number} by ${post.author.display_name}`}
      style={[
        { flexDirection: 'row', gap: small ? 12 : 16, paddingVertical: 14 },
        accepted ? { backgroundColor: c.accentGreenSoft, marginHorizontal: -theme.space.md, paddingHorizontal: theme.space.md, borderRadius: theme.radii.md } : null,
      ]}
    >
      <Avatar name={post.author.display_name} uri={post.author.avatar_url} size={small ? 32 : 40} />
      <View style={{ flex: 1, gap: theme.space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.space.sm }}>
          <Text variant="bodySmStrong" tone="onDark">
            {post.author.display_name}
          </Text>
          <Text variant="captionMd" tone="muted">
            #{post.post_number}
            {note ? ` · ${note}` : ''} · {relativeTime(post.created_at)}
          </Text>
          {post.edit_count > 0 && !deleted ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Show edit history" onPress={() => setHistory(true)} hitSlop={6}>
              <Text variant="captionMd" tone="muted" style={{ textDecorationLine: 'underline' }}>
                Edited
              </Text>
            </Pressable>
          ) : null}
          {accepted ? (
            <View style={{ marginLeft: 'auto' }}>
              <Badge label="Accepted solution" tone="success" />
            </View>
          ) : null}
        </View>

        {editing ? (
          <View style={{ gap: theme.space.sm }}>
            <Composer value={draft} onChange={setDraft} slug={slug} minHeight={96} autoFocus onSubmit={save} error={error} />
            <View style={{ flexDirection: 'row', gap: theme.space.sm, justifyContent: 'flex-end' }}>
              <Button
                title="Cancel"
                variant="tertiary"
                onPress={() => {
                  setEditing(false);
                  setDraft(post.content);
                  setError(null);
                }}
              />
              <Button title="Save" loading={busy} onPress={save} />
            </View>
          </View>
        ) : deleted ? (
          <Text variant="bodySm" tone="muted" style={{ fontStyle: 'italic' }}>
            This post was deleted.
          </Text>
        ) : (
          <Markdown source={post.content} compact={small} />
        )}

        {!deleted && !editing ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.space.sm }}>
            {(post.reactions ?? []).map((r) => (
              <Chip key={r.emoji} label={`${r.emoji} ${r.count}`} on={r.me} accessibilityLabel={`${r.emoji} ${r.count}${r.me ? ', you reacted' : ''}`} onPress={canReact ? () => void run(() => actions.react(post, r.emoji, !r.me), 'Could not react. Try again.') : undefined} />
            ))}
            {canReact ? <Chip icon="smile" accessibilityLabel="Add a reaction" onPress={() => setPicker(true)} /> : null}
            {canReply ? <Chip icon="reply" label="Reply" onPress={() => onReply(post)} /> : null}
          </View>
        ) : null}

        {!editing && (canAccept || canEdit || canDelete) ? (
          <View style={{ flexDirection: 'row', gap: theme.space.lg }}>
            {canAccept ? linkAction(accepted ? 'Clear solution' : 'Accept as solution', () => void run(() => actions.setSolution(topic.id, accepted ? null : post.id), 'Could not change the solution. Try again.')) : null}
            {canEdit ? linkAction('Edit', () => setEditing(true)) : null}
            {canDelete ? linkAction('Delete', () => setConfirmDelete(true), true) : null}
          </View>
        ) : null}
        {!editing && error ? <Text variant="captionMd" tone="danger">{error}</Text> : null}
      </View>

      <RevisionsDialog post={post} visible={history} onClose={() => setHistory(false)} />
      <ReactionPicker visible={picker} onClose={() => setPicker(false)} onPick={(e) => void run(() => actions.react(post, e, true), 'Could not react. Try again.')} />
      <Dialog visible={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <Text variant="headingMd" accessibilityRole="header">
          Delete this post?
        </Text>
        <Text variant="bodySm" tone="muted">
          The post disappears from the topic. Replies to it stay.
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
          <Button title="Keep" variant="tertiary" onPress={() => setConfirmDelete(false)} />
          <Button
            title="Delete post"
            variant="danger"
            loading={busy}
            onPress={async () => {
              if (await run(() => actions.deletePost(post), 'Could not delete the post. Try again.')) setConfirmDelete(false);
            }}
          />
        </View>
      </Dialog>
    </View>
  );
}

/** Rows for a menu of topic actions, shown as a sheet or dialog. */
export function ActionList({ items, visible, onClose }: { items: Array<{ key: string; label: string; icon: IconName; danger?: boolean; onPress: () => void }>; visible: boolean; onClose: () => void }) {
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

export function Empty({ children }: { children: ReactNode }) {
  return (
    <View style={{ paddingVertical: 32, alignItems: 'center' }}>
      <Text variant="bodySm" tone="muted" style={{ textAlign: 'center' }}>
        {children}
      </Text>
    </View>
  );
}
