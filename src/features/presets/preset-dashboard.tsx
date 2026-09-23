import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { deletePreset, getPresets } from '@/src/features/presets/api';
import { ProblemDetailError } from '@/src/lib/api-client';
import { queryClient, queryKeys } from '@/src/lib/query-client';
import type { PresetListDTO } from '@/src/types/api';

const PRESET_OPTIONS = { staleTime: 15_000, gcTime: 5 * 60_000, retry: 1 } as const;

/** The presets tab is deliberately only a chooser; arrivals live in the PRIME details screen. */
export function PresetDashboard() {
  const router = useRouter();
  const presetsQuery = useQuery({
    queryKey: queryKeys.presets.all(),
    queryFn: getPresets,
    ...PRESET_OPTIONS,
  });
  const deleteMutation = useMutation({
    mutationFn: deletePreset,
    onSuccess: (_result, id) => void invalidatePresetQueries(id),
  });

  if (presetsQuery.isPending) return <Loading />;
  if (presetsQuery.isError) {
    return <ErrorState error={presetsQuery.error} onRetry={() => void presetsQuery.refetch()} />;
  }

  return (
    <View className="flex-1 bg-[#121212] px-5 pt-5">
      <View className="mb-5">
        <Text className="text-2xl font-bold text-[#E1E1E6]">Presets</Text>
        <Text className="mt-1 text-sm text-[#A4A4AB]">
          Elegí un preset para ver los arribos. Creá nuevos desde Líneas.
        </Text>
      </View>
      <FlashList
        contentContainerStyle={{ paddingBottom: 24 }}
        data={presetsQuery.data}
        keyExtractor={(preset) => String(preset.id)}
        ListEmptyComponent={<EmptyState />}
        renderItem={({ item }) => (
          <PresetRow
            onDelete={() =>
              Alert.alert('Eliminar preset', 'Esta acción no se puede deshacer.', [
                { style: 'cancel', text: 'Cancelar' },
                {
                  style: 'destructive',
                  text: 'Eliminar',
                  onPress: () => deleteMutation.mutate(item.id),
                },
              ])
            }
            onPress={() =>
              router.push({ pathname: '/favorites/preset/[id]', params: { id: String(item.id) } })
            }
            preset={item}
          />
        )}
      />
    </View>
  );
}

function PresetRow({
  onDelete,
  onPress,
  preset,
}: {
  onDelete: () => void;
  onPress: () => void;
  preset: PresetListDTO;
}) {
  const name = preset.alias?.trim() || `Línea ${preset.codigoLinea}`;
  const direction = preset.bandera || 'Todos los sentidos';

  return (
    <View className="mb-2 rounded-2xl bg-[#1E1E24] p-4">
      <View className="flex-row items-center gap-3">
        <Pressable
          className="flex-1 flex-row items-center gap-3 active:opacity-70"
          onPress={onPress}>
          <View className="h-9 w-9 items-center justify-center rounded-xl bg-[#25252B]">
            <MaterialCommunityIcons color="#80D4FF" name="bus" size={19} />
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-[#E1E1E6]">{name}</Text>
            <Text className="mt-1 text-sm text-[#A4A4AB]">
              Línea {preset.codigoLinea} · {direction}
            </Text>
          </View>
          <MaterialCommunityIcons color="#A4A4AB" name="chevron-right" size={22} />
        </Pressable>
        <Pressable accessibilityLabel="Eliminar preset" className="p-2" onPress={onDelete}>
          <MaterialCommunityIcons color="#E5B842" name="trash-can-outline" size={20} />
        </Pressable>
      </View>
    </View>
  );
}

function Loading() {
  return (
    <View className="flex-1 items-center justify-center bg-[#121212]">
      <ActivityIndicator color="#80D4FF" />
    </View>
  );
}

function EmptyState() {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <MaterialCommunityIcons color="#8E8E93" name="star-outline" size={36} />
      <Text className="mt-3 text-center text-base text-[#A4A4AB]">Todavía no hay presets.</Text>
    </View>
  );
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center bg-[#121212] px-6">
      <Text className="text-center text-base text-[#E1E1E6]">{errorMessage(error)}</Text>
      <Pressable className="mt-4 rounded-xl bg-[#25252B] px-4 py-3" onPress={onRetry}>
        <Text className="font-semibold text-[#80D4FF]">Reintentar</Text>
      </Pressable>
    </View>
  );
}

async function invalidatePresetQueries(id?: number): Promise<void> {
  const invalidations = [queryClient.invalidateQueries({ queryKey: queryKeys.presets.all() })];
  if (id !== undefined) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: queryKeys.presets.detail(id) }));
  }
  await Promise.all(invalidations);
}

function errorMessage(error: Error): string {
  return error instanceof ProblemDetailError
    ? error.problem.detail
    : error.message || 'No se pudo completar la operación.';
}
