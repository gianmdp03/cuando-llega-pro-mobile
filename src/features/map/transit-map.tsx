import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import {
  Camera,
  GeoJSONSource,
  Images,
  Layer,
  type LngLat,
  Map,
  type InitialViewState,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import {
  getMapDirections,
  getMapLines,
  getMapRoutes,
  getMapStop,
  getMapStops,
} from '@/src/features/map/api';
import { getArrivals } from '@/src/features/transit/api';
import { MAP_IMAGES } from '@/src/features/transit/arrival-map-modal';
import { MapControls } from '@/src/features/map/map-controls';
import { StopSheet } from '@/src/features/map/stop-sheet';
import { ArrivalDetail, TelemetryBadge } from '@/src/features/transit/arrival-ui';
import {
  createRouteArrows as createSharedRouteArrows,
  distanceMeters as geoDistanceMeters,
} from '@/src/features/map/geo';
import {
  getArrivalClockTime,
  getVisualRemainingMinutes,
  useArrivalClock,
} from '@/src/features/transit/use-arrival-ticker';
import { queryKeys } from '@/src/lib/query-client';
import type {
  BusArrival,
  MapLine,
  MapRoute,
  MapStop,
  MapStopDetail,
  MapStopDirection,
} from '@/src/types/api';

const INITIAL_CAMERA: InitialViewState = { center: [-57.5426, -38.0055], zoom: 12 };
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
const CATALOG_OPTIONS = { staleTime: 5 * 60_000, gcTime: 30 * 60_000, retry: 1 } as const;

export function TransitMap() {
  const [line, setLine] = useState<MapLine | null>(null);
  const [direction, setDirection] = useState<string | null>(null);
  const [stop, setStop] = useState<MapStop | null>(null);
  const linesQuery = useQuery({
    queryKey: queryKeys.map.lines(),
    queryFn: getMapLines,
    ...CATALOG_OPTIONS,
  });
  const directionsQuery = useQuery({
    queryKey: queryKeys.map.directions(line?.name ?? ''),
    queryFn: () => getMapDirections(line!.name),
    enabled: !!line,
    ...CATALOG_OPTIONS,
  });
  const stopsQuery = useQuery({
    queryKey: queryKeys.map.stops(line?.name ?? '', direction ?? ''),
    queryFn: () => getMapStops(line!.name, direction!),
    enabled: !!line && !!direction,
    ...CATALOG_OPTIONS,
  });
  const routesQuery = useQuery({
    queryKey: queryKeys.map.routes(line?.name ?? ''),
    queryFn: () => getMapRoutes(line!.name),
    enabled: !!line,
    ...CATALOG_OPTIONS,
  });
  const stopQuery = useQuery({
    queryKey: queryKeys.map.stop(stop?.identifier ?? ''),
    queryFn: () => getMapStop(stop!.identifier),
    enabled: !!stop,
    ...CATALOG_OPTIONS,
  });
  const markers = useMemo(
    () =>
      (stopsQuery.data ?? []).filter((item) => item.latitude !== null && item.longitude !== null),
    [stopsQuery.data]
  );
  const routeLines = useMemo(
    () =>
      (routesQuery.data ?? [])
        .filter((route) => routeMatchesDirection(route, direction))
        .map((route) => createRouteLine(route, markers))
        .filter((route): route is RenderedRoute => route !== null),
    [direction, markers, routesQuery.data]
  );
  const stopFeatures = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: markers.map((item) => ({
        type: 'Feature',
        properties: { identifier: item.identifier },
        geometry: { type: 'Point', coordinates: [item.longitude!, item.latitude!] },
      })),
    }),
    [markers]
  );
  const arrowFeatures = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: routeLines.flatMap(({ id, arrows }) =>
        arrows.map((arrow) => ({
          type: 'Feature',
          properties: { bearing: arrow.bearing - 90, id },
          geometry: { type: 'Point', coordinates: arrow.lngLat },
        }))
      ),
    }),
    [routeLines]
  );

  return (
    <View className="flex-1 bg-[#121212]">
      <Map
        androidView="texture"
        attribution={false}
        logo={false}
        mapStyle={OSM_STYLE}
        onPress={(event) => {
          const selected = findStopAtTap(event.nativeEvent.lngLat, markers);
          if (selected) setStop(selected);
        }}
        style={{ flex: 1 }}>
        <Camera initialViewState={INITIAL_CAMERA} maxZoom={19} minZoom={1} />
        <Images images={MAP_IMAGES} />
        {routeLines.map(({ id, line }) => (
          <GeoJSONSource data={line} id={`transit-route-${id}`} key={id}>
            <Layer
              id={`transit-route-line-${id}`}
              paint={{ 'line-color': '#1976A8', 'line-opacity': 0.9, 'line-width': 4 }}
              source={`transit-route-${id}`}
              type="line"
            />
          </GeoJSONSource>
        ))}
        <GeoJSONSource data={arrowFeatures} id="transit-route-arrows" key="transit-route-arrows-v2">
          <Layer
            id="transit-route-arrow-symbols"
            layout={{
              'icon-allow-overlap': true,
              'icon-image': 'route-arrow-icon',
              'icon-ignore-placement': true,
              'icon-rotate': ['get', 'bearing'],
              'icon-rotation-alignment': 'map',
              'icon-size': 0.5,
            }}
            type="symbol"
          />
        </GeoJSONSource>
        <GeoJSONSource
          data={stopFeatures}
          hitbox={{ bottom: 18, left: 18, right: 18, top: 18 }}
          id="transit-stops"
          onPress={(event) => {
            const identifier = event.nativeEvent.features[0]?.properties?.identifier;
            const selected =
              typeof identifier === 'string'
                ? markers.find((item) => item.identifier === identifier)
                : undefined;
            if (selected) setStop(selected);
          }}>
          <Layer
            id="transit-stop-circle"
            paint={{
              'circle-color': '#1E1E24',
              'circle-radius': 14,
              'circle-stroke-color': '#80D4FF',
              'circle-stroke-width': 3,
            }}
            type="circle"
          />
          <Layer
            id="transit-stop-icon"
            layout={{
              'icon-allow-overlap': true,
              'icon-image': 'arrival-stop-icon',
              'icon-ignore-placement': true,
              'icon-size': 0.48,
            }}
            type="symbol"
          />
        </GeoJSONSource>
      </Map>
      <MapControls
        direction={direction}
        directionsQuery={directionsQuery}
        line={line}
        linesQuery={linesQuery}
        onDirectionChange={(value) => {
          setDirection(value);
          setStop(null);
        }}
        onLineChange={(value) => {
          setLine(value);
          setDirection(null);
          setStop(null);
        }}
        showError={
          linesQuery.isError || directionsQuery.isError || stopsQuery.isError || routesQuery.isError
        }
      />
      <Text className="absolute bottom-3 left-4 text-xs text-[#A4A4AB]">
        © OpenStreetMap contributors
      </Text>
      {stop ? (
        <StopSheet
          key={stop.identifier}
          detail={stopQuery.data}
          isLoading={stopQuery.isPending}
          onClose={() => setStop(null)}
        />
      ) : null}
    </View>
  );
}

type RouteLine = {
  type: 'Feature';
  properties: Record<string, never>;
  geometry: { type: 'LineString'; coordinates: LngLat[] };
};

type RouteArrow = { lngLat: LngLat; bearing: number };
type RenderedRoute = { id: string; line: RouteLine; arrows: RouteArrow[] };

const ROUTE_ARROW_SPACING_METERS = 400;
const ROUTE_ARROW_MINIMUM_STOP_DISTANCE_METERS = 30;
const STOP_TAP_RADIUS_METERS = 65;

function routeMatchesDirection(route: MapRoute, direction: string | null): boolean {
  if (!direction) {
    return false;
  }

  // MGP encodes its route description as "code;short destination;long destination".
  // Match complete fields, never a substring such as "FARO" inside another destination.
  return (route.description ?? '').split(';').some((field) => field.trim() === direction);
}

function createRouteLine(route: MapRoute, stops: MapStop[]): RenderedRoute | null {
  const coordinates = route.coordinates.map(
    ([longitude, latitude]) => [longitude, latitude] as LngLat
  );

  return coordinates.length > 1
    ? {
        id: route.id,
        line: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } },
        arrows: createRouteArrows(coordinates).filter(({ lngLat }) =>
          stops.every(
            (stop) =>
              stop.longitude === null ||
              stop.latitude === null ||
              distanceMeters(lngLat, [stop.longitude, stop.latitude]) >=
                ROUTE_ARROW_MINIMUM_STOP_DISTANCE_METERS
          )
        ),
      }
    : null;
}

function findStopAtTap(lngLat: LngLat, stops: MapStop[]): MapStop | null {
  let nearest: MapStop | null = null;
  let nearestDistance = STOP_TAP_RADIUS_METERS;
  for (const stop of stops) {
    if (stop.longitude === null || stop.latitude === null) continue;
    const distance = distanceMeters(lngLat, [stop.longitude, stop.latitude]);
    if (distance <= nearestDistance) {
      nearest = stop;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function createRouteArrows(coordinates: LngLat[]): RouteArrow[] {
  return createSharedRouteArrows(coordinates, ROUTE_ARROW_SPACING_METERS);
  /*
  const arrows: RouteArrow[] = [];
  let distanceSinceLastArrow = 0;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    const segmentMeters = distanceMeters(start, end);
    if (segmentMeters === 0) {
      continue;
    }

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
  */
}

function distanceMeters(
  [startLongitude, startLatitude]: LngLat,
  [endLongitude, endLatitude]: LngLat
): number {
  return geoDistanceMeters([startLongitude, startLatitude], [endLongitude, endLatitude]);
}

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

function radians(degreesValue: number): number {
  return (degreesValue * Math.PI) / 180;
}

function degrees(radiansValue: number): number {
  return (radiansValue * 180) / Math.PI;
}

// Retained temporarily only as a non-public compatibility implementation while
// callers use the extracted StopSheet module above.
export function LegacyStopSheet({
  detail,
  isLoading,
  onClose,
}: {
  detail: MapStopDetail | undefined;
  isLoading: boolean;
  onClose: () => void;
}) {
  const [selectedDirection, setSelectedDirection] = useState<MapStopDirection | null>(null);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityLabel="Cerrar arribos"
          accessibilityRole="button"
          className="absolute inset-0 bg-black/40"
          onPress={onClose}
        />
        <View className="max-h-[64%] min-h-[46%] rounded-t-3xl bg-[#1E1E24] px-5 pb-6 pt-4">
          <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
            {isLoading ? (
              <View className="mt-6 items-center">
                <ActivityIndicator color="#80D4FF" />
              </View>
            ) : selectedDirection && detail ? (
              <MapStopArrivals
                direction={selectedDirection}
                onBack={() => setSelectedDirection(null)}
                stopIdentifier={detail.identifier}
              />
            ) : detail ? (
              <StopLinesList detail={detail} onSelect={setSelectedDirection} />
            ) : (
              <Text className="mt-4 text-sm text-[#E5B842]">No se pudo cargar la parada.</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function StopLinesList({
  detail,
  onSelect,
}: {
  detail: MapStopDetail;
  onSelect: (direction: MapStopDirection) => void;
}) {
  const directions = [...detail.directions].sort(
    (left, right) =>
      left.nameTransitLine.localeCompare(right.nameTransitLine) ||
      left.direction.localeCompare(right.direction)
  );
  return (
    <>
      <Text className="text-xl font-bold text-[#E1E1E6]">Parada</Text>
      <Text className="mt-1 text-sm text-[#A4A4AB]">
        Elegí un colectivo para consultar arribos.
      </Text>
      {directions.map((direction) => (
        <Pressable
          className="mt-4 rounded-xl bg-[#25252B] p-4 active:opacity-70"
          key={`${direction.codeTransitLine}:${direction.direction}`}
          onPress={() => onSelect(direction)}>
          <Text className="text-lg font-semibold text-[#E1E1E6]">
            Línea {direction.nameTransitLine}
          </Text>
          <Text className="mt-1 text-sm text-[#80D4FF]">
            {direction.expandedDirection ?? direction.direction}
          </Text>
        </Pressable>
      ))}
    </>
  );
}

function MapStopArrivals({
  direction,
  onBack,
  stopIdentifier,
}: {
  direction: MapStopDirection;
  onBack: () => void;
  stopIdentifier: string;
}) {
  const now = useArrivalClock();
  const arrivalsQuery = useQuery({
    queryKey: queryKeys.telemetry.arrivals(
      direction.nameTransitLine,
      stopIdentifier,
      direction.direction
    ),
    queryFn: () => getArrivals(direction.nameTransitLine, stopIdentifier, direction.direction),
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    // Arrival requests may wait in the global MGP queue; don't submit another automatically.
    retry: 0,
  });
  const arrivals = arrivalsQuery.data?.arrivals ?? [];

  return (
    <>
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityLabel="Volver a colectivos"
          className="h-10 w-10 items-center justify-center rounded-full bg-[#25252B] active:opacity-70"
          onPress={onBack}>
          <MaterialCommunityIcons color="#80D4FF" name="arrow-left" size={22} />
        </Pressable>
        <Text className="text-sm font-semibold text-[#E1E1E6]">Próximas llegadas</Text>
        <Pressable
          accessibilityLabel="Actualizar arribos"
          className="h-10 w-10 items-center justify-center rounded-full bg-[#25252B] active:opacity-70 disabled:opacity-40"
          disabled={arrivalsQuery.isFetching}
          onPress={() => void arrivalsQuery.refetch()}>
          {arrivalsQuery.isFetching ? (
            <ActivityIndicator color="#80D4FF" size="small" />
          ) : (
            <MaterialCommunityIcons color="#80D4FF" name="refresh" size={21} />
          )}
        </Pressable>
      </View>

      <View className="mt-4 flex-row items-center rounded-2xl bg-[#25252B] p-3">
        <View className="mr-3 h-11 w-11 items-center justify-center rounded-xl bg-[#12354A]">
          <MaterialCommunityIcons color="#80D4FF" name="bus-clock" size={24} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-[#E1E1E6]">
            Línea {direction.nameTransitLine}
          </Text>
          <Text className="mt-0.5 text-sm text-[#80D4FF]" numberOfLines={1}>
            {direction.expandedDirection ?? direction.direction}
          </Text>
        </View>
      </View>

      {arrivalsQuery.isPending ? (
        <View className="items-center py-10">
          <ActivityIndicator color="#80D4FF" />
          <Text className="mt-3 text-sm text-[#A4A4AB]">Buscando próximos colectivos…</Text>
        </View>
      ) : null}
      {arrivalsQuery.isError ? (
        <View className="mt-4 rounded-2xl bg-[#332500] p-4">
          <Text className="text-sm text-[#E5B842]">No se pudieron consultar los arribos.</Text>
        </View>
      ) : null}
      {!arrivalsQuery.isPending && !arrivalsQuery.isError && arrivals.length === 0 ? (
        <View className="items-center py-9">
          <MaterialCommunityIcons color="#A4A4AB" name="bus-clock" size={30} />
          <Text className="mt-3 text-sm text-[#A4A4AB]">
            No hay arribos próximos para este sentido.
          </Text>
        </View>
      ) : null}
      <View className="mt-4">
        {arrivals.map((arrival) => (
          <MapArrivalCard
            arrival={arrival}
            key={arrival.vehicleUnit ?? `${arrival.lineCode}:${arrival.estimatedArrivalTime}`}
            now={now}
          />
        ))}
      </View>
    </>
  );
}

function MapArrivalCard({ arrival, now }: { arrival: BusArrival; now: number }) {
  const visualMinutes = getVisualRemainingMinutes(arrival, now);
  const clockTime = getArrivalClockTime(visualMinutes, now);
  const reliable = arrival.status !== 'EXPIRED' && visualMinutes !== null;

  return (
    <View className="mb-3 overflow-hidden rounded-2xl border border-[#303038] bg-[#25252B]">
      <View className="flex-row items-center p-4">
        <View className="mr-3 h-12 w-12 items-center justify-center rounded-xl bg-[#1E1E24]">
          <MaterialCommunityIcons color="#80D4FF" name="bus" size={24} />
        </View>
        <View className="flex-1">
          <Text className="text-sm text-[#A4A4AB]">
            Coche {arrival.vehicleUnit ?? 'Sin identificar'}
          </Text>
          <Text className="mt-0.5 text-2xl font-bold text-[#E1E1E6]">
            {reliable ? `${visualMinutes} min` : 'ETA no confiable'}
          </Text>
        </View>
        <TelemetryBadge compact status={arrival.status} />
      </View>
      {reliable && clockTime ? (
        <View className="border-t border-[#303038] px-4 py-2.5">
          <Text className="text-sm text-[#A4A4AB]">Llegada aproximada {clockTime}</Text>
        </View>
      ) : null}
      {arrival.distanceMeters !== null || arrival.accessible !== null || arrival.branch ? (
        <View className="flex-row flex-wrap gap-x-4 gap-y-2 border-t border-[#303038] px-4 py-2.5">
          {arrival.distanceMeters !== null ? (
            <ArrivalDetail
              compact
              icon="map-marker-distance"
              value={`${arrival.distanceMeters} m`}
            />
          ) : null}
          {arrival.accessible !== null ? (
            <ArrivalDetail
              compact
              icon="wheelchair-accessibility"
              value={arrival.accessible ? 'Accesible' : 'No accesible'}
            />
          ) : null}
          {arrival.branch ? (
            <ArrivalDetail compact icon="sign-direction" value={arrival.branch} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
