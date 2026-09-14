# StormLens Roadmap Progress

Tracks the 350+ item feature roadmap you provided (`STORMLENS_MASTER_ROADMAP_FINAL`)
against what's actually shipped in the codebase. Updated every time a feature from
the list is built — checked items are verified present in code, not just planned.

Legend: ✅ done and verified in code · ☐ not started

## Completed so far

| # | Feature | Where |
|---|---------|-------|
| 9 | Service worker cache cleanup (auto-delete tiles >2 hrs old) | `sw.js` (`TILE_MAX_AGE_MS`, `expireOldTiles`) |
| 24 | Rapid intensification flag | `js/analysis/stormAnalyzer.js`, `js/ui/mapView.js` (⚡ badge) |
| 25 | Storm lifecycle classification (newborn/growing/mature/weakening) | `js/analysis/trends.js` (`lifecycleStage`), `js/ui/stormPanel.js` |
| 31 | Saved storm pins (bookmarks) | `js/storage.js`, `js/ui/stormPanel.js` |
| 39 | Searchable city/landmark database | `js/data/cities.js`, `js/app.js` (`wireLocationSearch`) |
| 42 | Custom hazard thresholds | `js/storage.js`, `js/alerts/alertEngine.js`, `js/ui/settingsPanel.js` |
| 51 | Storm target planner (enhanced) — intercept point + ETA | `js/ui/mapView.js` (`renderInterceptGuidance`), `js/chase/chaseSafety.js` |
| 60 | Pre-chase checklist v2 (CAPE/shear/LCL, tire pressure, GMRS, rally point) | `js/ui/settingsPanel.js` |
| 72 | Storm scorecard PNG export | `js/ui/stormPanel.js` (`shareScorecard`) |
| 93 | Large text mode | `js/storage.js`, `css/main.css` |
| 94 | High contrast mode | `js/storage.js`, `css/main.css` |
| 102 | Stale data indicators | `js/ui/stormPanel.js` (`isStale`), `css/main.css` (`.stale-tag`) |
| 106 | Battery level indicator | `js/app.js` (`wirePowerAwareness`) |
| 107 | Connection quality indicator | `js/app.js` (`wirePowerAwareness`) |
| 110 | Geolocation fallback (manual pin-drop) | `js/location.js` (`setManualLocation`), long-press on map |
| 111 | Prediction accuracy tracker | `js/data/stormDatabase.js` (wired to real recorded storms) |
| 112 | Storm seasonality stats | `js/data/stormDatabase.js` (`getSeasonalStats`) |
| 117 | Personal storm archive | History tab, `js/data/stormDatabase.js` |
| 136 | Keyboard shortcuts (P/Space/Z/1-9/Esc) | `js/app.js` (`wireKeyboardShortcuts`) |
| 137 | Recent searches cache | `js/app.js` (`getRecentSearches`/`addRecentSearch`) |
| 139 | Color-blind mode | `js/storage.js`, `js/utils.js` (`severityColor`) |
| 172 | Glossary modal | `js/data/glossary.js`, `js/app.js` (`wireGlossary`) |
| 191 | Storm overshoot prediction (warns when you're closing on a storm faster than it's moving, heading straight at it) | `js/app.js` (`overshootWarning`, chase HUD) |
| 30 | Storm hazard matrix (table view: dist/score/tornado%/hail/wind/lightning for every visible storm) | `js/ui/stormPanel.js` (`renderHazardMatrix`, Cards/Table toggle) |
| 46 | Fade-in alerts (already present — confirmed, not newly built) | `css/main.css` (`toast-in` keyframes) |
| 71 | Chase day summary (text, not PDF — shareable via native share sheet; already present, confirmed not newly built) | `js/ui/journal.js` (`chaseSummaryText`, "Share log" button) |
| 74 | KML chase-track export (already present — confirmed, not newly built) | `js/ui/journal.js` (`exportTrackKml`) |
| 75 | JSON storm report export | `js/ui/stormPanel.js` (`exportStormsJson`) |
| 195 | Tornado shelter locator | `js/chase/chaseSafety.js` (`SafeHavenFinder`, now wired to real GPS) |
| 173 | Hazard scale reference (tap any AI score badge — card, sheet, table — to see what the 0–100 bands mean, with a real-world example each) | `js/app.js` (`wireScoreScale`), `index.html` (`#score-scale-overlay`) |
| 140 | Font family toggle (sans-serif / serif) | `js/storage.js`, `css/main.css` (`body.serif-font`), `js/ui/settingsPanel.js` |
| 335 | Alert scheduling / quiet hours — mute sound/vibration/voice/push overnight; danger-level (TVS, tornado chance rising) still breaks through | `js/storage.js`, `js/alerts/alertEngine.js` (`isQuietHours`), `js/ui/settingsPanel.js` |
| 375, 376, 377 | Intercept confidence meter, speed recommendation, delayed-launch timer — added to the existing intercept-guidance popup | `js/ui/mapView.js` (`renderInterceptGuidance`) |
| 339 | Alert cooldown timer (already present — confirmed, not newly built; 30-min dedupe on every alert) | `js/alerts/alertEngine.js` (`once`, `DEDUPE_MS`) |
| 384, 388 | Chase decision support AI / pre-chase success prediction (already present — confirmed, not newly built) | `js/chase/chaseSafety.js` (`ChaseDecisionScore`) |
| — | Achievements/badges + day-streak (bonus, not numbered) | `js/data/stormDatabase.js` (`getAchievements`) |
| — | Basemap switcher: Topo/Satellite/OSM (bonus, not numbered) | `js/ui/mapView.js` |
| — | Mobile layout overflow fixes (tab bar, GPS chip) (bonus) | `css/main.css`, `css/ui-polish.css` |

**34 roadmap items + 3 bonus items shipped.**

Already verified as pre-existing/working (not newly built, but confirmed live):
screen wake-lock during chase (#97), metric/imperial toggle (#135), night
red-shift theme (#92), distance/bearing measure tool (#38).

## Everything else

Still open — see `STORMLENS_MASTER_ROADMAP_FINAL` for the full 350+ item list
(performance, radar/meteorology, visualization, alerts, chasing/navigation,
forecasting, safety/damage assessment, analytics, mobile, offline/resilience,
weather data sources). Community-feature items are intentionally deprioritized
per your request.

## Maintenance / audit passes

- **Tile-quilt bug fix** — the map was silently rendering two basemaps
  stacked on top of each other (a permanent full-opacity OSM layer plus
  whatever the basemap switcher had selected), causing the patchwork of
  mismatched tiles seen on a real device. Removed the stray layer and a
  redundant, conflicting Satellite toggle. See `js/ui/mapView.js`.
- **Full audit pass** (static review of every JS/CSS file + an interactive
  Playwright run through every tab, sub-tab, and toggle): fixed storm-merger
  detection that computed every cycle but was never shown to the user, a
  Data Saver toggle that didn't actually slow core data polling, five
  unbounded in-memory caches during long chase sessions, two unit-preference
  bugs (chase log export, overshoot-warning HUD), a missing Layers-panel
  toggle for the mesocyclone overlay, and removed ~40 lines of dead imports/
  computation. See commit "Audit pass: wire up dead safety data, fix memory
  growth, unit bugs" for the full list.
- **Known, deliberately untouched**: the Week 3 "Community" tab (spotter
  reports / leaderboard / shared tracking) has no submit UI anywhere, so it
  permanently shows an empty state — left alone since community features
  are explicitly deprioritized right now. An "Enhanced V2" storm-scoring
  module exists fully-written but unused; swapping it in for the live
  scoring path would need real-data validation first, so it wasn't touched.
  The Layers panel's "County boundaries" toggle (roadmap #36) turns a real
  Leaflet layer group on/off but nothing has ever populated it with county
  geometry, so switching it on currently shows nothing — needs a real county
  boundary data source wired in, held off tonight since this sandboxed
  environment has no live network to fetch/verify one against.

## Next up

Building continuously tonight — next candidates: chase corridor width
indicator, escape route planner, storm approach angle indicator, or a
radar-visualization item.
