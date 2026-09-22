import { useMemo, useSyncExternalStore } from 'react';

import type { BusArrival } from '@/src/types/api';

export function useArrivalTicker(arrival: BusArrival): number | null {
  const now = useArrivalClock();

  return useMemo(() => getVisualRemainingMinutes(arrival, now), [arrival, now]);
}

const listeners = new Set<() => void>();
let now = Date.now();
let intervalId: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!intervalId) {
    intervalId = setInterval(() => {
      now = Date.now();
      listeners.forEach((notify) => notify());
    }, 1_000);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && intervalId) {
      clearInterval(intervalId);
      intervalId = undefined;
    }
  };
}

function useArrivalClock(): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => now
  );
}

function getVisualRemainingMinutes(arrival: BusArrival, now: number): number | null {
  if (arrival.status === 'EXPIRED' || arrival.remainingMinutes === null || !arrival.timestamp) {
    return null;
  }

  const timestamp = Date.parse(arrival.timestamp);
  if (Number.isNaN(timestamp)) {
    return arrival.remainingMinutes;
  }

  return Math.max(0, arrival.remainingMinutes - Math.floor((now - timestamp) / 60_000));
}
