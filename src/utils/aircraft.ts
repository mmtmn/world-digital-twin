import type { Feature, FeatureCollection, Point } from 'geojson';

export type AircraftProperties = {
  id: string;
  name: string;
  registration?: string;
  type?: string;
  altitudeFt?: number;
  speedKt?: number;
  track?: number;
  source: string;
};

export type AircraftCollection = FeatureCollection<Point, AircraftProperties>;

type ReadsbAircraft = {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  alt_geom?: number;
  gs?: number;
  track?: number;
};

type ReadsbResponse = {
  ac?: ReadsbAircraft[];
  aircraft?: ReadsbAircraft[];
};

export const emptyAircraftCollection = (): AircraftCollection => ({
  type: 'FeatureCollection',
  features: []
});

export const aircraftApiUrl = (template: string, lat: number, lon: number, dist = 250) =>
  template
    .replace('{lat}', lat.toFixed(4))
    .replace('{lon}', lon.toFixed(4))
    .replace('{dist}', String(dist));

export const normalizeAircraft = (data: ReadsbResponse): AircraftCollection => {
  const aircraft = data.ac || data.aircraft || [];
  const features: Array<Feature<Point, AircraftProperties>> = [];

  for (const item of aircraft) {
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) continue;

    const altitude =
      typeof item.alt_baro === 'number'
        ? item.alt_baro
        : typeof item.alt_geom === 'number'
          ? item.alt_geom
          : undefined;
    const name = item.flight?.trim() || item.r || item.hex || 'Aircraft';

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [item.lon as number, item.lat as number]
      },
      properties: {
        id: item.hex || name,
        name,
        registration: item.r,
        type: item.t,
        altitudeFt: altitude,
        speedKt: item.gs,
        track: item.track,
        source: 'ADS-B open data'
      }
    });
  }

  return {
    type: 'FeatureCollection',
    features
  };
};
