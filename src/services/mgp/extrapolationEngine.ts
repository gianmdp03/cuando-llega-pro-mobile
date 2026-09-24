import { useEffect, useState } from 'react';
import { ArrivalResponse, BusArrivalItem } from './telemetryMapper';

export const EXPIRATION_THRESHOLD_MINUTES = 25;

export interface ExtrapolatedItem extends BusArrivalItem {
  extrapolatedRemainingMinutes: number | null;
  extrapolatedRemainingSeconds: number | null;
  elapsedSeconds: number;
}

/**
 * Extrapolates a single bus arrival prediction by second and minute count down.
 * Degrades status to ESTIMATED_FALLBACK when time has elapsed, or EXPIRED when > 25 min.
 */
export function extrapolateArrivalItem(
  item: BusArrivalItem,
  currentTime: Date = new Date()
): ExtrapolatedItem {
  const itemTime = item.timestamp ? new Date(item.timestamp).getTime() : currentTime.getTime();
  const nowMs = currentTime.getTime();
  const elapsedMs = Math.max(0, nowMs - itemTime);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  if (item.remainingMinutes === null || item.remainingMinutes === undefined) {
    return {
      ...item,
      extrapolatedRemainingMinutes: null,
      extrapolatedRemainingSeconds: null,
      elapsedSeconds,
    };
  }

  const initialTotalSeconds = item.remainingMinutes * 60;
  const remainingSeconds = Math.max(0, initialTotalSeconds - elapsedSeconds);
  const remainingMinutes = Math.floor(remainingSeconds / 60);

  let status: 'LIVE' | 'ESTIMATED_FALLBACK' | 'EXPIRED' = item.status;
  if (elapsedMinutes <= 0) {
    status = 'LIVE';
  } else if (elapsedMinutes > EXPIRATION_THRESHOLD_MINUTES) {
    status = 'EXPIRED';
  } else {
    status = 'ESTIMATED_FALLBACK';
  }

  return {
    ...item,
    status,
    remainingMinutes: status === 'EXPIRED' ? 0 : remainingMinutes,
    extrapolatedRemainingMinutes: status === 'EXPIRED' ? 0 : remainingMinutes,
    extrapolatedRemainingSeconds: status === 'EXPIRED' ? 0 : remainingSeconds,
    elapsedSeconds,
  };
}

/**
 * Extrapolates an entire list of bus arrival items against the current time.
 */
export function extrapolateArrivalsList(
  items: BusArrivalItem[],
  currentTime: Date = new Date()
): ExtrapolatedItem[] {
  return items.map((item) => extrapolateArrivalItem(item, currentTime));
}

/**
 * Extrapolates an ArrivalResponse object, updating deltaMinutes and status.
 */
export function extrapolateArrivalResponse(
  response: ArrivalResponse,
  currentTime: Date = new Date()
): ArrivalResponse {
  const refTime = response.timestamp ? new Date(response.timestamp).getTime() : currentTime.getTime();
  const elapsedMinutes = Math.floor(Math.max(0, currentTime.getTime() - refTime) / 60000);

  let targetStatus = response.status;
  if (elapsedMinutes <= 0) {
    targetStatus = 'LIVE';
  } else if (elapsedMinutes > EXPIRATION_THRESHOLD_MINUTES) {
    targetStatus = 'EXPIRED';
  } else {
    targetStatus = 'ESTIMATED_FALLBACK';
  }

  const extrapolatedArrivals = response.arrivals.map((item) =>
    extrapolateArrivalItem(item, currentTime)
  );

  return {
    ...response,
    status: targetStatus,
    deltaMinutes: elapsedMinutes,
    arrivals: extrapolatedArrivals,
  };
}

/**
 * React hook providing 1-second countdown extrapolation without aggressive network polling.
 */
export function useExtrapolatedArrivals(items: BusArrivalItem[] | undefined): ExtrapolatedItem[] {
  const [extrapolated, setExtrapolated] = useState<ExtrapolatedItem[]>(() =>
    items ? extrapolateArrivalsList(items) : []
  );

  useEffect(() => {
    if (!items || items.length === 0) {
      setExtrapolated([]);
      return;
    }

    const tick = () => {
      setExtrapolated(extrapolateArrivalsList(items));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [items]);

  return extrapolated;
}
