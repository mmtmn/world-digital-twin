import type { Feature, FeatureCollection, Point } from 'geojson';

export const FEED_TYPES = ['iframe', 'hls', 'mjpeg', 'image', 'youtube', 'mp4'] as const;

export type FeedType = (typeof FEED_TYPES)[number];

export type CameraProperties = {
  id: string;
  name: string;
  city?: string;
  country?: string;
  kind?: string;
  feedType: FeedType;
  feedUrl: string;
  pageUrl?: string;
  source?: string;
  license?: string;
  refreshSeconds?: number;
};

export type CameraFeature = Feature<Point, CameraProperties>;

export type CameraFeatureCollection = FeatureCollection<Point, CameraProperties>;

export type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
  boundingbox?: [string, string, string, string];
};
