import type { Track } from 'livekit-client';
import { useEffect, useRef } from 'react';

export interface VideoSurfaceProps {
  track: Track;
  /** `cover` fills the tile; `contain` shows the whole picture (screens). */
  fit: 'cover' | 'contain';
  /** Your own camera, shown as in a mirror. */
  mirror?: boolean;
  /** Receives the element so the stage can make it full screen. */
  onElement?: (el: HTMLElement | null) => void;
}

/** A camera or screen on web and desktop. */
export function VideoSurface({ track, fit, mirror, onElement }: VideoSurfaceProps) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => void track.detach(el);
  }, [track]);
  useEffect(() => {
    onElement?.(ref.current);
    return () => onElement?.(null);
  }, [onElement]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit, transform: mirror ? 'scaleX(-1)' : undefined, backgroundColor: 'transparent' }}
    />
  );
}
