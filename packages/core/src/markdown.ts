import { Lexer, type Token, type Tokens } from 'marked';

/**
 * Markdown to a small, closed tree. Renderers walk this tree, so nothing the author types can become
 * markup or script: raw HTML is kept as text, link targets are checked, and unknown tokens fall back
 * to their source text.
 */
export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'del'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'mention'; username: string }
  | { type: 'br' };

export type Block =
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'heading'; depth: number; children: Inline[] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'quote'; children: Block[] }
  | { type: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { type: 'table'; header: Inline[][]; rows: Inline[][][] }
  | { type: 'hr' };

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** The link target when it is safe to open, otherwise `null`. Only http(s) and mailto links are allowed. */
export function sanitizeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href || /[\u0000-\u001f\u007f\s]/.test(href)) return null;
  try {
    const url = new URL(href);
    return SAFE_PROTOCOLS.has(url.protocol) ? href : null;
  } catch {
    return null;
  }
}

/** Same rule the server uses to find mentions: not preceded by a word character, `@`, `.`, `/` or `-`. */
const MENTION = /(^|[^\w@./-])@([a-zA-Z0-9_.-]{3,32})/g;

/** Usernames mentioned in text, outside code, lowercased and without duplicates. */
export function extractMentions(markdown: string): string[] {
  const found = new Set<string>();
  const walk = (inlines: Inline[]) => {
    for (const n of inlines) {
      if (n.type === 'mention') found.add(n.username.toLowerCase());
      else if ('children' in n) walk(n.children);
    }
  };
  const blocks = (list: Block[]) => {
    for (const b of list) {
      if (b.type === 'paragraph' || b.type === 'heading') walk(b.children);
      else if (b.type === 'quote') blocks(b.children);
      else if (b.type === 'list') b.items.forEach(blocks);
      else if (b.type === 'table') {
        b.header.forEach(walk);
        b.rows.forEach((r) => r.forEach(walk));
      }
    }
  };
  blocks(parseMarkdown(markdown));
  return [...found];
}

function withMentions(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION)) {
    const at = (m.index ?? 0) + (m[1]?.length ?? 0);
    if (at > last) out.push({ type: 'text', text: text.slice(last, at) });
    out.push({ type: 'mention', username: m[2]! });
    last = at + 1 + m[2]!.length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

function inlines(tokens: Token[] | undefined, fallback = ''): Inline[] {
  if (!tokens) return fallback ? [{ type: 'text', text: fallback }] : [];
  const out: Inline[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'text':
      case 'escape': {
        const tt = t as Tokens.Text | Tokens.Escape;
        if ('tokens' in tt && tt.tokens?.length) out.push(...inlines(tt.tokens, tt.text));
        else out.push(...withMentions(tt.text));
        break;
      }
      case 'strong':
        out.push({ type: 'strong', children: inlines((t as Tokens.Strong).tokens) });
        break;
      case 'em':
        out.push({ type: 'em', children: inlines((t as Tokens.Em).tokens) });
        break;
      case 'del':
        out.push({ type: 'del', children: inlines((t as Tokens.Del).tokens) });
        break;
      case 'codespan':
        out.push({ type: 'code', text: (t as Tokens.Codespan).text });
        break;
      case 'br':
        out.push({ type: 'br' });
        break;
      case 'link': {
        const l = t as Tokens.Link;
        const href = sanitizeHref(l.href);
        const children = inlines(l.tokens, l.text);
        if (href) out.push({ type: 'link', href, children });
        else out.push(...children);
        break;
      }
      case 'image': {
        // Remote images are not loaded from post text; the alt text links to the source instead.
        const i = t as Tokens.Image;
        const href = sanitizeHref(i.href);
        const label: Inline[] = [{ type: 'text', text: i.text || i.href }];
        out.push(href ? { type: 'link', href, children: label } : { type: 'text', text: i.text });
        break;
      }
      default:
        // Inline HTML and anything unknown stay visible as plain text.
        out.push({ type: 'text', text: (t as { raw?: string }).raw ?? '' });
    }
  }
  return out;
}

function blocks(tokens: Token[]): Block[] {
  const out: Block[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'paragraph':
      case 'text': {
        const p = t as Tokens.Paragraph | Tokens.Text;
        out.push({ type: 'paragraph', children: inlines(p.tokens, p.text) });
        break;
      }
      case 'heading': {
        const h = t as Tokens.Heading;
        out.push({ type: 'heading', depth: h.depth, children: inlines(h.tokens, h.text) });
        break;
      }
      case 'code': {
        const c = t as Tokens.Code;
        out.push({ type: 'code', lang: c.lang ?? '', text: c.text });
        break;
      }
      case 'blockquote':
        out.push({ type: 'quote', children: blocks((t as Tokens.Blockquote).tokens) });
        break;
      case 'list': {
        const l = t as Tokens.List;
        out.push({ type: 'list', ordered: l.ordered, start: typeof l.start === 'number' ? l.start : 1, items: l.items.map((i) => blocks(i.tokens)) });
        break;
      }
      case 'table': {
        const tb = t as Tokens.Table;
        out.push({ type: 'table', header: tb.header.map((c) => inlines(c.tokens, c.text)), rows: tb.rows.map((r) => r.map((c) => inlines(c.tokens, c.text))) });
        break;
      }
      case 'hr':
        out.push({ type: 'hr' });
        break;
      case 'space':
      case 'def':
        break;
      default: {
        // Raw HTML blocks render as the text the author typed.
        const raw = ((t as { raw?: string }).raw ?? '').trim();
        if (raw) out.push({ type: 'paragraph', children: [{ type: 'text', text: raw }] });
      }
    }
  }
  return out;
}

export function parseMarkdown(source: string): Block[] {
  return blocks(new Lexer({ gfm: true, breaks: true }).lex(source));
}

/** Plain text of a post for previews: the Markdown without its syntax, on one line. */
export function plainText(source: string, max = 200): string {
  const parts: string[] = [];
  const walk = (list: Inline[]) => {
    for (const n of list) {
      if (n.type === 'text' || n.type === 'code') parts.push(n.text);
      else if (n.type === 'mention') parts.push(`@${n.username}`);
      else if (n.type === 'br') parts.push(' ');
      else walk(n.children);
    }
  };
  const visit = (list: Block[]) => {
    for (const b of list) {
      if (b.type === 'paragraph' || b.type === 'heading') walk(b.children);
      else if (b.type === 'code') parts.push(b.text);
      else if (b.type === 'quote') visit(b.children);
      else if (b.type === 'list') b.items.forEach(visit);
      parts.push(' ');
    }
  };
  visit(parseMarkdown(source));
  const text = parts.join('').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** A search snippet from the server marks matches with `**`; this splits it into plain and matched runs. */
export function splitHighlights(snippet: string): Array<{ text: string; match: boolean }> {
  return snippet
    .split('**')
    .map((text, i) => ({ text, match: i % 2 === 1 }))
    .filter((p) => p.text.length > 0);
}
