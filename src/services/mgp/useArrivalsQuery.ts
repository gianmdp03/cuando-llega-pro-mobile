import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMgp } from './MgpWorker';
import type { ArrivalResponseDTO, BusArrival as ApiBusArrival } from '@/src/types/api';
import type { BusArrival } from './telemetryMapper';
import { getArrivals as getCachedArrivals, refreshArrivalsCache } from '@/src/features/transit/api';
import { ProblemDetailError } from '@/src/lib/api-client';

export function filterByBandera(
  arrivals: BusArrival[] | ApiBusArrival[],
  bandera?: string | null
): BusArrival[] {
  if (!bandera || !bandera.trim()) {
    return arrivals as BusArrival[];
  }
  const cleanTarget = bandera.trim().toLowerCase();
  return (arrivals as BusArrival[]).filter(
    (item) => item.branch && item.branch.trim().toLowerCase() === cleanTarget
  );
}

export type UseArrivalsQueryResult = UseQueryResult<ArrivalResponseDTO, Error> & {
  isBridgeReady: boolean;
  isChallenging: boolean;
  reloadBridge: () => void;
};

/**
 * React Query hook executing arrival queries through the distributed MGP WebView Worker.
 * Deduplicates concurrent requests, applies 15-second staleTime cache, and supports branch filtering.
 * Key: ['arrivals', lineCode, stopId]
 */
export function useArrivalsQuery(
  lineCode?: string,
  stopId?: string,
  bandera?: string | null,
  options?: { enabled?: boolean; refetchInterval?: number | false }
): UseArrivalsQueryResult {
  const { getArrivals, isReady, isChallenging, reloadBridge } = useMgp();

  const isEnabled = Boolean(
    lineCode && stopId && (options?.enabled === undefined ? true : options.enabled)
  );

  const query = useQuery<ArrivalResponseDTO, Error>({
    queryKey: ['arrivals', lineCode, stopId],
    queryFn: async ({ signal }): Promise<ArrivalResponseDTO> => {
      try {
        // Shared server cache is always the first hop. It has the same 15-second
        // freshness window as this query and avoids waking MGP for refresh spam.
        return await getCachedArrivals(lineCode!, stopId!, bandera ?? null, signal);
      } catch (error) {
        const requiresClientRefresh =
          error instanceof ProblemDetailError &&
          error.problem.type === 'urn:cuando-llega:mgp-client-refresh-required';
        if (!requiresClientRefresh) throw error;
      }

      const items = await getArrivals(lineCode!, stopId!);

      const busArrivals: ApiBusArrival[] = items.map((item) => ({
        lineCode: item.lineCode,
        branch: item.branch,
        remainingMinutes: item.remainingMinutes,
        distanceMeters: item.distanceMeters,
        estimatedArrivalTime: item.estimatedArrivalTime ?? null,
        vehicleUnit: item.vehicleUnit,
        accessible: item.accessible,
        status: item.status,
        timestamp: item.timestamp,
        latitude: item.latitude,
        longitude: item.longitude,
        scheduleDeviation: item.scheduleDeviation ?? null,
        driverId: item.driverId ?? null,
        stopLatitude: item.stopLatitude ?? null,
        stopLongitude: item.stopLongitude ?? null,
        bearing: null,
        speedKmH: null,
      }));

      const firstWithCoords = items.find((i) => i.stopLatitude != null && i.stopLongitude != null);

      const response: ArrivalResponseDTO = {
        lineCode: lineCode!,
        stopId: stopId!,
        branch: bandera ?? null,
        status: items.length > 0 ? items[0].status : 'LIVE',
        timestamp: items[0]?.timestamp ?? new Date().toISOString(),
        deltaMinutes: 0,
        arrivals: busArrivals,
        stopLatitude: firstWithCoords?.stopLatitude ?? items[0]?.stopLatitude ?? null,
        stopLongitude: firstWithCoords?.stopLongitude ?? items[0]?.stopLongitude ?? null,
      };
      try {
        const consolidated = await refreshArrivalsCache(response);
        if (consolidated && Array.isArray(consolidated.arrivals)) {
          return consolidated;
        }
      } catch {
        // Degrade gracefully to local raw snapshot if backend is unreachable
      }
      return response;
    },
    enabled: isEnabled,
    staleTime: 15_000,
    gcTime: 5 * 60 * 1000,
    // Cloudflare owns the verification flow. Retrying while it is active restarts
    // the challenge navigation and produces a loop.
    retry: false,
    refetchInterval: options?.refetchInterval !== undefined ? options.refetchInterval : 30_000,
    refetchIntervalInBackground: false,
    select: (response): ArrivalResponseDTO => ({
      ...response,
      branch: bandera ?? null,
      arrivals: filterByBandera(response.arrivals as any, bandera) as any,
    }),
  });

  return {
    ...query,
    isBridgeReady: isReady,
    isChallenging,
    reloadBridge,
  };
}
