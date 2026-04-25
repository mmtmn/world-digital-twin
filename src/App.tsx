import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, {
  type GeoJSONSource,
  type LngLatBoundsLike,
  type Map as MapLibreMap,
  type MapGeoJSONFeature
} from 'maplibre-gl';
import {
  Building2,
  Camera,
  Check,
  Compass,
  ExternalLink,
  Globe2,
  Image,
  Layers,
  LocateFixed,
  Map as MapIcon,
  Plane,
  RefreshCw,
  RotateCcw,
  Satellite,
  Search,
  X
} from 'lucide-react';
import type { FeatureCollection, Point } from 'geojson';
import {
  AIRCRAFT_API_TEMPLATE,
  AIRCRAFT_LIVE_MAP_URL,
  CAMERA_GEOJSON_URL,
  EARTH_IMAGERY_TILES,
  MAP_STYLE_URL,
  NOMINATIM_EMAIL,
  NOMINATIM_ENDPOINT,
  OVERPASS_ENDPOINT,
  SATELLITE_TLE_URL
} from './config';
import { CameraDrawer } from './components/CameraDrawer';
import { TrackingDrawer } from './components/TrackingDrawer';
import type { CameraFeatureCollection, CameraProperties, NominatimResult } from './types';
import { aircraftApiUrl, emptyAircraftCollection, normalizeAircraft, type AircraftProperties } from './utils/aircraft';
import { cameraBounds, emptyCameraCollection, normalizeCameraCollection } from './utils/cameras';
import { buildWebcamQuery, normalizeOverpassWebcams } from './utils/overpass';
import {
  emptySatelliteCollection,
  loadSatelliteCatalog,
  propagateSatellites,
  type SatelliteProperties,
  type TrackedSatellite
} from './utils/satellites';

const CAMERA_SOURCE_ID = 'open-cameras';
const CAMERA_DOT_LAYER_ID = 'open-cameras-dot';
const CAMERA_HIT_LAYER_ID = 'open-cameras-hit';
const SATELLITE_SOURCE_ID = 'live-satellites';
const SATELLITE_DOT_LAYER_ID = 'live-satellites-dot';
const SATELLITE_HIT_LAYER_ID = 'live-satellites-hit';
const AIRCRAFT_SOURCE_ID = 'live-aircraft';
const AIRCRAFT_DOT_LAYER_ID = 'live-aircraft-dot';
const AIRCRAFT_HIT_LAYER_ID = 'live-aircraft-hit';
const EARTH_IMAGERY_SOURCE_ID = 'earth-imagery';
const EARTH_IMAGERY_LAYER_ID = 'earth-imagery';
const BUILDING_LAYER_ID = 'building-3d';

const worldView = {
  center: [0, 18] as [number, number],
  zoom: 1.18,
  pitch: 0,
  bearing: 0
};

const dense3DView = {
  center: [-74.0066, 40.7135] as [number, number],
  zoom: 15.9,
  pitch: 62,
  bearing: -28
};

const emptySearchResults: NominatimResult[] = [];

type TrackingSelection =
  | {
      type: 'satellite';
      properties: SatelliteProperties;
    }
  | {
      type: 'aircraft';
      properties: AircraftProperties;
    };

const setSourceData = <P,>(map: MapLibreMap | null, sourceId: string, data: FeatureCollection<Point, P>) => {
  if (!map || !map.getSource(sourceId)) return;
  (map.getSource(sourceId) as GeoJSONSource).setData(data as never);
};

const mergeCameraCollections = (
  current: CameraFeatureCollection,
  incoming: CameraFeatureCollection
): CameraFeatureCollection => {
  const byId = new globalThis.Map<string, CameraFeatureCollection['features'][number]>();

  for (const feature of current.features) byId.set(feature.properties.id, feature);
  for (const feature of incoming.features) byId.set(feature.properties.id, feature);

  return {
    type: 'FeatureCollection',
    features: [...byId.values()]
  };
};

export function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const satelliteCatalogRef = useRef<TrackedSatellite[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [status, setStatus] = useState('Loading planet tiles');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>(emptySearchResults);
  const [searchBusy, setSearchBusy] = useState(false);
  const [webcamBusy, setWebcamBusy] = useState(false);
  const [cameras, setCameras] = useState<CameraFeatureCollection>(emptyCameraCollection);
  const [selectedCamera, setSelectedCamera] = useState<CameraProperties | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<TrackingSelection | null>(null);
  const [showCameras, setShowCameras] = useState(true);
  const [showBuildings, setShowBuildings] = useState(true);
  const [showImagery, setShowImagery] = useState(true);
  const [showSatellites, setShowSatellites] = useState(true);
  const [showAircraft, setShowAircraft] = useState(false);
  const [aircraftPanelOpen, setAircraftPanelOpen] = useState(false);
  const [mapMode, setMapMode] = useState<'globe' | 'mercator'>('globe');
  const [satelliteCount, setSatelliteCount] = useState(0);
  const [aircraftCount, setAircraftCount] = useState(0);

  const cameraCount = cameras.features.length;

  const setLayerVisibility = useCallback((layerId: string, visible: boolean) => {
    const map = mapRef.current;
    if (!map || !map.getLayer(layerId)) return;
    map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
  }, []);

  const syncCameraSource = useCallback((collection: CameraFeatureCollection) => {
    setSourceData(mapRef.current, CAMERA_SOURCE_ID, collection);
  }, []);

  const syncSatelliteSource = useCallback((collection = emptySatelliteCollection()) => {
    setSourceData(mapRef.current, SATELLITE_SOURCE_ID, collection);
  }, []);

  const syncAircraftSource = useCallback((collection = emptyAircraftCollection()) => {
    setSourceData(mapRef.current, AIRCRAFT_SOURCE_ID, collection);
  }, []);

  const addEarthPresentation = useCallback((map: MapLibreMap) => {
    map.setSky({
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 0.9, 7, 0.15],
      'sky-color': '#07111f',
      'horizon-color': '#7db6ff',
      'horizon-fog-blend': 0.08,
      'fog-color': '#d7ecff'
    });

    if (!map.getSource(EARTH_IMAGERY_SOURCE_ID)) {
      map.addSource(EARTH_IMAGERY_SOURCE_ID, {
        type: 'raster',
        tiles: [EARTH_IMAGERY_TILES],
        tileSize: 256,
        maxzoom: 13,
        attribution: 'EOX Sentinel-2 cloudless'
      });
    }

    if (!map.getLayer(EARTH_IMAGERY_LAYER_ID)) {
      const beforeId = map
        .getStyle()
        .layers?.find((layer) => {
          const sourceLayer = (layer as { 'source-layer'?: string })['source-layer'];
          return sourceLayer === 'transportation' || layer.id.startsWith('road') || layer.id.startsWith('tunnel');
        })?.id;

      map.addLayer(
        {
          id: EARTH_IMAGERY_LAYER_ID,
          type: 'raster',
          source: EARTH_IMAGERY_SOURCE_ID,
          paint: {
            'raster-opacity': 0.92,
            'raster-saturation': 0.08,
            'raster-contrast': 0.08
          }
        },
        beforeId
      );
    }
  }, []);

  const tuneBuildingLayer = useCallback((map: MapLibreMap) => {
    const heightExpression = [
      'case',
      ['has', 'render_height'],
      ['to-number', ['get', 'render_height'], 10],
      ['has', 'height'],
      ['to-number', ['get', 'height'], 10],
      ['has', 'building:levels'],
      ['*', ['to-number', ['get', 'building:levels'], 3], 3],
      10
    ];
    const baseExpression = [
      'case',
      ['has', 'render_min_height'],
      ['to-number', ['get', 'render_min_height'], 0],
      ['has', 'min_height'],
      ['to-number', ['get', 'min_height'], 0],
      0
    ];

    if (!map.getLayer(BUILDING_LAYER_ID) && map.getSource('openmaptiles')) {
      const beforeId = map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id;
      map.addLayer(
        {
          id: BUILDING_LAYER_ID,
          type: 'fill-extrusion',
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: 13,
          paint: {
            'fill-extrusion-base': baseExpression as never,
            'fill-extrusion-color': '#ded2c0',
            'fill-extrusion-height': heightExpression as never,
            'fill-extrusion-opacity': 0.84
          }
        },
        beforeId
      );
    }

    if (!map.getLayer(BUILDING_LAYER_ID)) return;

    map.setLayerZoomRange(BUILDING_LAYER_ID, 13, 24);
    map.setPaintProperty(BUILDING_LAYER_ID, 'fill-extrusion-base', baseExpression);
    map.setPaintProperty(BUILDING_LAYER_ID, 'fill-extrusion-height', heightExpression);
    map.setPaintProperty(BUILDING_LAYER_ID, 'fill-extrusion-color', [
      'interpolate',
      ['linear'],
      ['zoom'],
      13,
      '#c9c4b8',
      16,
      '#e2d5c2'
    ]);
  }, []);

  const addCameraLayers = useCallback((map: MapLibreMap) => {
    if (!map.getSource(CAMERA_SOURCE_ID)) {
      map.addSource(CAMERA_SOURCE_ID, {
        type: 'geojson',
        data: emptyCameraCollection()
      });
    }

    if (!map.getLayer(CAMERA_DOT_LAYER_ID)) {
      map.addLayer({
        id: CAMERA_DOT_LAYER_ID,
        type: 'circle',
        source: CAMERA_SOURCE_ID,
        paint: {
          'circle-color': '#e11d48',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 4, 8, 5, 14, 7],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-opacity': 0.94
        }
      });
    }

    if (!map.getLayer(CAMERA_HIT_LAYER_ID)) {
      map.addLayer({
        id: CAMERA_HIT_LAYER_ID,
        type: 'circle',
        source: CAMERA_SOURCE_ID,
        paint: {
          'circle-color': '#e11d48',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 15, 8, 18, 14, 24],
          'circle-opacity': 0
        }
      });
    }
  }, []);

  const addTrackingLayers = useCallback((map: MapLibreMap) => {
    if (!map.getSource(SATELLITE_SOURCE_ID)) {
      map.addSource(SATELLITE_SOURCE_ID, {
        type: 'geojson',
        data: emptySatelliteCollection()
      });
    }

    if (!map.getLayer(SATELLITE_DOT_LAYER_ID)) {
      map.addLayer({
        id: SATELLITE_DOT_LAYER_ID,
        type: 'circle',
        source: SATELLITE_SOURCE_ID,
        paint: {
          'circle-color': '#f59e0b',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 1.6, 4, 2.6, 8, 4.5],
          'circle-stroke-color': '#fff7ed',
          'circle-stroke-width': 0.75,
          'circle-opacity': 0.88
        }
      });
    }

    if (!map.getLayer(SATELLITE_HIT_LAYER_ID)) {
      map.addLayer({
        id: SATELLITE_HIT_LAYER_ID,
        type: 'circle',
        source: SATELLITE_SOURCE_ID,
        paint: {
          'circle-color': '#f59e0b',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 9, 4, 12, 8, 18],
          'circle-opacity': 0
        }
      });
    }

    if (!map.getSource(AIRCRAFT_SOURCE_ID)) {
      map.addSource(AIRCRAFT_SOURCE_ID, {
        type: 'geojson',
        data: emptyAircraftCollection()
      });
    }

    if (!map.getLayer(AIRCRAFT_DOT_LAYER_ID)) {
      map.addLayer({
        id: AIRCRAFT_DOT_LAYER_ID,
        type: 'circle',
        source: AIRCRAFT_SOURCE_ID,
        paint: {
          'circle-color': '#0284c7',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 3, 6, 5, 10, 7],
          'circle-stroke-color': '#e0f2fe',
          'circle-stroke-width': 1.5,
          'circle-opacity': 0.9
        }
      });
    }

    if (!map.getLayer(AIRCRAFT_HIT_LAYER_ID)) {
      map.addLayer({
        id: AIRCRAFT_HIT_LAYER_ID,
        type: 'circle',
        source: AIRCRAFT_SOURCE_ID,
        paint: {
          'circle-color': '#0284c7',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 13, 6, 17, 10, 22],
          'circle-opacity': 0
        }
      });
    }
  }, []);

  const applyBuildingVisibility = useCallback(
    (visible: boolean) => {
      setLayerVisibility(BUILDING_LAYER_ID, visible);
      const map = mapRef.current;
      if (map?.getLayer(BUILDING_LAYER_ID)) {
        map.setPaintProperty(BUILDING_LAYER_ID, 'fill-extrusion-opacity', visible ? 0.86 : 0);
      }
    },
    [setLayerVisibility]
  );

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE_URL,
      center: worldView.center,
      zoom: worldView.zoom,
      pitch: worldView.pitch,
      bearing: worldView.bearing,
      attributionControl: false,
      cooperativeGestures: true
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.GlobeControl(), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    const hydrateStyle = () => {
      map.setProjection({ type: 'globe' });
      addEarthPresentation(map);
      tuneBuildingLayer(map);
      addCameraLayers(map);
      addTrackingLayers(map);
    };

    map.on('style.load', hydrateStyle);

    map.on('load', () => {
      setMapReady(true);
      setStatus('World twin online');
      hydrateStyle();
    });

    map.on('click', CAMERA_HIT_LAYER_ID, (event) => {
      const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
      if (!feature?.properties) return;
      setSelectedCamera(feature.properties as CameraProperties);
      setSelectedTrack(null);
    });

    map.on('click', SATELLITE_HIT_LAYER_ID, (event) => {
      const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
      if (!feature?.properties) return;
      setSelectedTrack({ type: 'satellite', properties: feature.properties as SatelliteProperties });
      setSelectedCamera(null);
    });

    map.on('click', AIRCRAFT_HIT_LAYER_ID, (event) => {
      const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
      if (!feature?.properties) return;
      setSelectedTrack({ type: 'aircraft', properties: feature.properties as AircraftProperties });
      setSelectedCamera(null);
    });

    const usePointer = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const clearPointer = () => {
      map.getCanvas().style.cursor = '';
    };

    for (const layerId of [CAMERA_HIT_LAYER_ID, SATELLITE_HIT_LAYER_ID, AIRCRAFT_HIT_LAYER_ID]) {
      map.on('mouseenter', layerId, usePointer);
      map.on('mouseleave', layerId, clearPointer);
    }

    map.on('error', (event) => {
      const message = event.error?.message || 'Map error';
      setStatus(message);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [addCameraLayers, addEarthPresentation, addTrackingLayers, tuneBuildingLayer]);

  useEffect(() => {
    const controller = new AbortController();

    const loadCameras = async () => {
      try {
        const response = await fetch(CAMERA_GEOJSON_URL, {
          cache: 'no-store',
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`Camera feed returned ${response.status}`);
        const collection = normalizeCameraCollection(await response.json());
        setCameras(collection);
        syncCameraSource(collection);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setStatus('Camera feed unavailable');
      }
    };

    loadCameras();
    return () => controller.abort();
  }, [syncCameraSource]);

  useEffect(() => {
    if (!mapReady) return;
    syncCameraSource(cameras);
  }, [cameras, mapReady, syncCameraSource]);

  useEffect(() => {
    if (!mapReady) return;
    setLayerVisibility(CAMERA_DOT_LAYER_ID, showCameras);
    setLayerVisibility(CAMERA_HIT_LAYER_ID, showCameras);
  }, [mapReady, setLayerVisibility, showCameras]);

  useEffect(() => {
    if (!mapReady) return;
    setLayerVisibility(EARTH_IMAGERY_LAYER_ID, showImagery);
  }, [mapReady, setLayerVisibility, showImagery]);

  useEffect(() => {
    if (!mapReady) return;
    applyBuildingVisibility(showBuildings);
  }, [applyBuildingVisibility, mapReady, showBuildings]);

  useEffect(() => {
    if (!mapReady) return;
    setLayerVisibility(SATELLITE_DOT_LAYER_ID, showSatellites);
    setLayerVisibility(SATELLITE_HIT_LAYER_ID, showSatellites);
  }, [mapReady, setLayerVisibility, showSatellites]);

  useEffect(() => {
    if (!mapReady) return;
    setLayerVisibility(AIRCRAFT_DOT_LAYER_ID, showAircraft && Boolean(AIRCRAFT_API_TEMPLATE));
    setLayerVisibility(AIRCRAFT_HIT_LAYER_ID, showAircraft && Boolean(AIRCRAFT_API_TEMPLATE));
  }, [mapReady, setLayerVisibility, showAircraft]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    map.setProjection({ type: mapMode });
  }, [mapMode, mapReady]);

  useEffect(() => {
    if (!mapReady || !showSatellites) return;

    const controller = new AbortController();
    let interval = 0;

    const updateSatellites = async () => {
      try {
        if (satelliteCatalogRef.current.length === 0) {
          setStatus('Loading active satellite catalog');
          satelliteCatalogRef.current = await loadSatelliteCatalog(SATELLITE_TLE_URL, controller.signal);
        }

        const collection = propagateSatellites(satelliteCatalogRef.current);
        syncSatelliteSource(collection);
        setSatelliteCount(collection.features.length);
        setStatus(`Tracking ${collection.features.length.toLocaleString()} satellites`);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setStatus('Satellite catalog unavailable');
      }
    };

    updateSatellites();
    interval = window.setInterval(updateSatellites, 30000);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [mapReady, showSatellites, syncSatelliteSource]);

  useEffect(() => {
    if (!mapReady || !showAircraft || !AIRCRAFT_API_TEMPLATE) return;

    const controller = new AbortController();
    let interval = 0;

    const updateAircraft = async () => {
      const map = mapRef.current;
      if (!map) return;

      try {
        const center = map.getCenter();
        const url = aircraftApiUrl(AIRCRAFT_API_TEMPLATE, center.lat, center.lng, 250);
        const response = await fetch(url, {
          cache: 'no-store',
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`Aircraft API returned ${response.status}`);
        const collection = normalizeAircraft(await response.json());
        syncAircraftSource(collection);
        setAircraftCount(collection.features.length);
        setStatus(`Tracking ${collection.features.length.toLocaleString()} aircraft near map center`);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setStatus('Aircraft API blocked; use the ADS-B live panel');
        setAircraftPanelOpen(true);
      }
    };

    updateAircraft();
    interval = window.setInterval(updateAircraft, 30000);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [mapReady, showAircraft, syncAircraftSource]);

  const flyToWorld = () => {
    setMapMode('globe');
    mapRef.current?.easeTo({
      ...worldView,
      duration: 1200
    });
  };

  const focus3D = () => {
    setShowBuildings(true);
    const map = mapRef.current;
    if (!map) return;

    const nextView = map.getZoom() < 12 ? dense3DView : { pitch: 62, bearing: map.getBearing() - 18 };
    map.easeTo({
      ...nextView,
      duration: 1100
    });
  };

  const focusStreets = () => {
    const map = mapRef.current;
    if (!map) return;
    const zoom = map.getZoom() < 13 ? 14.6 : map.getZoom();
    map.easeTo({
      zoom,
      pitch: 0,
      bearing: 0,
      duration: 950
    });
  };

  const focusCameras = () => {
    const bounds = cameraBounds(cameras);
    if (!bounds) {
      setStatus('No public camera feeds loaded');
      return;
    }

    setShowCameras(true);
    mapRef.current?.fitBounds(bounds, {
      padding: 120,
      duration: 1200,
      maxZoom: 9
    });
  };

  const toggleAircraft = () => {
    const next = !showAircraft;
    setShowAircraft(next);
    setAircraftPanelOpen(next);
    if (next && !AIRCRAFT_API_TEMPLATE) {
      setStatus('Opening ADS-B live panel; direct aircraft layer needs a CORS-capable API endpoint');
    }
  };

  const locateUser = () => {
    if (!navigator.geolocation) {
      setStatus('Geolocation unavailable');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapRef.current?.easeTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: 15,
          pitch: 50,
          duration: 1100
        });
      },
      () => setStatus('Location permission denied'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const loadOsmWebcams = async () => {
    const map = mapRef.current;
    if (!map) return;

    if (map.getZoom() < 7) {
      setStatus('Zoom closer before loading OSM webcam URLs');
      return;
    }

    const bounds = map.getBounds();
    const south = bounds.getSouth();
    const west = bounds.getWest();
    const north = bounds.getNorth();
    const east = bounds.getEast();
    const query = buildWebcamQuery(south, west, north, east);
    const url = `${OVERPASS_ENDPOINT}?data=${encodeURIComponent(query)}`;

    setWebcamBusy(true);
    setStatus('Loading OSM webcam URLs in view');

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json'
        }
      });
      if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
      const incoming = normalizeOverpassWebcams(await response.json());
      setCameras((current) => mergeCameraCollections(current, incoming));
      setStatus(`Added ${incoming.features.length.toLocaleString()} OSM webcam marker(s)`);
    } catch {
      setStatus('OSM webcam query unavailable');
    } finally {
      setWebcamBusy(false);
    }
  };

  const searchUrl = useMemo(() => {
    const params = new URLSearchParams({
      q: searchQuery.trim(),
      format: 'jsonv2',
      addressdetails: '1',
      limit: '8'
    });

    if (NOMINATIM_EMAIL) params.set('email', NOMINATIM_EMAIL);
    return `${NOMINATIM_ENDPOINT}?${params.toString()}`;
  }, [searchQuery]);

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchBusy(true);
    setStatus('Searching OpenStreetMap');

    try {
      const response = await fetch(searchUrl, {
        headers: {
          Accept: 'application/json'
        }
      });

      if (!response.ok) throw new Error(`Search returned ${response.status}`);
      const results = (await response.json()) as NominatimResult[];
      setSearchResults(results);
      setStatus(results.length ? `${results.length} places found` : 'No places found');
    } catch {
      setStatus('Search unavailable');
    } finally {
      setSearchBusy(false);
    }
  };

  const selectSearchResult = (result: NominatimResult) => {
    setSearchResults(emptySearchResults);
    setSearchQuery(result.display_name);

    const map = mapRef.current;
    if (!map) return;

    if (result.boundingbox) {
      const [south, north, west, east] = result.boundingbox.map(Number);
      const bounds: LngLatBoundsLike = [
        [west, south],
        [east, north]
      ];
      map.fitBounds(bounds, {
        padding: 96,
        duration: 1000,
        maxZoom: 16
      });
      return;
    }

    map.easeTo({
      center: [Number(result.lon), Number(result.lat)],
      zoom: 14,
      duration: 1000
    });
  };

  return (
    <main className="app-shell">
      <div ref={mapContainerRef} className="map-canvas" aria-label="World digital twin map" />

      <header className="topbar">
        <section className="search-panel" aria-label="Place search">
          <div className="brand-mark" aria-hidden="true">
            <Globe2 size={22} />
          </div>
          <form className="search-form" onSubmit={handleSearch}>
            <label htmlFor="place-search" className="sr-only">
              Search country, city, street, or address
            </label>
            <Search size={17} aria-hidden="true" />
            <input
              id="place-search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search country, city, street, or address"
              autoComplete="off"
            />
            {searchQuery ? (
              <button
                className="plain-icon"
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults(emptySearchResults);
                }}
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            ) : null}
            <button className="search-submit" type="submit" disabled={searchBusy}>
              {searchBusy ? 'Searching' : 'Go'}
            </button>
          </form>

          {searchResults.length ? (
            <div className="search-results">
              {searchResults.map((result) => (
                <button key={result.place_id} type="button" onClick={() => selectSearchResult(result)}>
                  <span>{result.display_name}</span>
                  <small>{[result.class, result.type].filter(Boolean).join(' / ')}</small>
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <nav className="quick-tools" aria-label="Map tools">
          <button type="button" onClick={flyToWorld} title="World view" aria-label="World view">
            <Globe2 size={18} />
          </button>
          <button
            type="button"
            onClick={() => setShowImagery((value) => !value)}
            title="Satellite imagery"
            aria-label="Satellite imagery"
          >
            <Image size={18} />
          </button>
          <button type="button" onClick={focusStreets} title="Street view" aria-label="Street view">
            <MapIcon size={18} />
          </button>
          <button type="button" onClick={focus3D} title="3D buildings" aria-label="3D buildings">
            <Building2 size={18} />
          </button>
          <button type="button" onClick={focusCameras} title="Public cameras" aria-label="Public cameras">
            <Camera size={18} />
          </button>
          <button type="button" onClick={() => setShowSatellites((value) => !value)} title="Satellites" aria-label="Satellites">
            <Satellite size={18} />
          </button>
          <button type="button" onClick={toggleAircraft} title="Aircraft" aria-label="Aircraft">
            <Plane size={18} />
          </button>
          <button type="button" onClick={locateUser} title="My location" aria-label="My location">
            <LocateFixed size={18} />
          </button>
        </nav>
      </header>

      <section className="status-panel" aria-label="World twin status">
        <div className="panel-heading">
          <h1>World Digital Twin</h1>
          <span>{status}</span>
        </div>

        <div className="metric-grid expanded">
          <div>
            <strong>Planet</strong>
            <span>Sentinel + OSM</span>
          </div>
          <div>
            <strong>3D</strong>
            <span>OSM buildings</span>
          </div>
          <div>
            <strong>{cameraCount}</strong>
            <span>Camera feeds</span>
          </div>
          <div>
            <strong>{satelliteCount || 'TLE'}</strong>
            <span>Satellites</span>
          </div>
          <div>
            <strong>{AIRCRAFT_API_TEMPLATE ? aircraftCount : 'ADS-B'}</strong>
            <span>Aircraft</span>
          </div>
          <div>
            <strong>Globe</strong>
            <span>Atmosphere</span>
          </div>
        </div>

        <div className="toggle-stack">
          <button
            type="button"
            className={showImagery ? 'toggle-row active' : 'toggle-row'}
            onClick={() => setShowImagery((value) => !value)}
          >
            <Image size={18} />
            <span>Satellite imagery</span>
            {showImagery ? <Check size={16} /> : null}
          </button>
          <button
            type="button"
            className={showBuildings ? 'toggle-row active' : 'toggle-row'}
            onClick={() => setShowBuildings((value) => !value)}
          >
            <Building2 size={18} />
            <span>3D buildings</span>
            {showBuildings ? <Check size={16} /> : null}
          </button>
          <button
            type="button"
            className={showCameras ? 'toggle-row active' : 'toggle-row'}
            onClick={() => setShowCameras((value) => !value)}
          >
            <Camera size={18} />
            <span>Open cameras</span>
            {showCameras ? <Check size={16} /> : null}
          </button>
          <button
            type="button"
            className={showSatellites ? 'toggle-row active' : 'toggle-row'}
            onClick={() => setShowSatellites((value) => !value)}
          >
            <Satellite size={18} />
            <span>Satellites</span>
            {showSatellites ? <Check size={16} /> : null}
          </button>
          <button type="button" className={showAircraft ? 'toggle-row active' : 'toggle-row'} onClick={toggleAircraft}>
            <Plane size={18} />
            <span>Aircraft</span>
            {showAircraft ? <Check size={16} /> : null}
          </button>
          <button
            type="button"
            className={mapMode === 'globe' ? 'toggle-row active' : 'toggle-row'}
            onClick={() => setMapMode((value) => (value === 'globe' ? 'mercator' : 'globe'))}
          >
            <Compass size={18} />
            <span>{mapMode === 'globe' ? 'Globe mode' : 'Flat mode'}</span>
            {mapMode === 'globe' ? <Check size={16} /> : null}
          </button>
        </div>

        <button className="secondary-action" type="button" onClick={loadOsmWebcams} disabled={webcamBusy}>
          <RefreshCw size={16} />
          {webcamBusy ? 'Loading webcams' : 'Load OSM webcams in view'}
        </button>
      </section>

      <section className="source-strip" aria-label="Data sources">
        <span>
          <Layers size={15} aria-hidden="true" />
          OpenFreeMap
        </span>
        <span>EOX Sentinel-2</span>
        <span>OpenStreetMap</span>
        <span>CelesTrak</span>
        <span>Overpass</span>
        <span>ADSB.fi</span>
      </section>

      <button className="reset-button" type="button" onClick={flyToWorld} aria-label="Reset map">
        <RotateCcw size={18} />
      </button>

      {aircraftPanelOpen ? (
        <aside className="aircraft-panel" aria-label="Live aircraft tracker">
          <div className="drawer-header">
            <div className="drawer-title">
              <span className="drawer-icon aircraft-icon" aria-hidden="true">
                <Plane size={18} />
              </span>
              <div>
                <h2>Live Aircraft</h2>
                <p>ADSB.fi open traffic map</p>
              </div>
            </div>
            <button className="icon-button" type="button" onClick={() => setAircraftPanelOpen(false)} aria-label="Close aircraft panel">
              <X size={18} />
            </button>
          </div>
          <iframe
            className="aircraft-frame"
            src={AIRCRAFT_LIVE_MAP_URL}
            title="ADSB.fi live aircraft tracker"
            referrerPolicy="strict-origin-when-cross-origin"
          />
          <a className="external-link" href={AIRCRAFT_LIVE_MAP_URL} target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            Open aircraft map
          </a>
        </aside>
      ) : null}

      <CameraDrawer camera={selectedCamera} onClose={() => setSelectedCamera(null)} />
      <TrackingDrawer selection={selectedTrack} onClose={() => setSelectedTrack(null)} />
    </main>
  );
}
