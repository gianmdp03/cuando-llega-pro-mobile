import { apiClient } from '@/src/lib/api-client';
import type {
  ArrivalResponseDTO,
  TransitIntersectionDTO,
  TransitLineDTO,
  TransitStopWithFlagDTO,
  TransitStreetDTO,
} from '@/src/types/api';

const TRANSIT_PATH = '/api/v1/transit/lines';
const MGP_PACED_TIMEOUT_MS = 90_000;

export function getTransitLines(): Promise<TransitLineDTO[]> {
  return apiClient.get<TransitLineDTO[]>(TRANSIT_PATH, { timeoutMs: MGP_PACED_TIMEOUT_MS });
}

export function getTransitStreets(commercialLineCode: string): Promise<TransitStreetDTO[]> {
  return apiClient.get<TransitStreetDTO[]>(
    `${TRANSIT_PATH}/${encodeURIComponent(commercialLineCode)}/streets`,
    { timeoutMs: MGP_PACED_TIMEOUT_MS }
  );
}

export function getTransitIntersections(
  commercialLineCode: string,
  streetCode: string
): Promise<TransitIntersectionDTO[]> {
  return apiClient.get<TransitIntersectionDTO[]>(
    `${TRANSIT_PATH}/${encodeURIComponent(commercialLineCode)}/streets/${encodeURIComponent(streetCode)}/intersections`,
    { timeoutMs: MGP_PACED_TIMEOUT_MS }
  );
}

export function getTransitStopsWithFlag(
  commercialLineCode: string,
  streetCode: string,
  intersectionCode: string
): Promise<TransitStopWithFlagDTO[]> {
  return apiClient.get<TransitStopWithFlagDTO[]>(
    `${TRANSIT_PATH}/${encodeURIComponent(commercialLineCode)}/streets/${encodeURIComponent(streetCode)}/intersections/${encodeURIComponent(intersectionCode)}/stops`,
    { timeoutMs: MGP_PACED_TIMEOUT_MS }
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

  // A globally paced upstream request can wait behind other users. Keep this
  // above the maximum expected queue time so a valid eventual response is not
  // presented as a mobile network error.
  return apiClient.get<ArrivalResponseDTO>(`/api/v1/telemetry/arrivals?${query}`, {
    timeoutMs: MGP_PACED_TIMEOUT_MS,
  });
}
