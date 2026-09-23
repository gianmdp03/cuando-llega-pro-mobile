import { apiClient } from '@/src/lib/api-client';
import type {
  DirectionDto,
  MapLine,
  MapRoute,
  MapStop,
  MapStopDetail,
  NearbyMapStop,
} from '@/src/types/api';

const MAP_PATH = '/api/v1/transit/map';

export function getMapLines(signal?: AbortSignal): Promise<MapLine[]> {
  return apiClient.get<MapLine[]>(`${MAP_PATH}/lines`, { signal });
}

export function getMapDirections(
  commercialCode: string,
  signal?: AbortSignal
): Promise<DirectionDto[]> {
  return apiClient.get<DirectionDto[]>(
    `${MAP_PATH}/lines/${encodeURIComponent(commercialCode)}/directions`,
    { signal }
  );
}

export function getMapStops(
  commercialCode: string,
  direction: string,
  signal?: AbortSignal
): Promise<MapStop[]> {
  return apiClient.get<MapStop[]>(
    `${MAP_PATH}/lines/${encodeURIComponent(commercialCode)}/stops?direction=${encodeURIComponent(direction)}`,
    { signal }
  );
}

export function getNearbyMapStops(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  signal?: AbortSignal
): Promise<NearbyMapStop[]> {
  const search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    radiusMeters: String(radiusMeters),
  });
  return apiClient.get<NearbyMapStop[]>(`${MAP_PATH}/stops/nearby?${search.toString()}`, {
    signal,
  });
}

export function getMapRoutes(commercialCode: string, signal?: AbortSignal): Promise<MapRoute[]> {
  return apiClient.get<MapRoute[]>(
    `${MAP_PATH}/lines/${encodeURIComponent(commercialCode)}/routes`,
    { signal }
  );
}

export function getMapStop(identifier: string, signal?: AbortSignal): Promise<MapStopDetail> {
  return apiClient.get<MapStopDetail>(`${MAP_PATH}/stops/${encodeURIComponent(identifier)}`, {
    signal,
  });
}

export function getReverseGeocoding(
  latitude: number,
  longitude: number,
  signal?: AbortSignal
): Promise<{ formattedAddress: string }> {
  return apiClient.get<{ formattedAddress: string }>(
    `/api/v1/geo/reverse?latitude=${latitude}&longitude=${longitude}`,
    { signal }
  );
}
