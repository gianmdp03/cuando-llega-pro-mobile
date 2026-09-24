import type { TransitIntersectionDTO, TransitLineDTO, TransitStopWithFlagDTO, TransitStreetDTO } from '../../types/api';

const REFRESH_REQUIRED_TYPE = 'urn:cuando-llega:mgp-client-refresh-required';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown): string { return value === null || value === undefined ? '' : String(value).trim(); }
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}
function arrayFrom(raw: string, property: 'lineas' | 'calles' | 'paradas'): Record<string, unknown>[] {
  const parsed: unknown = JSON.parse(raw);
  const root = asRecord(parsed);
  const candidate = root?.[property] ?? parsed;
  return Array.isArray(candidate) ? candidate.map(asRecord).filter((item): item is Record<string, unknown> => item !== null) : [];
}
function stripCitySuffix(descripcion: string): string {
  return descripcion.replace(/\s+-\s+(?:MAR DEL PLATA|GENERAL PUEYRREDON)\s*$/i, '').trim();
}

export function parseMgpLines(raw: string): TransitLineDTO[] {
  return arrayFrom(raw, 'lineas').map((item) => ({ id: text(item.CodigoLineaParada), codigo: text(item.Descripcion), descripcion: text(item.Descripcion), codigoEntidad: text(item.CodigoEntidad) || null, codigoEmpresa: numberOrNull(item.CodigoEmpresa) }));
}
export function parseMgpStreets(raw: string): TransitStreetDTO[] {
  return arrayFrom(raw, 'calles').map((item) => ({ codigo: text(item.Codigo), descripcion: stripCitySuffix(text(item.Descripcion)) })).sort((a, b) => a.descripcion.localeCompare(b.descripcion));
}
export function parseMgpIntersections(raw: string): TransitIntersectionDTO[] {
  return arrayFrom(raw, 'calles').map((item) => ({ codigo: text(item.Codigo), descripcion: stripCitySuffix(text(item.Descripcion)) })).sort((a, b) => a.descripcion.localeCompare(b.descripcion));
}
export function parseMgpStopsWithFlag(raw: string): TransitStopWithFlagDTO[] {
  return arrayFrom(raw, 'paradas').map((item) => ({ codigo: text(item.Codigo), identificador: text(item.Identificador), descripcion: text(item.Descripcion), abreviaturaBandera: text(item.AbreviaturaBandera), abreviaturaAmpliadaBandera: text(item.AbreviaturaAmpliadaBandera), latitudParada: numberOrNull(item.LatitudParada), longitudParada: numberOrNull(item.LongitudParada) }));
}

export function isMgpClientRefreshRequired(error: unknown): boolean {
  const value = asRecord(error);
  const problem = asRecord(value?.problem);
  return problem?.type === REFRESH_REQUIRED_TYPE;
}
