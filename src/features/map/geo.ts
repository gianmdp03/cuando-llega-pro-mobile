import type { LngLat } from '@maplibre/maplibre-react-native';
import type { MapRoute } from '@/src/types/api';

export type RouteArrow = { lngLat: LngLat; bearing: number };

/** Minimal stop shape accepted by the proximity filter — matches MapStop and NearbyMapStop. */
export type StopLike = { latitude: number | null; longitude: number | null };

// ---------------------------------------------------------------------------
// Spatial grid for O(1) stop-proximity look-up
// ---------------------------------------------------------------------------

/**
 * Sparse grid keyed by `"col:row"` that maps each cell to the list of valid
 * stop positions it contains. Used internally by {@link filterArrowsByStopProximity}.
 */
type StopGrid = {
  cells: Map<string, LngLat[]>;
  /** Cell side-length in degrees. */
  cellDegrees: number;
};

function cellKey(col: number, row: number): string {
  return `${col}:${row}`;
}

function buildStopGrid(stops: StopLike[], cellDegrees: number): StopGrid {
  const cells = new Map<string, LngLat[]>();
  for (const stop of stops) {
    if (stop.latitude === null || stop.longitude === null) continue;
    const col = Math.floor(stop.longitude / cellDegrees);
    const row = Math.floor(stop.latitude / cellDegrees);
    const key = cellKey(col, row);
    const bucket = cells.get(key);
    const pos: LngLat = [stop.longitude, stop.latitude];
    if (bucket) {
      bucket.push(pos);
    } else {
      cells.set(key, [pos]);
    }
  }
  return { cells, cellDegrees };
}

/**
 * Returns `true` when any stop in the grid is within `minDistanceMeters` of
 * `point`. The searched cell radius is derived from the requested distance,
 * keeping the per-arrow cost bounded while preserving nearby matches across cell boundaries.
 */
function gridHasNearbyStop(grid: StopGrid, point: LngLat, minDistanceMeters: number): boolean {
  const { cells, cellDegrees } = grid;
  const col = Math.floor(point[0] / cellDegrees);
  const row = Math.floor(point[1] / cellDegrees);

  const metersPerDegreeLongitude = 111_000 * Math.max(Math.cos((point[1] * Math.PI) / 180), 0.01);
  const minimumCellWidthMeters = Math.min(111_000, metersPerDegreeLongitude) * cellDegrees;
  const cellRadius = Math.ceil(minDistanceMeters / minimumCellWidthMeters);

  for (let dc = -cellRadius; dc <= cellRadius; dc++) {
    for (let dr = -cellRadius; dr <= cellRadius; dr++) {
      const bucket = cells.get(cellKey(col + dc, row + dr));
      if (!bucket) continue;
      for (const stopPos of bucket) {
        if (distanceMeters(point, stopPos) < minDistanceMeters) return true;
      }
    }
  }
  return false;
}

/**
 * Filters `arrows` to remove any arrow that is closer than `minDistanceMeters`
 * to any stop in `stops`.
 *
 * Complexity: O(arrows + stops) average-case via a spatial grid, versus the
 * previous O(arrows × stops) exhaustive comparison.
 *
 * The visible result is identical to the original `stops.every(...)` filter.
 */
export function filterArrowsByStopProximity(
  arrows: RouteArrow[],
  stops: StopLike[],
  minDistanceMeters: number
): RouteArrow[] {
  if (stops.length === 0) return arrows;

  // Cell size is half the requested distance; the search radius expands to cover boundaries.
  const cellDegrees = minDistanceMeters / 111_000 / 2;
  const grid = buildStopGrid(stops, cellDegrees);

  return arrows.filter((arrow) => !gridHasNearbyStop(grid, arrow.lngLat, minDistanceMeters));
}

// ---------------------------------------------------------------------------
// Route direction matching
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `route` belongs to `direction`.
 *
 * MGP encodes its route description as "code;short destination;long destination".
 * We match complete semicolon-delimited fields so that e.g. "FARO" does not
 * accidentally match inside a longer destination name.
 *
 * Passing `null` or an empty string for `direction` always returns `false`.
 */
export function routeMatchesDirection(route: MapRoute, direction: string | null): boolean {
  if (!direction) return false;
  return (route.description ?? '').split(';').some((field) => field.trim() === direction);
}

// ---------------------------------------------------------------------------
// Arrow generation
// ---------------------------------------------------------------------------

export function createRouteArrows(coordinates: LngLat[], spacingMeters: number): RouteArrow[] {
  const arrows: RouteArrow[] = [];
  let distanceSinceLastArrow = 0;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    const segmentMeters = distanceMeters(start, end);
    if (segmentMeters === 0) continue;
    const bearing = bearingDegrees(start, end);
    let traversedMeters = 0;
    while (distanceSinceLastArrow + (segmentMeters - traversedMeters) >= spacingMeters) {
      const metersToArrow = spacingMeters - distanceSinceLastArrow;
      traversedMeters += metersToArrow;
      const fraction = traversedMeters / segmentMeters;
      arrows.push({
        lngLat: [
          start[0] + (end[0] - start[0]) * fraction,
          start[1] + (end[1] - start[1]) * fraction,
        ],
        bearing,
      });
      distanceSinceLastArrow = 0;
    }
    distanceSinceLastArrow += segmentMeters - traversedMeters;
  }
  return arrows;
}

// ---------------------------------------------------------------------------
// Geodetic primitives
// ---------------------------------------------------------------------------

export function bearingDegrees(
  [startLongitude, startLatitude]: LngLat,
  [endLongitude, endLatitude]: LngLat
): number {
  const longitudeDelta = radians(endLongitude - startLongitude);
  const startLatitudeRadians = radians(startLatitude);
  const endLatitudeRadians = radians(endLatitude);
  const radiansBearing = Math.atan2(
    Math.sin(longitudeDelta) * Math.cos(endLatitudeRadians),
    Math.cos(startLatitudeRadians) * Math.sin(endLatitudeRadians) -
      Math.sin(startLatitudeRadians) * Math.cos(endLatitudeRadians) * Math.cos(longitudeDelta)
  );
  return (degrees(radiansBearing) + 360) % 360;
}

export function distanceMeters(
  [startLongitude, startLatitude]: LngLat,
  [endLongitude, endLatitude]: LngLat
): number {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = radians(endLatitude - startLatitude);
  const longitudeDelta = radians(endLongitude - startLongitude);
  const startLatitudeRadians = radians(startLatitude);
  const endLatitudeRadians = radians(endLatitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitudeRadians) *
      Math.cos(endLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function degrees(radiansValue: number): number {
  return (radiansValue * 180) / Math.PI;
}
