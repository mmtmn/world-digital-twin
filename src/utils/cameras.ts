import type { LngLatBoundsLike } from 'maplibre-gl';
import { FEED_TYPES, type CameraFeature, type CameraFeatureCollection, type FeedType } from '../types';

const emptyCollection: CameraFeatureCollection = {
  type: 'FeatureCollection',
  features: []
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asString = (value: unknown) => (typeof value === 'string' ? value.trim() : undefined);

const asNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export const emptyCameraCollection = () => emptyCollection;

export const inferFeedType = (value?: string): FeedType => {
  const url = value?.toLowerCase() || '';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('.m3u8')) return 'hls';
  if (url.includes('.mp4')) return 'mp4';
  if (url.includes('.mjpg') || url.includes('mjpeg')) return 'mjpeg';
  if (url.match(/\.(jpg|jpeg|png|webp)(\?|$)/)) return 'image';
  return 'iframe';
};

const normalizeFeedType = (raw: unknown, feedUrl: string): FeedType => {
  const feedType = asString(raw)?.toLowerCase();
  if (feedType && FEED_TYPES.includes(feedType as FeedType)) return feedType as FeedType;
  return inferFeedType(feedUrl);
};

export const normalizeCameraCollection = (raw: unknown): CameraFeatureCollection => {
  if (!isObject(raw) || raw.type !== 'FeatureCollection' || !Array.isArray(raw.features)) {
    return emptyCameraCollection();
  }

  const features = raw.features.flatMap((feature, index): CameraFeature[] => {
    if (!isObject(feature) || feature.type !== 'Feature' || !isObject(feature.geometry)) return [];
    if (feature.geometry.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) return [];

    const [lng, lat] = feature.geometry.coordinates.map(asNumber);
    if (lng === undefined || lat === undefined) return [];
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return [];

    const properties = isObject(feature.properties) ? feature.properties : {};
    const feedUrl =
      asString(properties.feedUrl) ||
      asString(properties.streamUrl) ||
      asString(properties.url) ||
      asString(properties.pageUrl);
    if (!feedUrl) return [];

    const name = asString(properties.name) || `Camera ${index + 1}`;
    const id = asString(properties.id) || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const refreshSeconds = asNumber(properties.refreshSeconds);

    return [
      {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        properties: {
          id,
          name,
          city: asString(properties.city),
          country: asString(properties.country),
          kind: asString(properties.kind),
          feedType: normalizeFeedType(properties.feedType, feedUrl),
          feedUrl,
          pageUrl: asString(properties.pageUrl),
          source: asString(properties.source),
          license: asString(properties.license),
          refreshSeconds
        }
      }
    ];
  });

  return {
    type: 'FeatureCollection',
    features
  };
};

export const cameraBounds = (collection: CameraFeatureCollection): LngLatBoundsLike | undefined => {
  if (collection.features.length === 0) return undefined;

  let minLng = 180;
  let minLat = 90;
  let maxLng = -180;
  let maxLat = -90;

  for (const feature of collection.features) {
    const [lng, lat] = feature.geometry.coordinates;
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  if (minLng === maxLng && minLat === maxLat) {
    return [
      [minLng - 0.08, minLat - 0.08],
      [maxLng + 0.08, maxLat + 0.08]
    ];
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat]
  ];
};

export const youtubeEmbedUrl = (url: string) => {
  const patterns = [
    /youtube\.com\/watch\?.*v=([^&]+)/i,
    /youtube\.com\/live\/([^?&/]+)/i,
    /youtube\.com\/embed\/([^?&/]+)/i,
    /youtu\.be\/([^?&/]+)/i
  ];

  const id = patterns.map((pattern) => url.match(pattern)?.[1]).find(Boolean);
  return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1` : url;
};
