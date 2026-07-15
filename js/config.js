/**
 * Central configuration: endpoints, refresh cadence, thresholds.
 *
 * All data sources are free public services that support CORS and require
 * no API key, so there are no secrets to manage client-side. If a keyed
 * service is ever added, route it through a small server-side proxy —
 * never embed keys in this bundle.
 */
export const CONFIG = {
  app: {
    name: 'StormLens',
    version: '1.0.0',
  },

  endpoints: {
    // National Weather Service public API (alerts, stations, obs, points).
    nws: 'https://api.weather.gov',
    // Iowa Environmental Mesonet: NEXRAD/MRMS tiles, storm attributes, LSRs.
    iem: 'https://mesonet.agron.iastate.edu',
    iemTiles: 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0',
    // SPC convective outlooks (GeoJSON).
    spc: 'https://www.spc.noaa.gov/products/outlook',
    // Open-Meteo: HRRR/GFS-derived environmental parameters (CAPE, shear...).
    openMeteo: 'https://api.open-meteo.com/v1',
    // Dark basemap (Carto) + reference labels.
    basemapDark: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
    basemapLabels: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
    basemapSatellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  },

  refresh: {
    radarMs: 60_000,          // radar tile refresh cadence (user adjustable)
    cellsMs: 120_000,         // NEXRAD storm attribute cells
    alertsMs: 60_000,         // NWS alerts
    environmentMs: 900_000,   // model environment (HRRR updates hourly)
    reportsMs: 300_000,       // local storm reports
    staleAfterMs: 240_000,    // mark feed stale in the UI after this
  },

  radar: {
    frameCount: 11,           // 10 history frames + live (IEM keeps 50 min)
    frameStepMin: 5,
    animFps: 4,               // user adjustable 1..8
    defaultOpacity: 0.78,
    defaultProduct: 'CREF',
  },

  analysis: {
    monitorRadiusKm: 250,     // default storm monitoring radius around GPS
    historyMaxSamples: 48,    // per-cell trend history (~90 min at 2 min)
    // Tornado chance bands: label + representative percentage range.
    torBands: [
      { max: 5,  label: 'None',      pct: '<2%' },
      { max: 20, label: 'Very Low',  pct: '~5%' },
      { max: 40, label: 'Low',       pct: '~15%' },
      { max: 60, label: 'Moderate',  pct: '~35%' },
      { max: 80, label: 'High',      pct: '~60%' },
      { max: 100, label: 'Very High', pct: '~80%' },
    ],
  },

  network: {
    timeoutMs: 15_000,
    retries: 3,
    retryBaseMs: 1_000,       // exponential backoff base
  },

  disclaimer:
    'AI-generated interpretation of public radar and model data. It is an ' +
    'estimate, NOT an official National Weather Service warning or forecast. ' +
    'Always follow official NWS warnings and local emergency guidance.',
};
