import { useEffect, useState } from 'react';

/** Counts whole seconds down from `seconds`; restarts whenever `start` changes. Used for Retry-After. */
export function useCountdown(seconds: number | null, start: number): number {
  const [left, setLeft] = useState(seconds ?? 0);
  useEffect(() => {
    setLeft(seconds ?? 0);
    if (!seconds) return;
    const timer = setInterval(() => setLeft((n) => (n <= 1 ? (clearInterval(timer), 0) : n - 1)), 1000);
    return () => clearInterval(timer);
  }, [seconds, start]);
  return left;
}
