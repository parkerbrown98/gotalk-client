import { commandQuery, completeMention, findMentionQuery, MESSAGE_LIMIT, parseCommand, validateMessage, type ChannelCommand, type Message, type ParsedCommand, type Selection } from '@gotalk/core';
import { Avatar, hoverTransition, Icon, Text, typeStyle, useTheme, type PressState } from '@gotalk/ui';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View, type NativeSyntheticEvent, type TextInputKeyPressEventData, type TextStyle } from 'react-native';

import { AttachButton, AttachmentTray, usePasteFiles } from '@/components/attachments';
import { ReactionPickerDialog } from '@/components/chat-dialogs';
import type { Attachment, AttachmentDraft } from '@/lib/attachments';
import type { Channel } from '@/lib/chat';
import { failureMessage } from '@/lib/failure';
import { useMemberSuggestions } from '@/lib/forums';

/** Unsent text per channel, kept while the app runs so switching channels does not lose it. */
const drafts = new Map<string, string>();
const TYPING_EVERY_MS = 8_000;

export interface ChatComposerProps {
  channel: Channel;
  /** Place whose members `@` suggests; conversations suggest their participants. */
  slug?: string;
  placeholder: string;
  wide: boolean;
  replyTo: Message | null;
  onClearReply: () => void;
  onSend: (content: string, attachments: Attachment[]) => void;
  /** Files added with the + button, paste or drag and drop (the chat view shares it for dropping). */
  attachments: AttachmentDraft;
  onTyping: () => void;
  commands: readonly ChannelCommand[];
  onCommand: (parsed: ParsedCommand) => Promise<void>;
  /** Changes when the composer should take focus, e.g. after choosing Reply. */
  focusKey?: unknown;
}

interface Suggestion {
  key: string;
  title: string;
  detail: string;
  avatar?: { name: string; uri: string | null };
  apply: () => void;
}

export function ChatComposer({ channel, slug, placeholder, wide, replyTo, onClearReply, onSend, attachments, onTyping, commands, onCommand, focusKey }: ChatComposerProps) {
  const theme = useTheme();
  const c = theme.colors;
  const input = useRef<TextInput>(null);
  const [value, setValueState] = useState(() => drafts.get(channel.id) ?? '');
  const [sel, setSel] = useState<Selection>({ start: value.length, end: value.length });
  const [focused, setFocused] = useState(false);
  const [height, setHeight] = useState(24);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const lastTyping = useRef(0);
  usePasteFiles(input, attachments);

  const setValue = (next: string) => {
    setValueState(next);
    // Web text areas report growth but not shrinking, so start over when the text is gone.
    if (!next) setHeight(24);
    if (next) drafts.set(channel.id, next);
    else drafts.delete(channel.id);
  };

  useEffect(() => {
    if (focusKey !== undefined) input.current?.focus();
  }, [focusKey]);

  const caret = sel.start === sel.end ? sel.start : -1;
  const mention = caret >= 0 && focused ? findMentionQuery(value, caret) : null;
  const inPlace = !!channel.place_id;
  const members = useMemberSuggestions(inPlace ? slug : undefined, mention && inPlace ? mention.query : null).data ?? [];
  const command = focused ? commandQuery(value) : null;

  let suggestions: Suggestion[] = [];
  if (mention) {
    const q = mention.query.toLowerCase();
    const people = inPlace
      ? members.map((m) => ({ user: m.user, label: m.nickname ?? m.user.display_name }))
      : (channel.recipients ?? []).filter((u) => !q || u.username.toLowerCase().startsWith(q) || u.display_name.toLowerCase().startsWith(q)).map((u) => ({ user: u, label: u.display_name }));
    suggestions = people.slice(0, 6).map(({ user, label }) => ({
      key: user.id,
      title: label,
      detail: `@${user.username}`,
      avatar: { name: user.display_name, uri: user.avatar_url },
      apply: () => {
        const next = completeMention(value, caret, mention, user.username);
        setValue(next.value);
        setSel(next.selection);
      },
    }));
  } else if (command !== null) {
    suggestions = commands
      .filter((cmd) => cmd.name.startsWith(command))
      .slice(0, 8)
      .map((cmd) => ({
        key: cmd.id,
        title: `/${cmd.name}${(cmd.options ?? []).map((o) => (o.required ? ` <${o.name}>` : ` [${o.name}]`)).join('')}`,
        detail: `${cmd.description} · ${cmd.application_name}`,
        apply: () => {
          const next = `/${cmd.name} `;
          setValue(next);
          setSel({ start: next.length, end: next.length });
        },
      }));
  }

  async function submit() {
    if (busy) return;
    const text = value.replace(/\s+$/, '');
    if (!text.trim() && attachments.items.length === 0) return;
    setError(null);
    if (attachments.uploading) return setError('Wait for the files to finish uploading.');
    if (attachments.items.some((i) => i.state === 'failed')) return setError('Some files did not upload. Retry or remove them.');
    const files = attachments.ready;
    if (text.startsWith('/') && commands.length > 0 && files.length === 0) {
      const parsed = parseCommand(text, commands);
      if (parsed && 'error' in parsed) return setError(parsed.error);
      if (parsed) {
        setBusy(true);
        try {
          await onCommand(parsed);
          setValue('');
        } catch (e) {
          setError(e instanceof Error && !('status' in e) ? e.message : failureMessage(e, 'The command could not be sent. Try again.'));
        } finally {
          setBusy(false);
        }
        return;
      }
    }
    const problem = validateMessage(text, files.length);
    if (problem) return setError(problem);
    onSend(text, files);
    attachments.clear();
    setValue('');
    setSel({ start: 0, end: 0 });
    lastTyping.current = 0;
  }

  function onKey(e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (Platform.OS !== 'web') return;
    const n = e.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean; isComposing?: boolean };
    if (n.isComposing) return;
    if ((n.key === 'Enter' || n.key === 'Tab') && !n.shiftKey && suggestions.length > 0) {
      e.preventDefault?.();
      suggestions[0]!.apply();
      return;
    }
    if (n.key === 'Enter' && !n.shiftKey) {
      e.preventDefault?.();
      void submit();
    } else if (n.key === 'Escape' && replyTo) onClearReply();
  }

  const over = [...value].length > MESSAGE_LIMIT;
  const hasText = value.trim().length > 0 || attachments.items.length > 0;

  return (
    <View style={{ paddingHorizontal: wide ? 20 : 12, paddingBottom: wide ? 16 : 8, gap: 6 }}>
      {replyTo ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
          <Icon name="reply" size={14} color={c.mute} />
          <Text variant="captionMd" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            Replying to{' '}
            <Text variant="captionMd" tone="onDark" style={{ fontFamily: theme.fontFaces['500'] }}>
              {replyTo.author?.display_name ?? 'Deleted account'}
            </Text>
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel reply" onPress={onClearReply} hitSlop={8}>
            <Icon name="x" size={14} color={c.mute} />
          </Pressable>
        </View>
      ) : null}
      <View>
        {suggestions.length > 0 ? (
          <View accessibilityRole="menu" style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', marginBottom: 6, padding: 6, gap: 2, backgroundColor: c.surfaceElevated, borderColor: c.hairlineStrong, borderWidth: 1, borderRadius: theme.radii.md, zIndex: 5 }}>
            {suggestions.map((s, i) => (
              <Pressable
                key={s.key}
                accessibilityRole="menuitem"
                onPress={() => {
                  s.apply();
                  input.current?.focus();
                }}
                style={({ pressed, hovered }: PressState) => ({ ...hoverTransition, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 6, borderRadius: theme.radii.sm, backgroundColor: pressed || hovered || i === 0 ? c.surfaceCard : 'transparent' })}
              >
                {s.avatar ? <Avatar name={s.avatar.name} uri={s.avatar.uri} size={24} /> : <Icon name="command" size={16} color={c.mute} />}
                <Text variant="bodySm" tone="onDark" numberOfLines={1}>
                  {s.title}
                </Text>
                <Text variant="captionMd" tone="muted" numberOfLines={1} style={{ marginLeft: 'auto', flexShrink: 1 }}>
                  {s.detail}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View
          style={{
            borderRadius: theme.radii.md,
            backgroundColor: c.surfaceElevated,
            borderWidth: 1,
            borderColor: error || over ? c.accentRed : focused ? c.hairlineStrong : c.hairline,
          }}
        >
          {attachments.items.length > 0 || attachments.notice ? (
            <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 }}>
              <AttachmentTray draft={attachments} />
            </View>
          ) : null}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: 8,
              minHeight: 42,
              paddingVertical: 6,
              paddingLeft: attachments.enabled ? 6 : 12,
              paddingRight: 8,
            }}
          >
            <AttachButton draft={attachments} />
            <TextInput
              ref={input}
              accessibilityLabel={placeholder}
              multiline
              value={value}
              selection={sel}
              onSelectionChange={(e) => setSel(e.nativeEvent.selection)}
              onChangeText={(next) => {
                setValue(next);
                if (error) setError(null);
                if (next.trim() && !next.startsWith('/') && Date.now() - lastTyping.current > TYPING_EVERY_MS) {
                  lastTyping.current = Date.now();
                  onTyping();
                }
              }}
              onContentSizeChange={(e) => setHeight(Math.min(160, Math.max(24, e.nativeEvent.contentSize.height)))}
              onKeyPress={onKey}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              placeholder={placeholder}
              placeholderTextColor={c.ash}
              style={[
                typeStyle(theme, 'bodyMd'),
                { flex: 1, color: c.onDark, height: Math.max(24, height), maxHeight: 160, paddingVertical: 4, textAlignVertical: 'top' } as TextStyle,
                Platform.OS === 'web' ? ({ outlineWidth: 0, outlineStyle: 'none', resize: 'none' } as unknown as TextStyle) : null,
              ]}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Insert an emoji" onPress={() => setEmoji(true)} hitSlop={6} style={{ height: 30, justifyContent: 'center' }}>
              <Icon name="smile" size={18} color={c.mute} />
            </Pressable>
            {hasText ? (
              wide ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={busy} onPress={() => void submit()} style={({ pressed, hovered }: PressState) => ({ ...hoverTransition, height: 30, paddingHorizontal: 12, justifyContent: 'center', borderRadius: theme.radii.md, backgroundColor: pressed || hovered ? c.primaryPressed : c.primary })}>
                  <Text variant="captionMd" tone="inverse" style={{ fontFamily: theme.fontFaces['500'] }}>
                    Send
                  </Text>
                </Pressable>
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={busy} onPress={() => void submit()} style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: c.primary }}>
                  <Icon name="send" size={16} color={c.onPrimary} />
                </Pressable>
              )
            ) : null}
          </View>
        </View>
      </View>
      {error || over ? (
        <Text variant="captionMd" tone="danger" accessibilityLiveRegion="polite">
          {error ?? `${[...value].length.toLocaleString('en-US')} / ${MESSAGE_LIMIT.toLocaleString('en-US')} characters`}
        </Text>
      ) : null}
      <ReactionPickerDialog
        title="Insert an emoji"
        visible={emoji}
        onClose={() => setEmoji(false)}
        onPick={(e) => {
          const at = Math.max(sel.start, sel.end);
          const next = value.slice(0, Math.min(sel.start, sel.end)) + e + value.slice(at);
          setValue(next);
          const caretAt = Math.min(sel.start, sel.end) + e.length;
          setSel({ start: caretAt, end: caretAt });
          input.current?.focus();
        }}
      />
    </View>
  );
}
