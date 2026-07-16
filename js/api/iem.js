/**
 * Iowa Environmental Mesonet (IEM) adapter.
 * IEM republishes NOAA/NWS NEXRAD Level III products, MRMS mosaics, GOES
 * imagery, local storm reports and SPC outlooks as CORS-friendly tiles and
 * GeoJSON — the backbone of this app's radar + storm-cell intelligence.
 */
import { CONFIG } from '../config.js';
import { getJSON } from './client.js';

const IEM = CONFIG.endpoints.iem;

/**
 * NEXRAD Level III storm attribute table (cells detected by the radar
 * network's SCIT algorithm): position, motion, TVS/MESO flags, hail
 * probability/size, VIL, echo top, max reflectivity.
 */
export async function fetchStormCells() {
  const data = await getJSON(`${IEM}/geojson/nexrad_attr.geojson`, { cacheMs: 60_000 });
  const cells = [];
  for (const f of data.features || []) {
    const p = f.properties || {};
    const [lon, lat] = f.geometry?.coordinates || [];
    if (lat == null) continue;
    cells.push({
      // Stable-ish id: radar site + SCIT storm id.
      id: `${p.nexrad || '???'}-${p.storm_id || cells.length}`,
      site: p.nexrad || null,
      stormId: p.storm_id || null,
      lat, lon,
      // Motion: direction storm is moving TOWARD (SCIT drct is from-north heading).
      moveDirDeg: numOrNull(p.drct),
      moveSpeedKts: numOrNull(p.sknt),
      // Rotation flags from Level III algorithms.
      tvs: String(p.tvs || 'NONE').toUpperCase() !== 'NONE',
      meso: parseMeso(p.meso),
      // Hail: probability of hail / severe hail (%), max expected size (in).
      poh: numOrNull(p.poh),
      posh: numOrNull(p.posh),
      maxHailIn: numOrNull(p.max_size),
      // Intensity.
      vil: numOrNull(p.vil),
      maxDbz: numOrNull(p.max_dbz),
      maxDbzHeightKft: numOrNull(p.max_dbz_height),
      topKft: numOrNull(p.top),
      valid: p.valid ? new Date(p.valid) : new Date(),
    });
  }
  return cells;
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** MESO field is "NONE" or a numeric mesocyclone strength rank (1..25). */
function parseMeso(v) {
  if (v == null) return 0;
  const s = String(v).toUpperCase();
  if (s === 'NONE' || s === '') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 1; // any non-numeric flag counts as weak meso
}

/** Local Storm Reports (spotter/emergency-management reports) — last N hours. */
export async function fetchStormReports(hours = 6) {
  const data = await getJSON(
    `${IEM}/geojson/lsr.geojson?inc_ap=yes&hours=${hours}`,
    { cacheMs: 120_000 },
  );
  return (data.features || []).map((f) => {
    const p = f.properties || {};
    const [lon, lat] = f.geometry?.coordinates || [];
    return {
      lat, lon,
      type: p.typetext || p.type || 'Report',
      magnitude: p.magnitude ?? null,
      unit: p.unit || '',
      city: p.city || '',
      state: p.st || p.state || '',
      remark: p.remark || '',
      valid: p.valid ? new Date(`${p.valid}Z`) : null,
      source: p.source || '',
    };
  }).filter((r) => r.lat != null);
}

/** WSR-88D radar site catalog (for single-site products / velocity). */
let siteCache = null;
export async function fetchRadarSites() {
  if (siteCache) return siteCache;
  try {
    const data = await getJSON(`${IEM}/geojson/network/NEXRAD.geojson`, { cacheMs: 86_400_000 });
    siteCache = (data.features || []).map((f) => ({
      id: f.properties?.sid || f.id,
      name: f.properties?.sname || '',
      lat: f.geometry?.coordinates?.[1],
      lon: f.geometry?.coordinates?.[0],
    })).filter((s) => s.id && s.lat != null);
  } catch {
    // Minimal fallback so single-site mode still works offline-first.
    siteCache = [
      { id: 'KTLX', name: 'Oklahoma City', lat: 35.333, lon: -97.278 },
      { id: 'KFWS', name: 'Dallas/Ft Worth', lat: 32.573, lon: -97.303 },
      { id: 'KDDC', name: 'Dodge City', lat: 37.761, lon: -99.969 },
      { id: 'KUEX', name: 'Hastings', lat: 40.321, lon: -98.442 },
      { id: 'KDMX', name: 'Des Moines', lat: 41.731, lon: -93.723 },
      { id: 'KLSX', name: 'St Louis', lat: 38.699, lon: -90.683 },
      { id: 'KBMX', name: 'Birmingham', lat: 33.172, lon: -86.770 },
      { id: 'KFFC', name: 'Atlanta', lat: 33.363, lon: -84.566 },
      { id: 'KLOT', name: 'Chicago', lat: 41.604, lon: -88.085 },
      { id: 'KOKX', name: 'New York', lat: 40.866, lon: -72.864 },
      { id: 'KAMX', name: 'Miami', lat: 25.611, lon: -80.413 },
      { id: 'KFTG', name: 'Denver', lat: 39.786, lon: -104.546 },
      { id: 'KATX', name: 'Seattle', lat: 48.195, lon: -122.496 },
      { id: 'KMUX', name: 'San Francisco', lat: 37.155, lon: -121.898 },
      { id: 'KSOX', name: 'Los Angeles', lat: 33.818, lon: -117.636 },
    ];
  }
  return siteCache;
}

/** SPC categorical convective outlook (GeoJSON via SPC), day 1–3. */
export async function fetchSpcOutlook(day = 1) {
  try {
    const data = await getJSON(
      `${CONFIG.endpoints.spc}/day${day}otlk_cat.lyr.geojson`,
      { cacheMs: 900_000 },
    );
    return data.features || [];
  } catch {
    return [];
  }
}
