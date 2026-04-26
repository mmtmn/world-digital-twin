import type { Feature, FeatureCollection, Polygon } from 'geojson';

type OverpassGeometryPoint = {
  lat: number;
  lon: number;
};

type OverpassMember = {
  type?: string;
  role?: string;
  geometry?: OverpassGeometryPoint[];
};

type OverpassElement = {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: OverpassGeometryPoint[];
  members?: OverpassMember[];
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

export type DetailedBuildingProperties = {
  id: string;
  name?: string;
  heightMeters: number;
  minHeightMeters: number;
  levels?: number;
  kind?: string;
  source: string;
};

export type DetailedBuildingCollection = FeatureCollection<Polygon, DetailedBuildingProperties>;

const emptyDetailedBuildings: DetailedBuildingCollection = {
  type: 'FeatureCollection',
  features: []
};

const fallbackHeights: Record<string, number> = {
  apartments: 18,
  commercial: 16,
  dormitory: 15,
  hotel: 18,
  house: 7,
  industrial: 12,
  office: 22,
  residential: 12,
  retail: 9,
  school: 12,
  skyscraper: 120,
  tower: 60,
  warehouse: 11
};

const asFiniteNumber = (value: string | undefined) => {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  const match = trimmed.match(/-?\d+(\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return trimmed.includes('ft') || trimmed.includes("'") ? parsed * 0.3048 : parsed;
};

const buildingHeight = (tags: Record<string, string>) => {
  const explicitHeight =
    asFiniteNumber(tags.height) ||
    asFiniteNumber(tags['building:height']) ||
    asFiniteNumber(tags['est_height']);
  if (explicitHeight) return Math.min(explicitHeight, 500);

  const levels = asFiniteNumber(tags['building:levels']) || asFiniteNumber(tags.levels);
  if (levels) return Math.min(levels * 3.2, 500);

  const kind = tags.building || tags['building:part'];
  return kind ? fallbackHeights[kind] || 10 : 10;
};

const minBuildingHeight = (tags: Record<string, string>) => {
  const explicitMin = asFiniteNumber(tags.min_height);
  if (explicitMin !== undefined) return Math.min(explicitMin, 500);

  const minLevel = asFiniteNumber(tags['building:min_level']);
  return Math.min((minLevel || 0) * 3.2, 500);
};

const levels = (tags: Record<string, string>) => {
  const parsed = asFiniteNumber(tags['building:levels']) || asFiniteNumber(tags.levels);
  return parsed ? Math.round(parsed) : undefined;
};

const ringFromGeometry = (geometry: OverpassGeometryPoint[] | undefined) => {
  if (!geometry || geometry.length < 4) return null;

  const ring = geometry.map((point) => [point.lon, point.lat] as [number, number]);
  const first = ring[0];
  const last = ring.at(-1);
  if (!last || first[0] !== last[0] || first[1] !== last[1]) ring.push(first);

  return ring.length >= 4 ? ring : null;
};

const featureFromRing = (
  ring: Array<[number, number]>,
  element: OverpassElement,
  suffix = ''
): Feature<Polygon, DetailedBuildingProperties> => {
  const tags = element.tags || {};

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [ring]
    },
    properties: {
      id: `osm-building-${element.type}-${element.id}${suffix}`,
      name: tags.name,
      heightMeters: Math.round(buildingHeight(tags) * 10) / 10,
      minHeightMeters: Math.round(minBuildingHeight(tags) * 10) / 10,
      levels: levels(tags),
      kind: tags.building || tags['building:part'],
      source: 'OpenStreetMap / Overpass'
    }
  };
};

export const emptyDetailedBuildingCollection = () => emptyDetailedBuildings;

export const buildDetailedBuildingQuery = (south: number, west: number, north: number, east: number) => `
[out:json][timeout:35];
(
  way["building"](${south},${west},${north},${east});
  relation["building"](${south},${west},${north},${east});
  way["building:part"](${south},${west},${north},${east});
  relation["building:part"](${south},${west},${north},${east});
);
out geom tags 2500;
`;

export const normalizeDetailedBuildings = (data: OverpassResponse): DetailedBuildingCollection => {
  const features: Array<Feature<Polygon, DetailedBuildingProperties>> = [];

  for (const element of data.elements || []) {
    const directRing = ringFromGeometry(element.geometry);

    if (directRing) {
      features.push(featureFromRing(directRing, element));
      continue;
    }

    const outerRings =
      element.members
        ?.filter((member) => member.type === 'way' && (!member.role || member.role === 'outer'))
        .map((member) => ringFromGeometry(member.geometry))
        .filter((ring): ring is Array<[number, number]> => Boolean(ring)) || [];

    outerRings.forEach((ring, index) => {
      features.push(featureFromRing(ring, element, `-${index}`));
    });
  }

  return {
    type: 'FeatureCollection',
    features
  };
};

export const mergeDetailedBuildings = (
  current: DetailedBuildingCollection,
  incoming: DetailedBuildingCollection
): DetailedBuildingCollection => {
  const byId = new Map<string, Feature<Polygon, DetailedBuildingProperties>>();

  for (const feature of current.features) byId.set(feature.properties.id, feature);
  for (const feature of incoming.features) byId.set(feature.properties.id, feature);

  return {
    type: 'FeatureCollection',
    features: [...byId.values()]
  };
};
