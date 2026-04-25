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

const CACHE_KEY = 'world-digital-twin:satellite-tles:v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

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

export const loadSatelliteCatalog = async (url: string, signal?: AbortSignal) => {
  const cached = readCachedTles();
  if (cached) return parseTleText(cached);

  const response = await fetch(url, {
    cache: 'force-cache',
    signal
  });

  if (!response.ok) {
    if (url.includes('GROUP=active')) {
      const fallbackUrl = url.replace('GROUP=active', 'GROUP=visual');
      const fallbackResponse = await fetch(fallbackUrl, {
        cache: 'force-cache',
        signal
      });
      if (!fallbackResponse.ok) throw new Error(`Satellite catalog returned ${response.status}`);
      const fallbackText = await fallbackResponse.text();
      return parseTleText(fallbackText);
    }

    throw new Error(`Satellite catalog returned ${response.status}`);
  }

  const text = await response.text();
  writeCachedTles(text);
  return parseTleText(text);
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
