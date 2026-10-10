import { applyFormat, completeMention, findMentionQuery, LIMITS, type Format, type Selection } from '@gotalk/core';
import { Avatar, hoverTransition, Icon, Text, typeStyle, useTheme, type IconName, type PressState } from '@gotalk/ui';
import { useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View, type NativeSyntheticEvent, type TextInputKeyPressEventData, type TextStyle } from 'react-native';

import { AttachButton, AttachmentTray, DropOverlay, MessageMedia, useFileDrop, usePasteFiles } from '@/components/attachments';
import { Markdown } from '@/components/markdown';
import type { AttachmentDraft } from '@/lib/attachments';
import { useMemberSuggestions, type DraftState } from '@/lib/forums';

const NO_ATTACHMENTS: AttachmentDraft = {
  enabled: false,
  max: 0,
  items: [],
  notice: null,
  uploading: false,
  ready: [],
  add: () => undefined,
  remove: () => undefined,
  retry: () => undefined,
  dismissNotice: () => undefined,
  clear: () => undefined,
};

const draftLabel: Record<DraftState, string> = { idle: '', saving: 'Saving draft…', saved: 'Draft saved', error: 'Draft not saved' };

const tools: Array<{ format: Format; label: string; icon?: IconName; text?: string }> = [
  { format: 'bold', label: 'Bold', text: 'B' },
  { format: 'italic', label: 'Italic', text: 'I' },
  { format: 'link', label: 'Link', icon: 'link' },
  { format: 'code', label: 'Code', text: '</>' },
  { format: 'quote', label: 'Quote', text: '“' },
];

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  /** Place whose members `@` suggests. */
  slug?: string;
  placeholder?: string;
  minHeight?: number;
  autoFocus?: boolean;
  draftState?: DraftState;
  /** Cmd/Ctrl+Enter. */
  onSubmit?: () => void;
  error?: string | null;
  /** Files for the post: a + button in the toolbar, paste and drag and drop. Omit to allow none. */
  attachments?: AttachmentDraft;
}

/** Markdown input with a formatting toolbar, Write/Preview, `@mention` suggestions and a draft indicator. */
export function Composer({ value, onChange, slug, placeholder, minHeight = 120, autoFocus, draftState = 'idle', onSubmit, error, attachments }: ComposerProps) {
  const theme = useTheme();
  const c = theme.colors;
  const input = useRef<TextInput>(null);
  const box = useRef<View>(null);
  const files = attachments ?? NO_ATTACHMENTS;
  usePasteFiles(input, files);
  const dragging = useFileDrop(box, files);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [sel, setSel] = useState<Selection>({ start: 0, end: 0 });
  const [focused, setFocused] = useState(false);
  const caret = sel.start === sel.end ? sel.start : -1;
  const mention = caret >= 0 && focused && mode === 'write' ? findMentionQuery(value, caret) : null;
  const suggestions = useMemberSuggestions(slug, mention ? mention.query : null);
  const names = mention ? (suggestions.data ?? []) : [];

  const edit = (next: { value: string; selection: Selection }) => {
    onChange(next.value);
    setSel(next.selection);
  };

  const key = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const n = e.nativeEvent as TextInputKeyPressEventData & { metaKey?: boolean; ctrlKey?: boolean };
    if (n.key === 'Enter' && (n.metaKey || n.ctrlKey)) {
      e.preventDefault?.();
      onSubmit?.();
    }
  };

  const tab = (value: 'write' | 'preview', label: string) => (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === value }} onPress={() => setMode(value)} style={{ paddingHorizontal: 8, height: 28, justifyContent: 'center', borderRadius: theme.radii.sm, backgroundColor: mode === value ? c.surfaceCard : 'transparent' }}>
      <Text variant="bodySm" tone={mode === value ? 'onDark' : 'default'}>
        {label}
      </Text>
    </Pressable>
  );

  const over = [...value].length > LIMITS.post;
  return (
    <View style={{ gap: theme.space.xs }}>
      <View ref={box} style={{ borderWidth: 1, borderColor: error || over ? c.accentRed : focused ? c.hairlineStrong : c.hairline, borderRadius: theme.radii.md, backgroundColor: c.surface }}>
        <DropOverlay visible={dragging} label="Drop files to attach" />
        <View accessibilityRole="toolbar" style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, gap: 2, borderBottomWidth: 1, borderBottomColor: c.hairline }}>
          {tab('write', 'Write')}
          {tab('preview', 'Preview')}
          <View style={{ width: 1, height: 16, backgroundColor: c.hairline, marginHorizontal: 6 }} />
          {tools.map((t) => (
            <Pressable
              key={t.format}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              disabled={mode !== 'write'}
              onPress={() => edit(applyFormat(value, sel, t.format))}
              style={({ pressed, hovered }: PressState) => ({ ...hoverTransition, minWidth: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radii.sm, opacity: mode === 'write' ? 1 : 0.4, backgroundColor: pressed || hovered ? c.surfaceCard : 'transparent' })}
            >
              {t.icon ? (
                <Icon name={t.icon} size={16} color={c.body} />
              ) : (
                <Text variant="bodySm" style={{ fontFamily: t.format === 'bold' ? theme.fontFaces['600'] : undefined, fontStyle: t.format === 'italic' ? 'italic' : undefined }}>
                  {t.text}
                </Text>
              )}
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mention someone"
            disabled={mode !== 'write'}
            onPress={() => {
              const at = Math.min(sel.start, sel.end);
              const before = value.slice(0, at);
              const lead = before && !/\s$/.test(before) ? ' ' : '';
              edit({ value: `${before}${lead}@${value.slice(Math.max(sel.start, sel.end))}`, selection: { start: at + lead.length + 1, end: at + lead.length + 1 } });
            }}
            style={{ minWidth: 28, height: 28, alignItems: 'center', justifyContent: 'center', opacity: mode === 'write' ? 1 : 0.4 }}
          >
            <Icon name="at" size={16} color={c.body} />
          </Pressable>
          {files.enabled ? (
            <View style={{ marginLeft: 'auto' }}>
              <AttachButton draft={files} size={28} />
            </View>
          ) : null}
        </View>
        {mode === 'write' ? (
          <TextInput
            ref={input}
            accessibilityLabel="Write your post in Markdown"
            multiline
            autoFocus={autoFocus}
            value={value}
            onChangeText={onChange}
            selection={sel}
            onSelectionChange={(e) => setSel(e.nativeEvent.selection)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onKeyPress={key}
            placeholder={placeholder}
            placeholderTextColor={c.ash}
            style={[
              typeStyle(theme, 'bodyMd'),
              { minHeight, paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md, color: c.onDark, textAlignVertical: 'top' } as TextStyle,
              Platform.OS === 'web' ? ({ outlineWidth: 0, outlineStyle: 'none', resize: 'vertical' } as unknown as TextStyle) : null,
            ]}
          />
        ) : (
          <View style={{ minHeight, padding: theme.space.lg }}>
            {value.trim() ? <Markdown source={value} /> : files.ready.length === 0 ? <Text variant="bodySm" tone="muted">Nothing to preview yet.</Text> : null}
            <MessageMedia attachments={files.ready} wide />
          </View>
        )}
        {mode === 'write' && (files.items.length > 0 || files.notice) ? (
          <View style={{ paddingHorizontal: theme.space.lg, paddingBottom: theme.space.md }}>
            <AttachmentTray draft={files} />
          </View>
        ) : null}
        {mention && names.length > 0 ? (
          <View accessibilityRole="menu" style={{ position: 'absolute', left: theme.space.lg, bottom: 8, minWidth: 240, padding: 6, gap: 2, backgroundColor: c.surfaceElevated, borderColor: c.hairlineStrong, borderWidth: 1, borderRadius: theme.radii.md, zIndex: 5 }}>
            {names.map((m) => (
              <Pressable
                key={m.user.id}
                accessibilityRole="menuitem"
                onPress={() => edit(completeMention(value, caret, mention, m.user.username))}
                style={({ pressed, hovered }: PressState) => ({ ...hoverTransition, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 6, borderRadius: theme.radii.sm, backgroundColor: pressed || hovered ? c.surfaceCard : 'transparent' })}
              >
                <Avatar name={m.user.display_name} uri={m.user.avatar_url} size={24} />
                <Text variant="bodySm" tone="onDark">
                  {m.nickname ?? m.user.display_name}
                </Text>
                <Text variant="captionMd" tone="muted" style={{ marginLeft: 'auto' }}>
                  @{m.user.username}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.space.md }}>
        {error ? (
          <Text variant="captionMd" tone="danger" accessibilityLiveRegion="polite" style={{ flex: 1 }}>
            {error}
          </Text>
        ) : (
          <Text variant="captionMd" tone={draftState === 'error' ? 'danger' : 'muted'} style={{ flex: 1 }} accessibilityLiveRegion="polite">
            {draftLabel[draftState] || `Markdown supported${Platform.OS === 'web' ? ' · Ctrl or ⌘ + Enter to post' : ''}`}
          </Text>
        )}
        {over ? (
          <Text variant="captionMd" tone="danger">
            {[...value].length.toLocaleString('en-US')} / {LIMITS.post.toLocaleString('en-US')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
