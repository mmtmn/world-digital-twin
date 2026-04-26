import type { Feature, FeatureCollection, LineString, Polygon } from 'geojson';

export type NightMaskProperties = {
  id: string;
  source: string;
};

export type TerminatorProperties = {
  id: string;
  subsolarLat: number;
  subsolarLon: number;
  source: string;
};

export type NightMaskCollection = FeatureCollection<Polygon, NightMaskProperties>;
export type TerminatorCollection = FeatureCollection<LineString, TerminatorProperties>;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const DAY_MS = 86_400_000;

const emptyNightMask: NightMaskCollection = {
  type: 'FeatureCollection',
  features: []
};

const emptyTerminator: TerminatorCollection = {
  type: 'FeatureCollection',
  features: []
};

const toRadians = (degrees: number) => degrees * DEG_TO_RAD;
const toDegrees = (radians: number) => radians * RAD_TO_DEG;

const normalizeDegrees = (degrees: number) => {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const normalizeLongitude = (longitude: number) => {
  const normalized = ((longitude + 180) % 360) + 360;
  return (normalized % 360) - 180;
};

const julianDay = (date: Date) => date.getTime() / DAY_MS + 2440587.5;

export const emptyNightMaskCollection = () => emptyNightMask;

export const emptyTerminatorCollection = () => emptyTerminator;

export const subsolarPoint = (date = new Date()) => {
  const jd = julianDay(date);
  const daysSinceJ2000 = jd - 2451545.0;
  const meanLongitude = normalizeDegrees(280.46 + 0.9856474 * daysSinceJ2000);
  const meanAnomaly = normalizeDegrees(357.528 + 0.9856003 * daysSinceJ2000);
  const eclipticLongitude =
    meanLongitude +
    1.915 * Math.sin(toRadians(meanAnomaly)) +
    0.02 * Math.sin(toRadians(2 * meanAnomaly));
  const obliquity = 23.439 - 0.0000004 * daysSinceJ2000;
  const rightAscension = toDegrees(
    Math.atan2(
      Math.cos(toRadians(obliquity)) * Math.sin(toRadians(eclipticLongitude)),
      Math.cos(toRadians(eclipticLongitude))
    )
  );
  const declination = toDegrees(
    Math.asin(Math.sin(toRadians(obliquity)) * Math.sin(toRadians(eclipticLongitude)))
  );
  const greenwichSiderealTime = normalizeDegrees(280.46061837 + 360.98564736629 * daysSinceJ2000);

  return {
    lat: declination,
    lon: normalizeLongitude(rightAscension - greenwichSiderealTime)
  };
};

const vectorFromLatLon = (lat: number, lon: number) => {
  const latRad = toRadians(lat);
  const lonRad = toRadians(lon);
  const cosLat = Math.cos(latRad);

  return {
    x: cosLat * Math.cos(lonRad),
    y: cosLat * Math.sin(lonRad),
    z: Math.sin(latRad)
  };
};

const dot = (
  left: ReturnType<typeof vectorFromLatLon>,
  right: ReturnType<typeof vectorFromLatLon>
) => left.x * right.x + left.y * right.y + left.z * right.z;

export const buildNightMask = (date = new Date(), stepDegrees = 4): NightMaskCollection => {
  const sun = subsolarPoint(date);
  const sunVector = vectorFromLatLon(sun.lat, sun.lon);
  const features: Array<Feature<Polygon, NightMaskProperties>> = [];
  const latMin = -84;
  const latMax = 84;

  for (let lat = latMin; lat < latMax; lat += stepDegrees) {
    for (let lon = -180; lon < 180; lon += stepDegrees) {
      const centerLat = lat + stepDegrees / 2;
      const centerLon = lon + stepDegrees / 2;
      const cellVector = vectorFromLatLon(centerLat, centerLon);

      if (dot(sunVector, cellVector) >= 0) continue;

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [lon, lat],
              [lon + stepDegrees, lat],
              [lon + stepDegrees, lat + stepDegrees],
              [lon, lat + stepDegrees],
              [lon, lat]
            ]
          ]
        },
        properties: {
          id: `night-${lat}-${lon}`,
          source: 'Computed solar terminator'
        }
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features
  };
};

const destinationPoint = (centerLat: number, centerLon: number, bearingDegrees: number, distanceRadians: number) => {
  const lat1 = toRadians(centerLat);
  const lon1 = toRadians(centerLon);
  const bearing = toRadians(bearingDegrees);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceRadians) +
      Math.cos(lat1) * Math.sin(distanceRadians) * Math.cos(bearing)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(distanceRadians) * Math.cos(lat1),
      Math.cos(distanceRadians) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [normalizeLongitude(toDegrees(lon2)), toDegrees(lat2)] as [number, number];
};

export const buildTerminator = (date = new Date(), stepDegrees = 2): TerminatorCollection => {
  const sun = subsolarPoint(date);
  const antisolarLat = -sun.lat;
  const antisolarLon = normalizeLongitude(sun.lon + 180);
  const features: Array<Feature<LineString, TerminatorProperties>> = [];
  let segment: Array<[number, number]> = [];

  const flush = () => {
    if (segment.length > 1) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: segment
        },
        properties: {
          id: `terminator-${features.length}`,
          subsolarLat: Number(sun.lat.toFixed(3)),
          subsolarLon: Number(sun.lon.toFixed(3)),
          source: 'Computed solar terminator'
        }
      });
    }

    segment = [];
  };

  for (let bearing = 0; bearing <= 360; bearing += stepDegrees) {
    const point = destinationPoint(antisolarLat, antisolarLon, bearing, Math.PI / 2);
    const previous = segment.at(-1);

    if (previous && Math.abs(point[0] - previous[0]) > 180) {
      flush();
    }

    segment.push(point);
  }

  flush();

  return {
    type: 'FeatureCollection',
    features
  };
};
