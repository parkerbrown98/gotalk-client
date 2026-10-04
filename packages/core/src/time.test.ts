import { describe, expect, it } from 'vitest';

import { relativeTime, shortTime } from './time.ts';

const now = new Date('2026-09-10T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

describe('relativeTime', () => {
  it('words recent times', () => {
    expect(relativeTime(ago(10_000), now)).toBe('just now');
    expect(relativeTime(ago(12 * MIN), now)).toBe('12 min ago');
    expect(relativeTime(ago(3 * HOUR), now)).toBe('3 h ago');
    expect(relativeTime(ago(30 * HOUR), now)).toBe('Yesterday');
    expect(relativeTime(ago(4 * 24 * HOUR), now)).toBe('4 days ago');
    expect(relativeTime('nonsense', now)).toBe('');
  });
});

describe('shortTime', () => {
  it('stays compact', () => {
    expect(shortTime(ago(5_000), now)).toBe('now');
    expect(shortTime(ago(12 * MIN), now)).toBe('12 m');
    expect(shortTime(ago(3 * HOUR), now)).toBe('3 h');
    expect(shortTime(ago(2 * 24 * HOUR), now)).toBe('2 d');
  });
});
