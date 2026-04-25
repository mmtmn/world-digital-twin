export const MAP_STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';

export const CAMERA_GEOJSON_URL =
  import.meta.env.VITE_CAMERA_GEOJSON_URL || `${import.meta.env.BASE_URL}cameras.geojson`;

export const NOMINATIM_EMAIL = import.meta.env.VITE_NOMINATIM_EMAIL || '';

export const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
