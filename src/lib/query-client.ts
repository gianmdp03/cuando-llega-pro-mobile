import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

export const queryKeys = {
  auth: {
    session: () => ['auth', 'session'] as const,
  },
  catalog: {
    lines: () => ['catalog', 'lines'] as const,
    streets: (commercialLineCode: string) => ['catalog', 'streets', commercialLineCode] as const,
    intersections: (commercialLineCode: string, streetCode: string) =>
      ['catalog', 'intersections', commercialLineCode, streetCode] as const,
    stopsWithFlags: (commercialLineCode: string, streetCode: string, intersectionCode: string) =>
      ['catalog', 'stops-with-flags', commercialLineCode, streetCode, intersectionCode] as const,
  },
  map: {
    lines: () => ['map', 'lines'] as const,
    directions: (commercialLineCode: string) => ['map', 'directions', commercialLineCode] as const,
    stops: (commercialLineCode: string, direction: string) =>
      ['map', 'stops', commercialLineCode, direction] as const,
    nearbyStops: (latitude: number, longitude: number, radiusMeters: number) =>
      ['map', 'nearby-stops', latitude, longitude, radiusMeters] as const,
    routes: (commercialLineCode: string) => ['map', 'routes', commercialLineCode] as const,
    stop: (identifier: string) => ['map', 'stop', identifier] as const,
    arrivals: (identifier: string) => ['map', 'arrivals', identifier] as const,
  },
  telemetry: {
    arrivals: (commercialLineCode: string, stopId: string, bandera: string | null) =>
      ['telemetry', 'arrivals', commercialLineCode, stopId, bandera] as const,
  },
  presets: {
    all: () => ['presets'] as const,
    detail: (id: number) => ['presets', id] as const,
  },
  dashboard: {
    currentUser: () => ['dashboard'] as const,
  },
} as const;
