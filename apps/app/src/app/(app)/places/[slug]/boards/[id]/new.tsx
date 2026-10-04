import { validateTopic } from '@gotalk/core';
import { Button, Notice, Stack, Text, TextField, useTheme } from '@gotalk/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Composer } from '@/components/composer';
import { messageFor } from '@/components/forum';
import { ScreenFrame } from '@/components/screen-frame';
import { TagInput } from '@/components/tag-input';
import { draftKeys, useForumActions, useServerDraft } from '@/lib/forums';
import { goBack, useWide } from '@/lib/layout';
import { useBoardAccess, useBoards, usePlace, usePlaceAccess } from '@/lib/places';

/** Start a topic: title, tags, Markdown body. The draft follows the person between devices. */
export default function NewTopic() {
  const theme = useTheme();
  const wide = useWide();
  const { slug, id } = useLocalSearchParams<{ slug: string; id: string }>();
  const place = usePlace(slug).data;
  const access = usePlaceAccess(place);
  const board = useBoards(slug, access.isMember).data?.find((b) => b.id === id);
  const boardAccess = useBoardAccess(board);
  const actions = useForumActions();
  const draft = useServerDraft(id ? draftKeys.topic(id) : null);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: 'title' | 'content' | 'tags' | 'form'; message: string } | null>(null);
  const restored = useRef(false);

  // Fill the form once from the stored draft, and never again, so typing is not overwritten.
  useEffect(() => {
    if (!draft.loaded || restored.current) return;
    restored.current = true;
    if (title || content || tags.length) draft.save({ title, tags, content });
    else if (draft.stored) {
      setTitle(draft.stored.title ?? '');
      setTags(draft.stored.tags ?? []);
      setContent(draft.stored.content);
    }
    // Only the moment the stored draft arrives matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.loaded, draft.stored]);

  const change = (next: { title?: string; tags?: string[]; content?: string }) => {
    const t = next.title ?? title;
    const g = next.tags ?? tags;
    const body = next.content ?? content;
    if (next.title !== undefined) setTitle(t);
    if (next.tags !== undefined) setTags(g);
    if (next.content !== undefined) setContent(body);
    setError(null);
    if (draft.loaded) draft.save({ title: t, tags: g, content: body });
  };

  async function post() {
    const problem = validateTopic({ title, content, tags });
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const topic = await actions.createTopic(id, { title: title.trim().replace(/\s+/g, ' '), content, tags });
      await draft.discard();
      router.replace({ pathname: '/places/[slug]/topics/[id]', params: { slug, id: topic.id } });
    } catch (e) {
      setError({ field: 'form', message: messageFor(e, 'Could not post the topic. Try again.') });
    } finally {
      setBusy(false);
    }
  }

  const back = () => goBack({ pathname: '/places/[slug]/boards/[id]', params: { slug, id } });
  const locked = !!board && !boardAccess.can('CREATE_TOPICS');

  return (
    <ScreenFrame title="New topic" onBack={back} end={wide ? undefined : <Button title="Post" size="sm" loading={busy} onPress={post} disabled={locked} />} maxWidth={800} contentStyle={wide ? { paddingVertical: 32, paddingHorizontal: 40 } : { padding: theme.space.lg }}>
      <Stack gap="lg">
        {wide ? (
          <Text variant="headingLg" accessibilityRole="header">
            New topic{board ? ` in ${board.name}` : ''}
          </Text>
        ) : null}
        {!draft.loaded ? <ActivityIndicator /> : null}
        {locked ? <Notice tone="warning" title="You cannot start topics here." /> : null}
        <TextField label="Title" value={title} onChangeText={(v) => change({ title: v })} error={error?.field === 'title' ? error.message : null} maxLength={400} returnKeyType="next" />
        <TagInput slug={slug} value={tags} onChange={(v) => change({ tags: v })} />
        {error?.field === 'tags' ? <Notice tone="danger">{error.message}</Notice> : null}
        <Composer value={content} onChange={(v) => change({ content: v })} slug={slug} placeholder="What do you want to discuss?" minHeight={wide ? 200 : 160} draftState={draft.state} onSubmit={post} error={error?.field === 'content' ? error.message : null} />
        {error?.field === 'form' ? <Notice tone="danger">{error.message}</Notice> : null}
        <View style={{ flexDirection: 'row', gap: theme.space.sm, justifyContent: 'flex-end' }}>
          <Button
            title="Discard draft"
            variant="tertiary"
            onPress={async () => {
              await draft.discard();
              setTitle('');
              setTags([]);
              setContent('');
              back();
            }}
          />
          {wide ? <Button title="Post topic" loading={busy} disabled={locked} onPress={post} /> : null}
        </View>
      </Stack>
    </ScreenFrame>
  );
}
