import type { Schemas } from '@gotalk/api-client';

import { relativeTime } from './time.ts';

export type TokenScope = 'read' | 'write' | 'gateway' | 'admin';
export type CommandOptionType = Schemas['CommandOption']['type'];
export type CommandDraft = {
  name: string;
  description: string;
  options: Array<{ name: string; description: string; type: CommandOptionType; required?: boolean }>;
};
export type PolicyKind = Schemas['PolicySummary']['kind'];

const commandName = /^[a-z0-9_-]{1,32}$/;

export const TOKEN_SCOPES: ReadonlyArray<{ value: TokenScope; label: string; description: string }> = [
  { value: 'read', label: 'Read', description: 'GET requests' },
  { value: 'write', label: 'Write', description: 'Posting, editing, moderating and other changes' },
  { value: 'gateway', label: 'Gateway', description: 'Real-time events over WebSocket' },
  { value: 'admin', label: 'Admin', description: 'Keep instance administrator powers' },
];

export const TOKEN_EXPIRY_CHOICES: ReadonlyArray<{ days: number; label: string }> = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 366, label: '1 year' },
  { days: 0, label: 'Never' },
];

export function tokenScopeDescription(scope: string): string {
  return TOKEN_SCOPES.find((s) => s.value === scope)?.label ?? scope;
}

export function describeTokenExpiry(expiresAt: string | null | undefined, expired = false, now: Date = new Date()): string {
  if (expired) return 'expired';
  if (!expiresAt) return 'never expires';
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (!(ms > 0)) return 'expired';
  const days = Math.ceil(ms / 86400000);
  if (days === 1) return 'expires tomorrow';
  if (days < 60) return `expires in ${days} days`;
  if (days < 370) return `expires in ${Math.round(days / 30)} months`;
  return `expires ${new Date(expiresAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}`;
}

export function describeLastTokenUse(usedAt: string | null | undefined, now: Date = new Date()): string {
  return usedAt ? `Last used ${relativeTime(usedAt, now)}` : 'Never used';
}

export function webhookHealth(webhook: Pick<Schemas['Webhook'], 'active' | 'disabled_reason' | 'consecutive_failures'>): {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
} {
  if (!webhook.active) return { label: 'Disabled', tone: webhook.disabled_reason ? 'warning' : 'neutral' };
  if (webhook.consecutive_failures > 0) return { label: `Failing · ${webhook.consecutive_failures} in a row`, tone: 'warning' };
  return { label: 'Active', tone: 'success' };
}

export function deliveryStatus(delivery: Pick<Schemas['WebhookDelivery'], 'status' | 'response_status' | 'next_attempt_at'>, now: Date = new Date()): {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
} {
  if (delivery.status === 'succeeded') return { label: delivery.response_status ? String(delivery.response_status) : 'Succeeded', tone: 'success' };
  if (delivery.status === 'failed') return { label: delivery.response_status ? String(delivery.response_status) : 'Failed', tone: 'danger' };
  if (!delivery.next_attempt_at) return { label: 'Pending', tone: 'neutral' };
  const seconds = Math.max(0, Math.round((new Date(delivery.next_attempt_at).getTime() - now.getTime()) / 1000));
  const minutes = Math.ceil(seconds / 60);
  return { label: minutes > 0 ? `Pending · retry in ${minutes} min` : 'Pending · retry soon', tone: 'neutral' };
}

const WEBHOOK_EVENTS: Record<string, { description: string; requires?: 'VIEW_AUDIT_LOG' | 'MANAGE_REPORTS' }> = {
  'member.join': { description: 'Someone joins the place' },
  'member.leave': { description: 'Someone leaves, or is kicked or banned' },
  'message.create': { description: 'A chat message is sent' },
  'message.update': { description: 'A chat message is edited' },
  'message.delete': { description: 'A chat message is deleted' },
  'topic.create': { description: 'A forum topic is started' },
  'post.create': { description: 'A forum reply is posted' },
  'report.create': { description: 'A member reports something', requires: 'MANAGE_REPORTS' },
  'moderation.action': { description: 'A moderator takes an action', requires: 'VIEW_AUDIT_LOG' },
};

/** What a webhook event means, and the permission the server requires to subscribe to it. */
export function webhookEventInfo(event: string): { description: string; requires?: 'VIEW_AUDIT_LOG' | 'MANAGE_REPORTS' } {
  return WEBHOOK_EVENTS[event] ?? { description: '' };
}
export function policyKindLabel(kind: string): string {
  switch (kind) {
    case 'terms':
      return 'Terms of service';
    case 'privacy':
      return 'Privacy policy';
    case 'guidelines':
      return 'Community guidelines';
    default:
      return kind.replace(/_/g, ' ');
  }
}

export function policyVersionState(effectiveAt: string, now: Date = new Date()): 'scheduled' | 'current' {
  return new Date(effectiveAt).getTime() > now.getTime() ? 'scheduled' : 'current';
}

export function validateCommandDrafts(commands: readonly CommandDraft[]): string | null {
  if (commands.length > 50) return 'An application can have at most 50 commands.';
  const seen = new Set<string>();
  for (const command of commands) {
    const name = command.name.trim();
    if (!commandName.test(name)) return `Command name "${name || '(blank)'}" must be 1-32 lowercase letters, numbers, "-" or "_".`;
    const description = command.description.trim();
    if (!description || description.length > 100) return `Command "${name}" needs a description of 1-100 characters.`;
    if (seen.has(name)) return `Command "${name}" is defined twice.`;
    seen.add(name);
    if (command.options.length > 10) return `Command "${name}" can have at most 10 options.`;
    const options = new Set<string>();
    for (const option of command.options) {
      const optionName = option.name.trim();
      if (!commandName.test(optionName)) return `Option name "${optionName || '(blank)'}" must be 1-32 lowercase letters, numbers, "-" or "_".`;
      const optionDescription = option.description.trim();
      if (!optionDescription || optionDescription.length > 100) return `Option "${optionName}" needs a description of 1-100 characters.`;
      if (options.has(optionName)) return `Command "${name}" defines option "${optionName}" twice.`;
      options.add(optionName);
    }
  }
  return null;
}

export function normalizeCommandDrafts(commands: readonly CommandDraft[]): CommandDraft[] {
  return commands
    .map((command) => ({
      name: command.name.trim(),
      description: command.description.trim(),
      options: command.options.map((option) => ({
        name: option.name.trim(),
        description: option.description.trim(),
        type: option.type,
        required: !!option.required,
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
