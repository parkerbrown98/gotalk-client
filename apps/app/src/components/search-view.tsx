import { splitHighlights, relativeTime } from '@gotalk/core';
import { Badge, Button, Checkbox, Notice, PillTabs, Stack, Text, TextField, useTheme } from '@gotalk/ui';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Empty } from '@/components/forum';
import { boardTree, usePlaceSearch, type SearchParams, type SearchResult } from '@/lib/forums';
import { useWide } from '@/lib/layout';
import { useBoards } from '@/lib/places';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function Snippet({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Text variant="bodySm">
      {splitHighlights(text).map((p, i) =>
        p.match ? (
          <Text key={i} variant="bodySm" tone="onDark" style={{ backgroundColor: theme.colors.surfaceCard, fontFamily: theme.fontFaces['500'] }}>
            {p.text}
          </Text>
        ) : (
          p.text
        ),
      )}
    </Text>
  );
}

function Result({ result, slug, wide }: { result: SearchResult; slug: string; wide: boolean }) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push({ pathname: '/places/[slug]/topics/[id]', params: { slug, id: result.topic.id } })}
      style={({ pressed }) => ({ gap: 4, paddingVertical: 14, paddingHorizontal: wide ? 0 : theme.space.lg, borderBottomWidth: 1, borderBottomColor: c.hairline, backgroundColor: pressed ? c.surface : 'transparent' })}
    >
      <Text variant="bodySmStrong" tone="onDark">
        {result.topic.title}
      </Text>
      <Text variant="captionMd" tone="muted">
        {result.author.display_name} · #{result.post_number} · {relativeTime(result.created_at)}
      </Text>
      <Snippet text={result.snippet} />
      {result.topic.solved || result.topic.tags?.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
          {result.topic.solved ? <Badge label="Solved" tone="success" /> : null}
          {(result.topic.tags ?? []).map((t) => (
            <Badge key={t} label={t} />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

/** Search one place: words, phrases and exclusions, narrowed by author, tag, forum, answered state and date. */
export function SearchView({ slug, board: initialBoard }: { slug: string; board?: string }) {
  const theme = useTheme();
  const wide = useWide();
  const boards = boardTree(useBoards(slug).data ?? []).filter((n) => n.board.kind === 'board');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [author, setAuthor] = useState('');
  const [tag, setTag] = useState('');
  const [board, setBoard] = useState(initialBoard ?? '');
  const [solved, setSolved] = useState<'any' | 'true' | 'false'>('any');
  const [sort, setSort] = useState<SearchParams['sort']>('relevance');
  const [after, setAfter] = useState('');
  const [before, setBefore] = useState('');
  const [topicsOnly, setTopicsOnly] = useState(false);
  const [filters, setFilters] = useState(wide);

  // A different place or a link with another forum starts from the new context.
  useEffect(() => setBoard(initialBoard ?? ''), [initialBoard, slug]);
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim().slice(0, 200)), 400);
    return () => clearTimeout(t);
  }, [text]);

  const dateProblem = (after && !DATE.test(after)) || (before && !DATE.test(before));
  const search = usePlaceSearch(slug, {
    q,
    author: author.trim().replace(/^@/, ''),
    tag: tag.trim().toLowerCase(),
    board: board || undefined,
    solved: solved === 'any' ? undefined : solved,
    after: after && DATE.test(after) ? `${after}T00:00:00Z` : undefined,
    before: before && DATE.test(before) ? `${before}T23:59:59Z` : undefined,
    topicsOnly,
    sort,
  });
  const active = [author, tag, board, solved !== 'any' ? solved : '', after, before, topicsOnly ? 'x' : ''].filter(Boolean).length;

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string) => (
    <View style={{ flex: 1, minWidth: 140 }}>
      <TextField label={label} value={value} onChangeText={set} placeholder={placeholder} autoCapitalize="none" autoCorrect={false} />
    </View>
  );

  return (
    <Stack gap="lg" style={wide ? undefined : { paddingHorizontal: 0 }}>
      <View style={{ paddingHorizontal: wide ? 0 : theme.space.lg, gap: theme.space.md }}>
        <TextField accessibilityLabel="Search" value={text} onChangeText={setText} placeholder='Search words, "quoted phrases", -exclusions' returnKeyType="search" autoCapitalize="none" onSubmitEditing={() => setQ(text.trim().slice(0, 200))} />
        {wide ? null : (
          <Button title={filters ? 'Hide filters' : active ? `Filters (${active})` : 'Filters'} variant="tertiary" size="sm" onPress={() => setFilters((f) => !f)} style={{ alignSelf: 'flex-start' }} />
        )}
        {filters ? (
          <Stack gap="md">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md }}>
              {field('Author', author, setAuthor, 'username')}
              {field('Tag', tag, setTag, 'any')}
              {field('After', after, setAfter, 'YYYY-MM-DD')}
              {field('Before', before, setBefore, 'YYYY-MM-DD')}
            </View>
            {dateProblem ? <Text variant="captionMd" tone="danger">Dates use the form 2026-09-01.</Text> : null}
            {boards.length > 0 ? (
              <Stack gap="xs">
                <Text variant="bodySmStrong" tone="onDark">
                  Forum
                </Text>
                <PillTabs options={[{ value: '', label: 'Any forum' }, ...boards.map((n) => ({ value: n.board.id, label: n.board.name }))]} value={board} onChange={setBoard} />
              </Stack>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.xl }}>
              <Stack gap="xs">
                <Text variant="bodySmStrong" tone="onDark">
                  Answered
                </Text>
                <PillTabs
                  options={[
                    { value: 'any', label: 'Any' },
                    { value: 'true', label: 'Solved' },
                    { value: 'false', label: 'Unsolved' },
                  ]}
                  value={solved}
                  onChange={setSolved}
                />
              </Stack>
              <Stack gap="xs">
                <Text variant="bodySmStrong" tone="onDark">
                  Sort
                </Text>
                <PillTabs
                  options={[
                    { value: 'relevance', label: 'Best match' },
                    { value: 'newest', label: 'Newest' },
                    { value: 'oldest', label: 'Oldest' },
                  ]}
                  value={sort}
                  onChange={setSort}
                />
              </Stack>
            </View>
            <Checkbox checked={topicsOnly} onChange={setTopicsOnly}>
              Only opening posts
            </Checkbox>
          </Stack>
        ) : null}
      </View>

      <View>
        {!q ? (
          <Empty>Type to search this place. Results come only from forums you can read.</Empty>
        ) : search.isPending ? (
          <ActivityIndicator style={{ marginTop: 24 }} />
        ) : search.isError ? (
          <View style={{ paddingHorizontal: wide ? 0 : theme.space.lg, gap: theme.space.md }}>
            <Notice tone="danger" title="The search failed.">
              Check your connection and try again.
            </Notice>
            <Button title="Try again" variant="tertiary" onPress={() => void search.refetch()} />
          </View>
        ) : (
          <>
            <Text variant="captionMd" tone="muted" style={{ paddingHorizontal: wide ? 0 : theme.space.lg, paddingBottom: theme.space.sm }}>
              {search.results.length === 0 ? 'No results' : `${search.results.length}${search.hasNextPage ? '+' : ''} ${search.results.length === 1 ? 'result' : 'results'}`}
            </Text>
            {search.results.map((r) => (
              <Result key={r.post_id} result={r} slug={slug} wide={wide} />
            ))}
            {search.hasNextPage ? (
              <View style={{ padding: theme.space.lg, alignItems: 'center' }}>
                <Button title="Show more results" variant="tertiary" loading={search.isFetchingNextPage} onPress={() => void search.fetchNextPage()} />
              </View>
            ) : null}
            {search.results.length === 0 ? <Empty>Nothing matched. Try fewer words or clear a filter.</Empty> : null}
          </>
        )}
      </View>
    </Stack>
  );
}
