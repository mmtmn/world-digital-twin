import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, {
  type GeoJSONSource,
  type LngLatBoundsLike,
  type Map,
  type MapGeoJSONFeature
} from 'maplibre-gl';
import {
  Building2,
  Camera,
  Check,
  Compass,
  Globe2,
  Layers,
  LocateFixed,
  Map as MapIcon,
  RotateCcw,
  Search,
  X
} from 'lucide-react';
import { CAMERA_GEOJSON_URL, MAP_STYLE_URL, NOMINATIM_EMAIL, NOMINATIM_ENDPOINT } from './config';
import { CameraDrawer } from './components/CameraDrawer';
import type { CameraFeatureCollection, CameraProperties, NominatimResult } from './types';
import { cameraBounds, emptyCameraCollection, normalizeCameraCollection } from './utils/cameras';

const CAMERA_SOURCE_ID = 'open-cameras';
const CAMERA_DOT_LAYER_ID = 'open-cameras-dot';
const CAMERA_HIT_LAYER_ID = 'open-cameras-hit';
const BUILDING_LAYER_ID = 'building-3d';

const worldView = {
  center: [0, 18] as [number, number],
  zoom: 1.35,
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

export function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [status, setStatus] = useState('Loading planet tiles');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>(emptySearchResults);
  const [searchBusy, setSearchBusy] = useState(false);
  const [cameras, setCameras] = useState<CameraFeatureCollection>(emptyCameraCollection);
  const [selectedCamera, setSelectedCamera] = useState<CameraProperties | null>(null);
  const [showCameras, setShowCameras] = useState(true);
  const [showBuildings, setShowBuildings] = useState(true);
  const [mapMode, setMapMode] = useState<'globe' | 'mercator'>('globe');

  const cameraCount = cameras.features.length;

  const setLayerVisibility = useCallback((layerId: string, visible: boolean) => {
    const map = mapRef.current;
    if (!map || !map.getLayer(layerId)) return;
    map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
  }, []);

  const syncCameraSource = useCallback((collection: CameraFeatureCollection) => {
    const map = mapRef.current;
    if (!map || !map.getSource(CAMERA_SOURCE_ID)) return;
    (map.getSource(CAMERA_SOURCE_ID) as GeoJSONSource).setData(collection);
  }, []);

  const addCameraLayers = useCallback(
    (map: Map) => {
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
            'circle-opacity': 0.92
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

    },
    []
  );

  const applyBuildingVisibility = useCallback(
    (visible: boolean) => {
      setLayerVisibility(BUILDING_LAYER_ID, visible);
      const map = mapRef.current;
      if (map?.getLayer(BUILDING_LAYER_ID)) {
        map.setPaintProperty(BUILDING_LAYER_ID, 'fill-extrusion-opacity', visible ? 0.84 : 0);
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

    const handleStyleReady = () => {
      map.setProjection({ type: 'globe' });
      addCameraLayers(map);
    };

    map.on('style.load', handleStyleReady);

    map.on('load', () => {
      setMapReady(true);
      setStatus('World twin online');
      addCameraLayers(map);
    });

    map.on('click', CAMERA_HIT_LAYER_ID, (event) => {
      const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
      if (!feature?.properties) return;
      setSelectedCamera(feature.properties as CameraProperties);
    });

    map.on('mouseenter', CAMERA_HIT_LAYER_ID, () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', CAMERA_HIT_LAYER_ID, () => {
      map.getCanvas().style.cursor = '';
    });

    map.on('error', (event) => {
      const message = event.error?.message || 'Map error';
      setStatus(message);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [addCameraLayers]);

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
    applyBuildingVisibility(showBuildings);
  }, [applyBuildingVisibility, mapReady, showBuildings]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    map.setProjection({ type: mapMode });
  }, [mapMode, mapReady]);

  const flyToWorld = () => {
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
          <button type="button" onClick={focusStreets} title="Street view" aria-label="Street view">
            <MapIcon size={18} />
          </button>
          <button type="button" onClick={focus3D} title="3D buildings" aria-label="3D buildings">
            <Building2 size={18} />
          </button>
          <button type="button" onClick={focusCameras} title="Public cameras" aria-label="Public cameras">
            <Camera size={18} />
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

        <div className="metric-grid">
          <div>
            <strong>Planet</strong>
            <span>OSM vector streets</span>
          </div>
          <div>
            <strong>Countries</strong>
            <span>Global boundaries</span>
          </div>
          <div>
            <strong>3D</strong>
            <span>OSM buildings</span>
          </div>
          <div>
            <strong>{cameraCount}</strong>
            <span>Camera feeds</span>
          </div>
        </div>

        <div className="toggle-stack">
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
            className={mapMode === 'globe' ? 'toggle-row active' : 'toggle-row'}
            onClick={() => setMapMode((value) => (value === 'globe' ? 'mercator' : 'globe'))}
          >
            <Compass size={18} />
            <span>{mapMode === 'globe' ? 'Globe mode' : 'Flat mode'}</span>
            {mapMode === 'globe' ? <Check size={16} /> : null}
          </button>
        </div>
      </section>

      <section className="source-strip" aria-label="Data sources">
        <span>
          <Layers size={15} aria-hidden="true" />
          OpenFreeMap
        </span>
        <span>OpenStreetMap</span>
        <span>MapLibre GL JS</span>
        <span>GeoJSON cameras</span>
      </section>

      <button className="reset-button" type="button" onClick={flyToWorld} aria-label="Reset map">
        <RotateCcw size={18} />
      </button>

      <CameraDrawer camera={selectedCamera} onClose={() => setSelectedCamera(null)} />
    </main>
  );
}
