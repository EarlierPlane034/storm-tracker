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
| 195 | Tornado shelter locator | `js/chase/chaseSafety.js` (`SafeHavenFinder`, now wired to real GPS) |
| — | Achievements/badges + day-streak (bonus, not numbered) | `js/data/stormDatabase.js` (`getAchievements`) |
| — | Basemap switcher: Topo/Satellite/OSM (bonus, not numbered) | `js/ui/mapView.js` |
| — | Mobile layout overflow fixes (tab bar, GPS chip) (bonus) | `css/main.css`, `css/ui-polish.css` |

**24 roadmap items + 3 bonus items shipped.**

Already verified as pre-existing/working (not newly built, but confirmed live):
screen wake-lock during chase (#97), metric/imperial toggle (#135), night
red-shift theme (#92), distance/bearing measure tool (#38).

## Everything else

Still open — see `STORMLENS_MASTER_ROADMAP_FINAL` for the full 350+ item list
(performance, radar/meteorology, visualization, alerts, chasing/navigation,
forecasting, safety/damage assessment, analytics, mobile, offline/resilience,
weather data sources). Community-feature items are intentionally deprioritized
per your request.

## Next up

Not decided yet — will pick from the remaining list next round.
