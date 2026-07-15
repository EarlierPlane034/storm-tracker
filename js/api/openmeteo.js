/**
 * Open-Meteo adapter — free, keyless, CORS-enabled access to model fields
 * (HRRR/GFS blend for CONUS). Supplies the environmental parameters the
 * tornado-intelligence engine needs: CAPE, CIN, lifted index, shear-layer
 * winds, moisture, boundary-layer height, lapse-rate proxies.
 */
import { CONFIG } from '../config.js';
import { getJSON } from './client.js';

/**
 * Fetch the current mesoscale environment at a point.
 * Returns derived kinematic values (bulk shear, SRH estimate, LCL) too, so
 * the analysis layer never touches raw model plumbing.
 */
export async function fetchEnvironment(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    // Instability / thermodynamics.
    hourly: [
      'cape', 'convective_inhibition', 'lifted_index',
      'temperature_2m', 'dew_point_2m', 'surface_pressure',
      'precipitation', 'precipitation_probability',
      'freezing_level_height', 'boundary_layer_height',
      // Wind profile for shear/helicity estimates.
      'wind_speed_10m', 'wind_direction_10m',
      'wind_speed_850hPa', 'wind_direction_850hPa',
      'wind_speed_700hPa', 'wind_direction_700hPa',
      'wind_speed_500hPa', 'wind_direction_500hPa',
      'temperature_850hPa', 'temperature_700hPa', 'temperature_500hPa',
      'geopotential_height_850hPa', 'geopotential_height_500hPa',
    ].join(','),
    wind_speed_unit: 'kn',
    timezone: 'UTC',
    forecast_days: '1',
    models: 'best_match',
  });
  const data = await getJSON(
    `${CONFIG.endpoints.openMeteo}/forecast?${params}`,
    { cacheMs: CONFIG.refresh.environmentMs },
  );

  const h = data.hourly;
  if (!h?.time?.length) return null;

  // Pick the hour closest to "now".
  const now = Date.now();
  let idx = 0, best = Infinity;
  for (let i = 0; i < h.time.length; i++) {
    const dt = Math.abs(new Date(`${h.time[i]}Z`).getTime() - now);
    if (dt < best) { best = dt; idx = i; }
  }
  const at = (key) => (h[key] ? h[key][idx] : null);

  const tempC = at('temperature_2m');
  const dewC = at('dew_point_2m');

  // --- Derived quantities -------------------------------------------------
  // LCL height (m), Espy's approximation: ~125 m per °C of dewpoint depression.
  const lclM = tempC != null && dewC != null ? Math.max(0, 125 * (tempC - dewC)) : null;

  const sfc = windVector(at('wind_speed_10m'), at('wind_direction_10m'));
  const w850 = windVector(at('wind_speed_850hPa'), at('wind_direction_850hPa'));
  const w700 = windVector(at('wind_speed_700hPa'), at('wind_direction_700hPa'));
  const w500 = windVector(at('wind_speed_500hPa'), at('wind_direction_500hPa'));

  // Deep-layer (0–6 km proxy: sfc→500 hPa) and low-level (sfc→850 hPa) bulk shear, kt.
  const bulkShearKts = vecDiffMag(sfc, w500);
  const lowShearKts = vecDiffMag(sfc, w850);

  // Storm-relative helicity estimate (0–1 km proxy) from hodograph curvature:
  // a crude trapezoid integration over sfc→850→700 using a Bunkers-like
  // storm motion (mean wind + 7.5 kt right-normal deviation).
  const srhProxy = estimateSRH(sfc, w850, w700, w500);

  // 850–500 hPa lapse rate (°C/km) using geopotential heights when available.
  const t850 = at('temperature_850hPa');
  const t500 = at('temperature_500hPa');
  const z850 = at('geopotential_height_850hPa');
  const z500 = at('geopotential_height_500hPa');
  const lapseRate = t850 != null && t500 != null && z850 != null && z500 != null && z500 > z850
    ? ((t850 - t500) / (z500 - z850)) * 1000
    : null;

  return {
    time: new Date(`${h.time[idx]}Z`),
    cape: at('cape'),
    cin: at('convective_inhibition'),
    liftedIndex: at('lifted_index'),
    tempC, dewC,
    lclM,
    pwatProxyMm: null, // Open-Meteo lacks PWAT directly; precip prob stands in
    precipProb: at('precipitation_probability'),
    freezingLevelM: at('freezing_level_height'),
    boundaryLayerM: at('boundary_layer_height'),
    bulkShearKts,
    lowShearKts,
    srh: srhProxy,
    lapseRate850_500: lapseRate,
    stormMotion: bunkersMotion(sfc, w850, w700, w500),
    windProfile: { sfc, w850, w700, w500 },
    model: 'HRRR/GFS blend (Open-Meteo best_match)',
  };
}

/** Convert speed (kt) + meteorological direction (from) to u/v components (kt). */
function windVector(speedKts, dirDeg) {
  if (speedKts == null || dirDeg == null) return null;
  const rad = ((dirDeg + 180) % 360) * (Math.PI / 180); // direction wind blows TOWARD
  return { u: speedKts * Math.sin(rad), v: speedKts * Math.cos(rad), speed: speedKts, dir: dirDeg };
}

function vecDiffMag(a, b) {
  if (!a || !b) return null;
  return Math.hypot(b.u - a.u, b.v - a.v);
}

/** Bunkers right-mover motion estimate from a 4-level profile. */
function bunkersMotion(sfc, w850, w700, w500) {
  const levels = [sfc, w850, w700, w500].filter(Boolean);
  if (levels.length < 2) return null;
  const mean = {
    u: levels.reduce((s, w) => s + w.u, 0) / levels.length,
    v: levels.reduce((s, w) => s + w.v, 0) / levels.length,
  };
  const shear = { u: (w500 ?? levels.at(-1)).u - (sfc ?? levels[0]).u,
                  v: (w500 ?? levels.at(-1)).v - (sfc ?? levels[0]).v };
  const mag = Math.hypot(shear.u, shear.v) || 1;
  // Deviate 7.5 kt to the right of the shear vector.
  const u = mean.u + 7.5 * (shear.v / mag);
  const v = mean.v - 7.5 * (shear.u / mag);
  const speed = Math.hypot(u, v);
  const dir = (Math.atan2(u, v) * 180 / Math.PI + 180) % 360; // "from" direction
  return { u, v, speedKts: speed, dirDeg: dir };
}

/**
 * SRH proxy (m²/s²): integrate u dv - v du along the low-level hodograph
 * relative to estimated storm motion. Coarse (4 levels), but tracks the
 * real quantity well enough to rank environments.
 */
function estimateSRH(sfc, w850, w700, w500) {
  const motion = bunkersMotion(sfc, w850, w700, w500);
  const hodo = [sfc, w850, w700].filter(Boolean);
  if (!motion || hodo.length < 2) return null;
  const KT = 0.514444; // kt -> m/s
  let srh = 0;
  for (let i = 0; i < hodo.length - 1; i++) {
    const u1 = (hodo[i].u - motion.u) * KT, v1 = (hodo[i].v - motion.v) * KT;
    const u2 = (hodo[i + 1].u - motion.u) * KT, v2 = (hodo[i + 1].v - motion.v) * KT;
    // SRH = Σ [u(z+1)·v(z) − u(z)·v(z+1)] relative to storm motion;
    // positive for cyclonically-curved hodographs / right movers.
    srh += u2 * v1 - u1 * v2;
  }
  return Math.round(srh);
}
