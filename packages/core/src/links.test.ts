import { describe, expect, it } from 'vitest';

import { gotalkLinkPath, isTopicId, linkStep, normalizeLinkOrigin, parseGotalkLink, placeLink, topicLink } from './links.ts';

const TOPIC = '01a151db-8b15-7971-93b6-d15d4a61f4ce';

describe('place and topic links', () => {
  it('builds app links when there is no web client', () => {
    expect(placeLink({ slug: 'rust-help', instanceOrigin: 'https://forum.example' })).toBe('gotalk://places/rust-help?instance=https%3A%2F%2Fforum.example');
    expect(topicLink({ topicId: TOPIC, instanceOrigin: 'http://localhost:18080/' })).toBe(`gotalk://topics/${TOPIC}?instance=http%3A%2F%2Flocalhost%3A18080`);
  });

  it('builds web links for a hosted web client', () => {
    expect(placeLink({ slug: 'rust-help', instanceOrigin: 'https://forum.example', webClientOrigin: 'https://app.gotalk.sh/' })).toBe(
      'https://app.gotalk.sh/places/rust-help?instance=https%3A%2F%2Fforum.example',
    );
    expect(topicLink({ topicId: TOPIC, instanceOrigin: 'https://forum.example', webClientOrigin: 'https://app.gotalk.sh' })).toBe(
      `https://app.gotalk.sh/topics/${TOPIC}?instance=https%3A%2F%2Fforum.example`,
    );
  });

  it('parses what it builds, in both forms', () => {
    for (const webClientOrigin of [null, 'https://app.gotalk.sh']) {
      expect(parseGotalkLink(placeLink({ slug: 'rust-help', instanceOrigin: 'https://forum.example', webClientOrigin }))).toEqual({
        kind: 'place',
        slug: 'rust-help',
        instance: 'https://forum.example',
      });
      expect(parseGotalkLink(topicLink({ topicId: TOPIC, instanceOrigin: 'http://localhost:18080', webClientOrigin }))).toEqual({
        kind: 'topic',
        topicId: TOPIC,
        instance: 'http://localhost:18080',
      });
    }
  });

  it('recognizes invite links and app paths', () => {
    expect(parseGotalkLink('gotalk://invite/k3Vq9Xz2Lm?instance=https%3A%2F%2Fwoodworkers.example.org')).toEqual({
      kind: 'invite',
      code: 'k3Vq9Xz2Lm',
      instance: 'https://woodworkers.example.org',
    });
    expect(parseGotalkLink('https://app.gotalk.sh/invite/abc123?instance=http%3A%2F%2Flocalhost%3A8080')).toMatchObject({ kind: 'invite', code: 'abc123' });
    expect(parseGotalkLink('/places/rust-help?instance=https://forum.example/')).toEqual({ kind: 'place', slug: 'rust-help', instance: 'https://forum.example' });
    expect(parseGotalkLink('gotalk:///places/rust-help?instance=https%3A%2F%2Fforum.example')).toMatchObject({ kind: 'place', slug: 'rust-help' });
    expect(parseGotalkLink(`GOTALK://topics/${TOPIC.toUpperCase()}/?instance=HTTPS%3A%2F%2FForum.Example%2F%2F#top`)).toEqual({
      kind: 'topic',
      topicId: TOPIC,
      instance: 'https://forum.example',
    });
    expect(parseGotalkLink('gotalk://places/rust-help?utm=x&instance=https%3A%2F%2Fforum.example&x=1')).toMatchObject({ instance: 'https://forum.example' });
  });

  it('rejects garbage', () => {
    for (const bad of [
      '',
      'rust-help',
      'gotalk://places/rust-help',
      'gotalk://places/rust-help?instance=',
      'gotalk://places/rust-help?instance=ftp%3A%2F%2Fforum.example',
      'gotalk://places/rust-help?instance=javascript%3Aalert(1)',
      'gotalk://places/rust-help?instance=https%3A%2F%2Fforum.example%2Fpath',
      'gotalk://places/rust-help?instance=https%3A%2F%2Fuser%40forum.example',
      'gotalk://places/rust-help?instance=%E0%A4%A',
      'gotalk://places/Not_A_Slug?instance=https%3A%2F%2Fforum.example',
      'gotalk://places/rust-help/extra?instance=https%3A%2F%2Fforum.example',
      'gotalk://topics/42?instance=https%3A%2F%2Fforum.example',
      'gotalk://invite/../etc?instance=https%3A%2F%2Fforum.example',
      'gotalk://boards/abc?instance=https%3A%2F%2Fforum.example',
      'mailto://places/rust-help?instance=https%3A%2F%2Fforum.example',
      'https://evil..example/places/rust-help?instance=https%3A%2F%2Fforum.example',
    ]) {
      expect(parseGotalkLink(bad), bad).toBeNull();
    }
  });

  it('normalizes instance origins', () => {
    expect(normalizeLinkOrigin('https://Forum.Example///')).toBe('https://forum.example');
    expect(normalizeLinkOrigin(' http://127.0.0.1:18080 ')).toBe('http://127.0.0.1:18080');
    expect(normalizeLinkOrigin('http://[::1]:8080')).toBe('http://[::1]:8080');
    expect(normalizeLinkOrigin('https://forum.example:99999')).toBeNull();
    expect(normalizeLinkOrigin('forum.example')).toBeNull();
    expect(normalizeLinkOrigin(null)).toBeNull();
    expect(isTopicId(TOPIC)).toBe(true);
    expect(isTopicId('rust-help')).toBe(false);
  });

  it('turns a link into the app route', () => {
    expect(gotalkLinkPath({ kind: 'place', slug: 'rust-help', instance: 'https://forum.example' })).toBe('/places/rust-help?instance=https%3A%2F%2Fforum.example');
    expect(gotalkLinkPath({ kind: 'topic', topicId: TOPIC, instance: 'http://localhost:18080' })).toBe(`/topics/${TOPIC}?instance=http%3A%2F%2Flocalhost%3A18080`);
    expect(gotalkLinkPath({ kind: 'invite', code: 'abc123', instance: 'https://forum.example' })).toBe('/invite/abc123?instance=https%3A%2F%2Fforum.example');
  });

  it('decides between opening, reading and offering to add the instance', () => {
    const saved = [
      { id: 'https://forum.example', origin: 'https://forum.example' },
      { id: 'http://localhost:18080', origin: 'http://localhost:18080' },
    ];
    const signedIn = (id: string) => id === 'https://forum.example';
    expect(linkStep('https://FORUM.example/', saved, signedIn)).toEqual({ kind: 'open', instanceId: 'https://forum.example' });
    expect(linkStep('http://localhost:18080', saved, signedIn)).toEqual({ kind: 'read', instanceId: 'http://localhost:18080' });
    expect(linkStep('https://other.example', saved, signedIn)).toEqual({ kind: 'offer', origin: 'https://other.example' });
    expect(linkStep('nonsense', saved, signedIn)).toEqual({ kind: 'incomplete' });
    expect(linkStep(undefined, saved, signedIn)).toEqual({ kind: 'incomplete' });
  });
});
