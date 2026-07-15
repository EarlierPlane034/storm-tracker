# StormLens — AI-Powered Storm Chasing & Tornado Analysis PWA

A professional-grade Progressive Web App that continuously watches NEXRAD
radar, NWS alerts, spotter reports and the model environment, then **explains
what it sees in plain English**: per-storm severe scores, tornado chance
estimates with reasoning, trend charts, projected tracks and proximity alerts.

Dark, clean weather-analysis aesthetic (original design — no third-party
assets). Installs to the iPhone Home Screen straight from Safari and runs
like a native app.

> ⚠️ **Every AI assessment in this app is an automated interpretation of
> public weather data. It is NOT an official National Weather Service
> warning or forecast. Always follow official NWS warnings.**

---

## Install on iPhone (no App Store)

1. Host the repo on any static web server with HTTPS (GitHub Pages, Netlify,
   Cloudflare Pages — no build step required).
2. Open the URL in **Safari**.
3. Tap **Share → Add to Home Screen**.
4. Launch from the Home Screen icon — StormLens runs fullscreen/standalone,
   caches its shell for offline startup, and (on iOS 16.4+) can show
   notifications once you enable them in Settings → Notifications.

Local preview: `python3 -m http.server 8080` in the repo root, then open
`http://localhost:8080`.

## What it does

- **Live radar** — CONUS composite reflectivity mosaic plus single-site
  base reflectivity / velocity / storm-relative velocity with 4 selectable
  tilts, ~5-min history playback with scrubbing and smooth animation,
  adjustable opacity, smoothing and color tables, refresh every minute.
- **AI storm analysis** — every SCIT-detected cell gets: Severe Storm Score
  (0–100), tornado / hail / wind / flood / lightning risk scores, rotation
  and organization scores, storm-type classification (classic/HP/LP
  supercell, QLCS, mesovortex, multicell), trend
  (strengthening/weakening/steady) and a confidence level — each with the
  *why* spelled out and score changes explained between updates.
- **Tornado intelligence** — a 0–100 Tornado Potential Score blending radar
  rotation evidence (TVS, mesocyclone rank, gate-to-gate persistence,
  scan-to-scan trends), the model environment (CAPE, CIN, estimated SRH,
  low-level and deep-layer shear, LCL height, lapse rates), storm structure
  and official warning context — rendered as an explicit chance band
  (None → Very High), estimated percentage, time window and confidence,
  always with reasoning and never as a guarantee.
- **AI Meteorologist panel** — situation overview, environment discussion,
  storm-by-storm narratives, optional technical readout.
- **Storm tracking** — tap any cell for movement, arrival time, distance,
  hail size / VIL / echo tops, warning status, rotation persistence,
  projected 60-minute track and per-storm trend charts.
- **Alerts** — NWS tornado/severe/flash-flood warnings & watches (polygons
  on the map + panel sorted by proximity), plus AI events: significant
  rotation nearby, tornado chance rising, rapid intensification, storm
  approaching your GPS location. Delivered as in-app banners and (where the
  platform allows) system notifications.
- **GPS awareness** — nearest-storm chip with distance and ETA countdown,
  distances on every card, monitoring radius setting.
- **Map layers** — warnings, watches, SPC Day-1 outlook, storm cells,
  projected tracks, local storm reports, surface (METAR) stations, radar
  sites, satellite basemap.
- **Settings** — units, refresh cadence, animation speed, radar color
  table/smoothing/transparency, AI + notification sensitivity, per-alert
  toggles, monitoring radius, favorite locations, technical mode.

## Data sources (free, keyless, CORS-enabled)

| Feed | Source |
|---|---|
| Radar tiles (mosaic + single-site, history) | NOAA NEXRAD via Iowa Environmental Mesonet tile cache |
| Storm cell attributes (TVS, meso, hail, VIL, tops, motion) | NEXRAD Level III SCIT tables via IEM GeoJSON |
| Watches / warnings / advisories | NWS API (`api.weather.gov`) |
| SPC Day-1 convective outlook | SPC GeoJSON |
| Local storm reports | IEM GeoJSON |
| Environment (CAPE, CIN, LI, wind profile → shear/SRH/LCL) | Open-Meteo (HRRR/GFS blend) |
| Surface observations | NWS station API |
| Basemaps | CARTO dark / Esri imagery |

No API keys anywhere in the client. If a keyed service is ever added, put it
behind a server-side proxy — see `js/config.js`.

## Honest limitations

- **Dual-pol grids (CC, ZDR, spectrum width), echo-top and VIL *imagery***
  have no free public tile service. The product buttons explain this in-app;
  per-cell VIL, echo tops and hail parameters still come from the Level III
  attribute feed and drive the analysis.
- **Lightning**: no free public strike feed exists, so the lightning score is
  a storm-depth/intensity proxy and is labelled as such in the UI.
- **SRH/shear are estimates** derived from a 4-level model wind profile —
  good for ranking environments, not a sounding replacement.
- **Storm-type calls are attribute-level heuristics** ("structure consistent
  with…"), not image recognition of hooks/BWERs.
- **iOS background limits**: true push requires a server; StormLens uses
  local notifications when the PWA is open/backgrounded, refreshes
  immediately on foreground, and uses Background Sync where supported.

## Architecture

```
index.html            app shell (installable, iOS meta, safe-area aware)
manifest.webmanifest  PWA manifest
sw.js                 service worker: cache-first shell, network-first data,
                      bounded offline tile fallback, notification relay
css/main.css          dark theme, panels, sheet, charts, markers
vendor/leaflet/       Leaflet 1.9.4 vendored for full offline shell
js/
  config.js           endpoints, cadences, thresholds, disclaimer
  utils.js            geo math, formatting, DOM helpers
  storage.js          settings persistence (+ change bus)
  location.js         GPS watch wrapper
  api/
    client.js         fetch: timeout, retry w/ backoff, soft cache, feed health
    nws.js iem.js openmeteo.js   source adapters (normalize everything)
    sources.js        refresh scheduler + pub/sub facade
  radar/
    products.js       product registry + color tables (+ honest availability)
    radarController.js  frame stack, playback, tilts, site selection
  analysis/
    trends.js         per-cell history, slopes, persistence, RI detection
    stormAnalyzer.js  hazard scores, classification, ranking, ETA
    tornadoIntelligence.js  tornado score/band/window/confidence + reasons
    narrative.js      plain-English + technical text, change explanations
  ui/                 mapView, stormPanel, alertsPanel, aiPanel,
                      settingsPanel, layersPanel, trendChart, toasts
  alerts/alertEngine.js  event detection, de-dup, notification delivery
scripts/gen-icons.mjs   dependency-free PNG icon generator
```

Data flows one way: **adapters → sources facade → analysis → UI/alerts**.
Every module can be tested in isolation; the UI never touches raw APIs.

## Development

No build step — edit and reload. Regenerate icons with
`node scripts/gen-icons.mjs`. Bump the `VERSION` constant in `sw.js` when
shipping changes so installed clients pick up the new shell.
