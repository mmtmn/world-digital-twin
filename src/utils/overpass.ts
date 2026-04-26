import type { CameraFeature, CameraFeatureCollection } from '../types';
import { inferFeedType } from './cameras';

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat: number;
    lon: number;
  };
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

const webcamUrlFromTags = (tags: Record<string, string>) =>
  tags['contact:webcam'] ||
  tags['webcam:url'] ||
  tags['camera:url'] ||
  tags['stream:url'] ||
  tags['video:url'] ||
  tags['contact:youtube'] ||
  tags.webcam ||
  (tags.tourism === 'webcam' ? tags.website || tags.url : undefined) ||
  (tags.surveillance === 'webcam' ? tags.url : undefined);

export const buildWebcamQuery = (south: number, west: number, north: number, east: number) => `
[out:json][timeout:25];
(
  node["contact:webcam"](${south},${west},${north},${east});
  way["contact:webcam"](${south},${west},${north},${east});
  relation["contact:webcam"](${south},${west},${north},${east});
  node["webcam:url"](${south},${west},${north},${east});
  way["webcam:url"](${south},${west},${north},${east});
  relation["webcam:url"](${south},${west},${north},${east});
  node["camera:url"](${south},${west},${north},${east});
  way["camera:url"](${south},${west},${north},${east});
  relation["camera:url"](${south},${west},${north},${east});
  node["stream:url"](${south},${west},${north},${east});
  way["stream:url"](${south},${west},${north},${east});
  relation["stream:url"](${south},${west},${north},${east});
  node["video:url"](${south},${west},${north},${east});
  way["video:url"](${south},${west},${north},${east});
  relation["video:url"](${south},${west},${north},${east});
  node["tourism"="webcam"](${south},${west},${north},${east});
  way["tourism"="webcam"](${south},${west},${north},${east});
  relation["tourism"="webcam"](${south},${west},${north},${east});
  node["surveillance"="webcam"]["url"](${south},${west},${north},${east});
  way["surveillance"="webcam"]["url"](${south},${west},${north},${east});
  relation["surveillance"="webcam"]["url"](${south},${west},${north},${east});
);
out center tags 1000;
`;

export const normalizeOverpassWebcams = (data: OverpassResponse): CameraFeatureCollection => {
  const features: CameraFeature[] = [];

  for (const element of data.elements || []) {
    const tags = element.tags || {};
    const feedUrl = webcamUrlFromTags(tags);
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;

    if (!feedUrl || lat === undefined || lon === undefined) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lon, lat]
      },
      properties: {
        id: `osm-${element.type}-${element.id}`,
        name: tags.name || tags.operator || `OSM webcam ${element.id}`,
        city: tags['addr:city'],
        country: tags['addr:country'],
        kind: tags.surveillance === 'webcam' ? 'webcam' : 'public webcam',
        feedType: inferFeedType(feedUrl),
        feedUrl,
        pageUrl: tags.website || tags.url || feedUrl,
        source: 'OpenStreetMap / Overpass',
        license: 'OSM data is ODbL. Webcam stream terms remain with the linked source.'
      }
    });
  }

  return {
    type: 'FeatureCollection',
    features
  };
};
