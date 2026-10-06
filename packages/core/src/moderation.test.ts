import { describe, expect, it } from 'vitest';

import {
  auditUserIds,
  banExpiry,
  breakdownRows,
  describeAuditEntry,
  durationPhrase,
  isTimedOut,
  reportReasonLabel,
  timeLeft,
  transparencyActionLabel,
  transparencyRange,
} from './moderation.ts';

const now = new Date('2026-03-02T12:00:00Z');
const later = (seconds: number) => new Date(now.getTime() + seconds * 1000).toISOString();

const marta = { id: 'u-marta', display_name: 'Marta K.', username: 'marta', avatar_url: null, bio: '', pronouns: '', bot: false, created_at: '' };
const entry = (action: string, extra: Partial<{ target_id: string | null; target_type: string; reason: string; metadata: Record<string, unknown> }> = {}) => ({
  action,
  actor: marta,
  actor_id: marta.id,
  target_type: 'user',
  target_id: 'u-tom',
  reason: '',
  metadata: {},
  ...extra,
});
const names = {
  user: (id: string) => ({ 'u-tom': 'Tom R.', 'u-jo': 'Jo P.' })[id],
  role: (id: string) => ({ 'r-mod': 'Moderator' })[id],
  channel: (id: string) => ({ 'c-bench': 'bench-talk' })[id],
  board: (id: string) => ({ 'b-joinery': 'Joinery' })[id],
};

describe('durations', () => {
  it('words lengths of time', () => {
    expect(durationPhrase(60)).toBe('1 minute');
    expect(durationPhrase(90)).toBe('90 seconds');
    expect(durationPhrase(300)).toBe('5 minutes');
    expect(durationPhrase(3600)).toBe('1 hour');
    expect(durationPhrase(5000)).toBe('83 minutes');
    expect(durationPhrase(7200)).toBe('2 hours');
    expect(durationPhrase(86400)).toBe('1 day');
    expect(durationPhrase(604800)).toBe('7 days');
  });

  it('counts down timeouts and bans', () => {
    expect(timeLeft(later(2 * 3600 - 10), now)).toBe('2 h left');
    expect(timeLeft(later(290), now)).toBe('5 min left');
    expect(timeLeft(later(3 * 86400), now)).toBe('3 days left');
    expect(timeLeft(later(-5), now)).toBeNull();
    expect(timeLeft(null, now)).toBeNull();
    expect(isTimedOut({ timeout_until: later(60) }, now)).toBe(true);
    expect(isTimedOut({ timeout_until: later(-60) }, now)).toBe(false);
    expect(banExpiry(null, now)).toBe('Permanent');
    expect(banExpiry(later(6 * 86400), now)).toBe('Lifts in 6 days');
    expect(banExpiry(later(86400 - 30), now)).toBe('Lifts in 1 day');
    expect(banExpiry(later(3 * 3600 - 30), now)).toBe('Lifts in 3 hours');
    expect(banExpiry(later(600), now)).toBe('Lifts soon');
  });

  it('labels report reasons', () => {
    expect(reportReasonLabel('off_topic')).toBe('Off topic');
    expect(reportReasonLabel('brand_new')).toBe('brand new');
  });
});

describe('describeAuditEntry', () => {
  it('words member actions with names and durations', () => {
    expect(describeAuditEntry(entry('member.ban', { reason: 'Spam', metadata: { expires_at: later(86400), duration_seconds: 604800 } }), names)).toEqual({
      actor: 'Marta K.',
      summary: 'banned Tom R. for 7 days',
      reason: 'Spam',
      detail: null,
    });
    expect(describeAuditEntry(entry('member.ban'), names).summary).toBe('banned Tom R.');
    const dayBan = { ...entry('member.ban', { metadata: { expires_at: '2026-03-03T12:00:00Z' } }), created_at: '2026-03-02T12:00:00.4Z' };
    expect(describeAuditEntry(dayBan, names).summary).toBe('banned Tom R. for 1 day');
    expect(describeAuditEntry(entry('member.ban', { metadata: { expires_at: '2026-03-03T12:00:00Z' } }), names).summary).toMatch(/^banned Tom R\. until /);
    expect(describeAuditEntry(entry('member.timeout', { metadata: { duration_seconds: 3600 } }), names).summary).toBe('timed out Tom R. for 1 hour');
    expect(describeAuditEntry(entry('member.role_add', { metadata: { role_id: 'r-x', role_name: 'Helper' } }), names).summary).toBe('gave Tom R. the Helper role');
    expect(describeAuditEntry(entry('member.kick', { target_id: 'u-gone' }), names).summary).toBe('kicked a former member');
  });

  it('names channels, roles and authors from what is loaded', () => {
    expect(describeAuditEntry(entry('message.delete', { target_type: 'message', target_id: 'm1', metadata: { channel_id: 'c-bench', author_id: 'u-jo', content: 'buy now' } }), names)).toMatchObject({
      summary: 'removed a message by Jo P. in #bench-talk',
      detail: 'buy now',
    });
    expect(describeAuditEntry(entry('channel.overwrite_update', { target_type: 'channel', target_id: 'c-bench', metadata: { role_id: 'r-mod', allow: 1, deny: 0 } }), names).summary).toBe(
      'changed the overrides of Moderator in #bench-talk',
    );
    expect(describeAuditEntry(entry('channel.create', { target_type: 'channel', target_id: 'c2', metadata: { name: 'Shop radio', kind: 'voice' } }), names).summary).toBe('created the voice channel Shop radio');
    expect(describeAuditEntry(entry('board.overwrite_delete', { target_type: 'board', target_id: 'b-joinery', metadata: { role_id: 'r-gone' } }), names).summary).toBe(
      'removed the overrides of a deleted role in the forum Joinery',
    );
    expect(describeAuditEntry(entry('role.update', { target_type: 'role', target_id: 'r-mod', metadata: { permissions: 5 } }), names).summary).toBe('changed the permissions of Moderator');
    expect(describeAuditEntry(entry('topic.update', { target_type: 'topic', metadata: { title: 'Dovetails', is_locked: true } }), names).summary).toBe('locked “Dovetails”');
  });

  it('credits the server for its own actions and falls back for unknown ones', () => {
    const system = { ...entry('webhook.disable', { target_type: 'webhook', target_id: 'w1', reason: '6 failed attempts', metadata: { name: 'CRM' } }), actor: null as never, actor_id: null };
    expect(describeAuditEntry(system, names)).toMatchObject({ actor: 'Gotalk', summary: 'turned off the webhook CRM after repeated failures', reason: '6 failed attempts' });
    expect(describeAuditEntry(entry('place.frobnicate'), names).summary).toBe('did place frobnicate');
  });

  it('lists the users an entry mentions', () => {
    expect(auditUserIds(entry('message.delete', { target_type: 'message', target_id: 'm1', metadata: { author_id: 'u-jo' } }))).toEqual(['u-jo']);
    expect(auditUserIds(entry('report.resolve', { target_type: 'report', target_id: 'r1', metadata: { user_id: 'u-tom' } }))).toEqual(['u-tom']);
    expect(auditUserIds(entry('member.warn'))).toEqual(['u-tom']);
  });
});

describe('transparency', () => {
  it('builds the period and sorted breakdowns', () => {
    expect(transparencyRange(30, now)).toEqual({ since: '2026-01-31T12:00:00.000Z', until: '2026-03-02T12:00:00.000Z' });
    const rows = breakdownRows({ spam: 2, harassment: 4, other: 0 }, reportReasonLabel);
    expect(rows.map((r) => [r.label, r.count, r.share])).toEqual([
      ['Harassment', 4, 1],
      ['Spam', 2, 0.5],
    ]);
    expect(breakdownRows(null, String)).toEqual([]);
    expect(transparencyActionLabel('member.timeout')).toBe('Timeouts');
    expect(transparencyActionLabel('channel.create')).toBe('Channel create');
  });
});
