/**
 * Unit tests for filterArrowsByStopProximity and routeMatchesDirection in geo.ts.
 *
 * These are plain TypeScript / Jest tests with no React Native dependencies.
 * Run with:  npx jest src/features/map/geo.test.ts
 * (requires jest + ts-jest to be configured; validated with tsc --noEmit regardless)
 */

import { describe, expect, it } from 'vitest';

import { filterArrowsByStopProximity, routeMatchesDirection } from './geo';
import type { RouteArrow, StopLike } from './geo';
import type { MapRoute } from '@/src/types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** ~111 m at latitude −38° */
const ONE_DEGREE_METERS = 111_000;

function makeArrow(lng: number, lat: number, bearing = 0): RouteArrow {
  return { lngLat: [lng, lat], bearing };
}

function makeStop(lng: number | null, lat: number | null): StopLike {
  return { longitude: lng, latitude: lat };
}

// ---------------------------------------------------------------------------
// filterArrowsByStopProximity
// ---------------------------------------------------------------------------

describe('filterArrowsByStopProximity', () => {
  const MIN_DISTANCE = 30; // metres — matches ROUTE_ARROW_MINIMUM_STOP_DISTANCE_METERS

  describe('no stops', () => {
    it('returns all arrows when stops array is empty', () => {
      const arrows = [makeArrow(0, 0), makeArrow(0.01, 0)];
      expect(filterArrowsByStopProximity(arrows, [], MIN_DISTANCE)).toEqual(arrows);
    });
  });

  describe('stops with null coordinates', () => {
    it('ignores stops with null latitude/longitude', () => {
      const arrows = [makeArrow(0, 0)];
      const stops = [makeStop(null, null), makeStop(0, null), makeStop(null, 0)];
      // Arrow should NOT be filtered because null-coordinate stops are ignored
      expect(filterArrowsByStopProximity(arrows, stops, MIN_DISTANCE)).toEqual(arrows);
    });
  });

  describe('arrow exactly AT stop position (0 m distance)', () => {
    it('removes the arrow', () => {
      const arrow = makeArrow(0, 0);
      const stop = makeStop(0, 0);
      expect(filterArrowsByStopProximity([arrow], [stop], MIN_DISTANCE)).toHaveLength(0);
    });
  });

  describe('arrow within min distance', () => {
    it('removes arrow that is 15 m from a stop (< 30 m threshold)', () => {
      // 15 m ≈ 15/111000 degrees longitude at equator
      const offset = 15 / ONE_DEGREE_METERS;
      const arrow = makeArrow(offset, 0);
      const stop = makeStop(0, 0);
      expect(filterArrowsByStopProximity([arrow], [stop], MIN_DISTANCE)).toHaveLength(0);
    });
  });

  describe('arrow beyond min distance', () => {
    it('keeps arrow that is 50 m from the nearest stop (> 30 m threshold)', () => {
      const offset = 50 / ONE_DEGREE_METERS;
      const arrow = makeArrow(offset, 0);
      const stop = makeStop(0, 0);
      const result = filterArrowsByStopProximity([arrow], [stop], MIN_DISTANCE);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(arrow);
    });
  });

  describe('arrow exactly at threshold boundary', () => {
    it('keeps arrow at exactly minDistance (>= is the keep condition)', () => {
      // The original filter kept arrow when distance >= minDistanceMeters.
      // Our grid filter removes when distance < minDistanceMeters, so distance === min → keep.
      const offset = MIN_DISTANCE / ONE_DEGREE_METERS;
      const arrow = makeArrow(offset, 0);
      const stop = makeStop(0, 0);
      const result = filterArrowsByStopProximity([arrow], [stop], MIN_DISTANCE);
      // distance should be close enough to MIN_DISTANCE that the arrow is kept
      expect(result).toHaveLength(1);
    });
  });

  describe('multiple stops, one nearby', () => {
    it('removes arrow when ANY stop is within min distance', () => {
      const arrow = makeArrow(0, 0);
      const stops = [
        makeStop(1, 1), // far away
        makeStop(0.0001, 0.0001), // ~15 m — close
      ];
      expect(filterArrowsByStopProximity([arrow], stops, MIN_DISTANCE)).toHaveLength(0);
    });
  });

  describe('multiple arrows, mixed distances', () => {
    it('selectively filters only the arrows that are too close', () => {
      const close = makeArrow(0.0001, 0); // close to stop at origin
      const far = makeArrow(0.01, 0); // far from stop at origin
      const stop = makeStop(0, 0);
      const result = filterArrowsByStopProximity([close, far], [stop], MIN_DISTANCE);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(far);
    });
  });

  describe('stops in different grid cells', () => {
    it('correctly finds a stop that is in an adjacent cell to the arrow', () => {
      // Cell size ≈ minDistance/111000/2. With MIN_DISTANCE=30, cellDegrees ≈ 0.000135.
      // Place stop at (0,0) and arrow just inside the 3×3 neighbourhood.
      const arrow = makeArrow(0.0002, 0); // in a nearby cell
      const stop = makeStop(0, 0);
      // Distance = 0.0002 * 111000 ≈ 22 m < 30 m → should be removed
      expect(filterArrowsByStopProximity([arrow], [stop], MIN_DISTANCE)).toHaveLength(0);
    });

    it('does not flag an arrow in a cell far from all stops', () => {
      // Place arrow far from any stop (multiple cells away)
      const arrow = makeArrow(0.1, 0);
      const stop = makeStop(0, 0);
      expect(filterArrowsByStopProximity([arrow], [stop], MIN_DISTANCE)).toHaveLength(1);
    });

    it('finds a nearby stop two cells away across a grid boundary', () => {
      const cellDegrees = MIN_DISTANCE / ONE_DEGREE_METERS / 2;
      const arrow = makeArrow(cellDegrees * 0.98, 0);
      const stop = makeStop(-cellDegrees * 1.01, 0);
      expect(filterArrowsByStopProximity([arrow], [stop], MIN_DISTANCE)).toHaveLength(0);
    });
  });

  describe('large stop arrays (performance smoke test)', () => {
    it('handles 500 stops and 200 arrows without error', () => {
      const stops: StopLike[] = Array.from({ length: 500 }, (_, i) => ({
        latitude: (i * 0.001) % 0.5,
        longitude: (i * 0.0007) % 0.3,
      }));
      const arrows: RouteArrow[] = Array.from({ length: 200 }, (_, i) =>
        makeArrow((i * 0.002) % 0.3, (i * 0.0015) % 0.3)
      );
      expect(() => filterArrowsByStopProximity(arrows, stops, MIN_DISTANCE)).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// routeMatchesDirection
// ---------------------------------------------------------------------------

describe('routeMatchesDirection', () => {
  function makeRoute(description: string | null): MapRoute {
    return { id: 'r1', branch: '', description, coordinates: [] };
  }

  it('returns false for null direction', () => {
    expect(routeMatchesDirection(makeRoute('FARO;CENTRO'), null)).toBe(false);
  });

  it('returns false for empty string direction', () => {
    expect(routeMatchesDirection(makeRoute('FARO;CENTRO'), '')).toBe(false);
  });

  it('matches an exact field', () => {
    expect(routeMatchesDirection(makeRoute('code;FARO;Terminal del Faro'), 'FARO')).toBe(true);
  });

  it('does not match a substring (e.g. FARO inside FAROL)', () => {
    expect(routeMatchesDirection(makeRoute('code;FAROL;Terminal Farol'), 'FARO')).toBe(false);
  });

  it('matches the third field', () => {
    expect(
      routeMatchesDirection(makeRoute('code;FAR;Terminal del Faro'), 'Terminal del Faro')
    ).toBe(true);
  });

  it('trims whitespace around fields before matching', () => {
    expect(routeMatchesDirection(makeRoute('code ; FARO ; Terminal'), 'FARO')).toBe(true);
  });

  it('returns false when route description is null', () => {
    expect(routeMatchesDirection(makeRoute(null), 'FARO')).toBe(false);
  });

  it('returns false when no field matches', () => {
    expect(routeMatchesDirection(makeRoute('code;CENTRO;Terminal Centro'), 'FARO')).toBe(false);
  });
});
