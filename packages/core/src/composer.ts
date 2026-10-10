/** Limits the server enforces on topics, posts and tags; checked here so the form can say so first. */
export const LIMITS = { title: 200, post: 50_000, tags: 5, tagLength: 32 } as const;

export interface Selection {
  start: number;
  end: number;
}

export interface EditResult {
  value: string;
  selection: Selection;
}

export type Format = 'bold' | 'italic' | 'code' | 'link' | 'quote';

/** Wraps the selection (or inserts a placeholder) the way a Markdown toolbar button would. */
export function applyFormat(value: string, sel: Selection, format: Format): EditResult {
  const start = Math.min(sel.start, sel.end);
  const end = Math.max(sel.start, sel.end);
  const chosen = value.slice(start, end);
  const splice = (before: string, inner: string, after: string, innerFrom = before.length): EditResult => ({
    value: value.slice(0, start) + before + inner + after + value.slice(end),
    selection: { start: start + innerFrom, end: start + innerFrom + inner.length },
  });
  switch (format) {
    case 'bold':
      return splice('**', chosen || 'bold text', '**');
    case 'italic':
      return splice('*', chosen || 'italic text', '*');
    case 'code':
      return chosen.includes('\n') ? splice('```\n', chosen, '\n```', 4) : splice('`', chosen || 'code', '`');
    case 'link': {
      const label = chosen || 'link text';
      const out = splice('[', label, '](https://)');
      // Leave the address selected so it can be typed over.
      const from = start + 1 + label.length + 2;
      return { value: out.value, selection: { start: from, end: from + 'https://'.length } };
    }
    case 'quote': {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const block = value.slice(lineStart, end).split('\n');
      const quoted = block.map((l) => `> ${l}`).join('\n');
      const added = quoted.length - (end - lineStart);
      return { value: value.slice(0, lineStart) + quoted + value.slice(end), selection: { start: start + 2, end: end + added } };
    }
  }
}

export interface MentionQuery {
  /** Index of the `@`. */
  start: number;
  query: string;
}

/** The `@name` being typed at the caret, if any. */
export function findMentionQuery(value: string, caret: number): MentionQuery | null {
  const m = /(^|[^\w@./-])@([a-zA-Z0-9_.-]{0,32})$/.exec(value.slice(0, caret));
  if (!m) return null;
  const query = m[2]!;
  return { start: caret - query.length - 1, query };
}

/** Replaces the `@query` at the caret with `@username ` and puts the caret after it. */
export function completeMention(value: string, caret: number, mention: MentionQuery, username: string): EditResult {
  const insert = `@${username} `;
  const next = value.slice(0, mention.start) + insert + value.slice(caret);
  const at = mention.start + insert.length;
  return { value: next, selection: { start: at, end: at } };
}

export const TAG_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/^#/, '');
}

export function isValidTag(tag: string): boolean {
  return TAG_PATTERN.test(tag);
}

export interface ComposeProblem {
  field: 'title' | 'content' | 'tags';
  message: string;
}

/** First problem that would make the server reject a new topic, so the form can point at it. */
/** A topic needs a title; its body may be empty when it has attachments. */
export function validateTopic(input: { title: string; content: string; tags: string[]; attachments?: number }): ComposeProblem | null {
  const title = input.title.trim().replace(/\s+/g, ' ');
  if (!title) return { field: 'title', message: 'Give the topic a title.' };
  if ([...title].length > LIMITS.title) return { field: 'title', message: `Titles can be up to ${LIMITS.title} characters.` };
  if (input.tags.length > LIMITS.tags) return { field: 'tags', message: `A topic can have up to ${LIMITS.tags} tags.` };
  return validatePost(input.content, input.attachments);
}

/** `attachments` is how many files go with the post; with any, the text may be empty. */
export function validatePost(content: string, attachments = 0): ComposeProblem | null {
  if (!content.trim() && attachments === 0) return { field: 'content', message: 'Write something first.' };
  if ([...content].length > LIMITS.post) return { field: 'content', message: `Posts can be up to ${LIMITS.post.toLocaleString('en-US')} characters.` };
  return null;
}

/** Server-side draft keys: letters, digits and `:_.-`, 100 characters at most. */
export const draftKeys = {
  topic: (boardId: string) => `topic:${boardId}`,
  reply: (topicId: string, parentId?: string | null) => (parentId ? `reply:${topicId}:${parentId}` : `reply:${topicId}`),
} as const;

export interface DraftData {
  title?: string;
  tags?: string[];
  content: string;
}

/** Reads draft data back defensively: it is whatever any client once saved. */
export function parseDraft(data: unknown): DraftData | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const content = typeof d.content === 'string' ? d.content : '';
  const title = typeof d.title === 'string' ? d.title : undefined;
  const tags = Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === 'string') : undefined;
  if (!content && !title && !(tags && tags.length)) return null;
  return { content, title, tags };
}

/** Emoji offered in the reaction picker; the server also accepts any other Unicode emoji. */
export const QUICK_REACTIONS = ['👍', '❤️', '🎉', '😄', '🤔', '👀', '🙏', '👎'] as const;
