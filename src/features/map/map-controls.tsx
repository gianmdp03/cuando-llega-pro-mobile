import { Pressable, Text, View } from 'react-native';

import { Picker } from '@react-native-picker/picker';
import type { UseQueryResult } from '@tanstack/react-query';

import type { MapLine } from '@/src/types/api';

export function MapControls({
  direction,
  directionsQuery,
  line,
  linesQuery,
  onDirectionChange,
  onLineChange,
  onRetry,
  showError,
}: {
  direction: string | null;
  directionsQuery: UseQueryResult<
    { direction: string; expandedDirection?: string | null }[],
    Error
  >;
  line: MapLine | null;
  linesQuery: UseQueryResult<MapLine[], Error>;
  onDirectionChange: (direction: string | null) => void;
  onLineChange: (line: MapLine | null) => void;
  onRetry: () => void;
  showError: boolean;
}) {
  return (
    <View className="absolute left-4 right-4 top-4 rounded-2xl bg-[#1E1E24] p-3">
      <Text className="mb-1 text-xs text-[#A4A4AB]">Línea comercial</Text>
      <Picker
        dropdownIconColor="#E1E1E6"
        onValueChange={(value) =>
          onLineChange((linesQuery.data ?? []).find((item) => item.name === value) ?? null)
        }
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
            onValueChange={(value) => onDirectionChange(value || null)}
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
      {showError ? (
        <View className="mt-2 flex-row items-center justify-between gap-3">
          <Text className="flex-1 text-xs text-[#E5B842]">No se pudo cargar el catálogo.</Text>
          <Pressable
            className="rounded-lg bg-[#25252B] px-3 py-2 active:opacity-70"
            onPress={onRetry}>
            <Text className="text-xs font-semibold text-[#80D4FF]">Reintentar</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
