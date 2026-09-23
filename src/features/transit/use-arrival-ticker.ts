import { useSyncExternalStore } from 'react';

import type { BusArrival } from '@/src/types/api';

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

export function useArrivalClock(): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => now
  );
}

export function getVisualRemainingMinutes(arrival: BusArrival, now: number): number | null {
  if (arrival.status === 'EXPIRED' || arrival.remainingMinutes === null || !arrival.timestamp) {
    return null;
  }

  const timestamp = Date.parse(arrival.timestamp);
  if (Number.isNaN(timestamp)) {
    return arrival.remainingMinutes;
  }

  return Math.max(0, arrival.remainingMinutes - Math.floor((now - timestamp) / 60_000));
}

export function getArrivalClockTime(visualMinutes: number | null, now: number): string | null {
  if (visualMinutes === null) {
    return null;
  }
  const arrivalTimeMs = now + visualMinutes * 60_000;
  const date = new Date(arrivalTimeMs);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes} hs`;
}

export function formatVisualArrivalMinutes(visualMinutes: number): string {
  return visualMinutes === 0 ? 'LLEGANDO (<1 min)' : `${visualMinutes} min`;
}
