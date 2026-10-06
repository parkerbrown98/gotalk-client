import { unwrap, type Schemas } from '@gotalk/api-client';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useApiClient } from './api';
import { useActiveInstance } from './instances';

export type APIToken = Schemas['APIToken'];
export type CreatedAPIToken = Schemas['CreatedAPIToken'];
export type Application = Schemas['Application'];
export type ApplicationWithToken = Schemas['ApplicationWithToken'];
export type Command = Schemas['Command'];
export type CommandRequest = Schemas['CommandRequest'];
export type Webhook = Schemas['Webhook'];
export type WebhookDelivery = Schemas['WebhookDelivery'];
export type WebhookDeliveryStatus = WebhookDelivery['status'];
export type TransparencyReport = Schemas['TransparencyReport'];

const PAGE = 25;

function useContext() {
  const active = useActiveInstance();
  const client = useApiClient();
  return { inst: active?.id, client };
}

export const developerKeys = {
  tokens: (inst: string | undefined) => ['tokens', inst] as const,
  applications: (inst: string | undefined) => ['applications', inst] as const,
  application: (inst: string | undefined, id: string | undefined) => ['application', inst, id] as const,
  commands: (inst: string | undefined, id: string | undefined) => ['application-commands', inst, id] as const,
  webhooks: (inst: string | undefined, slug: string | undefined) => ['webhooks', inst, slug] as const,
  webhook: (inst: string | undefined, id: string | undefined) => ['webhook', inst, id] as const,
  deliveries: (inst: string | undefined, id: string | undefined, status: WebhookDeliveryStatus | 'all') => ['webhook-deliveries', inst, id, status] as const,
  transparency: (inst: string | undefined, place: string | undefined, days: number) => ['transparency', inst, place ?? 'instance', days] as const,
};

export function useTokens() {
  const { inst, client } = useContext();
  return useQuery({
    queryKey: developerKeys.tokens(inst),
    enabled: !!client,
    queryFn: async () => unwrap(await client!.GET('/users/@me/tokens')) ?? [],
  });
}

export function useTokenActions() {
  const { inst, client } = useContext();
  const qc = useQueryClient();
  return useMemo(() => {
    const api = () => {
      if (!client) throw new Error('No active instance');
      return client;
    };
    return {
      async create(input: { name: string; scopes: string[]; expires_in_days?: number }) {
        const token = unwrap(await api().POST('/users/@me/tokens', { body: { name: input.name, scopes: input.scopes, expires_in_days: input.expires_in_days } }));
        await qc.invalidateQueries({ queryKey: developerKeys.tokens(inst) });
        return token;
      },
      async revoke(id: string) {
        unwrap(await api().DELETE('/users/@me/tokens/{tokenID}', { params: { path: { tokenID: id } } }));
        await qc.invalidateQueries({ queryKey: developerKeys.tokens(inst) });
      },
    };
  }, [client, inst, qc]);
}

export function useApplications() {
  const { inst, client } = useContext();
  return useQuery({
    queryKey: developerKeys.applications(inst),
    enabled: !!client,
    queryFn: async () => unwrap(await client!.GET('/applications')) ?? [],
  });
}

export function useApplication(id: string | undefined) {
  const { inst, client } = useContext();
  return useQuery({
    queryKey: developerKeys.application(inst, id),
    enabled: !!client && !!id,
    queryFn: async () => unwrap(await client!.GET('/applications/{applicationID}', { params: { path: { applicationID: id! } } })),
  });
}

export function useApplicationCommands(id: string | undefined) {
  const { inst, client } = useContext();
  return useQuery({
    queryKey: developerKeys.commands(inst, id),
    enabled: !!client && !!id,
    queryFn: async () => unwrap(await client!.GET('/applications/{applicationID}/commands', { params: { path: { applicationID: id! } } })) ?? [],
  });
}

export function useApplicationActions(id?: string) {
  const { inst, client } = useContext();
  const qc = useQueryClient();
  const refresh = useCallback(
    async (appID?: string) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: developerKeys.applications(inst) }),
        appID ? qc.invalidateQueries({ queryKey: developerKeys.application(inst, appID) }) : Promise.resolve(),
        appID ? qc.invalidateQueries({ queryKey: developerKeys.commands(inst, appID) }) : Promise.resolve(),
      ]);
    },
    [inst, qc],
  );
  return useMemo(() => {
    const api = () => {
      if (!client) throw new Error('No active instance');
      return client;
    };
    return {
      async create(input: Schemas['CreateApplicationRequest']) {
        const app = unwrap(await api().POST('/applications', { body: input }));
        await refresh(app.id);
        return app;
      },
      async update(input: Schemas['UpdateApplicationRequest']) {
        if (!id) throw new Error('No application selected');
        const app = unwrap(await api().PATCH('/applications/{applicationID}', { params: { path: { applicationID: id } }, body: input }));
        await refresh(id);
        return app;
      },
      async remove() {
        if (!id) throw new Error('No application selected');
        unwrap(await api().DELETE('/applications/{applicationID}', { params: { path: { applicationID: id } } }));
        qc.removeQueries({ queryKey: developerKeys.application(inst, id) });
        qc.removeQueries({ queryKey: developerKeys.commands(inst, id) });
        await refresh();
      },
      async resetToken() {
        if (!id) throw new Error('No application selected');
        const token = unwrap(await api().POST('/applications/{applicationID}/bot/token', { params: { path: { applicationID: id } } }));
        await refresh(id);
        return token;
      },
      async saveCommands(commands: CommandRequest[]) {
        if (!id) throw new Error('No application selected');
        const saved = unwrap(await api().PUT('/applications/{applicationID}/commands', { params: { path: { applicationID: id } }, body: commands }));
        await refresh(id);
        return saved ?? [];
      },
      async addToPlace(place: string, applicationID = id) {
        if (!applicationID) throw new Error('No application selected');
        const member = unwrap(await api().POST('/places/{place}/bots', { params: { path: { place } }, body: { application_id: applicationID } }));
        await Promise.all([['place-members', inst, place], ['members', inst, place], ['audit', inst, place], ['place', inst, place]].map((queryKey) => qc.invalidateQueries({ queryKey })));
        return member;
      },
    };
  }, [client, id, inst, qc, refresh]);
}

export function useWebhooks(slug: string | undefined, enabled = true) {
  const { inst, client } = useContext();
  return useQuery({
    queryKey: developerKeys.webhooks(inst, slug),
    enabled: !!client && !!slug && enabled,
    queryFn: async () => unwrap(await client!.GET('/places/{place}/webhooks', { params: { path: { place: slug! } } })) ?? [],
  });
}

export function useWebhook(id: string | undefined, enabled = true) {
  const { inst, client } = useContext();
  return useQuery({
    queryKey: developerKeys.webhook(inst, id),
    enabled: !!client && !!id && enabled,
    queryFn: async () => unwrap(await client!.GET('/webhooks/{webhookID}', { params: { path: { webhookID: id! } } })),
  });
}

export function useWebhookDeliveries(id: string | undefined, status: WebhookDeliveryStatus | 'all', enabled = true) {
  const { inst, client } = useContext();
  return useInfiniteQuery({
    queryKey: developerKeys.deliveries(inst, id, status),
    enabled: !!client && !!id && enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(await client!.GET('/webhooks/{webhookID}/deliveries', { params: { path: { webhookID: id! }, query: { limit: PAGE, offset: pageParam, status: status === 'all' ? undefined : status } } })),
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });
}

export function useWebhookActions(slug?: string, id?: string) {
  const { inst, client } = useContext();
  const qc = useQueryClient();
  const refresh = useCallback(
    async (webhookID?: string) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: developerKeys.webhooks(inst, slug) }),
        webhookID ? qc.invalidateQueries({ queryKey: developerKeys.webhook(inst, webhookID) }) : Promise.resolve(),
        webhookID ? qc.invalidateQueries({ queryKey: ['webhook-deliveries', inst, webhookID] }) : Promise.resolve(),
        qc.invalidateQueries({ queryKey: ['audit', inst, slug] }),
      ]);
    },
    [inst, qc, slug],
  );
  return useMemo(() => {
    const api = () => {
      if (!client) throw new Error('No active instance');
      return client;
    };
    return {
      async create(input: Schemas['CreateWebhookRequest']) {
        if (!slug) throw new Error('No place selected');
        const webhook = unwrap(await api().POST('/places/{place}/webhooks', { params: { path: { place: slug } }, body: input }));
        await refresh(webhook.id);
        return webhook;
      },
      async update(input: Schemas['UpdateWebhookRequest']) {
        if (!id) throw new Error('No webhook selected');
        const webhook = unwrap(await api().PATCH('/webhooks/{webhookID}', { params: { path: { webhookID: id } }, body: input }));
        await refresh(id);
        return webhook;
      },
      async remove() {
        if (!id) throw new Error('No webhook selected');
        unwrap(await api().DELETE('/webhooks/{webhookID}', { params: { path: { webhookID: id } } }));
        qc.removeQueries({ queryKey: developerKeys.webhook(inst, id) });
        qc.removeQueries({ queryKey: ['webhook-deliveries', inst, id] });
        await refresh();
      },
      async ping() {
        if (!id) throw new Error('No webhook selected');
        const delivery = unwrap(await api().POST('/webhooks/{webhookID}/ping', { params: { path: { webhookID: id } } }));
        await refresh(id);
        return delivery;
      },
      async rotateSecret() {
        if (!id) throw new Error('No webhook selected');
        const webhook = unwrap(await api().POST('/webhooks/{webhookID}/secret', { params: { path: { webhookID: id } } }));
        await refresh(id);
        return webhook;
      },
      async redeliver(deliveryID: string) {
        if (!id) throw new Error('No webhook selected');
        const delivery = unwrap(await api().POST('/webhooks/{webhookID}/deliveries/{deliveryID}/redeliver', { params: { path: { webhookID: id, deliveryID } } }));
        await refresh(id);
        return delivery;
      },
    };
  }, [client, id, inst, qc, refresh, slug]);
}

export function useTransparency(days: number, place?: string) {
  const { inst, client } = useContext();
  return useQuery({
    queryKey: developerKeys.transparency(inst, place, days),
    enabled: !!client,
    queryFn: async () => {
      const until = new Date();
      const since = new Date(until.getTime() - days * 86400000);
      const query = { since: since.toISOString(), until: until.toISOString() };
      return place
        ? unwrap(await client!.GET('/places/{place}/transparency', { params: { path: { place }, query } }))
        : unwrap(await client!.GET('/transparency', { params: { query } }));
    },
  });
}
