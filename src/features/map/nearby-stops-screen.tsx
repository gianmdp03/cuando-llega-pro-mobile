import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type GestureResponderEvent,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';

import { FlashList } from '@shopify/flash-list';
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
} from '@maplibre/maplibre-react-native';

import { getNearbyMapStops, getReverseGeocoding } from '@/src/features/map/api';
import { OSM_STYLE } from '@/src/features/map/map-style';
import { StopSheet } from '@/src/features/map/stop-sheet';
import { MAP_IMAGES } from '@/src/features/transit/arrival-map-modal';
import { queryKeys } from '@/src/lib/query-client';
import type { MapStopDetail, NearbyMapStop } from '@/src/types/api';

const RADIUS_OPTIONS = [200, 300, 400, 500, 600, 700, 800] as const;
const LOCATION_CACHE_PRECISION = 10_000;

export function NearbyStopsScreen() {
  const [radiusMeters, setRadiusMeters] = useState<(typeof RADIUS_OPTIONS)[number]>(500);
  const [location, setLocation] = useState<LngLat | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedStop, setSelectedStop] = useState<NearbyMapStop | null>(null);
  const [mapStop, setMapStop] = useState<NearbyMapStop | null>(null);
  const [revealedAddresses, setRevealedAddresses] = useState<Record<string, string>>({});
  const [revealingStopIds, setRevealingStopIds] = useState<ReadonlySet<string>>(new Set());
  const [coolingDownStopIds, setCoolingDownStopIds] = useState<ReadonlySet<string>>(new Set());
  const activeRevealIdsRef = useRef(new Set<string>());
  const revealControllersRef = useRef(new globalThis.Map<string, AbortController>());
  const cooldownTimersRef = useRef(new globalThis.Map<string, ReturnType<typeof setTimeout>>());
  const locationRequestIdRef = useRef(0);
  const isMountedRef = useRef(true);

  const refreshLocation = async () => {
    const requestId = ++locationRequestIdRef.current;
    setIsLocating(true);
    setLocationError(null);
    let lastKnownPosition: Location.LocationObject | null = null;
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        if (requestId === locationRequestIdRef.current) {
          setLocationError('Necesitamos tu ubicación para buscar paradas cercanas.');
        }
        return;
      }
      lastKnownPosition = await Location.getLastKnownPositionAsync({
        maxAge: 60_000,
        requiredAccuracy: Location.Accuracy.Balanced,
      });
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      if (requestId === locationRequestIdRef.current) {
        setLocation([position.coords.longitude, position.coords.latitude]);
      }
    } catch {
      // A cached fix is a useful fallback when a fresh high-accuracy reading
      // fails, but using it optimistically would issue a second nearby-stops
      // request whenever the two positions round to different cache cells.
      if (lastKnownPosition && requestId === locationRequestIdRef.current) {
        setLocation([lastKnownPosition.coords.longitude, lastKnownPosition.coords.latitude]);
      } else if (requestId === locationRequestIdRef.current) {
        setLocationError('No se pudo obtener tu ubicación.');
      }
    } finally {
      if (requestId === locationRequestIdRef.current) {
        setIsLocating(false);
      }
    }
  };

  useEffect(() => {
    void Promise.resolve().then(refreshLocation);
  }, []);

  useEffect(() => {
    const timers = cooldownTimersRef.current;
    const controllers = revealControllersRef.current;
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      timers.forEach(clearTimeout);
      controllers.forEach((controller) => controller.abort());
    };
  }, []);

  const nearbyStopsQuery = useQuery({
    queryKey: queryKeys.map.nearbyStops(
      normalizeLocationCoordinate(location?.[1] ?? 0),
      normalizeLocationCoordinate(location?.[0] ?? 0),
      radiusMeters
    ),
    queryFn: ({ signal }) =>
      getNearbyMapStops(
        normalizeLocationCoordinate(location![1]),
        normalizeLocationCoordinate(location![0]),
        radiusMeters,
        signal
      ),
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

  const stops = nearbyStopsQuery.data ?? [];

  // Stable callbacks for renderItem — these do not change between renders unless
  // setMapStop / setSelectedStop themselves change (they never do).
  const handleMapPress = useCallback((stop: NearbyMapStop) => setMapStop(stop), []);
  const handleStopPress = useCallback((stop: NearbyMapStop) => setSelectedStop(stop), []);
  const handleRevealLocation = useCallback(async (stop: NearbyMapStop) => {
    if (activeRevealIdsRef.current.has(stop.identifier)) {
      return;
    }

    activeRevealIdsRef.current.add(stop.identifier);
    const controller = new AbortController();
    revealControllersRef.current.set(stop.identifier, controller);
    setRevealingStopIds((previous) => new Set(previous).add(stop.identifier));
    setCoolingDownStopIds((previous) => new Set(previous).add(stop.identifier));
    try {
      const response = await getReverseGeocoding(stop.latitude, stop.longitude, controller.signal);
      setRevealedAddresses((previous) => ({
        ...previous,
        [stop.identifier]: response.formattedAddress,
      }));
    } catch {
      // Keep the button available after its cooldown so this stop can be retried.
    } finally {
      activeRevealIdsRef.current.delete(stop.identifier);
      revealControllersRef.current.delete(stop.identifier);
      if (!isMountedRef.current) {
        return;
      }
      setRevealingStopIds((previous) => {
        const next = new Set(previous);
        next.delete(stop.identifier);
        return next;
      });
      const previousTimer = cooldownTimersRef.current.get(stop.identifier);
      if (previousTimer) {
        clearTimeout(previousTimer);
      }
      cooldownTimersRef.current.set(
        stop.identifier,
        setTimeout(() => {
          setCoolingDownStopIds((previous) => {
            const next = new Set(previous);
            next.delete(stop.identifier);
            return next;
          });
          cooldownTimersRef.current.delete(stop.identifier);
        }, 5000)
      );
    }
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: NearbyMapStop }) => (
      <NearbyStopCard
        address={revealedAddresses[item.identifier]}
        isCoolingDown={coolingDownStopIds.has(item.identifier)}
        isRevealing={revealingStopIds.has(item.identifier)}
        onMap={handleMapPress}
        onPress={handleStopPress}
        onRevealLocation={handleRevealLocation}
        stop={item}
      />
    ),
    [
      coolingDownStopIds,
      handleMapPress,
      handleRevealLocation,
      handleStopPress,
      revealedAddresses,
      revealingStopIds,
    ]
  );

  const keyExtractor = useCallback((item: NearbyMapStop) => item.identifier, []);

  const ListHeader = (
    <ListHeaderComponent
      isLocating={isLocating}
      location={location}
      locationError={locationError}
      nearbyStopsQuery={nearbyStopsQuery}
      onRefreshLocation={() => void refreshLocation()}
      radiusMeters={radiusMeters}
      onRadiusChange={setRadiusMeters}
    />
  );

  const ListEmpty =
    !nearbyStopsQuery.isPending && !nearbyStopsQuery.isError && location ? (
      <View className="items-center py-12">
        <MaterialCommunityIcons color="#A4A4AB" name="map-marker-off-outline" size={32} />
        <Text className="mt-3 text-sm text-[#A4A4AB]">No hay paradas dentro de este radio.</Text>
      </View>
    ) : null;

  return (
    <View className="flex-1 bg-[#121212]">
      <FlashList
        style={{ paddingHorizontal: 16, paddingBottom: 32, paddingTop: 20 } as any}
        data={stops}
        keyExtractor={keyExtractor}
        ListEmptyComponent={ListEmpty}
        ListHeaderComponent={ListHeader}
        renderItem={renderItem}
      />
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

// ---------------------------------------------------------------------------
// ListHeaderComponent — encabezado, selector de radio y estados
// ---------------------------------------------------------------------------

function ListHeaderComponent({
  isLocating,
  location,
  locationError,
  nearbyStopsQuery,
  onRefreshLocation,
  radiusMeters,
  onRadiusChange,
}: {
  isLocating: boolean;
  location: LngLat | null;
  locationError: string | null;
  nearbyStopsQuery: ReturnType<typeof useQuery>;
  onRefreshLocation: () => void;
  radiusMeters: (typeof RADIUS_OPTIONS)[number];
  onRadiusChange: (radius: (typeof RADIUS_OPTIONS)[number]) => void;
}) {
  return (
    <>
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
          onPress={onRefreshLocation}>
          {isLocating ? (
            <ActivityIndicator color="#80D4FF" size="small" />
          ) : (
            <MaterialCommunityIcons color="#80D4FF" name="crosshairs-gps" size={18} />
          )}
          <Text className="ml-1.5 text-xs font-semibold text-[#E1E1E6]">Actualizar</Text>
        </Pressable>
      </View>
      {/* Horizontal radius selector — small and fixed; no virtualisation needed */}
      <View className="mt-3">
        <FlashList
          data={RADIUS_OPTIONS as unknown as (typeof RADIUS_OPTIONS)[number][]}
          horizontal
          keyExtractor={(item) => String(item)}
          renderItem={({ item: radius }) => (
            <Pressable
              className={`mr-2 rounded-full px-4 py-2 ${radius === radiusMeters ? 'bg-[#1976A8]' : 'bg-[#25252B]'}`}
              onPress={() => onRadiusChange(radius as (typeof RADIUS_OPTIONS)[number])}>
              <Text className="text-sm font-semibold text-[#E1E1E6]">{radius} m</Text>
            </Pressable>
          )}
          showsHorizontalScrollIndicator={false}
        />
      </View>

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
    </>
  );
}

// ---------------------------------------------------------------------------
// NearbyStopCard — memoised to avoid re-renders when parent state changes
// ---------------------------------------------------------------------------

const NearbyStopCard = memo(function NearbyStopCard({
  address,
  isCoolingDown,
  isRevealing,
  onMap,
  onPress,
  onRevealLocation,
  stop,
}: {
  address: string | undefined;
  isCoolingDown: boolean;
  isRevealing: boolean;
  onMap: (stop: NearbyMapStop) => void;
  onPress: (stop: NearbyMapStop) => void;
  onRevealLocation: (stop: NearbyMapStop) => Promise<void>;
  stop: NearbyMapStop;
}) {
  const handleRevealLocation = (event: GestureResponderEvent) => {
    event.stopPropagation();
    void onRevealLocation(stop);
  };

  const lines = [...new Set(stop.directions.map((direction) => direction.nameTransitLine))];
  return (
    <Pressable
      className="mt-4 rounded-2xl bg-[#1E1E24] p-4 active:opacity-70"
      onPress={() => onPress(stop)}>
      <View className="flex-row items-center justify-between">
        <View className="mr-3 flex-1">
          {address ? (
            <View className="self-start rounded-xl bg-[#25252B] p-2.5">
              <Text className="text-sm font-semibold text-[#E1E1E6]">{address}</Text>
            </View>
          ) : (
            <Text className="text-base font-bold text-[#E1E1E6]">Parada {stop.identifier}</Text>
          )}
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
      <View className="mt-4 flex-row items-center gap-2">
        <Pressable
          accessibilityLabel={`Ver parada ${stop.identifier} en el mapa`}
          className="rounded-lg bg-[#25252B] px-3 py-2"
          onPress={(event) => {
            event.stopPropagation();
            onMap(stop);
          }}>
          <Text className="text-xs font-semibold text-[#80D4FF]">Ver en mapa</Text>
        </Pressable>
        {!address ? (
          <Pressable
            accessibilityLabel="Revelar ubicación de la parada"
            className="rounded-lg bg-[#80d4ff] px-3 py-2 disabled:opacity-50"
            disabled={isRevealing || isCoolingDown}
            onPress={handleRevealLocation}>
            {isRevealing ? (
              <ActivityIndicator color="#121212" size="small" />
            ) : (
              <Text className="text-xs font-semibold text-[#121212]">Revelar Ubicación</Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// NearbyStopMapModal
// ---------------------------------------------------------------------------

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

function normalizeLocationCoordinate(coordinate: number): number {
  return Math.round(coordinate * LOCATION_CACHE_PRECISION) / LOCATION_CACHE_PRECISION;
}
