import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const filePath = process.argv[2];
const feedTypes = new Set(['iframe', 'hls', 'mjpeg', 'image', 'youtube', 'mp4']);

if (!filePath) {
  console.error('Usage: node scripts/validate-cameras.mjs public/cameras.geojson');
  process.exit(1);
}

const errors = [];
const warnings = [];
const raw = JSON.parse(await readFile(filePath, 'utf8'));

if (raw.type !== 'FeatureCollection' || !Array.isArray(raw.features)) {
  errors.push('Root must be a GeoJSON FeatureCollection.');
}

for (const [index, feature] of (raw.features || []).entries()) {
  const label = `features[${index}]`;
  const props = feature.properties || {};
  const coords = feature.geometry?.coordinates || [];

  if (feature.type !== 'Feature') errors.push(`${label}: type must be Feature.`);
  if (feature.geometry?.type !== 'Point') errors.push(`${label}: geometry must be Point.`);
  if (coords.length < 2) errors.push(`${label}: coordinates must include longitude and latitude.`);

  const [lng, lat] = coords;
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) errors.push(`${label}: longitude is invalid.`);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.push(`${label}: latitude is invalid.`);
  if (!props.name) errors.push(`${label}: properties.name is required.`);

  const feedUrl = props.feedUrl || props.streamUrl || props.url || props.pageUrl;
  if (!feedUrl) {
    errors.push(`${label}: properties.feedUrl or properties.pageUrl is required.`);
    continue;
  }

  const feedType = props.feedType || 'iframe';
  if (!feedTypes.has(feedType)) errors.push(`${label}: unsupported feedType "${feedType}".`);

  try {
    const url = new URL(feedUrl);
    if (!['http:', 'https:'].includes(url.protocol)) errors.push(`${label}: URL must use http or https.`);
    if (url.username || url.password) errors.push(`${label}: URL must not include embedded credentials.`);
    if (url.protocol === 'http:') warnings.push(`${label}: http feeds will be blocked from https deployments.`);
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname)) {
      errors.push(`${label}: local camera URLs are not suitable for the public layer.`);
    }
  } catch {
    errors.push(`${label}: feedUrl is not a valid URL.`);
  }
}

for (const warning of warnings) console.warn(`Warning: ${warning}`);

if (errors.length > 0) {
  console.error(`${basename(filePath)} failed validation:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`${basename(filePath)} is valid with ${raw.features.length} camera feature(s).`);
