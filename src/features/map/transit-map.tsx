import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import {
  Camera,
  GeoJSONSource,
  Images,
  Layer,
  type LngLat,
  Map,
  type InitialViewState,
} from '@maplibre/maplibre-react-native';
import { useQuery } from '@tanstack/react-query';

import {
  getMapDirections,
  getMapLines,
  getMapRoutes,
  getMapStop,
  getMapStops,
} from '@/src/features/map/api';
import { MAP_IMAGES } from '@/src/features/transit/arrival-map-modal';
import { MapControls } from '@/src/features/map/map-controls';
import { StopSheet } from '@/src/features/map/stop-sheet';
import {
  createRouteArrows as createSharedRouteArrows,
  filterArrowsByStopProximity,
  routeMatchesDirection,
} from '@/src/features/map/geo';
import { OSM_STYLE } from '@/src/features/map/map-style';
import { queryKeys } from '@/src/lib/query-client';
import type { MapLine, MapRoute, MapStop } from '@/src/types/api';

const INITIAL_CAMERA: InitialViewState = { center: [-57.5426, -38.0055], zoom: 12 };
const CATALOG_OPTIONS = { staleTime: 5 * 60_000, gcTime: 30 * 60_000, retry: 1 } as const;

export function TransitMap() {
  const [line, setLine] = useState<MapLine | null>(null);
  const [direction, setDirection] = useState<string | null>(null);
  const [stop, setStop] = useState<MapStop | null>(null);
  const linesQuery = useQuery({
    queryKey: queryKeys.map.lines(),
    queryFn: ({ signal }) => getMapLines(signal),
    ...CATALOG_OPTIONS,
  });
  const directionsQuery = useQuery({
    queryKey: queryKeys.map.directions(line?.name ?? ''),
    queryFn: ({ signal }) => getMapDirections(line!.name, signal),
    enabled: !!line,
    ...CATALOG_OPTIONS,
  });
  const stopsQuery = useQuery({
    queryKey: queryKeys.map.stops(line?.name ?? '', direction ?? ''),
    queryFn: ({ signal }) => getMapStops(line!.name, direction!, signal),
    enabled: !!line && !!direction,
    ...CATALOG_OPTIONS,
  });
  const routesQuery = useQuery({
    queryKey: queryKeys.map.routes(line?.name ?? ''),
    queryFn: ({ signal }) => getMapRoutes(line!.name, signal),
    // Do not fetch routes until the user has also chosen a direction; the data
    // is filtered client-side by direction anyway, so an early request only
    // wastes bandwidth and triggers a spurious render cycle.
    enabled: !!line && !!direction,
    ...CATALOG_OPTIONS,
  });
  const stopQuery = useQuery({
    queryKey: queryKeys.map.stop(stop?.identifier ?? ''),
    queryFn: ({ signal }) => getMapStop(stop!.identifier, signal),
    enabled: !!stop,
    ...CATALOG_OPTIONS,
  });
  const markers = useMemo(
    () =>
      (stopsQuery.data ?? []).filter((item) => item.latitude !== null && item.longitude !== null),
    [stopsQuery.data]
  );
  const markersByIdentifier = useMemo(
    () => new globalThis.Map(markers.map((marker) => [marker.identifier, marker])),
    [markers]
  );
  const preparedRoutes = useMemo(
    () =>
      (routesQuery.data ?? [])
        .map((route) => prepareRoute(route))
        .filter((route): route is PreparedRoute => route !== null),
    [routesQuery.data]
  );
  const routeLines = useMemo(
    () =>
      preparedRoutes
        .filter(({ route }) => routeMatchesDirection(route, direction))
        .map(({ arrows, id, line }) => ({
          arrows: filterArrowsByStopProximity(
            arrows,
            markers,
            ROUTE_ARROW_MINIMUM_STOP_DISTANCE_METERS
          ),
          id,
          line,
        })),
    [direction, markers, preparedRoutes]
  );
  const stopFeatures = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: markers.map((item) => ({
        type: 'Feature',
        properties: { identifier: item.identifier },
        geometry: { type: 'Point', coordinates: [item.longitude!, item.latitude!] },
      })),
    }),
    [markers]
  );
  const arrowFeatures = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: routeLines.flatMap(({ id, arrows }) =>
        arrows.map((arrow) => ({
          type: 'Feature',
          properties: { bearing: arrow.bearing - 90, id },
          geometry: { type: 'Point', coordinates: arrow.lngLat },
        }))
      ),
    }),
    [routeLines]
  );
  const retryFailedQueries = () => {
    const retries: Promise<unknown>[] = [];
    if (linesQuery.isError) retries.push(linesQuery.refetch());
    if (directionsQuery.isError) retries.push(directionsQuery.refetch());
    if (stopsQuery.isError) retries.push(stopsQuery.refetch());
    if (routesQuery.isError) retries.push(routesQuery.refetch());
    void Promise.all(retries);
  };

  return (
    <View className="flex-1 bg-[#121212]">
      <Map
        androidView="texture"
        attribution={false}
        logo={false}
        mapStyle={OSM_STYLE}
        style={{ flex: 1 }}>
        <Camera initialViewState={INITIAL_CAMERA} maxZoom={19} minZoom={1} />
        <Images images={MAP_IMAGES} />
        {routeLines.map(({ id, line }) => (
          <GeoJSONSource data={line} id={`transit-route-${id}`} key={id}>
            <Layer
              id={`transit-route-line-${id}`}
              paint={{ 'line-color': '#1976A8', 'line-opacity': 0.9, 'line-width': 4 }}
              source={`transit-route-${id}`}
              type="line"
            />
          </GeoJSONSource>
        ))}
        <GeoJSONSource data={arrowFeatures} id="transit-route-arrows" key="transit-route-arrows-v2">
          <Layer
            id="transit-route-arrow-symbols"
            layout={{
              'icon-allow-overlap': true,
              'icon-image': 'route-arrow-icon',
              'icon-ignore-placement': true,
              'icon-rotate': ['get', 'bearing'],
              'icon-rotation-alignment': 'map',
              'icon-size': 0.5,
            }}
            type="symbol"
          />
        </GeoJSONSource>
        <GeoJSONSource
          data={stopFeatures}
          hitbox={{ bottom: 18, left: 18, right: 18, top: 18 }}
          id="transit-stops"
          onPress={(event) => {
            const identifier = event.nativeEvent.features[0]?.properties?.identifier;
            const selected =
              typeof identifier === 'string' ? markersByIdentifier.get(identifier) : undefined;
            if (selected) setStop(selected);
          }}>
          <Layer
            id="transit-stop-circle"
            paint={{
              'circle-color': '#1E1E24',
              'circle-radius': 14,
              'circle-stroke-color': '#80D4FF',
              'circle-stroke-width': 3,
            }}
            type="circle"
          />
          <Layer
            id="transit-stop-icon"
            layout={{
              'icon-allow-overlap': true,
              'icon-image': 'arrival-stop-icon',
              'icon-ignore-placement': true,
              'icon-size': 0.48,
            }}
            type="symbol"
          />
        </GeoJSONSource>
      </Map>
      <MapControls
        direction={direction}
        directionsQuery={directionsQuery}
        line={line}
        linesQuery={linesQuery}
        onDirectionChange={(value) => {
          setDirection(value);
          setStop(null);
        }}
        onLineChange={(value) => {
          setLine(value);
          setDirection(null);
          setStop(null);
        }}
        onRetry={retryFailedQueries}
        showError={
          linesQuery.isError || directionsQuery.isError || stopsQuery.isError || routesQuery.isError
        }
      />
      <Text className="absolute bottom-3 left-4 text-xs text-[#A4A4AB]">
        © OpenStreetMap contributors
      </Text>
      {stop ? (
        <StopSheet
          key={stop.identifier}
          detail={stopQuery.data}
          isError={stopQuery.isError}
          isLoading={stopQuery.isPending}
          onClose={() => setStop(null)}
          onRetry={() => void stopQuery.refetch()}
        />
      ) : null}
    </View>
  );
}

type RouteLine = {
  type: 'Feature';
  properties: Record<string, never>;
  geometry: { type: 'LineString'; coordinates: LngLat[] };
};

type RouteArrow = { lngLat: LngLat; bearing: number };
type RenderedRoute = { id: string; line: RouteLine; arrows: RouteArrow[] };
type PreparedRoute = RenderedRoute & { route: MapRoute };

const ROUTE_ARROW_SPACING_METERS = 400;
const ROUTE_ARROW_MINIMUM_STOP_DISTANCE_METERS = 30;

// routeMatchesDirection is imported from geo.ts (shared with arrival-map-modal).

function prepareRoute(route: MapRoute): PreparedRoute | null {
  const coordinates = route.coordinates.map(
    ([longitude, latitude]) => [longitude, latitude] as LngLat
  );

  return coordinates.length > 1
    ? {
        route,
        id: route.id,
        line: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } },
        arrows: createRouteArrows(coordinates),
      }
    : null;
}

function createRouteArrows(coordinates: LngLat[]): RouteArrow[] {
  return createSharedRouteArrows(coordinates, ROUTE_ARROW_SPACING_METERS);
}
