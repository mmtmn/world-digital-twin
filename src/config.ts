export const MAP_STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';

export const CAMERA_GEOJSON_URL =
  import.meta.env.VITE_CAMERA_GEOJSON_URL || `${import.meta.env.BASE_URL}cameras.geojson`;

export const EARTH_IMAGERY_TILES =
  import.meta.env.VITE_EARTH_IMAGERY_TILES ||
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg';

export const NIGHT_LIGHTS_TILES =
  import.meta.env.VITE_NIGHT_LIGHTS_TILES ||
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png';

export const SATELLITE_TLE_URL =
  import.meta.env.VITE_SATELLITE_TLE_URL ||
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';

export const OVERPASS_ENDPOINT =
  import.meta.env.VITE_OVERPASS_ENDPOINT || 'https://overpass-api.de/api/interpreter';

export const AIRCRAFT_API_TEMPLATE =
  import.meta.env.VITE_AIRCRAFT_API_TEMPLATE ||
  (import.meta.env.DEV ? '/aircraft-api/api/v3/lat/{lat}/lon/{lon}/dist/{dist}' : '');

export const AIRCRAFT_LIVE_MAP_URL =
  import.meta.env.VITE_AIRCRAFT_LIVE_MAP_URL || 'https://globe.adsb.fi/';

export const NOMINATIM_EMAIL = import.meta.env.VITE_NOMINATIM_EMAIL || '';

export const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
