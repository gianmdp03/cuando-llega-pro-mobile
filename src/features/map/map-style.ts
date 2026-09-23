import type { StyleSpecification } from '@maplibre/maplibre-react-native';

/**
 * Shared OpenStreetMap raster base style used across all map instances.
 * Centralised here to avoid three identical copies in transit-map, arrival-map-modal
 * and nearby-stops-screen.
 */
export const OSM_STYLE: StyleSpecification = {
  version: 8,
  name: 'OpenStreetMap',
  sources: {
    openstreetmap: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      minzoom: 1,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#121212' } },
    { id: 'openstreetmap', type: 'raster', source: 'openstreetmap' },
  ],
};
