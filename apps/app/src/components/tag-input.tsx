import { isValidTag, LIMITS, normalizeTag } from '@gotalk/core';
import { Badge, hoverTransition, Icon, Text, typeStyle, useTheme, type PressState } from '@gotalk/ui';
import { useState } from 'react';
import { Platform, Pressable, TextInput, View, type TextStyle } from 'react-native';

import { usePlaceTags } from '@/lib/forums';

export interface TagInputProps {
  slug: string;
  value: string[];
  onChange: (tags: string[]) => void;
}

/** Up to five tags, typed and confirmed with Enter, comma or space, with suggestions from tags already in the place. */
export function TagInput({ slug, value, onChange }: TagInputProps) {
  const theme = useTheme();
  const c = theme.colors;
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const prefix = normalizeTag(text);
  const suggestions = usePlaceTags(slug, prefix, focused && prefix.length > 0 && value.length < LIMITS.tags);
  const options = (suggestions.data ?? []).filter((t) => !value.includes(t.tag));

  const add = (raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag) return;
    if (value.includes(tag)) return setText('');
    if (value.length >= LIMITS.tags) return setProblem(`A topic can have up to ${LIMITS.tags} tags.`);
    if (!isValidTag(tag)) return setProblem('Tags use lowercase letters, numbers and dashes, up to 32 characters.');
    setProblem(null);
    setText('');
    onChange([...value, tag]);
  };

  return (
    <View style={{ gap: theme.space.xs }}>
      <Text variant="bodySmStrong" tone="onDark">
        Tags
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, minHeight: theme.sizes.controlHeight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radii.md, borderWidth: 1, borderColor: problem ? c.accentRed : focused ? c.hairlineStrong : c.hairline, backgroundColor: c.surfaceElevated }}>
        {value.map((t) => (
          <Pressable key={t} accessibilityRole="button" accessibilityLabel={`Remove tag ${t}`} onPress={() => onChange(value.filter((x) => x !== t))} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Badge label={t} />
            <Icon name="x" size={12} color={c.mute} />
          </Pressable>
        ))}
        {value.length < LIMITS.tags ? (
          <TextInput
            accessibilityLabel="Add a tag"
            value={text}
            onChangeText={(v) => {
              setProblem(null);
              if (/[\s,]$/.test(v)) add(v.replace(/[\s,]+$/, ''));
              else setText(v);
            }}
            onSubmitEditing={() => add(text)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              add(text);
              setTimeout(() => setFocused(false), 150);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit={false}
            placeholder={value.length === 0 ? 'Add up to 5 tags' : ''}
            placeholderTextColor={c.ash}
            style={[typeStyle(theme, 'bodySm'), { flex: 1, minWidth: 96, paddingVertical: 4, color: c.onDark }, Platform.OS === 'web' ? ({ outlineWidth: 0, outlineStyle: 'none' } as unknown as TextStyle) : null]}
          />
        ) : null}
      </View>
      {focused && options.length > 0 ? (
        <View accessibilityRole="menu" style={{ padding: 6, gap: 2, backgroundColor: c.surfaceElevated, borderColor: c.hairlineStrong, borderWidth: 1, borderRadius: theme.radii.md }}>
          {options.map((t) => (
            <Pressable key={t.tag} accessibilityRole="menuitem" onPress={() => add(t.tag)} style={({ pressed, hovered }: PressState) => ({ ...hoverTransition, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6, borderRadius: theme.radii.sm, backgroundColor: pressed || hovered ? c.surfaceCard : 'transparent' })}>
              <Text variant="bodySm" tone="onDark">
                {t.tag}
              </Text>
              <Text variant="captionMd" tone="muted">
                {t.topic_count} {t.topic_count === 1 ? 'topic' : 'topics'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text variant="captionMd" tone={problem ? 'danger' : 'muted'}>
        {problem ?? 'Up to 5 tags. Lowercase letters, numbers and dashes.'}
      </Text>
    </View>
  );
}
