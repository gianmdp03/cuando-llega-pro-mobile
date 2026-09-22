import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useMutation, useQuery } from '@tanstack/react-query';

import { ProblemDetailError } from '@/src/lib/api-client';
import { queryClient, queryKeys } from '@/src/lib/query-client';
import {
  createPreset,
  deletePreset,
  getDashboard,
  getPreset,
  getPresets,
  updatePreset,
} from '@/src/features/presets/api';
import { useArrivalTicker } from '@/src/features/transit/use-arrival-ticker';
import type {
  BusArrival,
  DashboardPresetDTO,
  PresetDetailDTO,
  PresetRequestDTO,
} from '@/src/types/api';

const DASHBOARD_OPTIONS = { staleTime: 15_000, gcTime: 5 * 60_000, retry: 1 } as const;

export function PresetDashboard() {
  const [editingId, setEditingId] = useState<number | null | undefined>(undefined);
  const dashboardQuery = useQuery({
    queryKey: queryKeys.dashboard.currentUser(),
    queryFn: getDashboard,
    ...DASHBOARD_OPTIONS,
  });
  const presetsQuery = useQuery({
    queryKey: queryKeys.presets.all(),
    queryFn: getPresets,
    ...DASHBOARD_OPTIONS,
  });
  const deleteMutation = useMutation({
    mutationFn: deletePreset,
    onSuccess: (_result, id) => invalidatePresetQueries(id),
  });

  if (dashboardQuery.isPending || presetsQuery.isPending) return <Loading />;
  if (dashboardQuery.isError)
    return (
      <ErrorState error={dashboardQuery.error} onRetry={() => void dashboardQuery.refetch()} />
    );
  if (presetsQuery.isError)
    return <ErrorState error={presetsQuery.error} onRetry={() => void presetsQuery.refetch()} />;

  return (
    <View className="flex-1 bg-[#121212] px-5 pt-5">
      <View className="mb-4 flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-bold text-[#E1E1E6]">Favoritos</Text>
          <Text className="mt-1 text-sm text-[#A4A4AB]">
            {dashboardQuery.data.totalPresets} accesos rápidos
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Crear favorito"
          className="rounded-xl bg-[#80D4FF] p-3"
          onPress={() => setEditingId(null)}>
          <MaterialCommunityIcons color="#121212" name="plus" size={22} />
        </Pressable>
      </View>
      <FlashList
        contentContainerStyle={{ paddingBottom: 24 }}
        data={dashboardQuery.data.presets}
        keyExtractor={(preset) => String(preset.presetId)}
        ListEmptyComponent={<EmptyState onCreate={() => setEditingId(null)} />}
        refreshControl={
          <RefreshControl
            onRefresh={() => void Promise.all([dashboardQuery.refetch(), presetsQuery.refetch()])}
            refreshing={dashboardQuery.isRefetching || presetsQuery.isRefetching}
            tintColor="#80D4FF"
          />
        }
        renderItem={({ item }) => (
          <DashboardCard
            onDelete={() => confirmDelete(item.presetId)}
            onEdit={() => setEditingId(item.presetId)}
            preset={item}
          />
        )}
      />
      {editingId !== undefined ? (
        <PresetEditor id={editingId} onClose={() => setEditingId(undefined)} />
      ) : null}
    </View>
  );

  function confirmDelete(id: number): void {
    Alert.alert('Eliminar acceso rápido', 'Esta acción no se puede deshacer.', [
      { style: 'cancel', text: 'Cancelar' },
      { style: 'destructive', text: 'Eliminar', onPress: () => deleteMutation.mutate(id) },
    ]);
  }
}

function DashboardCard({
  onDelete,
  onEdit,
  preset,
}: {
  onDelete: () => void;
  onEdit: () => void;
  preset: DashboardPresetDTO;
}) {
  return (
    <View className="mb-3 rounded-2xl bg-[#1E1E24] p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-lg font-semibold text-[#E1E1E6]">{preset.config.alias}</Text>
          <Text className="mt-1 text-sm text-[#A4A4AB]">
            Línea {preset.codigoLinea} · {preset.identificadorParada}
          </Text>
          <Text className="mt-1 text-sm text-[#A4A4AB]">
            {preset.bandera ?? 'Todos los sentidos'}
          </Text>
        </View>
        <View className="flex-row gap-1">
          <Pressable accessibilityLabel="Editar acceso rápido" className="p-2" onPress={onEdit}>
            <MaterialCommunityIcons color="#80D4FF" name="pencil-outline" size={20} />
          </Pressable>
          <Pressable accessibilityLabel="Eliminar acceso rápido" className="p-2" onPress={onDelete}>
            <MaterialCommunityIcons color="#E5B842" name="trash-can-outline" size={20} />
          </Pressable>
        </View>
      </View>
      <View className="mt-4 border-t border-[#28282C] pt-3">
        <Text className="text-sm font-semibold text-[#A4A4AB]">{preset.telemetry.status}</Text>
        {preset.telemetry.arrivals.length === 0 ? (
          <Text className="mt-2 text-sm text-[#A4A4AB]">Sin coches próximos.</Text>
        ) : (
          preset.telemetry.arrivals.map((arrival) => (
            <DashboardArrival
              arrival={arrival}
              key={arrival.vehicleUnit ?? `${arrival.lineCode}:${arrival.estimatedArrivalTime}`}
            />
          ))
        )}
      </View>
    </View>
  );
}

function DashboardArrival({ arrival }: { arrival: BusArrival }) {
  const visualMinutes = useArrivalTicker(arrival);
  const eta =
    arrival.status === 'EXPIRED' || visualMinutes === null
      ? 'ETA no confiable'
      : `${visualMinutes} min`;
  return (
    <View className="mt-2 flex-row justify-between">
      <Text className="text-sm text-[#E1E1E6]">
        Coche {arrival.vehicleUnit ?? 'Sin identificar'}
      </Text>
      <Text className="text-sm text-[#A4A4AB]">{eta}</Text>
    </View>
  );
}

function PresetEditor({ id, onClose }: { id: number | null; onClose: () => void }) {
  const detailQuery = useQuery({
    queryKey: queryKeys.presets.detail(id ?? 0),
    queryFn: () => getPreset(id!),
    enabled: id !== null,
    ...DASHBOARD_OPTIONS,
  });
  const [draft, setDraft] = useState<Partial<PresetRequestDTO>>({});
  const baseForm = detailQuery.data ?? null;
  const form = mergeForm(baseForm ? toRequest(baseForm) : emptyRequest(), draft);
  const mutation = useMutation({
    mutationFn: (request: PresetRequestDTO) =>
      id === null ? createPreset(request) : updatePreset(id, request),
    onSuccess: async () => {
      await invalidatePresetQueries(id ?? undefined);
      onClose();
    },
  });
  const update = (key: 'codigoLinea' | 'identificadorParada' | 'bandera', value: string) =>
    setDraft((current) => ({ ...current, [key]: key === 'bandera' ? value || null : value }));
  const updateAlias = (alias: string) =>
    setDraft((current) => ({ ...current, config: { ...form.config, alias } }));
  const canSave =
    form.codigoLinea.trim() && form.identificadorParada.trim() && form.config.alias.trim();
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View className="flex-1 justify-end bg-black/60">
        <View className="rounded-t-3xl bg-[#1E1E24] p-6">
          <Text className="text-xl font-semibold text-[#E1E1E6]">
            {id === null ? 'Crear acceso rápido' : 'Editar acceso rápido'}
          </Text>
          {id !== null && detailQuery.isPending ? (
            <ActivityIndicator className="my-8" color="#80D4FF" />
          ) : (
            <>
              <Field label="Alias" onChangeText={updateAlias} value={form.config.alias} />
              <Field
                label="Línea comercial"
                onChangeText={(value) => update('codigoLinea', value)}
                value={form.codigoLinea}
              />
              <Field
                label="Identificador de parada"
                onChangeText={(value) => update('identificadorParada', value)}
                value={form.identificadorParada}
              />
              <Field
                label="Bandera opcional"
                onChangeText={(value) => update('bandera', value)}
                value={form.bandera ?? ''}
              />
              {mutation.error ? (
                <Text className="mt-3 text-sm text-[#E5B842]">{errorMessage(mutation.error)}</Text>
              ) : null}
              <View className="mt-5 flex-row gap-3">
                <Pressable
                  className="flex-1 items-center rounded-xl bg-[#25252B] py-4"
                  onPress={onClose}>
                  <Text className="font-semibold text-[#E1E1E6]">Cancelar</Text>
                </Pressable>
                <Pressable
                  className="flex-1 items-center rounded-xl bg-[#80D4FF] py-4 disabled:opacity-50"
                  disabled={!canSave || mutation.isPending}
                  onPress={() =>
                    mutation.mutate({
                      ...form,
                      codigoLinea: form.codigoLinea.trim(),
                      identificadorParada: form.identificadorParada.trim(),
                      bandera: form.bandera?.trim() || null,
                      config: { ...form.config, alias: form.config.alias.trim() },
                    })
                  }>
                  <Text className="font-semibold text-[#121212]">
                    {mutation.isPending ? 'Guardando…' : 'Guardar'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Field({
  label,
  onChangeText,
  value,
}: {
  label: string;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <View className="mt-4">
      <Text className="mb-2 text-sm text-[#A4A4AB]">{label}</Text>
      <TextInput
        className="min-h-12 rounded-xl bg-[#25252B] px-4 text-base text-[#E1E1E6]"
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor="#8E8E93"
        value={value}
      />
    </View>
  );
}
function toRequest(detail: PresetDetailDTO): PresetRequestDTO {
  return {
    codigoLinea: detail.codigoLinea,
    identificadorParada: detail.identificadorParada,
    bandera: detail.bandera,
    config: detail.config,
  };
}

function emptyRequest(): PresetRequestDTO {
  return {
    codigoLinea: '',
    identificadorParada: '',
    bandera: null,
    config: {
      alias: '',
      icon: 'bus',
      color: '#80D4FF',
      activeSchedule: null,
      notificationSettings: null,
    },
  };
}

function mergeForm(base: PresetRequestDTO, draft: Partial<PresetRequestDTO>): PresetRequestDTO {
  return {
    ...base,
    ...draft,
    config: { ...base.config, ...draft.config },
  };
}
async function invalidatePresetQueries(id?: number): Promise<void> {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: queryKeys.presets.all() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.currentUser() }),
  ];
  if (id !== undefined) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: queryKeys.presets.detail(id) }));
  }
  await Promise.all(invalidations);
}
function Loading() {
  return (
    <View className="flex-1 items-center justify-center bg-[#121212]">
      <ActivityIndicator color="#80D4FF" />
    </View>
  );
}
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <MaterialCommunityIcons color="#8E8E93" name="star-outline" size={36} />
      <Text className="mt-3 text-center text-base text-[#A4A4AB]">
        Todavía no hay accesos rápidos.
      </Text>
      <Pressable className="mt-4 rounded-xl bg-[#25252B] px-4 py-3" onPress={onCreate}>
        <Text className="font-semibold text-[#80D4FF]">Crear acceso</Text>
      </Pressable>
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
function errorMessage(error: Error): string {
  return error instanceof ProblemDetailError
    ? error.problem.detail
    : error.message || 'No se pudo completar la operación.';
}
