import { plainText } from './markdown.ts';

/** The parts of a notification the inbox words and routes. Structural, so it fits the API type. */
export interface NotificationLike {
  kind: string;
  actor?: { display_name: string } | null;
  data: { [key: string]: unknown };
  topic_id: string | null;
  place_id: string | null;
}

export interface NotificationView {
  /** Who did it, shown in the stronger weight. Empty for system messages. */
  actor: string;
  /** What they did, following the actor. */
  action: string;
  /** Second line: the excerpt or reason, when there is one. */
  detail: string | null;
  /** Where the topic or place lives, shown as the last line. */
  context: string;
  icon: 'check' | 'reply' | 'at' | 'smile' | 'forum' | 'shield' | 'bell';
  /** Route target; `null` for kinds this client cannot open yet. */
  target: { placeSlug: string; topicId: string | null } | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function describeNotification(n: NotificationLike): NotificationView {
  const actor = n.actor?.display_name ?? '';
  const title = str(n.data.topic_title);
  const placeName = str(n.data.place_name);
  const placeSlug = str(n.data.place_slug);
  const excerpt = plainText(str(n.data.excerpt), 160);
  const target = placeSlug ? { placeSlug, topicId: n.topic_id } : null;
  const base = { actor, detail: excerpt ? `“${excerpt}”` : null, context: title ? `${title} · ${placeName}` : placeName, target };
  switch (n.kind) {
    case 'solution':
      return { ...base, detail: null, icon: 'check', action: 'accepted your reply as the solution' };
    case 'reply':
      return { ...base, context: placeName, icon: 'reply', action: title ? `replied to ${title}` : 'replied to you' };
    case 'topic_reply':
      return { ...base, context: placeName, icon: 'reply', action: title ? `replied in ${title}` : 'replied in a topic you watch' };
    case 'mention':
      return { ...base, context: placeName, icon: 'at', action: title ? `mentioned you in ${title}` : 'mentioned you' };
    case 'reaction': {
      const emoji = str(n.data.emoji);
      return { ...base, detail: null, icon: 'smile', action: `reacted${emoji ? ` ${emoji}` : ''} to your post${title ? ` in ${title}` : ''}` };
    }
    case 'new_topic':
      return { ...base, detail: null, context: placeName, icon: 'forum', action: `started a topic${title ? `: ${title}` : ''}` };
    case 'moderation': {
      const reason = str(n.data.reason);
      const action = str(n.data.action);
      const until = str(n.data.until);
      const words: Record<string, string> = {
        'member.warn': 'You received a warning from the moderators',
        'member.timeout': until
          ? `You were timed out until ${new Date(until).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
          : 'You were timed out',
        'message.delete': 'A moderator removed your message',
        'post.delete': 'A moderator removed your post',
        'topic.delete': 'A moderator removed your topic',
      };
      const what = action.replace(/[._]/g, ' ');
      return {
        ...base,
        actor: '',
        icon: 'shield',
        action: words[action] ?? (what ? `A moderator took action: ${what}` : 'A moderator took action'),
        detail: reason ? `Reason: ${reason}` : null,
        context: placeName,
      };
    }
    case 'direct_message':
      return { ...base, detail: null, icon: 'bell', action: 'sent you a message', context: '', target: null };
    default:
      return { ...base, icon: 'bell', action: 'sent a notification', target: n.topic_id ? target : null };
  }
}
