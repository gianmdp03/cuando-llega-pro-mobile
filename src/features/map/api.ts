import { apiClient } from '@/src/lib/api-client';
import type { DirectionDto, MapLine, MapStop, MapStopDetail } from '@/src/types/api';

const MAP_PATH = '/api/v1/transit/map';

export function getMapLines(): Promise<MapLine[]> {
  return apiClient.get<MapLine[]>(`${MAP_PATH}/lines`);
}

export function getMapDirections(commercialCode: string): Promise<DirectionDto[]> {
  return apiClient.get<DirectionDto[]>(
    `${MAP_PATH}/lines/${encodeURIComponent(commercialCode)}/directions`
  );
}

export function getMapStops(commercialCode: string, direction: string): Promise<MapStop[]> {
  return apiClient.get<MapStop[]>(
    `${MAP_PATH}/lines/${encodeURIComponent(commercialCode)}/stops?direction=${encodeURIComponent(direction)}`
  );
}

export function getMapStop(identifier: string): Promise<MapStopDetail> {
  return apiClient.get<MapStopDetail>(`${MAP_PATH}/stops/${encodeURIComponent(identifier)}`);
}
