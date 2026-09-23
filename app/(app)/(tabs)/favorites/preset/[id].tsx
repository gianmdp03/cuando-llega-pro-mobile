import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getPreset } from '@/src/features/presets/api';
import { PresetTransitFlow } from '@/src/features/transit/legacy-transit-flow';
import { ProblemDetailError } from '@/src/lib/api-client';
import { queryKeys } from '@/src/lib/query-client';

const PRESET_OPTIONS = { staleTime: 15_000, gcTime: 5 * 60_000, retry: 1 } as const;

export default function PresetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const presetId = Number(id);
  const presetQuery = useQuery({
    queryKey: queryKeys.presets.detail(presetId),
    queryFn: () => getPreset(presetId),
    enabled: Number.isInteger(presetId) && presetId > 0,
    ...PRESET_OPTIONS,
  });

  if (presetQuery.isPending)
    return (
      <ScreenFrame>
        <Loading />
      </ScreenFrame>
    );
  if (presetQuery.isError) {
    return (
      <ScreenFrame>
        <ErrorState error={presetQuery.error} onRetry={() => void presetQuery.refetch()} />
      </ScreenFrame>
    );
  }
  if (!presetQuery.data) {
    return (
      <ScreenFrame>
        <ErrorState error={new Error('Preset inválido.')} onRetry={router.back} />
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame>
      <PresetTransitFlow onBack={router.back} preset={presetQuery.data} />
    </ScreenFrame>
  );
}

function ScreenFrame({ children }: { children: React.ReactNode }) {
  return <View className="flex-1 bg-[#121212]">{children}</View>;
}

function Loading() {
  return (
    <View className="flex-1 items-center justify-center bg-[#121212]">
      <ActivityIndicator color="#80D4FF" />
    </View>
  );
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const message =
    error instanceof ProblemDetailError
      ? error.problem.detail
      : error.message || 'No se pudo cargar el preset.';
  return (
    <View className="flex-1 items-center justify-center bg-[#121212] px-6">
      <Text className="text-center text-base text-[#E1E1E6]">{message}</Text>
      <Pressable className="mt-4 rounded-xl bg-[#25252B] px-4 py-3" onPress={onRetry}>
        <Text className="font-semibold text-[#80D4FF]">Reintentar</Text>
      </Pressable>
    </View>
  );
}
