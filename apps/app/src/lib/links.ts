import { createGotalkClient, unwrap, type Schemas } from '@gotalk/api-client';
import { gotalkLinkPath, linkStep, parseGotalkLink, type DiscoveredInstance, type LinkStep } from '@gotalk/core';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo } from 'react';

import { useApiClient } from './api';
import { useAuth } from './auth';
import { isDesktop } from './desktop';
import { useActiveInstance, useInstances } from './instances';

/** A place or topic link, opened from the web (`/places/<slug>?instance=…`) or the apps (`gotalk://…`). */
export type LinkTarget = { kind: 'place'; slug: string } | { kind: 'topic'; topicId: string };

/** What opening a link to `origin` should do on this device: open it, read it signed out, or offer to add it. */
export function useLinkStep(origin: string | null | undefined): LinkStep {
  const instances = useInstances((s) => s.instances);
  const sessions = useAuth((s) => s.sessions);
  return useMemo(() => linkStep(origin, instances, (id) => !!sessions[id]), [origin, instances, sessions]);
}

export interface LinkPreview {
  place: Schemas['Place'];
  topic: Schemas['Topic'] | null;
}

/** The place (and topic) behind a link on an instance that isn't saved yet, read without an account. */
export function useLinkPreview(target: LinkTarget, server: DiscoveredInstance | undefined) {
  const id = target.kind === 'place' ? target.slug : target.topicId;
  return useQuery({
    queryKey: ['link-preview', server?.id, target.kind, id],
    enabled: !!server && server.compatibility.ok,
    retry: false,
    queryFn: async (): Promise<LinkPreview> => {
      const client = createGotalkClient({ baseUrl: server!.apiBaseUrl });
      if (target.kind === 'place') {
        return { place: unwrap(await client.GET('/places/{place}', { params: { path: { place: target.slug } } })), topic: null };
      }
      const topic = unwrap(await client.GET('/topics/{topicID}', { params: { path: { topicID: target.topicId } } }));
      const place = unwrap(await client.GET('/places/{place}', { params: { path: { place: topic.place_id } } }));
      return { place, topic };
    },
  });
}

/** A topic's place address on the active instance, for opening the topic signed in. */
export function useTopicPlace(topicId: string | undefined, enabled = true) {
  const inst = useActiveInstance()?.id;
  const client = useApiClient();
  return useQuery({
    queryKey: ['topic-place', inst, topicId],
    enabled: !!client && !!topicId && enabled,
    retry: false,
    queryFn: async () => {
      const topic = unwrap(await client!.GET('/topics/{topicID}', { params: { path: { topicID: topicId! } } }));
      const place = unwrap(await client!.GET('/places/{place}', { params: { path: { place: topic.place_id } } }));
      return { topic, place };
    },
  });
}

/** Where a link goes once its instance is active: signed in, the place or topic; signed out, the public reading view. */
export function linkDestination(target: LinkTarget, signedIn: boolean, slug?: string): Href {
  if (target.kind === 'place') {
    return signedIn ? { pathname: '/places/[slug]', params: { slug: target.slug } } : { pathname: '/explore/places/[slug]', params: { slug: target.slug } };
  }
  if (signedIn && slug) return { pathname: '/places/[slug]/topics/[id]', params: { slug, id: target.topicId } };
  return { pathname: '/explore/topics/[id]', params: { id: target.topicId } };
}

/**
 * gotalk:// links that open the desktop app. The Tauri shell queues them (apps/desktop/src-tauri) and fires
 * `deep-link`; the page takes the queue on start and on each event, then routes like the phone apps do.
 */
export function useDesktopDeepLinks() {
  useEffect(() => {
    if (!isDesktop) return;
    let stopped = false;
    const drain = () =>
      invoke<string[]>('deep_links_take')
        .then((urls) => {
          if (stopped) return;
          for (const url of urls) {
            const link = parseGotalkLink(url);
            if (link) router.push(gotalkLinkPath(link) as Href);
          }
        })
        .catch(() => undefined);
    const unlisten = listen('deep-link', () => void drain());
    void drain();
    return () => {
      stopped = true;
      void unlisten.then((stop) => stop()).catch(() => undefined);
    };
  }, []);
}
