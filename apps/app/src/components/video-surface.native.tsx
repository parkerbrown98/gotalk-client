import type { VideoTrack } from 'livekit-client';
import { lazy, Suspense } from 'react';

import type { VideoSurfaceProps } from './video-surface';

// Loaded on first use: the WebRTC native module throws on import in Expo Go, which has no calling support.
const NativeVideo = lazy(async () => {
  const { VideoView } = await import('@livekit/react-native');
  return {
    default: ({ track, fit, mirror }: VideoSurfaceProps) => (
      <VideoView videoTrack={track as VideoTrack} objectFit={fit} mirror={mirror} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
    ),
  };
});

/** A camera on phones. */
export function VideoSurface(props: VideoSurfaceProps) {
  return (
    <Suspense fallback={null}>
      <NativeVideo {...props} />
    </Suspense>
  );
}
