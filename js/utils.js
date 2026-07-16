/** Shared small utilities: geo math, formatting, DOM helpers. */

const R_EARTH_KM = 6371;

/** Great-circle distance in km. */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.sqrt(a));
}

/** Initial bearing in degrees from point 1 to point 2. */
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Destination point given start, bearing (deg) and distance (km). */
export function destinationPoint(lat, lon, bearing, distKm) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const d = distKm / R_EARTH_KM;
  const brg = toRad(bearing);
  const la1 = toRad(lat);
  const lo1 = toRad(lon);
  const la2 = Math.asin(
    Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(brg)
  );
  const lo2 =
    lo1 +
    Math.atan2(
      Math.sin(brg) * Math.sin(d) * Math.cos(la1),
      Math.cos(d) - Math.sin(la1) * Math.sin(la2)
    );
  return [toDeg(la2), ((toDeg(lo2) + 540) % 360) - 180];
}

export function compassDir(deg) {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

/** Unit-aware distance formatting. */
export function fmtDistance(km, units = 'imperial') {
  if (units === 'metric') return `${km.toFixed(km < 10 ? 1 : 0)} km`;
  const mi = km * 0.621371;
  return `${mi.toFixed(mi < 10 ? 1 : 0)} mi`;
}

export function fmtSpeed(kts, units = 'imperial') {
  if (units === 'metric') return `${Math.round(kts * 1.852)} km/h`;
  return `${Math.round(kts * 1.15078)} mph`;
}

export function fmtHailSize(inches, units = 'imperial') {
  if (units === 'metric') return `${(inches * 2.54).toFixed(1)} cm`;
  return `${inches.toFixed(2)}"`;
}

export function fmtTimeUTC(date) {
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}Z`;
}

export function fmtTimeLocal(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function fmtRelTime(date) {
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/** Linear interpolation of v from [inLo,inHi] to [0,outMax], clamped. */
export function scaleTo(v, inLo, inHi, outMax = 100) {
  if (v == null || Number.isNaN(v)) return 0;
  return clamp(((v - inLo) / (inHi - inLo)) * outMax, 0, outMax);
}

/** Least-squares slope of {t(ms), v} samples in units of v per minute. */
export function slopePerMinute(samples) {
  if (!samples || samples.length < 2) return 0;
  const n = samples.length;
  const t0 = samples[0].t;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const s of samples) {
    const x = (s.t - t0) / 60000;
    sx += x; sy += s.v; sxy += x * s.v; sxx += x * x;
  }
  const denom = n * sxx - sx * sx;
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}

/** Tiny DOM helpers. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.appendChild(c);
  return node;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

/**
 * Approximate sunrise/sunset (NOAA solar equations, ±2 min) for a date
 * and location. Good enough for "daylight remaining" in chase mode.
 */
export function sunTimes(lat, lon, date = new Date()) {
  const rad = Math.PI / 180;
  const dayOfYear = Math.floor(
    (date - new Date(date.getFullYear(), 0, 0)) / 86400000);
  const calc = (isSunrise) => {
    const lngHour = lon / 15;
    const t = dayOfYear + ((isSunrise ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634;
    L = ((L % 360) + 360) % 360;
    let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad;
    RA = ((RA % 360) + 360) % 360;
    RA += (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90);
    RA /= 15;
    const sinDec = 0.39782 * Math.sin(L * rad);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) /
      (cosDec * Math.cos(lat * rad));
    if (cosH > 1 || cosH < -1) return null; // polar day/night
    let H = isSunrise ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad;
    H /= 15;
    const T = H + RA - 0.06571 * t - 6.622;
    let UT = ((T - lngHour) % 24 + 24) % 24;
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCMinutes(Math.round(UT * 60));
    return d;
  };
  return { sunrise: calc(true), sunset: calc(false) };
}

export function debounce(fn, ms) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}
