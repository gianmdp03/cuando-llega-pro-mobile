import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import {
  Camera,
  GeoJSONSource,
  Layer,
  type LngLat,
  Map,
  Marker,
  type InitialViewState,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useQuery } from '@tanstack/react-query';

import {
  getMapDirections,
  getMapLines,
  getMapRoutes,
  getMapStop,
  getMapStops,
} from '@/src/features/map/api';
import { getArrivals } from '@/src/features/transit/api';
import { useArrivalTicker } from '@/src/features/transit/use-arrival-ticker';
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
        .map(createRouteLine)
        .filter((route): route is RenderedRoute => route !== null),
    [direction, routesQuery.data]
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
        {routeLines.flatMap(({ id, arrows }) =>
          arrows.map((arrow, index) => (
            <Marker
              id={`transit-route-arrow-${id}-${index}`}
              key={`${id}-${index}`}
              lngLat={arrow.lngLat}>
              <View style={{ transform: [{ rotate: `${arrow.bearing - 90}deg` }] }}>
                <MaterialCommunityIcons color="#101114" name="arrow-right-bold" size={38} />
              </View>
            </Marker>
          ))
        )}
        {markers.map((item) => (
          <Marker
            id={item.identifier}
            key={item.identifier}
            lngLat={[item.longitude!, item.latitude!]}
            onPress={() => setStop(item)}>
            <View
              accessibilityLabel={item.description ?? item.identifier}
              style={{
                alignItems: 'center',
                backgroundColor: '#1E1E24',
                borderColor: '#80D4FF',
                borderRadius: 20,
                borderWidth: 3,
                height: 40,
                justifyContent: 'center',
                width: 40,
              }}>
              <MaterialCommunityIcons color="#80D4FF" name="bus-stop" size={21} />
            </View>
          </Marker>
        ))}
      </Map>
      <View className="absolute left-4 right-4 top-4 rounded-2xl bg-[#1E1E24] p-3">
        <Text className="mb-1 text-xs text-[#A4A4AB]">Línea comercial</Text>
        <Picker
          dropdownIconColor="#E1E1E6"
          onValueChange={(value) => {
            const selected = (linesQuery.data ?? []).find((item) => item.name === value) ?? null;
            setLine(selected);
            setDirection(null);
            setStop(null);
          }}
          selectedValue={line?.name ?? ''}
          style={{ color: '#E1E1E6' }}>
          <Picker.Item
            color="#A4A4AB"
            label={linesQuery.isPending ? 'Cargando líneas…' : 'Seleccionar línea'}
            value=""
          />
          {(linesQuery.data ?? []).map((item) => (
            <Picker.Item key={item.name} label={item.name} value={item.name} />
          ))}
        </Picker>
        {line ? (
          <>
            <Text className="mb-1 mt-2 text-xs text-[#A4A4AB]">Sentido</Text>
            <Picker
              dropdownIconColor="#E1E1E6"
              onValueChange={(value) => {
                setDirection(value || null);
                setStop(null);
              }}
              selectedValue={direction ?? ''}
              style={{ color: '#E1E1E6' }}>
              <Picker.Item
                color="#A4A4AB"
                label={directionsQuery.isPending ? 'Cargando sentidos…' : 'Seleccionar sentido'}
                value=""
              />
              {(directionsQuery.data ?? []).map((item) => (
                <Picker.Item
                  key={item.direction}
                  label={item.expandedDirection ?? item.direction}
                  value={item.direction}
                />
              ))}
            </Picker>
          </>
        ) : null}
        {linesQuery.isError ||
        directionsQuery.isError ||
        stopsQuery.isError ||
        routesQuery.isError ? (
          <Text className="mt-2 text-xs text-[#E5B842]">
            No se pudo cargar el catálogo. Reintentá cambiando la selección.
          </Text>
        ) : null}
      </View>
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
const STOP_TAP_RADIUS_METERS = 65;

function routeMatchesDirection(route: MapRoute, direction: string | null): boolean {
  if (!direction) {
    return false;
  }

  // MGP encodes its route description as "code;short destination;long destination".
  // Match complete fields, never a substring such as "FARO" inside another destination.
  return (route.description ?? '').split(';').some((field) => field.trim() === direction);
}

function createRouteLine(route: MapRoute): RenderedRoute | null {
  const coordinates = route.coordinates.map(
    ([longitude, latitude]) => [longitude, latitude] as LngLat
  );

  return coordinates.length > 1
    ? {
        id: route.id,
        line: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } },
        arrows: createRouteArrows(coordinates),
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
}

function distanceMeters(
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

function StopSheet({
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
        <View className="max-h-[82%] min-h-[45%] rounded-t-3xl bg-[#1E1E24] px-5 pb-8 pt-5">
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
        <Pressable accessibilityLabel="Volver a colectivos" onPress={onBack}>
          <MaterialCommunityIcons color="#80D4FF" name="arrow-left" size={26} />
        </Pressable>
        <Pressable
          accessibilityLabel="Actualizar arribos"
          disabled={arrivalsQuery.isFetching}
          onPress={() => void arrivalsQuery.refetch()}>
          <MaterialCommunityIcons color="#80D4FF" name="refresh" size={26} />
        </Pressable>
      </View>
      <Text className="mt-4 text-xl font-bold text-[#E1E1E6]">
        Línea {direction.nameTransitLine}
      </Text>
      <Text className="mt-1 text-sm text-[#80D4FF]">
        {direction.expandedDirection ?? direction.direction}
      </Text>
      {arrivalsQuery.isPending ? <ActivityIndicator className="mt-8" color="#80D4FF" /> : null}
      {arrivalsQuery.isError ? (
        <Text className="mt-4 text-sm text-[#E5B842]">No se pudieron consultar los arribos.</Text>
      ) : null}
      {!arrivalsQuery.isPending && !arrivalsQuery.isError && arrivals.length === 0 ? (
        <Text className="mt-5 text-sm text-[#A4A4AB]">
          No hay arribos próximos para este sentido.
        </Text>
      ) : null}
      {arrivals.map((arrival) => (
        <ArrivalRow
          arrival={arrival}
          key={arrival.vehicleUnit ?? `${arrival.lineCode}:${arrival.estimatedArrivalTime}`}
        />
      ))}
    </>
  );
}

function ArrivalRow({ arrival }: { arrival: BusArrival }) {
  const visualMinutes = useArrivalTicker(arrival);
  const eta =
    arrival.status === 'EXPIRED' || visualMinutes === null
      ? 'ETA no confiable'
      : `${visualMinutes} min`;
  return (
    <Text className="mt-2 text-sm text-[#E1E1E6]">
      {arrival.vehicleUnit ?? 'Coche sin identificar'} · {eta}
    </Text>
  );
}
