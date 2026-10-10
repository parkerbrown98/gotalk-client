import { clockTime, messagePreview, previewText, QUICK_REACTIONS, relativeTime, type Message } from '@gotalk/core';
import { Button, Dialog, hoverTransition, Icon, ListCard, ListRow, Notice, Text, TextField, useTheme, type IconName, type PressState } from '@gotalk/ui';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Markdown } from '@/components/markdown';
import { MenuItem, MenuPopover, MenuSeparator, type Anchor } from '@/components/menu';
import type { ChatScope } from '@/components/chat-message';
import { useMessageRevisions } from '@/lib/chat';
import { copyText } from '@/lib/clipboard';
import { failureMessage } from '@/lib/failure';

/** The last non-null value, so a dialog keeps its content while it fades out. */
function useLastShown<T>(value: T | null): T | null {
  const [shown, setShown] = useState(value);
  if (value !== null && value !== shown) setShown(value);
  return value ?? shown;
}

export interface MessageAction {
  key: string;
  label: string;
  icon: IconName;
  danger?: boolean;
  onPress: () => void;
}

/** The actions a viewer may take on a message, in menu order. */
export function messageActions(
  m: Message,
  scope: Pick<ChatScope, 'myId' | 'can' | 'reply' | 'openThread' | 'startThread' | 'setEditing' | 'showHistory'>,
  handlers: { pin: (m: Message, on: boolean) => void; remove: (m: Message) => void; report?: (m: Message) => void },
): MessageAction[] {
  const mine = !!scope.myId && m.author?.id === scope.myId;
  const out: MessageAction[] = [];
  if (scope.can.send) out.push({ key: 'reply', label: 'Reply', icon: 'reply', onPress: () => scope.reply(m) });
  if (m.thread) out.push({ key: 'thread', label: 'Open thread', icon: 'thread', onPress: () => scope.openThread(m) });
  else if (scope.can.thread) out.push({ key: 'thread', label: 'Start a thread', icon: 'thread', onPress: () => scope.startThread(m) });
  if (scope.can.pin) out.push({ key: 'pin', label: m.is_pinned ? 'Unpin message' : 'Pin message', icon: 'pin', onPress: () => handlers.pin(m, !m.is_pinned) });
  out.push({ key: 'copy', label: 'Copy text', icon: 'copy', onPress: () => void copyText(m.content) });
  // Reports go to a place's moderators, so direct messages have nobody to report to.
  if (!mine && m.author && handlers.report) {
    const report = handlers.report;
    out.push({ key: 'report', label: 'Report message', icon: 'flag', onPress: () => report(m) });
  }
  if (mine && scope.can.send) out.push({ key: 'edit', label: 'Edit message', icon: 'edit', onPress: () => scope.setEditing(m.id) });
  if (m.edited_at && (mine || scope.can.manage)) out.push({ key: 'history', label: 'Edit history', icon: 'clock', onPress: () => scope.showHistory(m) });
  if (mine || scope.can.manage) out.push({ key: 'delete', label: 'Delete message', icon: 'trash', danger: true, onPress: () => handlers.remove(m) });
  return out;
}

/** Wide screens: the actions as a popover under the message's "more" button. */
export function MessageMenu({ actions, anchor, visible, onClose }: { actions: MessageAction[]; anchor: Anchor; visible: boolean; onClose: () => void }) {
  const firstPersonal = actions.findIndex((a) => a.key === 'edit' || a.key === 'history' || a.key === 'delete');
  return (
    <MenuPopover visible={visible} onClose={onClose} anchor={anchor} width={220}>
      {actions.map((a, i) => (
        <View key={a.key}>
          {i === firstPersonal && i > 0 ? <MenuSeparator /> : null}
          <MenuItem
            label={a.label}
            icon={a.icon}
            danger={a.danger}
            onPress={() => {
              onClose();
              a.onPress();
            }}
          />
        </View>
      ))}
    </MenuPopover>
  );
}

/** Phones: a long press opens quick reactions and the same actions as a sheet. */
export function MessageSheet({ message, actions, canReact, onReact, onMoreReactions, visible, onClose }: { message: Message | null; actions: MessageAction[]; canReact: boolean; onReact: (emoji: string) => void; onMoreReactions: () => void; visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const c = theme.colors;
  const quick = QUICK_REACTIONS.slice(0, 5);
  const mine = new Set((message?.reactions ?? []).filter((r) => r.me).map((r) => r.emoji));
  return (
    <Dialog visible={visible} onClose={onClose}>
      {canReact ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {quick.map((e) => (
            <Pressable
              key={e}
              accessibilityRole="button"
              accessibilityLabel={`React with ${e}`}
              accessibilityState={{ selected: mine.has(e) }}
              onPress={() => {
                onClose();
                onReact(e);
              }}
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: mine.has(e) ? c.surface : c.surfaceCard, borderWidth: mine.has(e) ? 1 : 0, borderColor: c.hairlineStrong }}
            >
              <Text variant="headingSm">{e}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More reactions"
            onPress={() => {
              onClose();
              onMoreReactions();
            }}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceCard }}
          >
            <Icon name="smile" size={18} color={c.mute} />
          </Pressable>
        </View>
      ) : null}
      <ListCard style={{ backgroundColor: c.surface }}>
        {actions.map((a) => (
          <ListRow
            key={a.key}
            icon={a.icon}
            title={a.label}
            tone={a.danger ? 'danger' : 'default'}
            onPress={() => {
              onClose();
              a.onPress();
            }}
          />
        ))}
      </ListCard>
    </Dialog>
  );
}

export function ReactionPickerDialog({ visible, onClose, onPick, title = 'React' }: { visible: boolean; onClose: () => void; onPick: (emoji: string) => void; title?: string }) {
  const theme = useTheme();
  return (
    <Dialog visible={visible} onClose={onClose}>
      <Text variant="headingMd" accessibilityRole="header">
        {title}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
        {QUICK_REACTIONS.map((e) => (
          <Pressable
            key={e}
            accessibilityRole="button"
            accessibilityLabel={`${title === 'React' ? 'React with' : 'Insert'} ${e}`}
            onPress={() => {
              onClose();
              onPick(e);
            }}
            style={({ pressed, hovered }: PressState) => ({ ...hoverTransition, width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radii.md, backgroundColor: pressed || hovered ? theme.colors.surfaceCard : theme.colors.surface })}
          >
            <Text variant="headingMd">{e}</Text>
          </Pressable>
        ))}
      </View>
    </Dialog>
  );
}

function Quote({ message }: { message: Message }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 2, padding: theme.space.md, borderRadius: theme.radii.md, borderWidth: 1, borderColor: theme.colors.hairline, backgroundColor: theme.colors.surface }}>
      <View style={{ flexDirection: 'row', gap: theme.space.sm, alignItems: 'baseline' }}>
        <Text variant="bodySmStrong" tone="onDark">
          {message.author?.display_name ?? 'Deleted account'}
        </Text>
        <Text variant="captionMd" tone="faint">
          {clockTime(message.created_at)}
        </Text>
      </View>
      <Text variant="bodySm" numberOfLines={4}>
        {messagePreview(message, 300)}
      </Text>
    </View>
  );
}

/**
 * Deleting your own message asks once. Deleting someone else's (Manage messages) asks for an optional
 * reason, which the author is told; the server records it in the audit log.
 */
export function DeleteMessageDialog({ message, mine, onClose, onDelete }: { message: Message | null; mine: boolean; onClose: () => void; onDelete: (m: Message, reason?: string) => Promise<void> }) {
  const shown = useLastShown(message);
  return (
    <Dialog visible={!!message} onClose={onClose}>
      {shown ? <DeleteBody key={shown.id} message={shown} mine={mine} onClose={onClose} onDelete={onDelete} /> : null}
    </Dialog>
  );
}

function DeleteBody({ message, mine, onClose, onDelete }: { message: Message; mine: boolean; onClose: () => void; onDelete: (m: Message, reason?: string) => Promise<void> }) {
  const theme = useTheme();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const author = message.author?.display_name.split(/\s+/)[0] ?? 'the author';
  return (
    <>
      <Text variant="headingMd" accessibilityRole="header">
        Delete this message?
      </Text>
      <Quote message={message} />
      {mine ? (
        <Text variant="bodySm" tone="muted">
          It is removed for everyone. This cannot be undone.
        </Text>
      ) : (
        <TextField label="Reason" placeholder={`Tell ${author} why (optional)`} value={reason} onChangeText={setReason} maxLength={512} hint={`${author} is told the message was removed and why. The deletion is recorded in the audit log.`} />
      )}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
        <Button title="Keep" variant="tertiary" onPress={onClose} />
        <Button
          title="Delete message"
          variant="danger"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              await onDelete(message, mine ? undefined : reason);
              onClose();
            } catch (e) {
              setError(failureMessage(e, 'Could not delete the message. Try again.'));
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    </>
  );
}

export function MessageHistoryDialog({ message, onClose }: { message: Message | null; onClose: () => void }) {
  const theme = useTheme();
  const c = theme.colors;
  const revisions = useMessageRevisions(message?.id);
  const card = (key: string, title: string, subtitle: string, content: string, current?: boolean) => (
    <View key={key} style={{ gap: 6, padding: theme.space.md, borderRadius: theme.radii.md, borderWidth: 1, borderColor: current ? c.hairlineStrong : c.hairline, backgroundColor: c.surface }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.space.md }}>
        <Text variant="bodySmStrong" tone="onDark">
          {title}
        </Text>
        <Text variant="captionMd" tone="muted">
          {subtitle}
        </Text>
      </View>
      <Markdown source={content} compact />
    </View>
  );
  // Newest first, so the last one is what was originally sent.
  const items = revisions.data ?? [];
  return (
    <Dialog visible={!!message} onClose={onClose}>
      <Text variant="headingMd" accessibilityRole="header">
        Edit history
      </Text>
      {revisions.isPending ? <ActivityIndicator /> : null}
      {revisions.isError ? <Notice tone="danger">The history could not be loaded.</Notice> : null}
      {message ? (
        <View style={{ gap: theme.space.sm }}>
          {card('current', 'Current', relativeTime(message.edited_at ?? message.created_at), message.content, true)}
          {items.map((r, i) => card(r.id, i === items.length - 1 ? 'Original' : 'Earlier version', relativeTime(r.created_at), r.content))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Button title="Close" variant="tertiary" onPress={onClose} />
      </View>
    </Dialog>
  );
}

export function StartThreadDialog({ message, onClose, onStart }: { message: Message | null; onClose: () => void; onStart: (m: Message, name: string) => Promise<void> }) {
  const shown = useLastShown(message);
  return (
    <Dialog visible={!!message} onClose={onClose}>
      {shown ? <StartThreadBody key={shown.id} message={shown} onClose={onClose} onStart={onStart} /> : null}
    </Dialog>
  );
}

function StartThreadBody({ message, onClose, onStart }: { message: Message; onClose: () => void; onStart: (m: Message, name: string) => Promise<void> }) {
  const theme = useTheme();
  const [name, setName] = useState(() => previewText(message.content, 60));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Text variant="headingMd" accessibilityRole="header">
        Start a thread
      </Text>
      <Quote message={message} />
      <TextField label="Thread name" value={name} onChangeText={setName} maxLength={100} autoFocus />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
        <Button title="Cancel" variant="tertiary" onPress={onClose} />
        <Button
          title="Start thread"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              await onStart(message, name.trim() || previewText(message.content, 60) || 'Thread');
              onClose();
            } catch (e) {
              setError(failureMessage(e, 'Could not start the thread. Try again.'));
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    </>
  );
}
