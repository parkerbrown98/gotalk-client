import { describe, expect, it } from 'vitest';

import {
  deliveryStatus,
  describeLastTokenUse,
  describeTokenExpiry,
  normalizeCommandDrafts,
  policyKindLabel,
  policyVersionState,
  tokenScopeDescription,
  validateCommandDrafts,
  webhookEventInfo,
  webhookHealth,
} from './developer.ts';

const now = new Date('2026-03-02T12:00:00Z');
const later = (days: number) => new Date(now.getTime() + days * 86400000).toISOString();

describe('tokens', () => {
  it('describes scopes, use and expiry', () => {
    expect(tokenScopeDescription('gateway')).toBe('Gateway');
    expect(tokenScopeDescription('custom')).toBe('custom');
    expect(describeLastTokenUse(null, now)).toBe('Never used');
    expect(describeLastTokenUse('2026-03-02T09:00:00Z', now)).toBe('Last used 3 h ago');
    expect(describeTokenExpiry(null, false, now)).toBe('never expires');
    expect(describeTokenExpiry(later(1), false, now)).toBe('expires tomorrow');
    expect(describeTokenExpiry(later(26), false, now)).toBe('expires in 26 days');
    expect(describeTokenExpiry(later(-1), false, now)).toBe('expired');
    expect(describeTokenExpiry(later(10), true, now)).toBe('expired');
  });
});

describe('webhooks', () => {
  it('summarizes webhook and delivery health', () => {
    expect(webhookHealth({ active: true, disabled_reason: '', consecutive_failures: 0 })).toEqual({ label: 'Active', tone: 'success' });
    expect(webhookHealth({ active: true, disabled_reason: '', consecutive_failures: 3 })).toEqual({ label: 'Failing · 3 in a row', tone: 'warning' });
    expect(webhookHealth({ active: false, disabled_reason: '6 failed attempts', consecutive_failures: 6 })).toEqual({ label: 'Disabled', tone: 'warning' });
    expect(webhookEventInfo('report.create')).toEqual({ description: 'A member reports something', requires: 'MANAGE_REPORTS' });
    expect(webhookEventInfo('brand.new')).toEqual({ description: '' });
    expect(deliveryStatus({ status: 'succeeded', response_status: 204, next_attempt_at: null }, now)).toEqual({ label: '204', tone: 'success' });
    expect(deliveryStatus({ status: 'failed', response_status: null, next_attempt_at: null }, now)).toEqual({ label: 'Failed', tone: 'danger' });
    expect(deliveryStatus({ status: 'pending', response_status: null, next_attempt_at: later(0.01) }, now)).toEqual({ label: 'Pending · retry in 15 min', tone: 'neutral' });
  });
});

describe('policies', () => {
  it('labels kinds and version states', () => {
    expect(policyKindLabel('terms')).toBe('Terms of service');
    expect(policyKindLabel('brand_new')).toBe('brand new');
    expect(policyVersionState('2026-03-03T00:00:00Z', now)).toBe('scheduled');
    expect(policyVersionState('2026-03-01T00:00:00Z', now)).toBe('current');
  });
});

describe('commands', () => {
  it('validates server constraints and normalizes command drafts', () => {
    expect(validateCommandDrafts([{ name: 'Timer', description: 'Start', options: [] }])).toMatch(/must be/);
    expect(validateCommandDrafts([{ name: 'timer', description: '', options: [] }])).toMatch(/description/);
    expect(
      validateCommandDrafts([
        { name: 'timer', description: 'Start', options: [] },
        { name: 'timer', description: 'Again', options: [] },
      ]),
    ).toMatch(/twice/);
    expect(validateCommandDrafts([{ name: 'timer', description: 'Start', options: [{ name: 'minutes', description: 'How long', type: 'integer', required: true }] }])).toBeNull();
    expect(normalizeCommandDrafts([{ name: ' zed ', description: '  Z ', options: [{ name: ' q ', description: ' Q ', type: 'string' }] }])).toEqual([
      { name: 'zed', description: 'Z', options: [{ name: 'q', description: 'Q', type: 'string', required: false }] },
    ]);
  });
});
