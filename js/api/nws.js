/**
 * National Weather Service public API adapter (api.weather.gov).
 * Free, CORS-enabled, no key required. NWS asks for a descriptive UA but
 * browsers control that header; requests work without it.
 */
import { CONFIG } from '../config.js';
import { getJSON } from './client.js';

const BASE = CONFIG.endpoints.nws;

/** Active watches/warnings/advisories. Optionally filtered to a point. */
export async function fetchActiveAlerts({ lat, lon } = {}) {
  const url = lat != null
    ? `${BASE}/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`
    : `${BASE}/alerts/active?status=actual&message_type=alert`;
  const data = await getJSON(url, { cacheMs: 30_000 });
  return (data.features || []).map(normalizeAlert).filter(Boolean);
}

/** Severe-weather-relevant alerts nationwide (for map polygons). */
export async function fetchSevereAlerts() {
  const events = [
    'Tornado Warning', 'Tornado Watch',
    'Severe Thunderstorm Warning', 'Severe Thunderstorm Watch',
    'Flash Flood Warning', 'Flash Flood Watch',
    'Special Weather Statement',
  ].map(encodeURIComponent).join(',');
  const data = await getJSON(
    `${BASE}/alerts/active?status=actual&event=${events}`,
    { cacheMs: 30_000 },
  );
  return (data.features || []).map(normalizeAlert).filter(Boolean);
}

function normalizeAlert(f) {
  const p = f.properties;
  if (!p) return null;
  const event = p.event || '';
  return {
    id: p.id || f.id,
    event,
    kind: classifyEvent(event, p.description || ''),
    headline: p.headline || event,
    areaDesc: p.areaDesc || '',
    severity: p.severity,
    certainty: p.certainty,
    urgency: p.urgency,
    onset: p.onset ? new Date(p.onset) : null,
    ends: p.ends ? new Date(p.ends) : (p.expires ? new Date(p.expires) : null),
    description: p.description || '',
    instruction: p.instruction || '',
    senderName: p.senderName || 'NWS',
    geometry: f.geometry || null, // polygon when storm-based
    // Tornado emergencies are flagged in the description/parameters.
    isEmergency: /tornado emergency/i.test(p.description || '') ||
      (p.parameters?.tornadoDamageThreat || []).includes('CATASTROPHIC'),
  };
}

function classifyEvent(event, description) {
  if (/tornado warning/i.test(event)) return 'tor-warning';
  if (/tornado watch/i.test(event)) return 'tor-watch';
  if (/severe thunderstorm warning/i.test(event)) return 'svr-warning';
  if (/severe thunderstorm watch/i.test(event)) return 'svr-watch';
  if (/flash flood warning/i.test(event)) return 'ffw-warning';
  if (/flash flood watch/i.test(event)) return 'ffw-watch';
  return 'other';
}

/**
 * Official NWS point forecast bundle: 7-day periods, next-24h hourly
 * temps/precip, and the local office's Area Forecast Discussion (the
 * forecaster-written technical discussion storm chasers read daily).
 */
export async function fetchForecastBundle(lat, lon) {
  const out = { daily: [], hourly: [], afd: null, office: null };
  try {
    const pt = await getJSON(
      `${BASE}/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      { cacheMs: 3_600_000 },
    );
    const p = pt.properties || {};
    out.office = p.cwa || null;

    if (p.forecast) {
      try {
        const f = await getJSON(p.forecast, { cacheMs: 1_800_000 });
        out.daily = (f.properties?.periods || []).slice(0, 14).map((pd) => ({
          name: pd.name,
          tempF: pd.temperature,
          isDay: pd.isDaytime,
          short: pd.shortForecast,
          detailed: pd.detailedForecast,
          precip: pd.probabilityOfPrecipitation?.value ?? null,
        }));
      } catch { /* forecast grid can 500 sporadically */ }
    }

    if (p.forecastHourly) {
      try {
        const fh = await getJSON(p.forecastHourly, { cacheMs: 1_800_000 });
        out.hourly = (fh.properties?.periods || []).slice(0, 24).map((pd) => ({
          t: new Date(pd.startTime).getTime(),
          tempF: pd.temperature,
          precip: pd.probabilityOfPrecipitation?.value ?? 0,
        }));
      } catch { /* optional */ }
    }

    if (p.cwa) {
      try {
        const list = await getJSON(
          `${BASE}/products/types/AFD/locations/${p.cwa}`,
          { cacheMs: 1_800_000 },
        );
        const latest = list['@graph']?.[0];
        if (latest?.['@id']) {
          const prod = await getJSON(latest['@id'], { cacheMs: 1_800_000 });
          out.afd = {
            time: prod.issuanceTime ? new Date(prod.issuanceTime) : null,
            text: (prod.productText || '').slice(0, 20_000),
          };
        }
      } catch { /* optional */ }
    }
  } catch { /* points lookup failed; return empty bundle */ }
  return out;
}

/** Nearest observation stations to a point (METAR-style surface obs). */
export async function fetchNearbyObservations(lat, lon) {
  try {
    const pt = await getJSON(
      `${BASE}/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      { cacheMs: 3_600_000 },
    );
    const stationsUrl = pt.properties?.observationStations;
    if (!stationsUrl) return [];
    const st = await getJSON(`${stationsUrl}?limit=6`, { cacheMs: 3_600_000 });
    const results = [];
    for (const feat of (st.features || []).slice(0, 4)) {
      try {
        const obs = await getJSON(
          `${BASE}/stations/${feat.properties.stationIdentifier}/observations/latest`,
          { cacheMs: 300_000 },
        );
        const o = obs.properties;
        results.push({
          station: feat.properties.stationIdentifier,
          name: feat.properties.name,
          lat: feat.geometry.coordinates[1],
          lon: feat.geometry.coordinates[0],
          tempC: o.temperature?.value,
          dewpointC: o.dewpoint?.value,
          windDirDeg: o.windDirection?.value,
          windKmh: o.windSpeed?.value,
          gustKmh: o.windGust?.value,
          pressurePa: o.barometricPressure?.value,
          time: o.timestamp ? new Date(o.timestamp) : null,
          raw: o.rawMessage,
        });
      } catch { /* individual station failures are non-fatal */ }
    }
    return results;
  } catch {
    return [];
  }
}
