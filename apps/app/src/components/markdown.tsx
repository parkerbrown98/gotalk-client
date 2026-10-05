import { parseMarkdown, type Block, type Inline } from '@gotalk/core';
import { Text, useTheme, typeStyle } from '@gotalk/ui';
import { memo, useMemo, type ReactNode } from 'react';
import { Linking, Platform, ScrollView, Text as RNText, View, type TextStyle } from 'react-native';

type Theme = ReturnType<typeof useTheme>;

const monoFamily = Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined });

function useMono(theme: Theme): TextStyle {
  return { fontFamily: monoFamily ?? theme.fontFamilies.mono, fontSize: 13.5 };
}

function Inlines({ nodes, onMention }: { nodes: Inline[]; onMention?: (username: string) => void }) {
  const theme = useTheme();
  const c = theme.colors;
  const mono = useMono(theme);
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case 'text':
            return n.text;
          case 'br':
            return '\n';
          case 'strong':
            return (
              <RNText key={i} style={{ fontFamily: theme.fontFaces['600'], color: c.onDark }}>
                <Inlines nodes={n.children} onMention={onMention} />
              </RNText>
            );
          case 'em':
            return (
              <RNText key={i} style={{ fontStyle: 'italic' }}>
                <Inlines nodes={n.children} onMention={onMention} />
              </RNText>
            );
          case 'del':
            return (
              <RNText key={i} style={{ textDecorationLine: 'line-through' }}>
                <Inlines nodes={n.children} onMention={onMention} />
              </RNText>
            );
          case 'code':
            return (
              <RNText key={i} style={[mono, { color: c.onDark, backgroundColor: c.surfaceCard }]}>
                {` ${n.text} `}
              </RNText>
            );
          case 'link':
            return (
              <RNText key={i} accessibilityRole="link" onPress={() => void Linking.openURL(n.href)} style={{ color: c.onDark, textDecorationLine: 'underline' }}>
                <Inlines nodes={n.children} onMention={onMention} />
              </RNText>
            );
          case 'mention':
            return (
              <RNText key={i} onPress={onMention ? () => onMention(n.username) : undefined} style={{ color: c.onDark, fontFamily: theme.fontFaces['500'], backgroundColor: c.surfaceCard }}>
                {` @${n.username} `}
              </RNText>
            );
        }
      })}
    </>
  );
}

function Blocks({ blocks, onMention, compact, trailing }: { blocks: Block[]; onMention?: (username: string) => void; compact?: boolean; trailing?: ReactNode }) {
  const theme = useTheme();
  const c = theme.colors;
  const mono = useMono(theme);
  const body = typeStyle(theme, compact ? 'bodySm' : 'bodyMd');
  return (
    <View style={{ gap: theme.space.md }}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'paragraph':
            return (
              <RNText key={i} selectable style={[body, { color: c.body }]}>
                <Inlines nodes={b.children} onMention={onMention} />
                {trailing && i === blocks.length - 1 ? <> {trailing}</> : null}
              </RNText>
            );
          case 'heading':
            return (
              <Text key={i} variant={b.depth <= 1 ? 'headingLg' : b.depth === 2 ? 'headingMd' : 'headingSm'} accessibilityRole="header" selectable>
                <Inlines nodes={b.children} onMention={onMention} />
              </Text>
            );
          case 'code':
            return (
              <ScrollView key={i} horizontal style={{ backgroundColor: c.surfaceCard, borderRadius: theme.radii.md }} contentContainerStyle={{ padding: theme.space.md }}>
                <RNText selectable style={[mono, { color: c.onDark }]}>
                  {b.text}
                </RNText>
              </ScrollView>
            );
          case 'quote':
            return (
              <View key={i} style={{ borderLeftWidth: 2, borderLeftColor: c.hairlineStrong, paddingLeft: theme.space.md }}>
                <Blocks blocks={b.children} onMention={onMention} compact={compact} />
              </View>
            );
          case 'list':
            return (
              <View key={i} style={{ gap: theme.space.xs }}>
                {b.items.map((item, j) => (
                  <View key={j} style={{ flexDirection: 'row', gap: theme.space.sm }}>
                    <RNText style={[body, { color: c.mute, minWidth: 20, textAlign: 'right' }]}>{b.ordered ? `${b.start + j}.` : '•'}</RNText>
                    <View style={{ flex: 1 }}>
                      <Blocks blocks={item} onMention={onMention} compact={compact} />
                    </View>
                  </View>
                ))}
              </View>
            );
          case 'table':
            return (
              <ScrollView key={i} horizontal>
                <View style={{ borderWidth: 1, borderColor: c.hairline, borderRadius: theme.radii.md, overflow: 'hidden' }}>
                  {[b.header, ...b.rows].map((row, r) => (
                    <View key={r} style={{ flexDirection: 'row', backgroundColor: r === 0 ? c.surfaceCard : 'transparent', borderTopWidth: r === 0 ? 0 : 1, borderTopColor: c.hairline }}>
                      {row.map((cell, k) => (
                        <View key={k} style={{ minWidth: 96, padding: theme.space.sm, borderLeftWidth: k === 0 ? 0 : 1, borderLeftColor: c.hairline }}>
                          <RNText style={[typeStyle(theme, 'bodySm'), { color: r === 0 ? c.onDark : c.body }]}>
                            <Inlines nodes={cell} onMention={onMention} />
                          </RNText>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            );
          case 'hr':
            return <View key={i} style={{ height: 1, backgroundColor: c.hairline }} />;
        }
      })}
      {trailing && blocks.at(-1)?.type !== 'paragraph' ? <RNText>{trailing}</RNText> : null}
    </View>
  );
}

export interface MarkdownProps {
  source: string;
  /** Tapping an `@name`. */
  onMention?: (username: string) => void;
  compact?: boolean;
  /** Inline text after the last paragraph, such as "(edited)". */
  trailing?: ReactNode;
}

/** Posts and previews. Renders only the closed tree from `parseMarkdown`, so authored text never becomes markup. */
export const Markdown = memo(function Markdown({ source, onMention, compact, trailing }: MarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return <Blocks blocks={blocks} onMention={onMention} compact={compact} trailing={trailing} />;
});
