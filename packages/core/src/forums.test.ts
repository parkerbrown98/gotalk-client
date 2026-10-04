import { describe, expect, it } from 'vitest';

import { applyFormat, completeMention, draftKeys, findMentionQuery, parseDraft, validatePost, validateTopic } from './composer.ts';
import { extractMentions, parseMarkdown, plainText, sanitizeHref, splitHighlights } from './markdown.ts';

describe('sanitizeHref', () => {
  it('allows http, https and mailto only', () => {
    expect(sanitizeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(sanitizeHref('http://example.com')).toBe('http://example.com');
    expect(sanitizeHref('mailto:a@b.co')).toBe('mailto:a@b.co');
    expect(sanitizeHref('javascript:alert(1)')).toBeNull();
    expect(sanitizeHref('JaVaScRiPt:alert(1)')).toBeNull();
    expect(sanitizeHref('data:text/html,<script>')).toBeNull();
    expect(sanitizeHref('//evil.example')).toBeNull();
    expect(sanitizeHref('/relative')).toBeNull();
    expect(sanitizeHref('https://exa mple.com')).toBeNull();
  });
});

describe('parseMarkdown', () => {
  it('parses inline formatting', () => {
    const [p] = parseMarkdown('Hello **bold** and *em* and `code` and ~~gone~~');
    expect(p).toMatchObject({ type: 'paragraph' });
    const kinds = (p as { children: Array<{ type: string }> }).children.map((c) => c.type);
    expect(kinds).toEqual(['text', 'strong', 'text', 'em', 'text', 'code', 'text', 'del']);
  });

  it('does not unescape or double-escape text', () => {
    const [p] = parseMarkdown('Tom & Jerry "quoted" <3');
    expect(p).toEqual({ type: 'paragraph', children: [{ type: 'text', text: 'Tom & Jerry "quoted" <3' }] });
  });

  it('keeps raw HTML as visible text', () => {
    const blocks = parseMarkdown('<script>alert(1)</script>\n\nhi <b>there</b>');
    expect(JSON.stringify(blocks)).toContain('<script>alert(1)</script>');
    expect(JSON.stringify(blocks)).not.toContain('"type":"html"');
  });

  it('drops unsafe link targets but keeps the label', () => {
    const [p] = parseMarkdown('[click](javascript:alert(1)) and [ok](https://example.com)');
    const children = (p as { children: Array<{ type: string; href?: string }> }).children;
    expect(children.some((c) => c.type === 'link' && c.href === 'https://example.com')).toBe(true);
    expect(children.some((c) => c.type === 'link' && c.href?.startsWith('javascript'))).toBe(false);
    expect(plainText('[click](javascript:alert(1))')).toBe('click');
  });

  it('links bare URLs and turns images into links', () => {
    const [p] = parseMarkdown('see https://example.com/x and ![alt](https://example.com/i.png)');
    const links = (p as { children: Array<{ type: string; href?: string }> }).children.filter((c) => c.type === 'link');
    expect(links.map((l) => l.href)).toEqual(['https://example.com/x', 'https://example.com/i.png']);
  });

  it('parses blocks', () => {
    const blocks = parseMarkdown('# Title\n\n> quoted\n\n- a\n- b\n\n1. one\n2. two\n\n```ts\nconst x = 1;\n```\n\n---\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'quote', 'list', 'list', 'code', 'hr', 'table']);
    expect(blocks[2]).toMatchObject({ ordered: false });
    expect(blocks[3]).toMatchObject({ ordered: true, start: 1 });
    expect(blocks[4]).toMatchObject({ lang: 'ts', text: 'const x = 1;' });
  });

  it('keeps single line breaks', () => {
    const [p] = parseMarkdown('one\ntwo');
    expect((p as { children: Array<{ type: string }> }).children.map((c) => c.type)).toContain('br');
  });
});

describe('mentions', () => {
  it('finds mentions outside code, like the server does', () => {
    expect(extractMentions('hi @Ana.L and @bob_b, not email me@host.com or `@code` or @ab')).toEqual(['ana.l', 'bob_b']);
    expect(extractMentions('```\n@fenced\n```\n@real-one')).toEqual(['real-one']);
  });

  it('renders mentions as nodes', () => {
    const [p] = parseMarkdown('ping @ana.l now');
    expect((p as { children: Array<{ type: string }> }).children.map((c) => c.type)).toEqual(['text', 'mention', 'text']);
  });
});

describe('plainText', () => {
  it('flattens and truncates', () => {
    expect(plainText('# Hi\n\nsome **bold** text')).toBe('Hi some bold text');
    expect(plainText('x'.repeat(300), 50)).toHaveLength(50);
  });
});

describe('splitHighlights', () => {
  it('alternates plain and matched runs', () => {
    expect(splitHighlights('the **baseline** is **crushed**')).toEqual([
      { text: 'the ', match: false },
      { text: 'baseline', match: true },
      { text: ' is ', match: false },
      { text: 'crushed', match: true },
    ]);
  });
});

describe('applyFormat', () => {
  it('wraps a selection and keeps it selected', () => {
    expect(applyFormat('make bold now', { start: 5, end: 9 }, 'bold')).toEqual({ value: 'make **bold** now', selection: { start: 7, end: 11 } });
  });

  it('inserts a placeholder when nothing is selected', () => {
    const r = applyFormat('', { start: 0, end: 0 }, 'italic');
    expect(r.value).toBe('*italic text*');
    expect(r.value.slice(r.selection.start, r.selection.end)).toBe('italic text');
  });

  it('uses a fence for multi-line code and selects the address of a link', () => {
    expect(applyFormat('a\nb', { start: 0, end: 3 }, 'code').value).toBe('```\na\nb\n```');
    const l = applyFormat('docs', { start: 0, end: 4 }, 'link');
    expect(l.value).toBe('[docs](https://)');
    expect(l.value.slice(l.selection.start, l.selection.end)).toBe('https://');
  });

  it('quotes every selected line', () => {
    expect(applyFormat('a\nb\nc', { start: 2, end: 5 }, 'quote').value).toBe('a\n> b\n> c');
  });
});

describe('mention autocomplete', () => {
  it('finds the name being typed', () => {
    expect(findMentionQuery('hello @an', 9)).toEqual({ start: 6, query: 'an' });
    expect(findMentionQuery('@', 1)).toEqual({ start: 0, query: '' });
    expect(findMentionQuery('mail me@host', 12)).toBeNull();
    expect(findMentionQuery('hello @an world', 15)).toBeNull();
  });

  it('completes in place', () => {
    const m = findMentionQuery('hi @an there', 6)!;
    expect(completeMention('hi @an there', 6, m, 'ana.l')).toEqual({ value: 'hi @ana.l  there', selection: { start: 10, end: 10 } });
  });
});

describe('validation and drafts', () => {
  it('mirrors the server limits', () => {
    expect(validateTopic({ title: '  ', content: 'x', tags: [] })?.field).toBe('title');
    expect(validateTopic({ title: 'ok', content: ' ', tags: [] })?.field).toBe('content');
    expect(validateTopic({ title: 'ok', content: 'x', tags: ['a', 'b', 'c', 'd', 'e', 'f'] })?.field).toBe('tags');
    expect(validateTopic({ title: 'ok', content: 'x', tags: [] })).toBeNull();
    expect(validatePost('x'.repeat(50_001))?.field).toBe('content');
  });

  it('builds draft keys the server accepts', () => {
    const id = '0190a3c2-1d3e-7c11-9a5e-0123456789ab';
    for (const k of [draftKeys.topic(id), draftKeys.reply(id), draftKeys.reply(id, id)]) expect(k).toMatch(/^[a-zA-Z0-9:_.-]{1,100}$/);
  });

  it('reads draft data defensively', () => {
    expect(parseDraft({ content: 'hi', title: 't', tags: ['a', 1] })).toEqual({ content: 'hi', title: 't', tags: ['a'] });
    expect(parseDraft({})).toBeNull();
    expect(parseDraft(null)).toBeNull();
  });
});
