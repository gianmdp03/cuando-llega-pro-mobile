import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { getArrivals } from '@/src/features/transit/api';
import { ArrivalDetail, TelemetryBadge } from '@/src/features/transit/arrival-ui';
import {
  formatVisualArrivalMinutes,
  getArrivalClockTime,
  getVisualRemainingMinutes,
  useArrivalClock,
} from '@/src/features/transit/use-arrival-ticker';
import { queryKeys } from '@/src/lib/query-client';
import type { BusArrival, MapStopDirection } from '@/src/types/api';

export function MapStopArrivals({
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
            {reliable ? formatVisualArrivalMinutes(visualMinutes) : 'ETA no confiable'}
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
