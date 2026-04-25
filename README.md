# World Digital Twin

An open-source, no-key browser map that streams worldwide OpenStreetMap vector data, renders supported 3D buildings, searches countries/cities/streets, displays public camera feeds, and tracks satellites plus aircraft where free public data allows it.

## What is included

- Global country, place, road, and street rendering through OpenFreeMap vector tiles.
- A satellite-imagery globe using EOX Sentinel-2 cloudless raster tiles, MapLibre atmosphere, and OpenStreetMap labels/roads.
- 3D building extrusions from the OpenMapTiles `building` layer, with fallback heights for mapped buildings that do not have explicit height tags.
- Globe and flat map modes using MapLibre GL JS.
- Nominatim place search for countries, cities, streets, and addresses.
- Clickable live camera markers loaded from `public/cameras.geojson`.
- On-demand OSM webcam discovery in the current viewport via Overpass.
- HLS, MP4, MJPEG, image-refresh, YouTube, and iframe camera playback.
- Satellite tracking from CelesTrak GP/TLE data using `satellite.js` SGP4 propagation.
- Cyberpunk-styled satellite icons with predicted ground-track trajectories.
- Aircraft tracking through the embedded ADSB.fi live map. Local development also includes a Vite proxy for the ADSB.fi open-data API.

## Reality checks

This repo does not bundle the planet, every building, every aircraft, or every camera feed. A complete offline global twin is many terabytes, browser-rendering all global buildings at once is not practical on a PC, and a legal real-time global camera catalog does not exist as a free public dataset.

The app uses open data and free public endpoints by default:

- Streets/countries: OpenStreetMap data served through OpenFreeMap/OpenMapTiles.
- Planet imagery: EOX Sentinel-2 cloudless 2024 tiles.
- 3D buildings: OSM building footprints in the current vector tiles. Explicit heights are used when available; otherwise the app estimates a modest extrusion.
- Cameras: explicitly public feeds listed in GeoJSON plus OSM objects with webcam URL tags in the current viewport.
- Satellites: public CelesTrak GP/TLE records. Classified or withheld objects are not available.
- Aircraft: ADS-B community data. Coverage depends on receivers, aircraft transponders, provider limits, and browser CORS.

Many webcam sites intentionally block cross-site embedding with browser security headers such as `X-Frame-Options` or CSP `frame-ancestors`. The app does not try to bypass those protections. For those cameras, the drawer shows an "Open live camera" action. In-app playback is available for direct HLS/MP4/MJPEG/image feeds and embeddable YouTube streams.

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
VITE_CAMERA_GEOJSON_URL=
VITE_EARTH_IMAGERY_TILES=https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg
VITE_SATELLITE_TLE_URL=https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle
VITE_OVERPASS_ENDPOINT=https://overpass-api.de/api/interpreter
VITE_AIRCRAFT_API_TEMPLATE=
VITE_AIRCRAFT_LIVE_MAP_URL=https://globe.adsb.fi/
VITE_NOMINATIM_EMAIL=you@example.com
```

`VITE_MAP_STYLE_URL` can point at a self-hosted OpenFreeMap/OpenMapTiles style. Leave `VITE_CAMERA_GEOJSON_URL` blank to use the bundled `cameras.geojson`, or point it at any HTTPS GeoJSON endpoint with the schema below.

`VITE_AIRCRAFT_API_TEMPLATE` is blank in production because public ADS-B JSON APIs usually block browser CORS from GitHub Pages. During local development, Vite proxies `/aircraft-api/...` to ADSB.fi so the aircraft point layer can be tested with:

```bash
VITE_AIRCRAFT_API_TEMPLATE=/aircraft-api/api/v3/lat/{lat}/lon/{lon}/dist/{dist}
```

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

## Live layers

- Satellite imagery is streamed as raster tiles, so only visible tiles are rendered.
- Building meshes are generated from vector tiles in the current viewport, not loaded globally.
- Satellites are propagated client-side from TLEs and refreshed every 30 seconds.
- Satellite trajectories are predicted ground tracks for a bounded subset of the catalog so the app stays usable on a normal PC.
- Aircraft uses the embedded ADSB.fi map in the deployed static app. A direct aircraft point layer requires a same-origin proxy or a CORS-enabled ADS-B endpoint.
- OSM webcams are loaded only after zooming in and pressing "Load OSM webcams in view" to avoid abusive global Overpass queries.

## Data and licenses

- Map renderer: [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/).
- Vector map style and tiles: [OpenFreeMap](https://openfreemap.org/quick_start/) / [OpenMapTiles](https://openmaptiles.org/).
- Base map data: [OpenStreetMap](https://www.openstreetmap.org/copyright), ODbL.
- Satellite imagery: [EOX Sentinel-2 cloudless](https://s2maps.eu/), Creative Commons attribution terms.
- Satellite orbital data: [CelesTrak GP data](https://celestrak.org/NORAD/documentation/gp-data-formats.php).
- Aircraft live map/open data: [ADSB.fi](https://adsb.fi/).
- OSM webcam lookup: [Overpass API](https://overpass-api.de/).
- Search: public [Nominatim](https://nominatim.org/) endpoint by default. Follow the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/).
- Tile usage: follow public provider terms and the [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/) when using OSM-hosted services.
- Camera feeds: governed by each feed owner.

Respect source terms, privacy rules, and local law. Do not add private surveillance cameras, credentialed feeds, or feeds that identify private spaces without permission.

## GitHub Pages

The included workflow builds and publishes the app with GitHub Pages when pushed to `main`. In the repository settings, set Pages source to GitHub Actions if it is not already enabled.
