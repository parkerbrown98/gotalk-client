import { afterEach, describe, expect, it, vi } from 'vitest';

import { IMAGE_FAILURE_TTL_MS, isImageFailed, markImageFailed, resetImageFailures } from './image-fallback.ts';

// Avatar and InstanceIcon render the image only while `isImageFailed` is false for its URL, and
// call `markImageFailed` from the image's onError; these cover that decision.
describe('image fallback', () => {
  afterEach(() => resetImageFailures());

  it('shows the image until it fails, then the initials for every copy of that URL', () => {
    const url = 'https://x.example/media/avatars/old.png';
    expect(isImageFailed(url)).toBe(false);
    markImageFailed(url, 1_000);
    expect(isImageFailed(url, 2_000)).toBe(true);
    expect(isImageFailed('https://x.example/media/avatars/new.png', 2_000)).toBe(false);
  });

  it('has nothing to fall back from without a URL', () => {
    expect(isImageFailed(null)).toBe(false);
    expect(isImageFailed('')).toBe(false);
  });

  it('tries the image again after a while, in case it was the network', () => {
    const url = 'https://x.example/media/place-icons/1.png';
    markImageFailed(url, 0);
    expect(isImageFailed(url, IMAGE_FAILURE_TTL_MS)).toBe(true);
    expect(isImageFailed(url, IMAGE_FAILURE_TTL_MS + 1)).toBe(false);
    expect(isImageFailed(url, IMAGE_FAILURE_TTL_MS + 2)).toBe(false);
  });

  it('can be cleared', () => {
    markImageFailed('a', Date.now());
    resetImageFailures();
    expect(isImageFailed('a')).toBe(false);
  });

  it('uses the current time by default', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(5_000);
      markImageFailed('b');
      vi.setSystemTime(5_000 + IMAGE_FAILURE_TTL_MS + 10);
      expect(isImageFailed('b')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
