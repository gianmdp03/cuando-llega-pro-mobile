import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useIsFocused } from 'expo-router';
import {
  BackHandler,
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { getErrorMessage } from '@/src/lib/error-message';
import { queryClient, queryKeys } from '@/src/lib/query-client';
import { createPreset } from '@/src/features/presets/api';
import { getMapStop } from '@/src/features/map/api';
import { ArrivalMapModal } from '@/src/features/transit/arrival-map-modal';
import { ArrivalDetail, TelemetryBadge } from '@/src/features/transit/arrival-ui';
import {
  CatalogList,
  CatalogRow,
  EmptyState,
  ErrorState,
  LoadingState,
  StepLayout,
} from '@/src/features/transit/transit-catalog-ui';
import { useArrivalsQuery, useTransitCatalog } from '@/src/services/mgp';
import {
  formatVisualArrivalMinutes,
  getArrivalClockTime,
  getVisualRemainingMinutes,
  useArrivalClock,
} from '@/src/features/transit/use-arrival-ticker';

import type {
  ArrivalResponseDTO,
  BusArrival,
  MapStopDirection,
  PresetDetailDTO,
  PresetRequestDTO,
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

// These endpoints can need MGP on a cache miss. The user explicitly controls retries.
const CATALOG_OPTIONS = { staleTime: 5 * 60_000, gcTime: 30 * 60_000, retry: 0 } as const;

export function LegacyTransitFlow() {
  const [selection, setSelection] = useState<Selection>({});
  const exitPressTime = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (Platform.OS !== 'android') return false;

        if (selection.line) {
          setSelection({});
          exitPressTime.current = 0;
          return true;
        }

        const now = Date.now();
        if (now - exitPressTime.current < 2_000) {
          BackHandler.exitApp();
          return true;
        }

        exitPressTime.current = now;
        ToastAndroid.show('Tocá atrás nuevamente para cerrar', ToastAndroid.SHORT);
        return true;
      });

      return () => subscription.remove();
    }, [selection.line])
  );

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

/**
 * Opens a saved preset in the exact same arrivals experience used by the
 * lines flow. Its only navigation difference is that Back returns to the
 * presets selector.
 */
export function PresetTransitFlow({
  onBack,
  preset,
}: {
  onBack: () => void;
  preset: PresetDetailDTO;
}) {
  const [selection, setSelection] = useState(() => ({
    line: presetLine(preset.codigoLinea),
    stop: presetStop(preset),
  }));
  return (
    <ArrivalsStep
      line={selection.line}
      locationOverride={preset.config.location ?? undefined}
      onBack={onBack}
      onSwitchToLineAtStop={(line, stop) => setSelection({ line, stop })}
      showSavePreset={false}
      stop={selection.stop}
    />
  );
}

function presetLine(codigo: string): TransitLineDTO {
  return {
    id: codigo,
    codigo,
    descripcion: codigo,
    codigoEntidad: null,
    codigoEmpresa: null,
  };
}

function presetStop(preset: PresetDetailDTO): TransitStopWithFlagDTO {
  const direction = preset.bandera ?? '';
  return {
    codigo: preset.identificadorParada,
    identificador: preset.identificadorParada,
    descripcion: preset.config.alias,
    abreviaturaBandera: direction,
    abreviaturaAmpliadaBandera: direction || 'Todos los sentidos',
    latitudParada: null,
    longitudParada: null,
  };
}

function LinesStep({ onSelect }: { onSelect: (line: TransitLineDTO) => void }) {
  const catalog = useTransitCatalog();
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: queryKeys.catalog.lines(),
    queryFn: ({ signal }) => catalog.lines(signal),
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
  const catalog = useTransitCatalog();
  const query = useQuery({
    queryKey: queryKeys.catalog.streets(line.codigo),
    queryFn: ({ signal }) => catalog.streets(line.codigo, signal),
    ...CATALOG_OPTIONS,
  });
  return (
    <ListStep
      data={query.data ?? []}
      emptyMessage="No hay calles disponibles para esta línea."
      emptySearchMessage="No hay calles que coincidan con la búsqueda."
      getSearchText={(item) => item.descripcion}
      keyExtractor={(item) => item.codigo}
      onBack={onBack}
      query={query}
      renderItem={({ item }) => (
        <CatalogRow onPress={() => onSelect(item)} title={item.descripcion} />
      )}
      searchPlaceholder="Buscar calle"
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
  const catalog = useTransitCatalog();
  const query = useQuery({
    queryKey: queryKeys.catalog.intersections(line.codigo, street.codigo),
    queryFn: ({ signal }) => catalog.intersections(line.codigo, street.codigo, signal),
    ...CATALOG_OPTIONS,
  });
  return (
    <ListStep
      data={query.data ?? []}
      emptyMessage="No hay intersecciones disponibles."
      emptySearchMessage="No hay intersecciones que coincidan con la búsqueda."
      getSearchText={(item) => item.descripcion}
      keyExtractor={(item) => item.codigo}
      onBack={onBack}
      query={query}
      renderItem={({ item }) => (
        <CatalogRow onPress={() => onSelect(item)} title={item.descripcion} />
      )}
      searchPlaceholder="Buscar intersección"
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
  const catalog = useTransitCatalog();
  const query = useQuery({
    queryKey: queryKeys.catalog.stopsWithFlags(line.codigo, street.codigo, intersection.codigo),
    queryFn: ({ signal }) => catalog.stopsWithFlag(line.codigo, street.codigo, intersection.codigo, signal),
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
  emptySearchMessage,
  getSearchText,
  keyExtractor,
  onBack,
  query,
  renderItem,
  searchPlaceholder,
  subtitle,
  title,
}: {
  data: T[];
  emptyMessage: string;
  emptySearchMessage?: string;
  getSearchText?: (item: T) => string;
  keyExtractor: (item: T) => string;
  onBack: () => void;
  query: UseQueryResult<T[], Error>;
  renderItem: ListRenderItem<T>;
  searchPlaceholder?: string;
  subtitle: string;
  title: string;
}) {
  const [search, setSearch] = useState('');
  const filteredData = useMemo(() => {
    const value = search.trim().toLowerCase();
    return value && getSearchText
      ? data.filter((item) => getSearchText(item).toLowerCase().includes(value))
      : data;
  }, [data, getSearchText, search]);

  return (
    <StepLayout onBack={onBack} subtitle={subtitle} title={title}>
      {searchPlaceholder ? (
        <View className="mb-3 flex-row items-center rounded-xl bg-[#25252B] px-3">
          <MaterialCommunityIcons color="#A4A4AB" name="magnify" size={20} />
          <TextInput
            autoCapitalize="none"
            className="ml-2 min-h-12 flex-1 text-base text-[#E1E1E6]"
            onChangeText={setSearch}
            placeholder={searchPlaceholder}
            placeholderTextColor="#8E8E93"
            value={search}
          />
        </View>
      ) : null}
      <CatalogList
        data={filteredData}
        emptyMessage={search.trim() && emptySearchMessage ? emptySearchMessage : emptyMessage}
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
  locationOverride,
  onBack,
  onSwitchToLineAtStop,
  showSavePreset = true,
  stop,
  street,
}: {
  intersection?: TransitIntersectionDTO;
  line: TransitLineDTO;
  locationOverride?: string;
  onBack: () => void;
  onSwitchToLineAtStop: (line: TransitLineDTO, stop: TransitStopWithFlagDTO) => void;
  showSavePreset?: boolean;
  stop: TransitStopWithFlagDTO;
  street?: TransitStreetDTO;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [isMapVisible, setIsMapVisible] = useState(false);
  const query = useArrivalsQuery(
    line.codigo,
    stop.identificador,
    stop.abreviaturaBandera
  );

  // --- Animated spin for the refresh icon ---
  const rotation = useSharedValue(0);
  const prevFetching = useRef(false);

  useEffect(() => {
    if (query.isFetching && !prevFetching.current) {
      rotation.value = 0;
      rotation.value = withRepeat(withTiming(360, { duration: 800 }), -1, false);
    } else if (!query.isFetching && prevFetching.current) {
      cancelAnimation(rotation);
      rotation.value = withTiming(360, { duration: 200 });
    }
    prevFetching.current = query.isFetching;
  }, [query.isFetching, rotation]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  // ------------------------------------------

  const lastUpdated = query.dataUpdatedAt > 0 ? new Date(query.dataUpdatedAt) : null;
  const lastUpdatedLabel = lastUpdated
    ? `${lastUpdated.getHours().toString().padStart(2, '0')}:${lastUpdated.getMinutes().toString().padStart(2, '0')}:${lastUpdated.getSeconds().toString().padStart(2, '0')}`
    : null;

  const quickSwitchFooter = (
    <QuickSwitchPanel
      currentBandera={stop.abreviaturaBandera}
      currentLineCode={line.codigo}
      onSwitch={onSwitchToLineAtStop}
      stop={stop}
    />
  );

  const location =
    locationOverride ??
    (street && intersection
      ? `${street.descripcion} ${/^[IiYy]/u.test(intersection.descripcion) ? 'e' : 'y'} ${intersection.descripcion}`
      : undefined);

  return (
    <StepLayout
      location={location}
      onBack={onBack}
      subtitle={stop.abreviaturaAmpliadaBandera || stop.abreviaturaBandera}
      title={`Línea ${line.codigo}`}>
      <View className="mb-3">
        <View className="flex-row items-center justify-between">
          {query.isSuccess && query.data.status ? (
            <TelemetryBadge prominent status={query.data.status} />
          ) : null}
          {showSavePreset ? (
            <Pressable
              accessibilityLabel="Guardar acceso rápido"
              accessibilityRole="button"
              className="flex-row items-center rounded-xl bg-[#25252B] px-2 py-2 active:opacity-70"
              onPress={() => setIsSaving(true)}>
              <MaterialCommunityIcons color="#80D4FF" name="star-plus-outline" size={18} />
              <Text className="ml-1.5 text-xs font-semibold text-[#E1E1E6]">Guardar</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel="Mostrar mapa de arribos"
            accessibilityRole="button"
            className="flex-row items-center rounded-xl bg-[#25252B] px-2 py-2 active:opacity-70"
            onPress={() => setIsMapVisible(true)}>
            <MaterialCommunityIcons color="#80D4FF" name="map-outline" size={18} />
            <Text className="ml-1.5 text-xs font-semibold text-[#E1E1E6]">Mapa</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Actualizar arribos"
            accessibilityRole="button"
            className="flex-row items-center rounded-xl bg-[#25252B] px-2 py-2 active:opacity-70"
            disabled={query.isFetching}
            onPress={() => void query.refetch()}>
            <Animated.View style={iconStyle}>
              <MaterialCommunityIcons
                color={query.isFetching ? '#4A90A4' : '#80D4FF'}
                name="refresh"
                size={18}
              />
            </Animated.View>
            <Text
              className="ml-1.5 text-xs font-semibold"
              style={{ color: query.isFetching ? '#4A90A4' : '#E1E1E6' }}>
              {query.isFetching ? 'Actualizando…' : 'Actualizar'}
            </Text>
          </Pressable>
        </View>
        {lastUpdatedLabel ? (
          <Text className="mt-2 text-sm text-[#8E8E93]" numberOfLines={1}>
            {query.isFetching ? 'Consultando…' : `Última actualización: ${lastUpdatedLabel}`}
          </Text>
        ) : null}
      </View>
      <ArrivalsContent listFooterComponent={quickSwitchFooter} query={query} />
      {showSavePreset ? (
        <SavePresetModal
          lineCode={line.codigo}
          location={location}
          onClose={() => setIsSaving(false)}
          stop={stop}
          visible={isSaving}
        />
      ) : null}
      {isMapVisible ? (
        <ArrivalMapModal
          arrivals={query.data}
          direction={stop.abreviaturaBandera}
          isRefreshing={query.isFetching}
          lineCode={line.codigo}
          onClose={() => setIsMapVisible(false)}
          onRefresh={() => void query.refetch()}
          stop={stop}
          visible
        />
      ) : null}
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
  const isFocused = useIsFocused();
  const now = useArrivalClock(isFocused);
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
      keyExtractor={(arrival, index) =>
        arrival.vehicleUnit ??
        `${arrival.lineCode ?? 'linea'}:${arrival.estimatedArrivalTime ?? 'sin-hora'}:${index}`
      }
      ListFooterComponent={listFooterComponent}
      renderItem={({ item }) => <ArrivalCard arrival={item} now={now} />}
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
    queryFn: ({ signal }) => getMapStop(stop.identificador, signal),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });

  if (!query.isSuccess || !query.data) {
    return query.isPending ? (
      <View className="mb-3 mt-1 flex-row items-center gap-2 self-start rounded-xl bg-[#25252B] px-4 py-3">
        <ActivityIndicator color="#80D4FF" size="small" />
        <Text className="text-sm text-[#A4A4AB]">Buscando opciones…</Text>
      </View>
    ) : query.isError ? (
      <Pressable
        accessibilityLabel="Reintentar opciones de combinación"
        className="mb-3 mt-1 self-start rounded-xl bg-[#25252B] px-4 py-3 active:opacity-70"
        onPress={() => void query.refetch()}>
        <Text className="text-sm font-semibold text-[#80D4FF]">Reintentar opciones</Text>
      </Pressable>
    ) : null;
  }

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
    setPendingLineName(null);
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

function ArrivalCard({ arrival, now }: { arrival: BusArrival; now: number }) {
  const visualMinutes = getVisualRemainingMinutes(arrival, now);
  const clockTime = getArrivalClockTime(visualMinutes, now);
  const reliable = arrival.status !== 'EXPIRED';
  return (
    <View className="mb-3 rounded-2xl bg-[#1E1E24] p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View>
          <Text className="text-sm text-[#A4A4AB]">
            Coche {arrival.vehicleUnit ?? 'Sin identificar'}
          </Text>
          <Text className="mt-1 text-3xl font-bold text-[#E1E1E6]">
            {reliable && visualMinutes !== null
              ? formatVisualArrivalMinutes(visualMinutes)
              : 'ETA no confiable'}
          </Text>
          {reliable && clockTime ? (
            <Text className="mt-1 text-sm text-[#A4A4AB]">Llegada aprox. {clockTime}</Text>
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
  location,
  onClose,
  stop,
  visible,
}: {
  lineCode: string;
  location?: string;
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
        location: location ?? null,
      },
    };
    mutation.mutate(request);
  }
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView
        automaticOffset
        behavior="padding"
        className="flex-1 justify-end bg-black/60">
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
            <Text className="mt-3 text-sm text-[#E5B842]">
              {getErrorMessage(mutation.error, 'No se pudo completar la consulta.')}
            </Text>
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

type StepProps<T> = { onBack: () => void; onSelect: (item: T) => void };
