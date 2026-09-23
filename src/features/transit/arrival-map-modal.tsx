import { useMemo, useRef } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Images,
  type InitialViewState,
  Layer,
  type LngLat,
  Map,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';

import type { ArrivalResponseDTO, MapRoute, TransitStopWithFlagDTO } from '@/src/types/api';
import { getMapRoutes } from '@/src/features/map/api';
import { distanceMeters as geoDistanceMeters } from '@/src/features/map/geo';
import { queryKeys } from '@/src/lib/query-client';

const OSM_STYLE = {
  version: 8,
  name: 'OpenStreetMap',
  sources: {
    openstreetmap: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      minzoom: 1,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#121212' } },
    { id: 'openstreetmap', type: 'raster', source: 'openstreetmap' },
  ],
} satisfies StyleSpecification;

export const MAP_IMAGES = {
  'arrival-bus-icon':
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAGhSURBVHhe7dmxSgNBEAbglL6BORG0s9TKTsjjWFrkErscWGiRUrAMNt5pIQHBwkJsxEILQQtFFAIaCIgBQSJEWFlRiHMb3JvZPTj5P5gqOzezvyAXUioBAAAAAAAAgIlSqqKUigpYFXoXlu+HFVFE78KCABAAAjAGcHrfU82jK+vS5132W/AbgF4qqCXWpc+77LeAAOhdWBAAAkAACIA+WZNeQNpvAQHQu7AggDEBSN/kpP0W/AZQAAiA3oUFASAABIAA6JMLAgHQu7DYBHD91P96UbnoPNOPnMo4x38AepGl5uGvV9b5tbY6vunSoyLMOX4D0EvR9/XRSs4faAuLYI6/AN6HH2px/SC1zGjNNfZV73VAWzMRzvEXwF9/lZ9qX3ZoaybCOf4C2D67Sy1hKv0tTkI4x18A+p8PXcJU+gISwjnOAkj9PP748rYxXd8d0kVondx2N2lvlhLOcfPz+DjlcGeZLkJqi/Zw5DWHJajGq+UwGRiWas00WhP0PFdec1gm6/FsUEtWgjCO9KJT1b0FesaFvOYAAAAAAADAf/cJmRH3+x90+CEAAAAASUVORK5CYII=',
  'arrival-stop-icon':
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAGfSURBVHhe7Zg9bsJAEIU5CD8FUIUqVURlmohLUOQISCkpfAKkCBGlQEqPlC4FokrnXIAUaZ3KJ3C30SAc2Q+vsRfJ3qzeJ03FPLzzebHRtlqEEEIIqQOllKeU8kuUh1knOA1XBh+zTkABFEABbgmo8FRP6gMn1SB9mC2qZt4ap4vbQDM7hgIogAJyBQTBp1ounwpLeq7NpLBLgCy22x0UlvRcm0lBAbi2WqAACqAACsCVCCbDmGRS2CXA5J1ukklhl4AGoABcWy1QQAkB8ruViuMYP7pIhax9Ag6HLzWZ3P89wUejW7Xb7bEtF4OsXQLkjo3H3tlrbDi8UWH4g+0ZDLN2CZC7hQMktdm8YnsGw6xdArbbt7PFJ7Vev2B7BsOsXQKiKDpuWRxAquDPzBHDbGMCtMfii4X/jgPM548hrjyP1er5G7Oz2UOA10hVM8fil+j1BnedTt+Xarf7U92OycHHLH73v6SKAMw6AQVQAAVQAE6qgQIw6wQUQAEUQAE4qQYKwKwTUAAFUAAF4KQanBWgPUOEsvOMjxBCCHGLX+rTChW/K2sbAAAAAElFTkSuQmCC',
  'route-arrow-icon':
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAG0SURBVHhe7ZivUsQwEIdP4pJ02wFXJBKJRN4j8Ag8AhKHRPIISCQSiUQikciTyLtpe+2FZe5oe9vsJt1v5mf6J5P5pkl/7WKhKIqiKIqiKIMw5vQcH5sVxsG9dfBhDFzjc7OgEZCvt3mZ3ROBBKythZ/qWFmWJ/jaJPkjYCfi27n8Bl+fHHsFdCLy9yzLrvB9yfCvgJ2Ip6IozvD90dNbQJOVc3CX1P4wUECbL+eKJR4rSkYKaGLhFQAu8JhRcZSALvBojLF47CigEVCn2h9u8fjiIRSwTWS1ml5Alzhq9YQC4qjVkwpoI7lWBxHQRmKtDiqgjaRazSKgiYxazSigDW+tFiCgCVetFiOgS+BaLU9AnZUxxSWe6yTIExC4SosRUJclho8pEQJs/hB03fuwCuDa+X1YBNj8k/Xd7xNYQN3+8BxYCSZAUv/3CSDgLdg7fQyTCZD8D8CHXEAMf4F8SAVYeBa5zg9BIyBwfaXkKAFc9ZWS0QI46yslgwVIqK+U9BYgqb5S0kOAvPpKyUEBUusrJXsEyK6vlPwSEEt9paQWEFt9paRqcMmvc0VRFEVRlJTZAIL+AEQm5Cs9AAAAAElFTkSuQmCC',
} as const;

const ROUTE_OPTIONS = { staleTime: 5 * 60_000, gcTime: 30 * 60_000, retry: 1 } as const;
const ROUTE_ARROW_SPACING_METERS = 400;

type MapViewport =
  { kind: 'bounds'; bounds: [number, number, number, number] } | { kind: 'center'; center: LngLat };

export function ArrivalMapModal({
  arrivals,
  direction,
  isRefreshing,
  lineCode,
  onClose,
  onRefresh,
  stop,
  visible,
}: {
  arrivals: ArrivalResponseDTO | undefined;
  direction: string;
  isRefreshing: boolean;
  lineCode: string;
  onClose: () => void;
  onRefresh: () => void;
  stop: TransitStopWithFlagDTO;
  visible: boolean;
}) {
  const cameraRef = useRef<CameraRef>(null);
  const routesQuery = useQuery({
    queryKey: queryKeys.map.routes(lineCode),
    queryFn: () => getMapRoutes(lineCode),
    enabled: visible && Boolean(lineCode),
    ...ROUTE_OPTIONS,
  });
  const stopPosition = toLngLat(
    arrivals?.stopLongitude ?? stop.longitudParada,
    arrivals?.stopLatitude ?? stop.latitudParada
  );
  const vehicles = (arrivals?.arrivals ?? []).flatMap((arrival) => {
    const position = toLngLat(arrival.longitude, arrival.latitude);
    return position
      ? [{ id: arrival.vehicleUnit ?? `${arrival.lineCode}:${position.join(':')}`, position }]
      : [];
  });
  const stopFeatures = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: stopPosition
        ? [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: stopPosition },
            },
          ]
        : [],
    }),
    [stopPosition]
  );
  const vehicleFeatures = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: vehicles.map(({ id, position }) => ({
        type: 'Feature',
        properties: { id },
        geometry: { type: 'Point', coordinates: position },
      })),
    }),
    [vehicles]
  );
  const routeFeatures = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: (routesQuery.data ?? [])
        .filter((route) => routeMatchesDirection(route, direction))
        .map((route) => ({
          type: 'Feature' as const,
          properties: { id: route.id },
          geometry: {
            type: 'LineString' as const,
            coordinates: route.coordinates.map(([longitude, latitude]) => [longitude, latitude]),
          },
        }))
        .filter((feature) => feature.geometry.coordinates.length > 1),
    }),
    [direction, routesQuery.data]
  );
  const routeArrowFeatures = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: (routesQuery.data ?? [])
        .filter((route) => routeMatchesDirection(route, direction))
        .flatMap((route) =>
          createRouteArrows(route.coordinates).map((arrow) => ({
            type: 'Feature' as const,
            properties: { bearing: arrow.bearing - 90, id: route.id },
            geometry: { type: 'Point' as const, coordinates: arrow.lngLat },
          }))
        ),
    }),
    [direction, routesQuery.data]
  );
  const viewport = useMemo(
    () =>
      mapViewport(stopPosition ? [stopPosition, ...vehicles.map(({ position }) => position)] : []),
    [stopPosition, vehicles]
  );
  const initialViewState = useMemo<InitialViewState>(
    () => toInitialViewState(viewport),
    [viewport]
  );

  const recenter = () => {
    if (viewport.kind === 'bounds') {
      cameraRef.current?.fitBounds(viewport.bounds, {
        bearing: 0,
        duration: 450,
        padding: MAP_PADDING,
      });
    } else {
      cameraRef.current?.flyTo({ bearing: 0, center: viewport.center, duration: 450, zoom: 16 });
    }
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View className="flex-1 justify-center bg-black/65 px-4 py-8">
        <View className="h-[78%] overflow-hidden rounded-3xl bg-[#1E1E24]">
          <View className="flex-row items-center justify-between px-4 py-3">
            <View>
              <Text className="text-lg font-bold text-[#E1E1E6]">Ubicación en el mapa</Text>
              <Text className="mt-0.5 text-sm text-[#A4A4AB]">Parada y colectivos próximos</Text>
            </View>
            <Pressable
              accessibilityLabel="Actualizar ubicaciones"
              className="h-10 w-10 items-center justify-center rounded-full bg-[#25252B] active:opacity-70 disabled:opacity-50"
              disabled={isRefreshing}
              onPress={onRefresh}>
              {isRefreshing ? (
                <ActivityIndicator color="#80D4FF" size="small" />
              ) : (
                <MaterialCommunityIcons color="#80D4FF" name="refresh" size={21} />
              )}
            </Pressable>
          </View>

          <View className="flex-1">
            <Map
              androidView="texture"
              attribution={false}
              compass={false}
              logo={false}
              mapStyle={OSM_STYLE}
              style={{ flex: 1 }}>
              <Camera
                initialViewState={initialViewState}
                maxZoom={19}
                minZoom={1}
                ref={cameraRef}
              />
              <Images images={MAP_IMAGES} />
              <GeoJSONSource data={routeFeatures} id="arrival-route">
                <Layer
                  id="arrival-route-line"
                  paint={{ 'line-color': '#1976A8', 'line-opacity': 0.92, 'line-width': 4 }}
                  type="line"
                />
              </GeoJSONSource>
              <GeoJSONSource data={routeArrowFeatures} id="arrival-route-arrows">
                <Layer
                  id="arrival-route-arrow-symbols"
                  layout={{
                    'icon-allow-overlap': true,
                    'icon-image': 'route-arrow-icon',
                    'icon-ignore-placement': true,
                    'icon-rotate': ['get', 'bearing'],
                    'icon-rotation-alignment': 'map',
                    'icon-size': 0.24,
                  }}
                  type="symbol"
                />
              </GeoJSONSource>
              <GeoJSONSource data={stopFeatures} id="arrival-stop">
                <Layer
                  id="arrival-stop-marker"
                  paint={{
                    'circle-color': '#1E1E24',
                    'circle-radius': 14,
                    'circle-stroke-color': '#80D4FF',
                    'circle-stroke-width': 3,
                  }}
                  type="circle"
                />
                <Layer
                  id="arrival-stop-icon"
                  layout={{
                    'icon-allow-overlap': true,
                    'icon-image': 'arrival-stop-icon',
                    'icon-ignore-placement': true,
                    'icon-size': 0.48,
                  }}
                  type="symbol"
                />
              </GeoJSONSource>
              <GeoJSONSource data={vehicleFeatures} id="arrival-vehicles">
                <Layer
                  id="arrival-vehicle-marker"
                  paint={{
                    'circle-color': '#1976A8',
                    'circle-radius': 13,
                    'circle-stroke-color': '#E1E1E6',
                    'circle-stroke-width': 2,
                  }}
                  type="circle"
                />
                <Layer
                  id="arrival-vehicle-icon"
                  layout={{
                    'icon-allow-overlap': true,
                    'icon-image': 'arrival-bus-icon',
                    'icon-ignore-placement': true,
                    'icon-size': 0.46,
                  }}
                  type="symbol"
                />
              </GeoJSONSource>
            </Map>

            <View className="absolute left-3 right-3 top-3 flex-row justify-between">
              <View className="rounded-full bg-[#121212]/90 px-3 py-2">
                <Text className="text-xs text-[#E1E1E6]">
                  {vehicles.length === 0
                    ? 'Sin ubicación en vivo del colectivo'
                    : `${vehicles.length} colectivo${vehicles.length === 1 ? '' : 's'} ubicado${vehicles.length === 1 ? '' : 's'}`}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Centrar parada y colectivos"
                className="h-10 w-10 items-center justify-center rounded-full bg-[#121212]/90 active:opacity-70"
                onPress={recenter}>
                <MaterialCommunityIcons color="#80D4FF" name="crosshairs-gps" size={21} />
              </Pressable>
            </View>
          </View>

          <View className="p-4">
            <Pressable
              accessibilityLabel="Cerrar mapa"
              className="items-center rounded-xl bg-[#25252B] py-3.5 active:opacity-70"
              onPress={onClose}>
              <Text className="font-semibold text-[#E1E1E6]">Cerrar mapa</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function toLngLat(
  longitude: number | null | undefined,
  latitude: number | null | undefined
): LngLat | null {
  return typeof longitude === 'number' && typeof latitude === 'number'
    ? [longitude, latitude]
    : null;
}

function mapViewport(points: LngLat[]): MapViewport {
  if (points.length === 0) {
    return { kind: 'center', center: [-57.5426, -38.0055] };
  }
  if (points.length === 1) {
    return { kind: 'center', center: points[0] };
  }

  const longitudes = points.map(([longitude]) => longitude);
  const latitudes = points.map(([, latitude]) => latitude);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const minimumSpan = 0.003;

  return {
    kind: 'bounds',
    bounds: [
      west === east ? west - minimumSpan : west,
      south === north ? south - minimumSpan : south,
      west === east ? east + minimumSpan : east,
      south === north ? north + minimumSpan : north,
    ],
  };
}

function toInitialViewState(viewport: MapViewport): InitialViewState {
  return viewport.kind === 'bounds'
    ? { bounds: viewport.bounds, padding: MAP_PADDING }
    : { center: viewport.center, zoom: 16 };
}

const MAP_PADDING = { bottom: 42, left: 42, right: 42, top: 42 };

function routeMatchesDirection(route: MapRoute, direction: string): boolean {
  return (
    !direction || (route.description ?? '').split(';').some((field) => field.trim() === direction)
  );
}

function createRouteArrows(coordinates: [number, number][]): RouteArrow[] {
  const arrows: RouteArrow[] = [];
  let distanceSinceLastArrow = 0;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    const segmentMeters = distanceMeters(start, end);
    if (segmentMeters === 0) continue;

    const bearing = bearingDegrees(start, end);
    let traversedMeters = 0;
    while (
      distanceSinceLastArrow + (segmentMeters - traversedMeters) >=
      ROUTE_ARROW_SPACING_METERS
    ) {
      const metersToArrow = ROUTE_ARROW_SPACING_METERS - distanceSinceLastArrow;
      traversedMeters += metersToArrow;
      const fraction = traversedMeters / segmentMeters;
      arrows.push({
        bearing,
        lngLat: [
          start[0] + (end[0] - start[0]) * fraction,
          start[1] + (end[1] - start[1]) * fraction,
        ],
      });
      distanceSinceLastArrow = 0;
    }
    distanceSinceLastArrow += segmentMeters - traversedMeters;
  }

  return arrows;
}

type RouteArrow = { lngLat: LngLat; bearing: number };

function distanceMeters(
  [startLongitude, startLatitude]: LngLat,
  [endLongitude, endLatitude]: LngLat
): number {
  return geoDistanceMeters([startLongitude, startLatitude], [endLongitude, endLatitude]);
}

function bearingDegrees(
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

function radians(degreesValue: number): number {
  return (degreesValue * Math.PI) / 180;
}

function degrees(radiansValue: number): number {
  return (radiansValue * 180) / Math.PI;
}
