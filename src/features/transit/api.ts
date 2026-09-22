import { apiClient } from '@/src/lib/api-client';
import type {
  ArrivalResponseDTO,
  TransitIntersectionDTO,
  TransitLineDTO,
  TransitStopWithFlagDTO,
  TransitStreetDTO,
} from '@/src/types/api';

const TRANSIT_PATH = '/api/v1/transit/lines';

export function getTransitLines(): Promise<TransitLineDTO[]> {
  return apiClient.get<TransitLineDTO[]>(TRANSIT_PATH);
}

export function getTransitStreets(commercialLineCode: string): Promise<TransitStreetDTO[]> {
  return apiClient.get<TransitStreetDTO[]>(
    `${TRANSIT_PATH}/${encodeURIComponent(commercialLineCode)}/streets`
  );
}

export function getTransitIntersections(
  commercialLineCode: string,
  streetCode: string
): Promise<TransitIntersectionDTO[]> {
  return apiClient.get<TransitIntersectionDTO[]>(
    `${TRANSIT_PATH}/${encodeURIComponent(commercialLineCode)}/streets/${encodeURIComponent(streetCode)}/intersections`
  );
}

export function getTransitStopsWithFlag(
  commercialLineCode: string,
  streetCode: string,
  intersectionCode: string
): Promise<TransitStopWithFlagDTO[]> {
  return apiClient.get<TransitStopWithFlagDTO[]>(
    `${TRANSIT_PATH}/${encodeURIComponent(commercialLineCode)}/streets/${encodeURIComponent(streetCode)}/intersections/${encodeURIComponent(intersectionCode)}/stops`
  );
}

export function getArrivals(
  commercialLineCode: string,
  stopId: string,
  bandera: string | null
): Promise<ArrivalResponseDTO> {
  const query = [
    `lineCode=${encodeURIComponent(commercialLineCode)}`,
    `stopId=${encodeURIComponent(stopId)}`,
    ...(bandera ? [`bandera=${encodeURIComponent(bandera)}`] : []),
  ].join('&');

  return apiClient.get<ArrivalResponseDTO>(`/api/v1/telemetry/arrivals?${query}`);
}
