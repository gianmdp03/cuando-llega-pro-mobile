import { useEffect, useMemo, useState } from 'react';

import type { BusArrival } from '@/src/types/api';

export function useArrivalTicker(arrival: BusArrival): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(intervalId);
  }, []);

  return useMemo(() => getVisualRemainingMinutes(arrival, now), [arrival, now]);
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
