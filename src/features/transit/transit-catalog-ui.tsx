import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import type { UseQueryResult } from '@tanstack/react-query';

import { getErrorMessage } from '@/src/lib/error-message';

export function CatalogList<T>({
  data,
  emptyMessage,
  keyExtractor,
  query,
  renderItem,
}: {
  data: T[];
  emptyMessage: string;
  keyExtractor: (item: T) => string;
  query: UseQueryResult<T[], Error>;
  renderItem: ListRenderItem<T>;
}) {
  if (query.isPending) return <LoadingState label="Cargando datos" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (data.length === 0) return <EmptyState label={emptyMessage} />;
  return <FlashList data={data} keyExtractor={keyExtractor} renderItem={renderItem} />;
}

export function StepLayout({
  children,
  location,
  onBack,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  location?: string;
  onBack?: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <View className="flex-1 bg-[#121212] px-5 pt-5">
      <View className="mb-5 flex-row items-center gap-3">
        {onBack ? (
          <Pressable
            accessibilityLabel="Volver"
            className="rounded-xl bg-[#25252B] p-2"
            onPress={onBack}>
            <MaterialCommunityIcons color="#E1E1E6" name="arrow-left" size={22} />
          </Pressable>
        ) : null}
        <View className="flex-1">
          <Text className="text-2xl font-bold text-[#E1E1E6]">{title}</Text>
          {location ? (
            <Text className="mt-0.5 text-sm font-medium text-[#E1E1E6]" numberOfLines={3}>
              {location}
            </Text>
          ) : null}
          <Text className="mt-0.5 text-sm text-[#A4A4AB]">{subtitle}</Text>
        </View>
      </View>
      <View className="flex-1">{children}</View>
    </View>
  );
}

export function CatalogRow({
  detail,
  onPress,
  title,
}: {
  detail?: string;
  onPress: () => void;
  title: string;
}) {
  const showDetail = Boolean(detail && detail.trim().toLowerCase() !== title.trim().toLowerCase());
  return (
    <Pressable className="mb-2 rounded-2xl bg-[#1E1E24] p-4 active:opacity-70" onPress={onPress}>
      <View className="flex-row items-center gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-[#25252B]">
          <MaterialCommunityIcons color="#80D4FF" name="bus" size={19} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-[#E1E1E6]">{title}</Text>
          {showDetail ? <Text className="mt-1 text-sm text-[#A4A4AB]">{detail}</Text> : null}
        </View>
        <MaterialCommunityIcons color="#A4A4AB" name="chevron-right" size={22} />
      </View>
    </Pressable>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-3">
      <ActivityIndicator color="#80D4FF" />
      <Text className="text-base text-[#A4A4AB]">{label}</Text>
    </View>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <MaterialCommunityIcons color="#8E8E93" name="bus-alert" size={32} />
      <Text className="mt-3 text-center text-base text-[#A4A4AB]">{label}</Text>
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <MaterialCommunityIcons color="#E5B842" name="alert-circle-outline" size={32} />
      <Text className="mt-3 text-center text-base text-[#E1E1E6]">
        {getErrorMessage(error, 'No se pudo completar la consulta.')}
      </Text>
      <Pressable className="mt-4 rounded-xl bg-[#25252B] px-4 py-3" onPress={onRetry}>
        <Text className="font-semibold text-[#80D4FF]">Reintentar</Text>
      </Pressable>
    </View>
  );
}
