import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useQuery } from '@tanstack/react-query';
import {
  Camera,
  GeoJSONSource,
  Images,
  Layer,
  type LngLat,
  Map,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';

import { getNearbyMapStops } from '@/src/features/map/api';
import { StopSheet } from '@/src/features/map/stop-sheet';
import { MAP_IMAGES } from '@/src/features/transit/arrival-map-modal';
import { queryKeys } from '@/src/lib/query-client';
import type { MapStopDetail, NearbyMapStop } from '@/src/types/api';

const RADIUS_OPTIONS = [200, 300, 400, 500, 600, 700, 800] as const;
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

export function NearbyStopsScreen() {
  const [radiusMeters, setRadiusMeters] = useState<(typeof RADIUS_OPTIONS)[number]>(500);
  const [location, setLocation] = useState<LngLat | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedStop, setSelectedStop] = useState<NearbyMapStop | null>(null);
  const [mapStop, setMapStop] = useState<NearbyMapStop | null>(null);

  const refreshLocation = async () => {
    setIsLocating(true);
    setLocationError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setLocationError('Necesitamos tu ubicación para buscar paradas cercanas.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      setLocation([position.coords.longitude, position.coords.latitude]);
    } catch {
      setLocationError('No se pudo obtener tu ubicación.');
    } finally {
      setIsLocating(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(refreshLocation);
  }, []);

  const nearbyStopsQuery = useQuery({
    queryKey: queryKeys.map.nearbyStops(location?.[1] ?? 0, location?.[0] ?? 0, radiusMeters),
    queryFn: () => getNearbyMapStops(location![1], location![0], radiusMeters),
    enabled: !!location,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
  const selectedDetail = useMemo<MapStopDetail | undefined>(
    () =>
      selectedStop
        ? {
            identifier: selectedStop.identifier,
            latitude: selectedStop.latitude,
            longitude: selectedStop.longitude,
            directions: selectedStop.directions,
          }
        : undefined,
    [selectedStop]
  );

  return (
    <View className="flex-1 bg-[#121212]">
      <ScrollView contentContainerClassName="px-4 pb-8 pt-5">
        <Text className="text-2xl font-bold text-[#E1E1E6]">Paradas cercanas</Text>
        <Text className="mt-1 text-sm text-[#A4A4AB]">
          Buscá paradas alrededor de tu última ubicación actualizada.
        </Text>

        <View className="mt-5 flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-[#E1E1E6]">Radio de búsqueda</Text>
          <Pressable
            accessibilityLabel="Actualizar ubicación"
            className="flex-row items-center rounded-full bg-[#25252B] px-3 py-2 active:opacity-70 disabled:opacity-50"
            disabled={isLocating}
            onPress={() => void refreshLocation()}>
            {isLocating ? (
              <ActivityIndicator color="#80D4FF" size="small" />
            ) : (
              <MaterialCommunityIcons color="#80D4FF" name="crosshairs-gps" size={18} />
            )}
            <Text className="ml-1.5 text-xs font-semibold text-[#E1E1E6]">Actualizar</Text>
          </Pressable>
        </View>
        <ScrollView className="mt-3" horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2">
            {RADIUS_OPTIONS.map((radius) => (
              <Pressable
                className={`rounded-full px-4 py-2 ${
                  radius === radiusMeters ? 'bg-[#1976A8]' : 'bg-[#25252B]'
                }`}
                key={radius}
                onPress={() => setRadiusMeters(radius)}>
                <Text className="text-sm font-semibold text-[#E1E1E6]">{radius} m</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {locationError ? <Notice text={locationError} /> : null}
        {!location && !locationError && !isLocating ? (
          <View className="mt-6 items-center rounded-2xl bg-[#1E1E24] px-5 py-9">
            <MaterialCommunityIcons color="#80D4FF" name="crosshairs-gps" size={34} />
            <Text className="mt-4 text-base font-semibold text-[#E1E1E6]">
              Buscá paradas cerca tuyo
            </Text>
            <Text className="mt-2 text-center text-sm text-[#A4A4AB]">
              Tocá Actualizar para permitir ubicación y buscar dentro del radio elegido.
            </Text>
          </View>
        ) : null}
        {isLocating ? (
          <View className="items-center py-12">
            <ActivityIndicator color="#80D4FF" />
            <Text className="mt-3 text-sm text-[#A4A4AB]">Obteniendo tu ubicación…</Text>
          </View>
        ) : null}
        {nearbyStopsQuery.isPending ? (
          <View className="items-center py-12">
            <ActivityIndicator color="#80D4FF" />
            <Text className="mt-3 text-sm text-[#A4A4AB]">Buscando paradas cercanas…</Text>
          </View>
        ) : null}
        {nearbyStopsQuery.isError ? (
          <Pressable onPress={() => void nearbyStopsQuery.refetch()}>
            <Notice text="No se pudieron cargar las paradas. Tocá para reintentar." />
          </Pressable>
        ) : null}
        {nearbyStopsQuery.data?.map((stop) => (
          <NearbyStopCard
            key={stop.identifier}
            onMap={() => setMapStop(stop)}
            onPress={() => setSelectedStop(stop)}
            stop={stop}
          />
        ))}
        {!nearbyStopsQuery.isPending &&
        !nearbyStopsQuery.isError &&
        location &&
        nearbyStopsQuery.data?.length === 0 ? (
          <View className="items-center py-12">
            <MaterialCommunityIcons color="#A4A4AB" name="map-marker-off-outline" size={32} />
            <Text className="mt-3 text-sm text-[#A4A4AB]">
              No hay paradas dentro de este radio.
            </Text>
          </View>
        ) : null}
      </ScrollView>
      {selectedStop && selectedDetail ? (
        <StopSheet
          detail={selectedDetail}
          isLoading={false}
          onClose={() => setSelectedStop(null)}
        />
      ) : null}
      {location && mapStop ? (
        <NearbyStopMapModal location={location} onClose={() => setMapStop(null)} stop={mapStop} />
      ) : null}
    </View>
  );
}

function NearbyStopCard({
  onMap,
  onPress,
  stop,
}: {
  onMap: () => void;
  onPress: () => void;
  stop: NearbyMapStop;
}) {
  const lines = [...new Set(stop.directions.map((direction) => direction.nameTransitLine))];
  return (
    <Pressable className="mt-4 rounded-2xl bg-[#1E1E24] p-4 active:opacity-70" onPress={onPress}>
      <View className="flex-row items-start justify-between">
        <View className="mr-3 flex-1">
          <Text className="text-base font-bold text-[#E1E1E6]">Parada {stop.identifier}</Text>
        </View>
        <Text className="text-sm font-semibold text-[#80D4FF]">{stop.distanceMeters} m</Text>
      </View>
      <View className="mt-4 flex-row flex-wrap gap-2">
        {lines.map((line) => (
          <View className="rounded-lg bg-[#25252B] px-3 py-2" key={line}>
            <Text className="text-sm font-semibold text-[#80D4FF]">{line}</Text>
          </View>
        ))}
      </View>
      <Pressable
        accessibilityLabel={`Ver parada ${stop.identifier} en el mapa`}
        className="mt-4 self-start rounded-lg bg-[#25252B] px-3 py-2"
        onPress={(event) => {
          event.stopPropagation();
          onMap();
        }}>
        <Text className="text-xs font-semibold text-[#80D4FF]">Ver en mapa</Text>
      </Pressable>
    </Pressable>
  );
}

function NearbyStopMapModal({
  location,
  onClose,
  stop,
}: {
  location: LngLat;
  onClose: () => void;
  stop: NearbyMapStop;
}) {
  const bounds = useMemo(() => {
    const west = Math.min(location[0], stop.longitude);
    const east = Math.max(location[0], stop.longitude);
    const south = Math.min(location[1], stop.latitude);
    const north = Math.max(location[1], stop.latitude);
    const padding = 0.002;
    return [west - padding, south - padding, east + padding, north + padding] as [
      number,
      number,
      number,
      number,
    ];
  }, [location, stop.latitude, stop.longitude]);
  const userFeature = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: location } },
      ],
    }),
    [location]
  );
  const stopFeature = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [stop.longitude, stop.latitude] },
        },
      ],
    }),
    [stop.latitude, stop.longitude]
  );
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View className="flex-1 justify-center bg-black/65 px-4 py-8">
        <View className="h-[78%] overflow-hidden rounded-3xl bg-[#1E1E24]">
          <View className="px-4 py-3">
            <Text className="text-lg font-bold text-[#E1E1E6]">Ubicación en el mapa</Text>
            <Text className="mt-0.5 text-sm text-[#A4A4AB]">
              Tu ubicación y parada {stop.identifier}
            </Text>
          </View>
          <Map
            androidView="texture"
            attribution={false}
            logo={false}
            mapStyle={OSM_STYLE}
            style={{ flex: 1 }}>
            <Camera
              initialViewState={{ bounds, padding: { bottom: 60, left: 60, right: 60, top: 60 } }}
              maxZoom={19}
              minZoom={1}
            />
            <Images images={MAP_IMAGES} />
            <GeoJSONSource data={userFeature} id="nearby-user-location">
              <Layer
                type="circle"
                paint={{
                  'circle-color': '#1976A8',
                  'circle-radius': 9,
                  'circle-stroke-color': '#E1E1E6',
                  'circle-stroke-width': 3,
                }}
              />
            </GeoJSONSource>
            <GeoJSONSource data={stopFeature} id="nearby-stop-location">
              <Layer
                type="circle"
                paint={{
                  'circle-color': '#1E1E24',
                  'circle-radius': 14,
                  'circle-stroke-color': '#80D4FF',
                  'circle-stroke-width': 3,
                }}
              />
              <Layer
                layout={{
                  'icon-image': 'arrival-stop-icon',
                  'icon-size': 0.48,
                  'icon-allow-overlap': true,
                }}
                type="symbol"
              />
            </GeoJSONSource>
          </Map>
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

function Notice({ text }: { text: string }) {
  return <Text className="mt-5 rounded-xl bg-[#332500] p-4 text-sm text-[#E5B842]">{text}</Text>;
}
