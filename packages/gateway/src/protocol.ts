import type { Schemas } from '@gotalk/api-client';

/** Statuses a connection can report. `invisible` shows as offline to everyone else. */
export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible';
/** What other people see. */
export type VisibleStatus = 'online' | 'idle' | 'dnd' | 'offline';

/** Close codes the server uses (see the gateway section of the server README). */
export const CloseCode = {
  ServerShutdown: 1001,
  UnknownError: 4000,
  DecodeError: 4001,
  NotAuthenticated: 4002,
  AlreadyIdentified: 4003,
  AuthFailed: 4004,
  /** Events may have been missed: reconnect and refetch, there is nothing to resume. */
  Resync: 4007,
  RateLimited: 4008,
  HeartbeatTimeout: 4009,
  SessionEnded: 4010,
} as const;

export interface Frame {
  op: string;
  d?: unknown;
  t?: string;
}

export interface ReadyEvent {
  user: Schemas['SelfUser'];
  session_id: string;
  place_ids: string[];
  status: PresenceStatus;
  heartbeat_interval: number;
  voice_state: Schemas['VoiceState'] | null;
}

export interface MessageRef {
  id: string;
  channel_id: string;
  place_id: string | null;
}

export interface ReactionEvent {
  message_id: string;
  channel_id: string;
  place_id: string | null;
  user_id: string;
  emoji: string;
}

export interface TypingEvent {
  channel_id: string;
  place_id: string | null;
  user_id: string;
  timestamp: string;
}

/** Payloads by dispatch type. They use the REST API's JSON shapes. */
export interface GatewayEvents {
  READY: ReadyEvent;
  MESSAGE_CREATE: Schemas['Message'];
  /** Edits, pins and new threads. Reactions carry `me: false`; this event is the same for everyone. */
  MESSAGE_UPDATE: Schemas['Message'];
  MESSAGE_DELETE: MessageRef;
  MESSAGE_REACTION_ADD: ReactionEvent;
  MESSAGE_REACTION_REMOVE: ReactionEvent;
  TYPING_START: TypingEvent;
  /** Public fields only: no `my_permissions`, `read_state` or `unread`. */
  CHANNEL_CREATE: Schemas['Channel'];
  CHANNEL_UPDATE: Schemas['Channel'];
  CHANNEL_DELETE: Pick<Schemas['Channel'], 'id' | 'kind'> & Partial<Schemas['Channel']>;
  CHANNEL_RECIPIENT_ADD: { channel_id: string; user: Schemas['User'] };
  CHANNEL_RECIPIENT_REMOVE: { channel_id: string; user_id: string };
  CHANNEL_READ: { channel_id: string; last_read_message_id: string | null; mention_count: number };
  READ_RECEIPT: { channel_id: string; user_id: string; last_read_message_id: string | null };
  NOTIFICATION_CREATE: Schemas['Notification'];
  PRESENCE_UPDATE: { user_id: string; status: VisibleStatus };
  PLACE_JOIN: { place_id: string };
  PLACE_LEAVE: { place_id: string };
  PLACE_DELETE: { place_id: string };
  VOICE_STATE_UPDATE: Schemas['VoiceState'];
  VOICE_SERVER_UPDATE: Schemas['VoiceConnection'];
  VOICE_SPEAKING: { user_id: string; channel_id: string; place_id: string; speaking: boolean };
  INTERACTION_CREATE: Schemas['Interaction'];
}

export type GatewayEventType = keyof GatewayEvents;

/** A dispatch whose payload is typed by its event name. */
export type Dispatch = { [K in GatewayEventType]: { type: K; data: GatewayEvents[K] } }[GatewayEventType];
