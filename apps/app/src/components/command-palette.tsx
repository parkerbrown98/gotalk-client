import { Icon, Keycap, Text, useTheme, type IconName } from '@gotalk/ui';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, TextInput, View } from 'react-native';

import { useRouteSlug } from '@/components/shell';
import { useActiveInstance } from '@/lib/instances';
import { useBoards, useChannels, useMyPlaces } from '@/lib/places';
import { typeStyle } from '@gotalk/ui';

interface Entry {
  key: string;
  group: 'Places' | 'In this place' | 'Go to';
  label: string;
  where?: string;
  icon: IconName;
  open: () => void;
}

/** Opens on Cmd/Ctrl+K (web and desktop). Jumps between places, the open place's channels, and a few screens. */
export function useCommandPaletteShortcut(onOpen: () => void) {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpen]);
}

export function CommandPalette({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const c = theme.colors;
  const active = useActiveInstance();
  const slug = useRouteSlug();
  const places = useMyPlaces().data ?? [];
  const boards = useBoards(slug, visible && !!slug).data ?? [];
  const channels = useChannels(slug, visible && !!slug).data ?? [];
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setIndex(0);
    }
  }, [visible]);

  const entries = useMemo<Entry[]>(() => {
    const here = places.find((p) => p.slug === slug)?.name;
    const all: Entry[] = [
      ...places.map<Entry>((p) => ({ key: `p-${p.id}`, group: 'Places', label: p.name, icon: 'home', open: () => router.push({ pathname: '/places/[slug]', params: { slug: p.slug } }) })),
      ...(slug
        ? [
            ...boards
              .filter((b) => b.kind === 'board')
              .map<Entry>((b) => ({ key: `b-${b.id}`, group: 'In this place', label: b.name, where: here, icon: 'forum', open: () => router.push({ pathname: '/places/[slug]/boards/[id]', params: { slug, id: b.id } }) })),
            ...channels
              .filter((ch) => ch.kind === 'text' || ch.kind === 'voice')
              .map<Entry>((ch) => ({ key: `c-${ch.id}`, group: 'In this place', label: ch.name, where: here, icon: ch.kind === 'voice' ? 'volume' : 'hash', open: () => router.push({ pathname: '/places/[slug]/channels/[id]', params: { slug, id: ch.id } }) })),
          ]
        : []),
      { key: 'discover', group: 'Go to', label: 'Discover places', icon: 'compass', open: () => router.push('/discover') },
      { key: 'new', group: 'Go to', label: 'Create a place', icon: 'plus', open: () => router.push('/places/new') },
      { key: 'account', group: 'Go to', label: 'Account settings', icon: 'settings', open: () => router.push('/settings') },
    ];
    const q = query.trim().toLowerCase();
    return q ? all.filter((e) => e.label.toLowerCase().includes(q)) : all;
  }, [places, boards, channels, slug, query]);

  const chosen = Math.min(index, Math.max(entries.length - 1, 0));
  const run = (e: Entry | undefined) => {
    if (!e) return;
    onClose();
    e.open();
  };

  let lastGroup = '';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', paddingTop: 88 }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View
          accessibilityViewIsModal
          style={{ width: 620, maxWidth: '92%', backgroundColor: c.surface, borderColor: c.hairlineStrong, borderWidth: 1, borderRadius: theme.radii.xl, overflow: 'hidden' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 56, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.hairline }}>
            <Icon name="search" size={18} color={c.mute} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={(t) => {
                setQuery(t);
                setIndex(0);
              }}
              placeholder={`Jump to a place or channel${active ? ` on ${active.name}` : ''}`}
              placeholderTextColor={c.ash}
              accessibilityLabel="Jump to"
              onKeyPress={(e) => {
                const key = e.nativeEvent.key;
                if (key === 'ArrowDown') setIndex((i) => Math.min(i + 1, entries.length - 1));
                else if (key === 'ArrowUp') setIndex((i) => Math.max(i - 1, 0));
                else if (key === 'Escape') onClose();
              }}
              onSubmitEditing={() => run(entries[chosen])}
              style={[typeStyle(theme, 'bodyMd'), { flex: 1, color: c.onDark }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as never) : null]}
            />
          </View>
          <View style={{ padding: 8, gap: 2 }}>
            {entries.length === 0 ? (
              <Text variant="bodySm" tone="muted" style={{ padding: 10 }}>
                Nothing matches "{query.trim()}".
              </Text>
            ) : null}
            {entries.map((e, i) => {
              const header = e.group !== lastGroup ? e.group : null;
              lastGroup = e.group;
              return (
                <View key={e.key}>
                  {header ? (
                    <Text variant="captionMd" tone="muted" style={{ paddingHorizontal: 10, paddingTop: 6, paddingBottom: 2 }}>
                      {header}
                    </Text>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => run(e)}
                    onHoverIn={() => setIndex(i)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36, paddingHorizontal: 10, borderRadius: theme.radii.sm, backgroundColor: i === chosen ? c.surfaceCard : 'transparent' }}
                  >
                    <Icon name={e.icon} size={16} color={c.mute} />
                    <Text variant="bodyMd" tone="onDark" numberOfLines={1} style={{ flex: 1 }}>
                      {e.label}
                    </Text>
                    {e.where ? (
                      <Text variant="captionMd" tone="muted">
                        {e.where}
                      </Text>
                    ) : null}
                    {i === chosen ? <Keycap>⏎</Keycap> : null}
                  </Pressable>
                </View>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, height: 40, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: c.hairline }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Keycap>↑</Keycap>
              <Keycap>↓</Keycap>
              <Text variant="captionMd" tone="muted">
                Move
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Keycap>⏎</Keycap>
              <Text variant="captionMd" tone="muted">
                Open
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
              <Keycap>esc</Keycap>
              <Text variant="captionMd" tone="muted">
                Close
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
