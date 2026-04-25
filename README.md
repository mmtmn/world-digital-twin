# World Digital Twin

An open-source, no-key browser map that streams worldwide OpenStreetMap vector data, renders supported 3D buildings, searches countries/cities/streets, and displays clickable public camera feeds from GeoJSON.

## What is included

- Global country, place, road, and street rendering through OpenFreeMap vector tiles.
- 3D building extrusions from the OpenMapTiles `building` layer where OpenStreetMap has building footprint and height data.
- Globe and flat map modes using MapLibre GL JS.
- Nominatim place search for countries, cities, streets, and addresses.
- Clickable live camera markers loaded from `public/cameras.geojson`.
- HLS, MP4, MJPEG, image-refresh, YouTube, and iframe camera playback.

## Reality checks

This repo does not bundle the planet, every building, or every camera feed. A complete offline global twin is many terabytes and a legal real-time global camera catalog does not exist as a free public dataset.

The app uses open data and free public endpoints by default:

- Streets/countries: OpenStreetMap data served through OpenFreeMap/OpenMapTiles.
- 3D buildings: only where OSM contributors mapped building footprints and height/render height.
- Cameras: only explicitly public, permissioned feeds listed in your GeoJSON file.

For production traffic, self-host the map tiles or use a provider whose policy matches your usage. Public OSM and Nominatim services are shared community resources with fair-use limits.

## Run locally

```bash
npm install
npm run validate:cameras
npm run dev
```

Open the Vite URL printed in the terminal.

## Build

```bash
npm run build
npm run preview
```

## Configuration

Copy `.env.example` to `.env` when you want to override defaults.

```bash
VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
VITE_CAMERA_GEOJSON_URL=/cameras.geojson
VITE_NOMINATIM_EMAIL=you@example.com
```

`VITE_MAP_STYLE_URL` can point at a self-hosted OpenFreeMap/OpenMapTiles style. `VITE_CAMERA_GEOJSON_URL` can point at any HTTPS GeoJSON endpoint with the schema below.

## Camera GeoJSON schema

Each camera is a GeoJSON point:

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [-74.0445, 40.6892]
  },
  "properties": {
    "id": "nps-statue-liberty-webcams",
    "name": "Statue of Liberty TorchCams",
    "city": "New York",
    "country": "United States",
    "kind": "landmark",
    "feedType": "iframe",
    "feedUrl": "https://www.nps.gov/stli/learn/photosmultimedia/webcams.htm",
    "pageUrl": "https://www.nps.gov/stli/learn/photosmultimedia/webcams.htm",
    "source": "National Park Service / EarthCam",
    "license": "Check source terms before redistributing footage."
  }
}
```

Supported `feedType` values:

- `iframe`
- `hls`
- `mjpeg`
- `image`
- `youtube`
- `mp4`

Validate after edits:

```bash
npm run validate:cameras
```

## Self-hosting the planet

The default style URL is convenient for development and light personal demos. For heavier use:

1. Self-host OpenFreeMap or OpenMapTiles planet tiles.
2. Publish your own MapLibre style JSON.
3. Set `VITE_MAP_STYLE_URL` to your style URL.
4. Keep OpenStreetMap attribution visible.

OpenFreeMap documents the public style URL and self-hosted full-planet option in its quick start.

## Data and licenses

- Map renderer: [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/).
- Vector map style and tiles: [OpenFreeMap](https://openfreemap.org/quick_start/) / [OpenMapTiles](https://openmaptiles.org/).
- Base map data: [OpenStreetMap](https://www.openstreetmap.org/copyright), ODbL.
- Search: public [Nominatim](https://nominatim.org/) endpoint by default. Follow the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/).
- Tile usage: follow public provider terms and the [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/) when using OSM-hosted services.
- Camera feeds: governed by each feed owner.

Respect source terms, privacy rules, and local law. Do not add private surveillance cameras, credentialed feeds, or feeds that identify private spaces without permission.

## GitHub Pages

The included workflow builds and publishes the app with GitHub Pages when pushed to `main`. In the repository settings, set Pages source to GitHub Actions if it is not already enabled.
