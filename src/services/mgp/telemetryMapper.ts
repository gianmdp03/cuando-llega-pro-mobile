/**
 * MGP Telemetry Mapper
 * Pure parsing, normalization, and line resolution functions for Mar del Plata municipal transit telemetry.
 */

// Upstream Commercial Line Code -> Municipal Internal Line Code mappings
export const LINE_MAPPINGS: Record<string, string> = {
  '501': '93',
  '511': '98',
  '512': '99',
  '521': '100',
  '522': '101',
  '523': '102',
  '525': '103',
  '531': '104',
  '532': '105',
  '533': '106',
  '541': '107',
  '542': '108',
  '543': '109',
  '551': '110',
  '552': '111',
  '553': '112',
  '554': '116',
  '555': '117',
  '562': '119',
  '563': '120',
  '571': '121',
  '573': '122',
  '581': '123',
  '591': '124',
  '593': '125',
  '593C': '126',
  '717': '127',
  BATAN: '344',
};

// Aliases for compatibility
export const COMMERCIAL_TO_INTERNAL_LINE = LINE_MAPPINGS;

// Inverse mapping: Internal Code -> Commercial Line Code
export const INTERNAL_TO_COMMERCIAL_LINE: Record<string, string> = Object.entries(
  LINE_MAPPINGS
).reduce<Record<string, string>>((acc, [commercial, internal]) => {
  acc[internal] = commercial;
  return acc;
}, {});

/**
 * Resolves municipal internal line code from commercial line name/code.
 */
export function resolveInternalLineCode(commercialCode: string): string {
  if (!commercialCode) return commercialCode;
  const cleaned = commercialCode.trim().toUpperCase();
  return LINE_MAPPINGS[cleaned] ?? commercialCode;
}

export const toInternalLineCode = resolveInternalLineCode;

export function toCommercialLineCode(internalLine: string): string {
  if (!internalLine) return internalLine;
  const cleaned = internalLine.trim();
  return INTERNAL_TO_COMMERCIAL_LINE[cleaned] ?? internalLine;
}

export interface RawMgpArrival {
  linea?: string;
  line?: string;
  CodigoLineaParada?: string;
  codigoLineaParada?: string;
  DescripcionLinea?: string;
  descripcionLinea?: string;
  bandera?: string;
  DescripcionBandera?: string;
  descripcionBandera?: string;
  DescripcionCortaBandera?: string;
  descripcionCortaBandera?: string;
  DescripcionCartelBandera?: string;
  descripcionCartelBandera?: string;
  Arribo?: string;
  minutos?: number | string;
  Minutos?: number | string;
  arribo?: string;
  distancia?: number | string;
  Distancia?: number | string;
  distanciaMetros?: number | string;
  coche?: string;
  IdentificadorCoche?: string;
  identificadorCoche?: string;
  adaptado?: boolean | string;
  EsAdaptado?: string;
  esAdaptado?: string;
  Latitud?: string | number;
  latitud?: string | number;
  Longitud?: string | number;
  longitud?: string | number;
  LatitudParada?: string | number;
  latitudParada?: string | number;
  LongitudParada?: string | number;
  longitudParada?: string | number;
  desvioHorario?: string;
  DesvioHorario?: string;
  identificadorChofer?: string;
  IdentificadorChofer?: string;
  UltimaFechaHoraGPS?: string;
  ultimaFechaHoraGps?: string;
  fechaHoraGps?: string;
  timestamp?: string;
}

/** Normalized Bus Arrival domain entity */
export interface BusArrival {
  lineCode: string;
  branch: string | null;
  remainingMinutes: number | null;
  distanceMeters: number | null;
  vehicleUnit: string | null;
  accessible: boolean;
  latitude: number | null;
  longitude: number | null;
  timestamp: string;
  status: 'LIVE' | 'ESTIMATED_FALLBACK' | 'EXPIRED';
  stopLatitude?: number | null;
  stopLongitude?: number | null;
  estimatedArrivalTime?: string | null;
  scheduleDeviation?: string | null;
  driverId?: string | null;
}

export type BusArrivalItem = BusArrival;

export interface ArrivalResponse {
  lineCode: string;
  stopId: string;
  branch: string | null;
  status: 'LIVE' | 'ESTIMATED_FALLBACK' | 'EXPIRED' | 'UNAVAILABLE';
  timestamp: string;
  deltaMinutes: number;
  arrivals: BusArrival[];
  stopLatitude: number | null;
  stopLongitude: number | null;
}

/**
 * Parses minutes remaining from raw arrival text or numeric value.
 * Handles "arribando", "próximo", "proximo", "X min. aprox." and plain digits.
 */
export function parseRemainingMinutes(arribo: string | number | null | undefined): number | null {
  if (arribo === null || arribo === undefined) {
    return null;
  }
  if (typeof arribo === 'number') {
    return isNaN(arribo) ? null : Math.round(arribo);
  }
  const trimmed = arribo.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes('arribando') || trimmed.includes('próximo') || trimmed.includes('proximo')) {
    return 0;
  }
  const match = trimmed.match(/(\d+)/);
  if (match && match[1]) {
    const val = parseInt(match[1], 10);
    return isNaN(val) ? null : val;
  }
  return null;
}

/**
 * Safely parses coordinate float from string or number, supporting comma or dot decimals.
 */
export function parseCoordinate(coord: string | number | null | undefined): number | null {
  if (coord === null || coord === undefined) {
    return null;
  }
  if (typeof coord === 'number') {
    return isNaN(coord) ? null : coord;
  }
  const str = coord.toString().trim().replace(',', '.');
  if (!str) return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

/** Parses MGP's `dd/MM/yyyy HH:mm:ss` GPS timestamp into an ISO instant. */
export function parseMgpGpsTimestamp(value: unknown, fallback = new Date()): string {
  if (typeof value !== 'string' || !value.trim()) return fallback.toISOString();

  const text = value.trim();
  const direct = Date.parse(text);
  if (!Number.isNaN(direct) && /^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return new Date(direct).toISOString();
  }

  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return fallback.toISOString();

  const [, day, month, year, hour, minute, second = '0'] = match;
  // MGP reports its GPS clock in Argentina time (UTC-03:00), matching the
  // former backend's America/Argentina/Buenos_Aires conversion.
  const instant = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) + 3,
    Number(minute),
    Number(second)
  );
  return Number.isNaN(instant) ? fallback.toISOString() : new Date(instant).toISOString();
}

/**
 * Parses boolean indicator for wheelchair accessibility ("S", "SI", "1", true, etc.).
 */
export function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    return lower === 'true' || lower === '1' || lower === 's' || lower === 'si';
  }
  return false;
}

export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Normalizes an array of raw items into a sorted list of BusArrival entities.
 */
export function parseMgpArrivals(rawItems: any[], commercialLine: string): BusArrival[] {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  const nowIso = new Date().toISOString();
  const items: BusArrival[] = [];

  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue;

    const lineCode =
      commercialLine ||
      raw.linea ||
      raw.line ||
      raw.CodigoLineaParada ||
      raw.codigoLineaParada ||
      raw.DescripcionLinea ||
      raw.descripcionLinea ||
      toCommercialLineCode(raw.CodigoLineaParada ?? '');

    const branch =
      (
        raw.bandera ||
        raw.DescripcionBandera ||
        raw.descripcionBandera ||
        raw.DescripcionCortaBandera ||
        raw.descripcionCortaBandera ||
        raw.DescripcionCartelBandera ||
        raw.descripcionCartelBandera ||
        null
      )?.trim() || null;
    const arrivalText = raw.Arribo ?? raw.arribo;
    const rawMinutes = raw.Minutos ?? raw.minutos;
    let remainingMinutes = parseRemainingMinutes(arrivalText);
    // MGP often sends both the clock time (Arribo: "14:05") and the actual
    // countdown (Minutos: 5). The working backend deliberately preferred the
    // latter for clock-formatted arrival strings.
    if (remainingMinutes === null || (arrivalText && String(arrivalText).includes(':'))) {
      remainingMinutes = parseRemainingMinutes(rawMinutes);
    }

    const lat = parseCoordinate(raw.Latitud ?? raw.latitud);
    const lon = parseCoordinate(raw.Longitud ?? raw.longitud);
    const stopLat = parseCoordinate(raw.LatitudParada ?? raw.latitudParada);
    const stopLon = parseCoordinate(raw.LongitudParada ?? raw.longitudParada);

    let distanceMeters: number | null = null;
    const rawDistance = raw.distancia ?? raw.Distancia ?? raw.distanciaMetros;
    if (rawDistance !== undefined && rawDistance !== null && rawDistance !== '') {
      const d = Number(rawDistance);
      if (!isNaN(d)) distanceMeters = Math.round(d);
    }
    if (
      distanceMeters === null &&
      lat !== null &&
      lon !== null &&
      stopLat !== null &&
      stopLon !== null
    ) {
      distanceMeters = calculateHaversineDistanceMeters(lat, lon, stopLat, stopLon);
    }

    const estimatedArrival =
      (arrivalText && String(arrivalText).trim()) ||
      (remainingMinutes !== null ? `${remainingMinutes} min` : null);

    const vehicleUnit =
      (raw.coche || raw.IdentificadorCoche || raw.identificadorCoche || null)?.toString().trim() ||
      null;
    const accessible = parseBoolean(raw.adaptado ?? raw.EsAdaptado ?? raw.esAdaptado);
    const gpsTimestamp =
      raw.UltimaFechaHoraGPS ?? raw.ultimaFechaHoraGps ?? raw.fechaHoraGps ?? raw.timestamp;
    const scheduleDeviation = raw.DesvioHorario ?? raw.desvioHorario ?? null;
    const driverId = raw.IdentificadorChofer ?? raw.identificadorChofer ?? null;

    items.push({
      lineCode: lineCode?.trim() || '',
      branch,
      remainingMinutes,
      distanceMeters,
      estimatedArrivalTime: estimatedArrival,
      vehicleUnit,
      accessible,
      status: 'LIVE',
      timestamp: parseMgpGpsTimestamp(gpsTimestamp, new Date(nowIso)),
      latitude: lat,
      longitude: lon,
      stopLatitude: stopLat,
      stopLongitude: stopLon,
      scheduleDeviation,
      driverId,
    });
  }

  items.sort((a, b) => (a.remainingMinutes ?? Infinity) - (b.remainingMinutes ?? Infinity));
  return items;
}

/**
 * Pure function parsing municipal upstream response text or JSON into typed BusArrival list.
 */
export function parseMgpResponse(rawText: string, commercialLine: string): BusArrival[] {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return [];
  }

  let rawList: any[] = [];
  try {
    const parsed = JSON.parse(rawText.trim());
    if (Array.isArray(parsed)) {
      rawList = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const candidates =
        parsed.arribos ??
        parsed.Arribos ??
        parsed.proximosArribos ??
        parsed.arrivals ??
        parsed.items ??
        parsed.data ??
        parsed.resultado;
      if (Array.isArray(candidates)) {
        rawList = candidates;
      } else if (
        parsed.DescripcionLinea ||
        parsed.descripcionLinea ||
        parsed.linea ||
        parsed.Arribo ||
        parsed.arribo
      ) {
        // The former backend also accepted an individual arrival object.
        rawList = [parsed];
      }
    }
  } catch {
    return [];
  }

  return parseMgpArrivals(rawList, commercialLine);
}
