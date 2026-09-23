import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useState } from 'react';

import type { MapStopDetail, MapStopDirection } from '@/src/types/api';
import { MapStopArrivals } from '@/src/features/map/map-stop-arrivals';

export function StopSheet({
  detail,
  isError,
  isLoading,
  onClose,
  onRetry,
}: {
  detail: MapStopDetail | undefined;
  isError?: boolean;
  isLoading: boolean;
  onClose: () => void;
  onRetry?: () => void;
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
              <View className="mt-4 items-start">
                <Text className="text-sm text-[#E5B842]">
                  {isError ? 'No se pudo cargar la parada.' : 'No hay información de esta parada.'}
                </Text>
                {isError && onRetry ? (
                  <Pressable
                    className="mt-3 rounded-xl bg-[#25252B] px-4 py-3 active:opacity-70"
                    onPress={onRetry}>
                    <Text className="font-semibold text-[#80D4FF]">Reintentar</Text>
                  </Pressable>
                ) : null}
              </View>
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
