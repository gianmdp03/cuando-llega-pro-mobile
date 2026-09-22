import { useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import BottomSheet from '@gorhom/bottom-sheet';
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

import { getMapDirections, getMapLines, getMapStop, getMapStops } from '@/src/features/map/api';
import { useStopArrivalsStream } from '@/src/features/map/use-stop-arrivals-stream';
import { useArrivalTicker } from '@/src/features/transit/use-arrival-ticker';
import { queryKeys } from '@/src/lib/query-client';
import type { BusArrival, MapLine, MapStop } from '@/src/types/api';

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
  const stopQuery = useQuery({
    queryKey: queryKeys.map.stop(stop?.identifier ?? ''),
    queryFn: () => getMapStop(stop!.identifier),
    enabled: !!stop,
    ...CATALOG_OPTIONS,
  });
  const stream = useStopArrivalsStream(stopQuery.data, !!stop && !!stopQuery.data);
  const markers = useMemo(
    () =>
      (stopsQuery.data ?? []).filter((item) => item.latitude !== null && item.longitude !== null),
    [stopsQuery.data]
  );
  const routeLine = useMemo(() => createStopsLine(markers), [markers]);
  const routeArrow = useMemo(() => createRouteArrow(routeLine), [routeLine]);

  return (
    <View className="flex-1 bg-[#121212]">
      <Map
        androidView="texture"
        attribution={false}
        logo={false}
        mapStyle={OSM_STYLE}
        style={{ flex: 1 }}>
        <Camera initialViewState={INITIAL_CAMERA} maxZoom={19} minZoom={1} />
        {routeLine ? (
          <GeoJSONSource data={routeLine} id="transit-route">
            <Layer
              id="transit-route-line"
              paint={{ 'line-color': '#1976A8', 'line-opacity': 0.9, 'line-width': 4 }}
              source="transit-route"
              type="line"
            />
          </GeoJSONSource>
        ) : null}
        {routeArrow ? (
          <Marker id="transit-route-direction" lngLat={routeArrow.lngLat}>
            <View
              style={{
                alignItems: 'center',
                backgroundColor: '#1E1E24',
                borderColor: '#80D4FF',
                borderRadius: 14,
                borderWidth: 2,
                height: 28,
                justifyContent: 'center',
                transform: [{ rotate: `${routeArrow.bearing}deg` }],
                width: 28,
              }}>
              <MaterialCommunityIcons color="#80D4FF" name="arrow-right-bold" size={16} />
            </View>
          </Marker>
        ) : null}
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
                borderRadius: 16,
                borderWidth: 2,
                height: 32,
                justifyContent: 'center',
                width: 32,
              }}>
              <MaterialCommunityIcons color="#80D4FF" name="bus-stop" size={18} />
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
        {linesQuery.isError || directionsQuery.isError || stopsQuery.isError ? (
          <Text className="mt-2 text-xs text-[#E5B842]">
            No se pudo cargar el catálogo. Reintentá cambiando la selección.
          </Text>
        ) : null}
      </View>
      <Text className="absolute bottom-3 left-4 text-xs text-[#A4A4AB]">
        © OpenStreetMap contributors
      </Text>
      {stop ? (
        <StopSheet isLoading={stopQuery.isPending} onClose={() => setStop(null)} stream={stream} />
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

function createStopsLine(stops: MapStop[]): RouteLine | null {
  const coordinates = stops.map((stop) => [stop.longitude!, stop.latitude!] as LngLat);

  return coordinates.length > 1
    ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }
    : null;
}

function createRouteArrow(routeLine: RouteLine | null): RouteArrow | null {
  if (!routeLine) {
    return null;
  }

  const coordinates = routeLine.geometry.coordinates;
  const segmentIndex = Math.floor((coordinates.length - 1) / 2);
  const start = coordinates[segmentIndex];
  const end = coordinates[segmentIndex + 1];
  const startLatitude = (start[1] * Math.PI) / 180;
  const endLatitude = (end[1] * Math.PI) / 180;
  const longitudeDelta = ((end[0] - start[0]) * Math.PI) / 180;
  const bearingRadians = Math.atan2(
    Math.sin(longitudeDelta) * Math.cos(endLatitude),
    Math.cos(startLatitude) * Math.sin(endLatitude) -
      Math.sin(startLatitude) * Math.cos(endLatitude) * Math.cos(longitudeDelta)
  );

  return {
    lngLat: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
    bearing: ((bearingRadians * 180) / Math.PI + 360) % 360,
  };
}

function StopSheet({
  isLoading,
  onClose,
  stream,
}: {
  isLoading: boolean;
  onClose: () => void;
  stream: ReturnType<typeof useStopArrivalsStream>;
}) {
  return (
    <BottomSheet
      backgroundStyle={{ backgroundColor: '#1E1E24' }}
      enablePanDownToClose
      index={0}
      onClose={onClose}
      snapPoints={['45%', '82%']}>
      <View className="flex-1 px-5 pt-2">
        <Text className="text-xl font-bold text-[#E1E1E6]">Arribos</Text>
        {isLoading || stream.isConnecting ? (
          <View className="mt-6 items-center">
            <ActivityIndicator color="#80D4FF" />
          </View>
        ) : null}
        {stream.error ? (
          <Text className="mt-4 text-sm text-[#E5B842]">{stream.error.message}</Text>
        ) : null}
        {stream.data?.lines.length === 0 && !stream.isConnecting ? (
          <Text className="mt-4 text-base text-[#A4A4AB]">Esperando arribos por línea.</Text>
        ) : null}
        {stream.data?.lines.map((line) => (
          <View className="mt-4 rounded-xl bg-[#25252B] p-3" key={line.lineCode}>
            <View className="flex-row items-center justify-between">
              <Text className="font-semibold text-[#E1E1E6]">Línea {line.lineCode}</Text>
              <Text className="text-sm text-[#A4A4AB]">{line.status}</Text>
            </View>
            {line.status === 'UNAVAILABLE' ? (
              <Text className="mt-2 text-sm text-[#8E8E93]">
                {line.error ?? 'Sin información disponible.'}
              </Text>
            ) : (
              line.directions
                .flatMap((direction) => direction.arrivals)
                .map((arrival) => (
                  <StreamArrivalRow
                    arrival={arrival}
                    key={
                      arrival.vehicleUnit ?? `${arrival.lineCode}:${arrival.estimatedArrivalTime}`
                    }
                  />
                ))
            )}
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}

function StreamArrivalRow({ arrival }: { arrival: BusArrival }) {
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
