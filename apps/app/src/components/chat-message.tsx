import { clockTime, previewText, type Message } from '@gotalk/core';
import { Avatar, Icon, Text, typeStyle, useTheme } from '@gotalk/ui';
import { createContext, memo, useContext, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, TextInput, View, type TextStyle } from 'react-native';

import { Chip } from '@/components/forum';
import { Markdown } from '@/components/markdown';
import type { Anchor } from '@/components/menu';
import type { Channel, OutgoingMessage } from '@/lib/chat';

/** What a message row can do, provided once by the chat view instead of being passed to every row. */
export interface ChatScope {
  channel: Channel;
  /** Roomy layout: larger avatars and text. */
  wide: boolean;
  /** A pointer is available: actions appear on hover rather than on a long press. */
  hover: boolean;
  myId: string | undefined;
  can: {
    send: boolean;
    react: boolean;
    manage: boolean;
    pin: boolean;
    thread: boolean;
  };
  editingId: string | null;
  setEditing: (id: string | null) => void;
  saveEdit: (m: Message, content: string) => Promise<boolean>;
  reply: (m: Message) => void;
  openThread: (m: Message) => void;
  startThread: (m: Message) => void;
  react: (m: Message, emoji: string, on: boolean) => void;
  openActions: (m: Message, anchor?: Anchor) => void;
  openPicker: (m: Message) => void;
  showHistory: (m: Message) => void;
  jumpTo: (messageId: string) => void;
  retry: (nonce: string) => void;
  discard: (nonce: string) => void;
}

export const ChatScopeContext = createContext<ChatScope | null>(null);

export function useChatScope(): ChatScope {
  const scope = useContext(ChatScopeContext);
  if (!scope) throw new Error('Message rows must be inside a chat view');
  return scope;
}

type HoverState = { pressed: boolean; hovered?: boolean };

function HoverBar({ message, scope }: { message: Message; scope: ChatScope }) {
  const theme = useTheme();
  const c = theme.colors;
  const more = useRef<View>(null);
  const look = ({ pressed, hovered }: HoverState) => ({
    width: 28,
    height: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: theme.radii.sm,
    backgroundColor: pressed || hovered ? c.surfaceCard : 'transparent',
  });
  const button = (label: string, onPress: () => void, child: ReactNode) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={look}>
      {child}
    </Pressable>
  );
  return (
    <View
      style={{
        position: 'absolute',
        right: scope.wide ? 20 : 12,
        top: -14,
        zIndex: 2,
        flexDirection: 'row',
        gap: 2,
        padding: 2,
        backgroundColor: c.surfaceElevated,
        borderWidth: 1,
        borderColor: c.hairlineStrong,
        borderRadius: theme.radii.md,
      }}
    >
      {scope.can.react ? button('Add a reaction', () => scope.openPicker(message), <Icon name="smile" size={16} color={c.body} />) : null}
      {scope.can.send ? button('Reply', () => scope.reply(message), <Icon name="reply" size={16} color={c.body} />) : null}
      {scope.can.thread && !message.thread ? button('Start a thread', () => scope.startThread(message), <Icon name="thread" size={16} color={c.body} />) : null}
      <Pressable ref={more} accessibilityRole="button" accessibilityLabel="More actions" onPress={() => more.current?.measureInWindow((x, y, w, h) => scope.openActions(message, { left: x + w - 220, top: y + h + 4, flipAt: y }))} style={look}>
        <Icon name="more" size={16} color={c.body} />
      </Pressable>
    </View>
  );
}

function SmallButton({ title, primary, disabled, onPress }: { title: string; primary?: boolean; disabled?: boolean; onPress: () => void }) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        height: 28,
        paddingHorizontal: 10,
        justifyContent: 'center',
        borderRadius: theme.radii.md,
        backgroundColor: primary ? c.primary : c.surfaceElevated,
      }}
    >
      <Text variant="captionMd" tone={primary ? 'inverse' : 'onDark'} style={{ fontFamily: theme.fontFaces['500'] }}>
        {title}
      </Text>
    </Pressable>
  );
}

function EditBox({ message, scope }: { message: Message; scope: ChatScope }) {
  const theme = useTheme();
  const c = theme.colors;
  const [value, setValue] = useState(message.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (busy) return;
    if (value.trim() === message.content.trim()) return scope.setEditing(null);
    if (!value.trim()) return setError('A message cannot be empty. Delete it instead.');
    setBusy(true);
    setError(null);
    const ok = await scope.saveEdit(message, value);
    setBusy(false);
    if (!ok) setError('Could not save the edit. Try again.');
  };
  return (
    <View style={{ gap: 6, marginTop: 4 }}>
      <TextInput
        accessibilityLabel="Edit message"
        autoFocus
        multiline
        value={value}
        onChangeText={setValue}
        onKeyPress={(e) => {
          const n = e.nativeEvent as { key: string; shiftKey?: boolean };
          if (n.key === 'Escape') scope.setEditing(null);
          if (n.key === 'Enter' && !n.shiftKey && Platform.OS === 'web') {
            e.preventDefault?.();
            void save();
          }
        }}
        style={[
          typeStyle(theme, scope.wide ? 'bodyMd' : 'bodySm'),
          {
            color: c.onDark,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: theme.radii.md,
            borderWidth: 1,
            borderColor: error ? c.accentRed : c.hairlineStrong,
            backgroundColor: c.surfaceElevated,
            minHeight: 40,
          } as TextStyle,
          Platform.OS === 'web'
            ? ({
                outlineWidth: 0,
                outlineStyle: 'none',
              } as unknown as TextStyle)
            : null,
        ]}
      />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <Text variant="captionMd" tone={error ? 'danger' : 'muted'} style={{ flex: 1 }}>
          {error ?? (Platform.OS === 'web' ? 'Escape to cancel · Enter to save' : '')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SmallButton title="Cancel" onPress={() => scope.setEditing(null)} />
          <SmallButton title="Save" primary disabled={busy} onPress={() => void save()} />
        </View>
      </View>
    </View>
  );
}

function ReplyQuote({ message, scope }: { message: Message; scope: ChatScope }) {
  const theme = useTheme();
  const c = theme.colors;
  // The generated type misses that the server sends null when the original is gone.
  const ref = message.reply_to as Message['reply_to'] | null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={ref ? `Replying to ${ref.author?.display_name ?? 'a deleted account'}` : 'Replying to a deleted message'}
      onPress={() => ref && scope.jumpTo(ref.id)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 2,
      }}
    >
      <View
        style={{
          width: 18,
          height: 10,
          marginTop: 6,
          borderLeftWidth: 2,
          borderTopWidth: 2,
          borderColor: c.hairlineStrong,
          borderTopLeftRadius: 6,
        }}
      />
      {ref ? (
        <Text variant="captionMd" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
          <Text variant="captionMd" tone="muted" style={{ fontFamily: theme.fontFaces['500'] }}>
            {ref.author?.display_name ?? 'Deleted account'}
          </Text>
          {'  '}
          <Text variant="captionMd" tone="faint">
            {previewText(ref.excerpt, 80)}
          </Text>
        </Text>
      ) : (
        <Text variant="captionMd" tone="faint">
          Original message was deleted
        </Text>
      )}
    </Pressable>
  );
}

export interface MessageRowProps {
  message: Message;
  /** Same author as the message above, shortly after: no avatar or header. */
  continued: boolean;
  highlighted?: boolean;
  /** "Seen" under the last message the other side has read, in direct conversations. */
  seen?: boolean;
}

/** One message: header (or a gutter time when it continues the one above), Markdown, reactions and its thread. */
export const MessageRow = memo(function MessageRow({ message, continued, highlighted, seen }: MessageRowProps) {
  const scope = useChatScope();
  const theme = useTheme();
  const c = theme.colors;
  const [hovered, setHovered] = useState(false);
  const editing = scope.editingId === message.id;
  const author = message.author;
  const name = author?.display_name ?? 'Deleted account';
  const avatar = scope.wide ? 36 : 32;
  const thread = message.thread as Message['thread'] | null;
  const canSeeHistory = message.author?.id === scope.myId || scope.can.manage;

  // Pointer enter/leave, unlike Pressable's hover, keep firing correctly while the pointer is over the action bar's own buttons.
  return (
    <View onPointerEnter={scope.hover ? () => setHovered(true) : undefined} onPointerLeave={scope.hover ? () => setHovered(false) : undefined} style={{ marginTop: continued ? 0 : 8 }}>
      <Pressable
        accessibilityLabel={`${name}, ${clockTime(message.created_at)}: ${previewText(message.content, 200)}`}
        onLongPress={scope.hover ? undefined : () => scope.openActions(message)}
        delayLongPress={350}
        style={{
          flexDirection: 'row',
          gap: 12,
          paddingHorizontal: scope.wide ? 20 : 16,
          paddingVertical: continued ? 0 : 4,
          backgroundColor: hovered || highlighted || editing ? c.surface : 'transparent',
        }}
      >
        <View style={{ width: avatar }}>
          {continued ? (
            scope.hover && hovered ? (
              <Text variant="captionSm" tone="faint" numberOfLines={1} style={{ textAlign: 'right', paddingTop: 4 }}>
                {clockTime(message.created_at, true)}
              </Text>
            ) : null
          ) : (
            <Avatar name={name} uri={author?.avatar_url} size={avatar} />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          {message.reply_to_id ? <ReplyQuote message={message} scope={scope} /> : null}
          {continued ? null : (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text variant="bodySmStrong" tone="onDark" numberOfLines={1} style={{ flexShrink: 1 }}>
                {name}
              </Text>
              {author?.bot ? (
                <Text variant="captionSm" tone="muted">
                  Bot
                </Text>
              ) : null}
              <Text variant="captionMd" tone="faint">
                {clockTime(message.created_at)}
              </Text>
            </View>
          )}
          {editing ? (
            <EditBox message={message} scope={scope} />
          ) : (
            <View style={{ maxWidth: 760 }}>
              <Markdown
                source={message.content}
                compact={!scope.wide}
                trailing={
                  message.edited_at ? (
                    <Text variant="captionSm" tone="faint" accessibilityRole={canSeeHistory ? 'button' : undefined} accessibilityLabel={canSeeHistory ? 'Edited. Show edit history' : 'Edited'} onPress={canSeeHistory ? () => scope.showHistory(message) : undefined}>
                      (edited)
                    </Text>
                  ) : undefined
                }
              />
            </View>
          )}
          {!editing && (message.reactions?.length ?? 0) > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 4,
                marginTop: 4,
              }}
            >
              {(message.reactions ?? []).map((r) => (
                <Chip key={r.emoji} label={`${r.emoji} ${r.count}`} on={r.me} accessibilityLabel={`${r.emoji} ${r.count}${r.me ? ', you reacted' : ''}`} onPress={scope.can.react ? () => scope.react(message, r.emoji, !r.me) : undefined} />
              ))}
            </View>
          ) : null}
          {thread ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Open thread, ${thread.message_count} ${thread.message_count === 1 ? 'reply' : 'replies'}`}
              onPress={() => scope.openThread(message)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginTop: 4,
                alignSelf: 'flex-start',
              }}
            >
              <Icon name="thread" size={14} color={c.mute} />
              <Text variant="captionMd" tone="onDark">
                {thread.message_count === 0 ? thread.name || 'Thread' : `${thread.message_count} ${thread.message_count === 1 ? 'reply' : 'replies'}`}
              </Text>
              {thread.last_message_at && thread.message_count > 0 && scope.wide ? (
                <Text variant="captionMd" tone="muted">
                  Last reply {clockTime(thread.last_message_at)}
                </Text>
              ) : null}
            </Pressable>
          ) : null}
          {seen ? (
            <Text variant="captionSm" tone="faint" style={{ marginTop: 2 }}>
              Seen
            </Text>
          ) : null}
        </View>
      </Pressable>
      {hovered && scope.hover && !editing ? <HoverBar message={message} scope={scope} /> : null}
    </View>
  );
});

/** A message on its way: "Sending" while the request is out or waiting for the connection, then a way forward if it failed. */
export function OutgoingRow({ item, author, continued }: { item: OutgoingMessage; author: { display_name: string; avatar_url: string | null }; continued: boolean }) {
  const scope = useChatScope();
  const theme = useTheme();
  const c = theme.colors;
  const avatar = scope.wide ? 36 : 32;
  const failed = item.state === 'failed';
  return (
    <View
      accessibilityLabel={failed ? `Not sent: ${item.content}` : `Sending: ${item.content}`}
      style={{
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: scope.wide ? 20 : 16,
        paddingVertical: continued ? 0 : 4,
        marginTop: continued ? 0 : 8,
      }}
    >
      <View style={{ width: avatar }}>{continued ? null : <Avatar name={author.display_name} uri={author.avatar_url} size={avatar} />}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {item.replyTo ? (
          <Text variant="captionMd" tone="muted" numberOfLines={1}>
            ↳ {item.replyTo.author?.display_name ?? 'Deleted account'} {previewText(item.replyTo.content, 60)}
          </Text>
        ) : null}
        {continued ? null : (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Text variant="bodySmStrong" tone="onDark">
              You
            </Text>
            <Text variant="captionMd" tone="faint">
              {clockTime(item.createdAt)}
            </Text>
          </View>
        )}
        <View style={{ opacity: failed ? 1 : 0.6 }}>
          <Markdown source={item.content} compact={!scope.wide} />
        </View>
        {failed ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              marginTop: 2,
            }}
          >
            <Text variant="captionMd" tone="danger">
              Not sent.
            </Text>
            {item.error && item.error !== 'Not sent.' ? (
              <Text variant="captionMd" tone="muted">
                {item.error}
              </Text>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Retry sending" onPress={() => scope.retry(item.nonce)} hitSlop={6}>
              <Text variant="captionMd" tone="onDark" style={{ textDecorationLine: 'underline' }}>
                Retry
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Delete unsent message" onPress={() => scope.discard(item.nonce)} hitSlop={6}>
              <Text variant="captionMd" tone="muted" style={{ textDecorationLine: 'underline' }}>
                Delete
              </Text>
            </Pressable>
          </View>
        ) : (
          <View
            accessibilityLiveRegion="polite"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              marginTop: 2,
            }}
          >
            <Icon name="clock" size={12} color={c.ash} />
            <Text variant="captionMd" tone="faint">
              Sending
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
