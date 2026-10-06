import { describe, expect, it } from 'vitest';

import { describeNotification } from './notifications.ts';

const base = { actor: { display_name: 'Ana L.' }, topic_id: 't1', place_id: 'p1' };
const data = { place_name: 'Open Woodworkers', place_slug: 'open-woodworkers', topic_title: 'Dovetails keep gapping', excerpt: 'Try a marking gauge' };

describe('describeNotification', () => {
  it('words each forum kind and routes to the topic', () => {
    const reply = describeNotification({ ...base, kind: 'reply', data });
    expect(reply).toMatchObject({ actor: 'Ana L.', action: 'replied to Dovetails keep gapping', icon: 'reply', target: { placeSlug: 'open-woodworkers', topicId: 't1' } });
    expect(reply.detail).toBe('“Try a marking gauge”');
    expect(describeNotification({ ...base, kind: 'mention', data }).action).toBe('mentioned you in Dovetails keep gapping');
    expect(describeNotification({ ...base, kind: 'solution', data })).toMatchObject({ action: 'accepted your reply as the solution', detail: null, icon: 'check' });
    expect(describeNotification({ ...base, kind: 'reaction', data: { ...data, emoji: '👍' } }).action).toBe('reacted 👍 to your post in Dovetails keep gapping');
    expect(describeNotification({ ...base, kind: 'new_topic', data }).action).toBe('started a topic: Dovetails keep gapping');
  });

  it('shows moderation without an actor and keeps the reason', () => {
    const v = describeNotification({ ...base, kind: 'moderation', topic_id: null, data: { place_name: 'Open Woodworkers', place_slug: 'open-woodworkers', action: 'post_deleted', reason: 'Off topic' } });
    expect(v).toMatchObject({ actor: '', action: 'A moderator took action: post deleted', detail: 'Reason: Off topic', target: { placeSlug: 'open-woodworkers', topicId: null } });
  });

  it('words the moderation actions the server sends', () => {
    const data = { place_name: 'Open Woodworkers', place_slug: 'open-woodworkers', reason: 'Be kind' };
    expect(describeNotification({ ...base, kind: 'moderation', topic_id: null, data: { ...data, action: 'member.warn' } }).action).toBe('You received a warning from the moderators');
    expect(describeNotification({ ...base, kind: 'moderation', topic_id: null, data: { ...data, action: 'message.delete' } }).action).toBe('A moderator removed your message');
    const timeout = describeNotification({ ...base, kind: 'moderation', topic_id: null, data: { ...data, action: 'member.timeout', until: '2026-03-02T15:00:00Z' } });
    expect(timeout.action).toMatch(/^You were timed out until /);
    expect(timeout.detail).toBe('Reason: Be kind');
  });

  it('does not do anything for kinds it does not know', () => {
    expect(describeNotification({ ...base, kind: 'brand_new', data }).action).toBe('sent a notification');
  });

  it('shows the excerpt without Markdown syntax', () => {
    const v = describeNotification({ ...base, kind: 'mention', data: { ...data, excerpt: 'Try a **marking gauge** and `code`\n\n- one' } });
    expect(v.detail).toBe('“Try a marking gauge and code one”');
  });

  it('does not offer a target for direct messages yet, and survives missing data', () => {
    expect(describeNotification({ ...base, kind: 'direct_message', data: {} }).target).toBeNull();
    expect(describeNotification({ kind: 'reply', actor: null, topic_id: null, place_id: null, data: {} })).toMatchObject({ actor: '', action: 'replied to you', target: null });
  });
});
