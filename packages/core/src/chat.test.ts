import { describe, expect, it } from 'vitest';

import {
  applyReaction,
  buildFeed,
  channelSections,
  channelSiblings,
  moveChannel,
  commandQuery,
  conversationTitle,
  dayLabel,
  firstUnreadId,
  keepOwnReactions,
  mergeMessages,
  newNonce,
  parseCommand,
  previewText,
  typingText,
  validateMessage,
  type ChannelCommand,
  type ChatChannel,
  type Message,
} from './chat.ts';

const user = (id: string, name = id) => ({ id, username: id, display_name: name, avatar_url: null, bio: '', bot: false, created_at: '', pronouns: '' });

// UUIDv7-like ids: the prefix orders them by time.
const id = (n: number) => `0190${n.toString(16).padStart(4, '0')}-0000-7000-8000-000000000000`;

function msg(n: number, over: Partial<Message> = {}): Message {
  return {
    id: id(n),
    channel_id: 'c1',
    place_id: 'p1',
    author: user('ana', 'Ana L.'),
    content: `message ${n}`,
    reply_to_id: null,
    // The generated types miss that the server sends null for these.
    reply_to: null as unknown as Message['reply_to'],
    mentions: [],
    reactions: [],
    attachments: [],
    embeds: [],
    is_pinned: false,
    pinned_at: null,
    thread: null as unknown as Message['thread'],
    edit_count: 0,
    edited_at: null,
    created_at: new Date(2026, 9, 3, 10, n).toISOString(),
    ...over,
  };
}

describe('mergeMessages', () => {
  it('adds, replaces and orders by id without duplicates', () => {
    const held = [msg(1), msg(3)];
    const out = mergeMessages(held, [msg(2), msg(3, { content: 'edited' }), msg(3, { content: 'edited' })]);
    expect(out.map((m) => m.id)).toEqual([id(1), id(2), id(3)]);
    expect(out[2]!.content).toBe('edited');
  });

  it('keeps the own-reaction flags that gateway copies lack', () => {
    const held = msg(1, { reactions: [{ emoji: '👍', count: 2, me: true }] });
    const incoming = msg(1, { content: 'edited', reactions: [{ emoji: '👍', count: 2, me: false }, { emoji: '🎉', count: 1, me: false }] });
    expect(keepOwnReactions(incoming, held).reactions).toEqual([
      { emoji: '👍', count: 2, me: true },
      { emoji: '🎉', count: 1, me: false },
    ]);
    expect(mergeMessages([held], [incoming])[0]!.reactions![0]!.me).toBe(true);
  });
});

describe('applyReaction', () => {
  it('counts other people and is idempotent for the own optimistic reaction', () => {
    let m = msg(1);
    m = applyReaction(m, '👍', true, true);
    expect(m.reactions).toEqual([{ emoji: '👍', count: 1, me: true }]);
    m = applyReaction(m, '👍', true, true);
    expect(m.reactions).toEqual([{ emoji: '👍', count: 1, me: true }]);
    m = applyReaction(m, '👍', true, false);
    expect(m.reactions).toEqual([{ emoji: '👍', count: 2, me: true }]);
    m = applyReaction(m, '👍', false, true);
    expect(m.reactions).toEqual([{ emoji: '👍', count: 1, me: false }]);
    m = applyReaction(m, '👍', false, true);
    expect(m.reactions).toEqual([{ emoji: '👍', count: 1, me: false }]);
    m = applyReaction(m, '👍', false, false);
    expect(m.reactions).toEqual([]);
  });
});

describe('feed layout', () => {
  const now = new Date(2026, 9, 3, 12);

  it('groups an author’s consecutive messages and breaks on replies, days and the New marker', () => {
    const msgs = [
      msg(1, { author: user('jonas', 'Jonas P.') }),
      msg(2),
      msg(3),
      msg(4, { reply_to_id: id(2) }),
      msg(20),
      msg(21),
      msg(22, { created_at: new Date(2026, 9, 4, 9).toISOString() }),
    ];
    const items = buildFeed(msgs, { newMarkerBefore: id(21), now });
    expect(items.map((i) => (i.kind === 'message' ? `${i.continued ? '+' : ''}${parseInt(i.message.id.slice(4, 8), 16)}` : i.kind === 'day' ? `[${i.label}]` : '|new|'))).toEqual([
      '[Today]',
      '1',
      '2',
      '+3',
      '4',
      '20',
      '|new|',
      '21',
      '[Sunday 4 October]',
      '22',
    ]);
  });

  it('labels days', () => {
    expect(dayLabel(new Date(2026, 9, 2, 8).toISOString(), now)).toBe('Yesterday');
    expect(dayLabel(new Date(2025, 0, 6).toISOString(), now)).toBe('Monday 6 January 2025');
  });

  it('puts the New marker before the first unread message from someone else', () => {
    const msgs = [msg(1), msg(2, { author: user('me') }), msg(3)];
    expect(firstUnreadId(msgs, id(1), 'me')).toBe(id(3));
    expect(firstUnreadId(msgs, null, 'me')).toBe(id(1));
    expect(firstUnreadId(msgs, id(3), 'me')).toBeNull();
    expect(firstUnreadId(msgs, undefined, 'me')).toBeNull();
  });
});

describe('text helpers', () => {
  it('describes who is typing', () => {
    expect(typingText([])).toBe('');
    expect(typingText(['Jonas P.'])).toBe('Jonas P. is typing');
    expect(typingText(['Ana', 'Jonas'])).toBe('Ana and Jonas are typing');
    expect(typingText(['Ana', 'Jonas', 'Tomas', 'Marta', 'Dov'])).toBe('Ana, Jonas and 3 others are typing');
  });

  it('names conversations after the other people in them', () => {
    expect(conversationTitle({ name: '', recipients: [user('me'), user('jp', 'Jonas P.')] }, 'me')).toBe('Jonas P.');
    expect(conversationTitle({ name: '', recipients: [user('me'), user('a', 'Ana Lima'), user('t', 'Tomas W.'), user('j', 'Jonas P.')] }, 'me')).toBe('Ana, Tomas, Jonas');
    expect(conversationTitle({ name: 'Shop crew', recipients: [] }, 'me')).toBe('Shop crew');
  });

  it('previews Markdown as one plain line', () => {
    expect(previewText('**Sent** you [the photos](https://x) of the `#7`\n\n> nice')).toBe('Sent you the photos of the #7 nice');
    expect(previewText('a'.repeat(200), 10)).toBe('aaaaaaaaa…');
  });

  it('validates message length', () => {
    expect(validateMessage('  ')).toMatch(/Write/);
    expect(validateMessage('x'.repeat(4001))).toMatch(/4,000/);
    expect(validateMessage('hi')).toBeNull();
  });

  it('makes unique nonces that fit the server limit', () => {
    const a = newNonce();
    expect(a.length).toBeLessThanOrEqual(64);
    expect(newNonce()).not.toBe(a);
  });
});

describe('slash commands', () => {
  const bot = user('bot', 'Shop Bot');
  const commands: ChannelCommand[] = [
    {
      id: 'c1',
      application_id: 'a1',
      application_name: 'Shop Bot',
      bot,
      name: 'remind',
      description: 'Set a reminder',
      options: [
        { name: 'minutes', description: 'In how many minutes', type: 'integer', required: true },
        { name: 'loud', description: 'Ping everyone', type: 'boolean' },
        { name: 'text', description: 'What to say', type: 'string' },
      ],
    },
    { id: 'c2', application_id: 'a1', application_name: 'Shop Bot', bot, name: 'kudos', description: 'Thank someone', options: [{ name: 'who', description: 'Who', type: 'user', required: true }] },
  ];

  it('suggests while the name is typed', () => {
    expect(commandQuery('/rem')).toBe('rem');
    expect(commandQuery('/')).toBe('');
    expect(commandQuery('/remind 5')).toBeNull();
    expect(commandQuery('hello')).toBeNull();
  });

  it('fills options by position and by name, and gives the rest to the last text option', () => {
    expect(parseCommand('/remind 5 loud:yes text:"oil the planer" now', commands)).toMatchObject({
      command: { name: 'remind' },
      options: { minutes: 5, loud: true, text: 'oil the planer now' },
      lookups: [],
    });
    expect(parseCommand('/remind 10 false sharpen the chisels', commands)).toMatchObject({ options: { minutes: 10, loud: false, text: 'sharpen the chisels' } });
  });

  it('explains what is wrong', () => {
    expect(parseCommand('/remind', commands)).toEqual({ error: '/remind needs minutes: In how many minutes' });
    expect(parseCommand('/remind soon', commands)).toEqual({ error: 'minutes must be a whole number.' });
    expect(parseCommand('/remind 5 maybe', commands)).toEqual({ error: 'loud must be true or false.' });
  });

  it('asks for user and channel names to be looked up', () => {
    expect(parseCommand('/kudos @ana', commands)).toMatchObject({ options: {}, lookups: [{ option: 'who', kind: 'user', name: 'ana' }] });
    expect(parseCommand('/kudos 01900001-0000-7000-8000-000000000000', commands)).toMatchObject({ options: { who: '01900001-0000-7000-8000-000000000000' } });
  });

  it('leaves ordinary messages and unknown commands alone', () => {
    expect(parseCommand('hello /remind', commands)).toBeNull();
    expect(parseCommand('/shrug', commands)).toBeNull();
  });
});

describe('channel ordering', () => {
  const ch = (id: string, kind: ChatChannel['kind'], position: number, parent: string | null = null): ChatChannel => ({
    id,
    kind,
    position,
    parent_id: parent,
    place_id: 'p1',
    name: id,
    topic: '',
    is_nsfw: false,
    owner_id: null,
    thread_message_id: null,
    is_archived: false,
    message_count: 0,
    user_limit: 0,
    last_message_id: null,
    last_message_at: null,
    created_at: `2026-10-0${position % 9}T00:00:00Z`,
  });
  const list = [ch('market', 'category', 1), ch('bench', 'text', 0), ch('swap', 'text', 0, 'market'), ch('garage', 'text', 1, 'market'), ch('help', 'text', 2), ch('lounge', 'voice', 3), ch('events', 'category', 4), ch('stage', 'voice', 0, 'events'), ch('meetup', 'text', 5, 'events')];

  it('groups channels under their categories, loose ones first', () => {
    const s = channelSections(list);
    expect(s.loose.map((c) => c.id)).toEqual(['bench', 'help']);
    expect(s.categories.map((c) => [c.category.id, c.channels.map((x) => x.id)])).toEqual([
      ['market', ['swap', 'garage']],
      ['events', ['meetup', 'stage']],
    ]);
    expect(s.voice.map((c) => c.id)).toEqual(['lounge']);
  });

  it('moves a channel among its siblings by swapping their positions', () => {
    const siblings = channelSiblings(list, list[1]!);
    expect(siblings.map((c) => c.id)).toEqual(['bench', 'help']);
    expect(moveChannel(siblings, 'help', -1)).toEqual([
      { id: 'help', position: 0 },
      { id: 'bench', position: 2 },
    ]);
    expect(moveChannel(siblings, 'bench', -1)).toEqual([]);
  });

  it('spreads out tied positions', () => {
    const tied = [ch('a', 'text', 0), ch('b', 'text', 0), ch('c', 'text', 0)];
    expect(moveChannel(tied, 'c', -1)).toEqual([
      { id: 'c', position: 1 },
      { id: 'b', position: 2 },
    ]);
  });
});
