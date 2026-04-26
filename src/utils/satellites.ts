import * as satellite from 'satellite.js';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';

export type TrackedSatellite = {
  id: string;
  name: string;
  satrec: satellite.SatRec;
};

export type SatelliteProperties = {
  id: string;
  name: string;
  altitudeKm: number;
  source: string;
};

export type SatelliteCollection = FeatureCollection<Point, SatelliteProperties>;

export type SatelliteTrackProperties = {
  id: string;
  name: string;
  minutes: number;
  source: string;
};

export type SatelliteTrackCollection = FeatureCollection<LineString, SatelliteTrackProperties>;

const CACHE_KEY = 'world-digital-twin:satellite-tles:v2';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FALLBACK_GROUPS = [
  'stations',
  'visual',
  'weather',
  'noaa',
  'goes',
  'resource',
  'sarsat',
  'tdrss',
  'geo',
  'intelsat',
  'ses',
  'starlink',
  'oneweb',
  'iridium',
  'iridium-NEXT',
  'orbcomm',
  'globalstar',
  'amateur',
  'x-comm',
  'other-comm',
  'gps-ops',
  'glo-ops',
  'galileo',
  'beidou',
  'sbas',
  'science',
  'geodetic',
  'engineering',
  'education',
  'military',
  'radar',
  'cubesat'
];

const emptySatellites: SatelliteCollection = {
  type: 'FeatureCollection',
  features: []
};

const emptyTracks: SatelliteTrackCollection = {
  type: 'FeatureCollection',
  features: []
};

type CachedTles = {
  fetchedAt: number;
  text: string;
};

export const emptySatelliteCollection = () => emptySatellites;

export const emptySatelliteTrackCollection = () => emptyTracks;

const parseTleText = (tleText: string): TrackedSatellite[] => {
  const lines = tleText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const satellites: TrackedSatellite[] = [];

  for (let index = 0; index < lines.length - 2; index += 3) {
    const name = lines[index];
    const line1 = lines[index + 1];
    const line2 = lines[index + 2];

    if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) {
      index -= 2;
      continue;
    }

    try {
      const satrec = satellite.twoline2satrec(line1, line2);
      const id = line1.slice(2, 7).trim() || name;
      satellites.push({ id, name, satrec });
    } catch {
      // Skip malformed or deprecated records. CelesTrak occasionally contains decayed entries.
    }
  }

  return satellites;
};

const uniqueSatellites = (satellites: TrackedSatellite[]) => {
  const byId = new Map<string, TrackedSatellite>();
  for (const item of satellites) byId.set(item.id, item);
  return [...byId.values()];
};

const readCachedTles = () => {
  try {
    const cached = JSON.parse(window.localStorage.getItem(CACHE_KEY) || 'null') as CachedTles | null;
    if (!cached || Date.now() - cached.fetchedAt > CACHE_TTL_MS) return null;
    return cached.text;
  } catch {
    return null;
  }
};

const writeCachedTles = (text: string) => {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), text }));
  } catch {
    // Local storage can be unavailable in private modes; the live fetch still works.
  }
};

const tleGroupUrl = (url: string, group: string) => {
  if (url.includes('GROUP=')) return url.replace(/GROUP=[^&]+/, `GROUP=${group}`);
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}GROUP=${group}`;
};

const loadGroupedCatalog = async (url: string, signal?: AbortSignal) => {
  const texts: string[] = [];

  for (const group of FALLBACK_GROUPS) {
    try {
      const response = await fetch(tleGroupUrl(url, group), {
        cache: 'force-cache',
        signal
      });
      if (!response.ok) continue;

      const text = await response.text();
      if (parseTleText(text).length === 0) continue;
      texts.push(text);
    } catch {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    }
  }

  const combined = texts.join('\n');
  const parsed = uniqueSatellites(parseTleText(combined));
  if (parsed.length === 0) throw new Error('Grouped satellite catalog unavailable');

  writeCachedTles(combined);
  return parsed;
};

export const loadSatelliteCatalog = async (url: string, signal?: AbortSignal) => {
  const cached = readCachedTles();
  if (cached) return uniqueSatellites(parseTleText(cached));

  const response = await fetch(url, {
    cache: 'force-cache',
    signal
  });

  if (!response.ok) {
    if (url.includes('GROUP=active')) {
      return loadGroupedCatalog(url, signal);
    }

    throw new Error(`Satellite catalog returned ${response.status}`);
  }

  const text = await response.text();
  const parsed = uniqueSatellites(parseTleText(text));
  if (parsed.length === 0) {
    if (url.includes('GROUP=active')) return loadGroupedCatalog(url, signal);
    throw new Error('Satellite catalog contained no TLE records');
  }

  writeCachedTles(text);
  return parsed;
};

export const propagateSatellites = (
  catalog: TrackedSatellite[],
  now = new Date()
): SatelliteCollection => {
  const gmst = satellite.gstime(now);
  const features: Array<Feature<Point, SatelliteProperties>> = [];

  for (const item of catalog) {
    const positionAndVelocity = satellite.propagate(item.satrec, now);
    if (!positionAndVelocity) continue;
    const position = positionAndVelocity.position;
    if (!position || typeof position === 'boolean') continue;

    const geodetic = satellite.eciToGeodetic(position, gmst);
    const lat = satellite.degreesLat(geodetic.latitude);
    const lon = satellite.degreesLong(geodetic.longitude);
    const altitudeKm = geodetic.height;

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(altitudeKm)) continue;

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lon, lat]
      },
      properties: {
        id: item.id,
        name: item.name,
        altitudeKm: Math.round(altitudeKm),
        source: 'CelesTrak GP/TLE'
      }
    });
  }

  return {
    type: 'FeatureCollection',
    features
  };
};

const geodeticPoint = (item: TrackedSatellite, now: Date) => {
  const positionAndVelocity = satellite.propagate(item.satrec, now);
  if (!positionAndVelocity) return null;

  const position = positionAndVelocity.position;
  if (!position || typeof position === 'boolean') return null;

  const geodetic = satellite.eciToGeodetic(position, satellite.gstime(now));
  const lat = satellite.degreesLat(geodetic.latitude);
  const lon = satellite.degreesLong(geodetic.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [lon, lat] as [number, number];
};

export const propagateSatelliteTracks = (
  catalog: TrackedSatellite[],
  now = new Date(),
  options = {
    limit: 160,
    minutesBack: 35,
    minutesForward: 95,
    stepMinutes: 5
  }
): SatelliteTrackCollection => {
  const features: Array<Feature<LineString, SatelliteTrackProperties>> = [];
  const selected = catalog.slice(0, options.limit);

  for (const item of selected) {
    let segment: Array<[number, number]> = [];
    let segmentIndex = 0;

    const flush = () => {
      if (segment.length < 2) {
        segment = [];
        return;
      }

      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: segment
        },
        properties: {
          id: `${item.id}-${segmentIndex}`,
          name: item.name,
          minutes: options.minutesBack + options.minutesForward,
          source: 'CelesTrak SGP4 predicted ground track'
        }
      });
      segmentIndex += 1;
      segment = [];
    };

    for (let offset = -options.minutesBack; offset <= options.minutesForward; offset += options.stepMinutes) {
      const point = geodeticPoint(item, new Date(now.getTime() + offset * 60_000));
      if (!point) {
        flush();
        continue;
      }

      const previous = segment.at(-1);
      if (previous && Math.abs(point[0] - previous[0]) > 180) {
        flush();
      }

      segment.push(point);
    }

    flush();
  }

  return {
    type: 'FeatureCollection',
    features
  };
};
