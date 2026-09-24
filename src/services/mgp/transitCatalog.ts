import { useCallback } from 'react';

import { getTransitIntersections, getTransitLines, getTransitStopsWithFlag, getTransitStreets } from '@/src/features/transit/api';
import { apiClient, ProblemDetailError } from '@/src/lib/api-client';

import { useMgp } from './MgpWorker';
import { resolveInternalLineCode } from './telemetryMapper';
import {
  isMgpClientRefreshRequired,
  parseMgpIntersections,
  parseMgpLines,
  parseMgpStopsWithFlag,
  parseMgpStreets,
} from './transitCatalogMapper';

type CatalogType = 'LINES' | 'STREETS' | 'INTERSECTIONS' | 'STOPS_FLAG';
type CatalogRefreshRequest = { cacheKey: string; catalogType: CatalogType; payload: string };

export function isRefreshRequired(error: unknown): boolean {
  return error instanceof ProblemDetailError && isMgpClientRefreshRequired(error);
}

async function publish(cacheKey: string, catalogType: CatalogType, payload: unknown): Promise<void> {
  await apiClient.post<void, CatalogRefreshRequest>('/api/v1/transit/catalog-cache', { cacheKey, catalogType, payload: JSON.stringify(payload) });
}

/** Backend-first catalog reader; MGP runs only after the explicit 409 refresh signal. */
export function useTransitCatalog() {
  const { requestMgp } = useMgp();
  const lines = useCallback(async (signal?: AbortSignal) => {
    try { return await getTransitLines(signal); } catch (error) {
      if (!isRefreshRequired(error)) throw error;
      const result = parseMgpLines(await requestMgp({ accion: 'RecuperarLineaPorCuandoLlega' }));
      await publish('lines:all', 'LINES', result); return result;
    }
  }, [requestMgp]);
  const streets = useCallback(async (commercialLine: string, signal?: AbortSignal) => {
    try { return await getTransitStreets(commercialLine, signal); } catch (error) {
      if (!isRefreshRequired(error)) throw error;
      const internalLine = resolveInternalLineCode(commercialLine).trim();
      const result = parseMgpStreets(await requestMgp({ accion: 'RecuperarCallesPrincipalPorLinea', codLinea: internalLine }));
      await publish(`streets:${internalLine}`, 'STREETS', result); return result;
    }
  }, [requestMgp]);
  const intersections = useCallback(async (commercialLine: string, streetCode: string, signal?: AbortSignal) => {
    try { return await getTransitIntersections(commercialLine, streetCode, signal); } catch (error) {
      if (!isRefreshRequired(error)) throw error;
      const internalLine = resolveInternalLineCode(commercialLine).trim();
      const result = parseMgpIntersections(await requestMgp({ accion: 'RecuperarInterseccionPorLineaYCalle', codLinea: internalLine, codCalle: streetCode }));
      await publish(`intersections:${internalLine}:${streetCode}`, 'INTERSECTIONS', result); return result;
    }
  }, [requestMgp]);
  const stopsWithFlag = useCallback(async (commercialLine: string, streetCode: string, intersectionCode: string, signal?: AbortSignal) => {
    try { return await getTransitStopsWithFlag(commercialLine, streetCode, intersectionCode, signal); } catch (error) {
      if (!isRefreshRequired(error)) throw error;
      const internalLine = resolveInternalLineCode(commercialLine).trim();
      const result = parseMgpStopsWithFlag(await requestMgp({ accion: 'RecuperarParadasConBanderaPorLineaCalleEInterseccion', codLinea: internalLine, codCalle: streetCode, codInterseccion: intersectionCode }));
      await publish(`stops_flag:${internalLine}:${streetCode}:${intersectionCode}`, 'STOPS_FLAG', result); return result;
    }
  }, [requestMgp]);
  return { lines, streets, intersections, stopsWithFlag };
}
