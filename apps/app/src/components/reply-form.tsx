import { validatePost } from '@gotalk/core';
import { Button, Icon, Text, useTheme } from '@gotalk/ui';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Composer } from '@/components/composer';
import { messageFor } from '@/components/forum';
import { draftKeys, useForumActions, useServerDraft, type Post } from '@/lib/forums';

export interface ReplyFormProps {
  topicId: string;
  slug: string;
  /** The post being answered; replies to the topic itself when absent. */
  parent?: Post;
  onClearParent?: () => void;
  onPosted: (post: Post) => void;
  autoFocus?: boolean;
  minHeight?: number;
}

/** Reply composer with a server-synced draft per topic (and per post being answered). */
export function ReplyForm({ topicId, slug, parent, onClearParent, onPosted, autoFocus, minHeight = 76 }: ReplyFormProps) {
  const theme = useTheme();
  const c = theme.colors;
  const actions = useForumActions();
  const draft = useServerDraft(draftKeys.reply(topicId, parent?.id));
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restored = useRef<string | null>(null);

  // Restore the stored draft once per draft key, without overwriting what is being typed.
  const key = draftKeys.reply(topicId, parent?.id);
  useEffect(() => {
    if (!draft.loaded || restored.current === key) return;
    restored.current = key;
    if (content) draft.save({ content });
    else setContent(draft.stored?.content ?? '');
    // Only the moment the stored draft arrives matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.loaded, draft.stored, key]);

  async function post() {
    const problem = validatePost(content);
    if (problem) return setError(problem.message);
    setBusy(true);
    setError(null);
    try {
      const created = await actions.reply(topicId, content, parent?.id);
      await draft.discard();
      setContent('');
      onPosted(created);
    } catch (e) {
      setError(messageFor(e, 'Could not post the reply. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: theme.space.sm }}>
      {parent ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
          <Icon name="reply" size={14} color={c.mute} />
          <Text variant="captionMd" tone="muted" style={{ flex: 1 }} numberOfLines={1}>
            Replying to {parent.author.display_name} (#{parent.post_number})
          </Text>
          {onClearParent ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Reply to the topic instead" hitSlop={8} onPress={onClearParent}>
              <Icon name="x" size={14} color={c.mute} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Composer
        value={content}
        onChange={(v) => {
          setContent(v);
          setError(null);
          if (draft.loaded) draft.save({ content: v });
        }}
        slug={slug}
        autoFocus={autoFocus}
        minHeight={minHeight}
        placeholder={parent ? `Reply to ${parent.author.display_name}` : 'Reply to the topic'}
        draftState={draft.state}
        onSubmit={post}
        error={error}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Button title="Post reply" loading={busy} onPress={post} />
      </View>
    </View>
  );
}
