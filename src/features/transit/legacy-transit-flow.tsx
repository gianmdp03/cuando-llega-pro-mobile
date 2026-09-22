import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { ProblemDetailError } from '@/src/lib/api-client';
import { queryClient, queryKeys } from '@/src/lib/query-client';
import { createPreset } from '@/src/features/presets/api';
import { getMapStop } from '@/src/features/map/api';
import {
  getArrivals,
  getTransitIntersections,
  getTransitLines,
  getTransitStopsWithFlag,
  getTransitStreets,
} from '@/src/features/transit/api';
import { useArrivalTicker } from '@/src/features/transit/use-arrival-ticker';
import type {
  ArrivalResponseDTO,
  BusArrival,
  MapStopDirection,
  PresetRequestDTO,
  TelemetryStatus,
  TransitIntersectionDTO,
  TransitLineDTO,
  TransitStopWithFlagDTO,
  TransitStreetDTO,
} from '@/src/types/api';

type Selection = {
  line?: TransitLineDTO;
  street?: TransitStreetDTO;
  intersection?: TransitIntersectionDTO;
  stop?: TransitStopWithFlagDTO;
};

const CATALOG_OPTIONS = { staleTime: 5 * 60_000, gcTime: 30 * 60_000, retry: 1 } as const;

export function LegacyTransitFlow() {
  const [selection, setSelection] = useState<Selection>({});

  if (!selection.line) return <LinesStep onSelect={(line) => setSelection({ line })} />;
  if (!selection.street) {
    return (
      <StreetsStep
        line={selection.line}
        onBack={() => setSelection({})}
        onSelect={(street) => setSelection({ ...selection, street })}
      />
    );
  }
  if (!selection.intersection) {
    return (
      <IntersectionsStep
        line={selection.line}
        onBack={() => setSelection({ line: selection.line })}
        onSelect={(intersection) => setSelection({ ...selection, intersection })}
        street={selection.street}
      />
    );
  }
  if (!selection.stop) {
    return (
      <StopsStep
        intersection={selection.intersection}
        line={selection.line}
        onBack={() => setSelection({ line: selection.line, street: selection.street })}
        onSelect={(stop) => setSelection({ ...selection, stop })}
        street={selection.street}
      />
    );
  }
  return (
    <ArrivalsStep
      intersection={selection.intersection}
      line={selection.line}
      onBack={() =>
        setSelection({
          line: selection.line,
          street: selection.street,
          // Omit intersection to land on IntersectionsStep, bypassing StopsStep.
          // If we went back to StopsStep the auto-select useEffect would immediately
          // re-fire (cached data) and loop back into ArrivalsStep indefinitely.
        })
      }
      onSwitchToLineAtStop={(newLine, newStop) =>
        setSelection({ ...selection, line: newLine, stop: newStop })
      }
      stop={selection.stop}
      street={selection.street}
    />
  );
}

function LinesStep({ onSelect }: { onSelect: (line: TransitLineDTO) => void }) {
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: queryKeys.catalog.lines(),
    queryFn: getTransitLines,
    ...CATALOG_OPTIONS,
  });
  const data = useMemo(() => {
    const value = search.trim().toLowerCase();
    return value
      ? (query.data ?? []).filter(
          (line) =>
            line.codigo.toLowerCase().includes(value) ||
            line.descripcion.toLowerCase().includes(value)
        )
      : (query.data ?? []);
  }, [query.data, search]);
  return (
    <StepLayout subtitle="Elegí una línea para comenzar." title="Líneas">
      <View className="mb-3 flex-row items-center rounded-xl bg-[#25252B] px-3">
        <MaterialCommunityIcons color="#A4A4AB" name="magnify" size={20} />
        <TextInput
          autoCapitalize="none"
          className="ml-2 min-h-12 flex-1 text-base text-[#E1E1E6]"
          onChangeText={setSearch}
          placeholder="Buscar línea"
          placeholderTextColor="#8E8E93"
          value={search}
        />
      </View>
      <CatalogList
        data={data}
        emptyMessage="No hay líneas que coincidan con la búsqueda."
        keyExtractor={(line) => line.codigo}
        query={query}
        renderItem={({ item }) => (
          <CatalogRow
            detail={item.descripcion}
            onPress={() => onSelect(item)}
            title={item.codigo}
          />
        )}
      />
    </StepLayout>
  );
}

function StreetsStep({
  line,
  onBack,
  onSelect,
}: StepProps<TransitStreetDTO> & { line: TransitLineDTO }) {
  const query = useQuery({
    queryKey: queryKeys.catalog.streets(line.codigo),
    queryFn: () => getTransitStreets(line.codigo),
    ...CATALOG_OPTIONS,
  });
  return (
    <ListStep
      data={query.data ?? []}
      emptyMessage="No hay calles disponibles para esta línea."
      keyExtractor={(item) => item.codigo}
      onBack={onBack}
      query={query}
      renderItem={({ item }) => (
        <CatalogRow onPress={() => onSelect(item)} title={item.descripcion} />
      )}
      subtitle={`Línea ${line.codigo}`}
      title="Calles"
    />
  );
}

function IntersectionsStep({
  line,
  onBack,
  onSelect,
  street,
}: StepProps<TransitIntersectionDTO> & { line: TransitLineDTO; street: TransitStreetDTO }) {
  const query = useQuery({
    queryKey: queryKeys.catalog.intersections(line.codigo, street.codigo),
    queryFn: () => getTransitIntersections(line.codigo, street.codigo),
    ...CATALOG_OPTIONS,
  });
  return (
    <ListStep
      data={query.data ?? []}
      emptyMessage="No hay intersecciones disponibles."
      keyExtractor={(item) => item.codigo}
      onBack={onBack}
      query={query}
      renderItem={({ item }) => (
        <CatalogRow onPress={() => onSelect(item)} title={item.descripcion} />
      )}
      subtitle={street.descripcion}
      title="Intersecciones"
    />
  );
}

function StopsStep({
  intersection,
  line,
  onBack,
  onSelect,
  street,
}: StepProps<TransitStopWithFlagDTO> & {
  intersection: TransitIntersectionDTO;
  line: TransitLineDTO;
  street: TransitStreetDTO;
}) {
  const query = useQuery({
    queryKey: queryKeys.catalog.stopsWithFlags(line.codigo, street.codigo, intersection.codigo),
    queryFn: () => getTransitStopsWithFlag(line.codigo, street.codigo, intersection.codigo),
    ...CATALOG_OPTIONS,
  });

  // Auto-select when there is exactly one result
  useEffect(() => {
    if (query.isSuccess && query.data.length === 1) {
      onSelect(query.data[0]);
    }
  }, [query.isSuccess, query.data, onSelect]);

  // While loading or auto-selecting the single result, show a loader
  if (query.isPending || (query.isSuccess && query.data.length === 1)) {
    return (
      <StepLayout onBack={onBack} subtitle={intersection.descripcion} title="Paradas y sentidos">
        <LoadingState label="Cargando paradas" />
      </StepLayout>
    );
  }

  return (
    <ListStep
      data={query.data ?? []}
      emptyMessage="No hay paradas disponibles para esta intersección."
      keyExtractor={(item) => `${item.identificador}::${item.abreviaturaBandera}`}
      onBack={onBack}
      query={query}
      renderItem={({ item }) => (
        <CatalogRow
          onPress={() => onSelect(item)}
          title={item.abreviaturaAmpliadaBandera || item.abreviaturaBandera}
        />
      )}
      subtitle={intersection.descripcion}
      title="Paradas y sentidos"
    />
  );
}

function ListStep<T>({
  data,
  emptyMessage,
  keyExtractor,
  onBack,
  query,
  renderItem,
  subtitle,
  title,
}: {
  data: T[];
  emptyMessage: string;
  keyExtractor: (item: T) => string;
  onBack: () => void;
  query: UseQueryResult<T[], Error>;
  renderItem: ListRenderItem<T>;
  subtitle: string;
  title: string;
}) {
  return (
    <StepLayout onBack={onBack} subtitle={subtitle} title={title}>
      <CatalogList
        data={data}
        emptyMessage={emptyMessage}
        keyExtractor={keyExtractor}
        query={query}
        renderItem={renderItem}
      />
    </StepLayout>
  );
}

function ArrivalsStep({
  intersection,
  line,
  onBack,
  onSwitchToLineAtStop,
  stop,
  street,
}: {
  intersection?: TransitIntersectionDTO;
  line: TransitLineDTO;
  onBack: () => void;
  onSwitchToLineAtStop: (line: TransitLineDTO, stop: TransitStopWithFlagDTO) => void;
  stop: TransitStopWithFlagDTO;
  street?: TransitStreetDTO;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const query = useQuery({
    queryKey: queryKeys.telemetry.arrivals(
      line.codigo,
      stop.identificador,
      stop.abreviaturaBandera
    ),
    queryFn: () => getArrivals(line.codigo, stop.identificador, stop.abreviaturaBandera),
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const quickSwitchFooter = (
    <QuickSwitchPanel
      currentBandera={stop.abreviaturaBandera}
      currentLineCode={line.codigo}
      onSwitch={onSwitchToLineAtStop}
      stop={stop}
    />
  );

  const location =
    street && intersection
      ? `${street.descripcion} ${/^[IiYy]/u.test(intersection.descripcion) ? 'e' : 'y'} ${intersection.descripcion}`
      : undefined;

  return (
    <StepLayout
      location={location}
      onBack={onBack}
      subtitle={stop.abreviaturaAmpliadaBandera || stop.abreviaturaBandera}
      title={`Línea ${line.codigo}`}>
      <View className="mb-3 flex-row justify-end">
        <Pressable
          accessibilityLabel="Actualizar arribos"
          accessibilityRole="button"
          className="flex-row items-center rounded-xl bg-[#25252B] px-3 py-2 active:opacity-70"
          disabled={query.isFetching}
          onPress={() => void query.refetch()}>
          <MaterialCommunityIcons color="#80D4FF" name="refresh" size={18} />
          <Text className="ml-2 text-sm font-semibold text-[#E1E1E6]">Actualizar</Text>
        </Pressable>
      </View>
      <View className="mb-3 flex-row items-center justify-between rounded-2xl bg-[#1E1E24] p-4">
        <View className="flex-1">
          <Text className="text-sm text-[#A4A4AB]">Parada</Text>
          <Text className="mt-1 text-base font-semibold text-[#E1E1E6]">{stop.descripcion}</Text>
          <Text className="mt-1 text-sm text-[#A4A4AB]">{stop.identificador}</Text>
        </View>
        <Pressable
          accessibilityLabel="Guardar acceso rápido"
          accessibilityRole="button"
          className="rounded-xl bg-[#25252B] p-3 active:opacity-70"
          onPress={() => setIsSaving(true)}>
          <MaterialCommunityIcons color="#80D4FF" name="star-plus-outline" size={22} />
        </Pressable>
      </View>
      <ArrivalsContent listFooterComponent={quickSwitchFooter} query={query} />
      <SavePresetModal
        lineCode={line.codigo}
        onClose={() => setIsSaving(false)}
        stop={stop}
        visible={isSaving}
      />
    </StepLayout>
  );
}

function ArrivalsContent({
  listFooterComponent,
  query,
}: {
  listFooterComponent?: React.ReactElement;
  query: UseQueryResult<ArrivalResponseDTO, Error>;
}) {
  if (query.isPending) return <LoadingState label="Consultando arribos" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data.arrivals.length === 0)
    return (
      <>
        <EmptyState label="No hay arribos próximos para este sentido." />
        {listFooterComponent}
      </>
    );
  return (
    <FlashList
      data={query.data.arrivals}
      keyExtractor={(arrival) =>
        arrival.vehicleUnit ??
        `${arrival.lineCode ?? 'linea'}:${arrival.estimatedArrivalTime ?? 'sin-hora'}`
      }
      ListFooterComponent={listFooterComponent}
      renderItem={({ item }) => <ArrivalCard arrival={item} />}
    />
  );
}

// ---------- Quick switch panel (cambiar colectivo / destino) ----------

function QuickSwitchPanel({
  currentBandera,
  currentLineCode,
  onSwitch,
  stop,
}: {
  currentBandera: string;
  currentLineCode: string;
  onSwitch: (line: TransitLineDTO, stop: TransitStopWithFlagDTO) => void;
  stop: TransitStopWithFlagDTO;
}) {
  const [pendingLineName, setPendingLineName] = useState<string | null>(null);

  const query = useQuery({
    queryKey: queryKeys.map.stop(stop.identificador),
    queryFn: () => getMapStop(stop.identificador),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });

  if (!query.isSuccess || !query.data) return null;

  const directions = query.data.directions;

  // Unique line names that are NOT the current line
  const otherLineNames = [
    ...new Set(
      directions.filter((d) => d.nameTransitLine !== currentLineCode).map((d) => d.nameTransitLine)
    ),
  ];

  // Other destinations of the CURRENT line at this stop
  const otherDestinations = directions.filter(
    (d) => d.nameTransitLine === currentLineCode && d.direction !== currentBandera
  );

  const hasSwitchLines = otherLineNames.length > 0;
  const hasSwitchDestinations = otherDestinations.length > 0;

  if (!hasSwitchLines && !hasSwitchDestinations) return null;

  function buildLineAndStop(dir: MapStopDirection): [TransitLineDTO, TransitStopWithFlagDTO] {
    const newLine: TransitLineDTO = {
      id: dir.codeTransitLine,
      codigo: dir.nameTransitLine,
      descripcion: dir.nameTransitLine,
      codigoEntidad: null,
      codigoEmpresa: null,
    };
    const newStop: TransitStopWithFlagDTO = {
      ...stop,
      abreviaturaBandera: dir.direction,
      abreviaturaAmpliadaBandera: dir.expandedDirection ?? dir.direction,
    };
    return [newLine, newStop];
  }

  function handleLineChipPress(lineName: string) {
    const lineDirections = directions.filter((d) => d.nameTransitLine === lineName);
    if (lineDirections.length === 1) {
      const [newLine, newStop] = buildLineAndStop(lineDirections[0]);
      onSwitch(newLine, newStop);
    } else {
      setPendingLineName(lineName);
    }
  }

  function handleDirectionPress(dir: MapStopDirection) {
    const [newLine, newStop] = buildLineAndStop(dir);
    onSwitch(newLine, newStop);
  }

  const pendingLineDirections = pendingLineName
    ? directions.filter((d) => d.nameTransitLine === pendingLineName)
    : [];

  return (
    <View className="mb-3 mt-1 gap-3">
      {/* ── Cambiar colectivo ── */}
      {hasSwitchLines && (
        <View className="rounded-2xl bg-[#1E1E24] p-4">
          <View className="mb-3 flex-row items-center gap-2">
            <MaterialCommunityIcons color="#A4A4AB" name="bus-multiple" size={16} />
            <Text className="text-sm font-semibold text-[#A4A4AB]">
              Otros colectivos en esta parada
            </Text>
          </View>

          {pendingLineName ? (
            /* Inline destination picker for the pending line */
            <View className="gap-2">
              <Text className="mb-1 text-xs text-[#8E8E93]">
                Elegí destino para el {pendingLineName}
              </Text>
              {pendingLineDirections.map((dir) => (
                <Pressable
                  key={dir.direction}
                  className="rounded-xl bg-[#25252B] px-3 py-2.5 active:opacity-70"
                  onPress={() => handleDirectionPress(dir)}>
                  <Text className="text-sm font-semibold text-[#E1E1E6]">
                    {dir.expandedDirection ?? dir.direction}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                className="mt-1 rounded-xl bg-[#25252B] px-3 py-2 active:opacity-70"
                onPress={() => setPendingLineName(null)}>
                <Text className="text-center text-xs text-[#8E8E93]">Cancelar</Text>
              </Pressable>
            </View>
          ) : (
            /* Line chips */
            <View className="flex-row flex-wrap gap-2">
              {otherLineNames.map((lineName) => (
                <Pressable
                  key={lineName}
                  className="rounded-xl bg-[#25252B] px-4 py-2 active:opacity-70"
                  onPress={() => handleLineChipPress(lineName)}>
                  <Text className="text-sm font-bold text-[#80D4FF]">{lineName}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ── Cambiar destino (mismo colectivo) ── */}
      {hasSwitchDestinations && !pendingLineName && (
        <View className="rounded-2xl bg-[#1E1E24] p-4">
          <View className="mb-3 flex-row items-center gap-2">
            <MaterialCommunityIcons color="#A4A4AB" name="sign-direction" size={16} />
            <Text className="text-sm font-semibold text-[#A4A4AB]">Cambiar destino</Text>
          </View>
          <View className="gap-2">
            {otherDestinations.map((dir) => (
              <Pressable
                key={dir.direction}
                className="rounded-xl bg-[#25252B] px-3 py-2.5 active:opacity-70"
                onPress={() => handleDirectionPress(dir)}>
                <Text className="text-sm font-semibold text-[#E1E1E6]">
                  {dir.expandedDirection ?? dir.direction}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ---------- Arrival card ----------

function ArrivalCard({ arrival }: { arrival: BusArrival }) {
  const visualMinutes = useArrivalTicker(arrival);
  const reliable = arrival.status !== 'EXPIRED';
  return (
    <View className="mb-3 rounded-2xl bg-[#1E1E24] p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View>
          <Text className="text-sm text-[#A4A4AB]">
            Coche {arrival.vehicleUnit ?? 'Sin identificar'}
          </Text>
          <Text className="mt-1 text-3xl font-bold text-[#E1E1E6]">
            {reliable && visualMinutes !== null ? `${visualMinutes} min` : 'ETA no confiable'}
          </Text>
          {arrival.estimatedArrivalTime ? (
            <Text className="mt-1 text-sm text-[#A4A4AB]">
              Hora estimada: {arrival.estimatedArrivalTime}
            </Text>
          ) : null}
        </View>
        <TelemetryBadge status={arrival.status} />
      </View>
      <View className="mt-4 flex-row flex-wrap gap-3">
        {arrival.accessible !== null ? (
          <ArrivalDetail
            icon="wheelchair-accessibility"
            value={arrival.accessible ? 'Accesible' : 'No accesible'}
          />
        ) : null}
        {arrival.distanceMeters !== null ? (
          <ArrivalDetail icon="map-marker-distance" value={`${arrival.distanceMeters} m`} />
        ) : null}
        {arrival.scheduleDeviation ? (
          <ArrivalDetail icon="clock-outline" value={arrival.scheduleDeviation} />
        ) : null}
        {arrival.branch ? <ArrivalDetail icon="sign-direction" value={arrival.branch} /> : null}
      </View>
    </View>
  );
}

function SavePresetModal({
  lineCode,
  onClose,
  stop,
  visible,
}: {
  lineCode: string;
  onClose: () => void;
  stop: TransitStopWithFlagDTO;
  visible: boolean;
}) {
  const [alias, setAlias] = useState('');
  const mutation = useMutation({
    mutationFn: createPreset,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.presets.all() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.currentUser() }),
      ]);
      setAlias('');
      onClose();
    },
  });
  function save() {
    const normalizedAlias = alias.trim();
    if (!normalizedAlias) return;
    const request: PresetRequestDTO = {
      codigoLinea: lineCode,
      identificadorParada: stop.identificador,
      bandera: stop.abreviaturaBandera || null,
      config: {
        alias: normalizedAlias,
        icon: 'bus',
        color: '#80D4FF',
        activeSchedule: null,
        notificationSettings: null,
      },
    };
    mutation.mutate(request);
  }
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View className="flex-1 justify-end bg-black/60">
        <View className="rounded-t-3xl bg-[#1E1E24] p-6">
          <Text className="text-xl font-semibold text-[#E1E1E6]">Guardar acceso rápido</Text>
          <Text className="mt-2 text-sm text-[#A4A4AB]">
            Definí un alias para Línea {lineCode}.
          </Text>
          <TextInput
            autoFocus
            className="mt-5 min-h-12 rounded-xl bg-[#25252B] px-4 text-base text-[#E1E1E6]"
            onChangeText={setAlias}
            placeholder="Alias"
            placeholderTextColor="#8E8E93"
            value={alias}
          />
          {mutation.error ? (
            <Text className="mt-3 text-sm text-[#E5B842]">{getErrorMessage(mutation.error)}</Text>
          ) : null}
          <View className="mt-5 flex-row gap-3">
            <Pressable
              className="flex-1 items-center rounded-xl bg-[#25252B] py-4"
              onPress={onClose}>
              <Text className="font-semibold text-[#E1E1E6]">Cancelar</Text>
            </Pressable>
            <Pressable
              className="flex-1 items-center rounded-xl bg-[#80D4FF] py-4 disabled:opacity-50"
              disabled={!alias.trim() || mutation.isPending}
              onPress={save}>
              <Text className="font-semibold text-[#121212]">
                {mutation.isPending ? 'Guardando…' : 'Guardar'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TelemetryBadge({ status }: { status: TelemetryStatus }) {
  const color =
    status === 'LIVE'
      ? { bg: '#0E2B18', text: '#6CD58A', label: 'En vivo' }
      : status === 'ESTIMATED_FALLBACK'
        ? { bg: '#332500', text: '#E5B842', label: 'Estimado' }
        : { bg: '#28282C', text: '#8E8E93', label: 'Vencido' };
  return (
    <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: color.bg }}>
      <Text className="text-xs font-semibold" style={{ color: color.text }}>
        {color.label}
      </Text>
    </View>
  );
}

function ArrivalDetail({
  icon,
  value,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  value: string;
}) {
  return (
    <View className="flex-row items-center gap-1.5">
      <MaterialCommunityIcons color="#A4A4AB" name={icon} size={16} />
      <Text className="text-sm text-[#A4A4AB]">{value}</Text>
    </View>
  );
}

function CatalogList<T>({
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

function StepLayout({
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

function CatalogRow({
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

function LoadingState({ label }: { label: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-3">
      <ActivityIndicator color="#80D4FF" />
      <Text className="text-base text-[#A4A4AB]">{label}</Text>
    </View>
  );
}
function EmptyState({ label }: { label: string }) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <MaterialCommunityIcons color="#8E8E93" name="bus-alert" size={32} />
      <Text className="mt-3 text-center text-base text-[#A4A4AB]">{label}</Text>
    </View>
  );
}
function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <MaterialCommunityIcons color="#E5B842" name="alert-circle-outline" size={32} />
      <Text className="mt-3 text-center text-base text-[#E1E1E6]">{getErrorMessage(error)}</Text>
      <Pressable className="mt-4 rounded-xl bg-[#25252B] px-4 py-3" onPress={onRetry}>
        <Text className="font-semibold text-[#80D4FF]">Reintentar</Text>
      </Pressable>
    </View>
  );
}
function getErrorMessage(error: Error): string {
  return error instanceof ProblemDetailError
    ? error.problem.detail
    : error.message || 'No se pudo completar la consulta.';
}
type StepProps<T> = { onBack: () => void; onSelect: (item: T) => void };
