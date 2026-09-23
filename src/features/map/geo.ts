import type { LngLat } from '@maplibre/maplibre-react-native';

export type RouteArrow = { lngLat: LngLat; bearing: number };

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
