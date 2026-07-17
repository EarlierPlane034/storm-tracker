# StormLens — Feature Inventory

Everything the app can do, by area. Also available in-app: **Settings → About**.

## 🗺 Radar & Map
- Live CONUS composite reflectivity mosaic, refreshed every minute
- Single-site Base Reflectivity, Base Velocity, Storm Relative Velocity with 4 tilts
- GOES satellite: visible, infrared, water vapor
- 📡 Radar site picker — auto (nearest) or pin any of the 12 closest WSR-88D sites; tappable site markers
- ~50 minutes of radar history: play/pause loop + scrubber; storm markers move in time with the loop
- Adjustable transparency, animation speed, smoothing, 3 color tables
- Layers: warnings, watches, SPC Day-1 outlook, storm cells, projected tracks, storm reports, METAR stations, radar sites, range rings (25/50/100 mi)
- Long-press any map point: distance, bearing, drive time, coordinates
- Performance-tuned: gesture-safe tile loading, bounded single-site tiles, lazy history frames, no GPU filters, render containment

## 🤖 AI Analysis
- Every storm cell scored 0–100: Severe, Tornado, Hail, Wind, Flood, Lightning, Rotation, Organization
- Storm-type classification: classic/HP/LP supercell, QLCS, mesovortex, multicell
- Tornado chance band (None → Very High) with percentage, time window, confidence
- Plain-English reasoning for every score and every score change
- Score breakdown bars; strengthening/weakening trends; rotation persistence; rapid-intensification detection
- Ranked storm list with a "why" line per storm; AI headline ticker
- 💬 Ask-the-AI chat — tornado/hail/wind/flood potential, arrival times, safety checks, week ahead — answered on-device from live data

## 📊 Forecasts & Environment
- "Today's outlook" briefing: SPC risk level at your location + what the environment supports
- Week ahead: 7-day storm potential (CAPE/shear/precip graded Quiet→High) + SPC Day 2/3 categories
- Official NWS 7-day point forecast with expandable details
- Next-24h temperature and precip-chance charts
- Area Forecast Discussion (AFD) viewer
- Environment discussion (CAPE, CIN, shear, SRH, LCL) + hodograph with storm motion
- SPC Mesoanalysis viewer: surface, T/Td, SBCAPE, effective shear, 0–1 km SRH, supercell composite, significant tornado

## 📋 Reports
- NWS Local Storm Reports sorted by distance with tornado/hail/wind/flood filters
- Submit GPS-stamped spotter reports to your own Cloudflare worker database (24 h TTL), shown alongside official reports
- Hail size reference guide; all reports plotted on the map

## 🚨 Alerts
- NWS warning/watch polygons + distance-sorted list with live expiration countdowns
- AI alerts: significant rotation, tornado chance rising, rapid intensification, storm approaching your location
- Favorite locations watched by the alert engine
- Background push notifications when the app is closed (self-hosted Cloudflare worker; see docs/PUSH_SETUP.md)
- 🔊 Spoken alerts through CarPlay/Bluetooth car audio
- Per-alert toggles, notification sensitivity, monitoring radius

## 🎯 Chase Kit
- Chase HUD: target storm, bearing arrow, distance, ETA, GPS speed, daylight remaining, nearest-station T/Td, cloud base, tap-to-copy coordinates
- Screen wake lock; follow-me auto-centering; night mode (dim red)
- Route check: geocoded driving route with storm-intersection warnings
- 📝 Chase journal (GPS/time-stamped, exportable) + pre-chase checklist
- Data saver mode for weak signal
- Storm replay scrubber; per-storm trend charts; share-a-storm

## ⚙️ Platform
- Installable PWA (Safari → Add to Home Screen), offline shell, service-worker updates
- Imperial/metric units, storm display filters, favorites, data feed status panel
- Automatic retries, offline fallbacks, no API keys, no accounts, no tracking
- Every AI output labelled as an unofficial estimate; NWS warnings are always the authority
