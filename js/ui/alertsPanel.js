/** Active NWS alerts panel, sorted by severity and proximity. */
import { el, fmtDistance, haversineKm, fmtTimeLocal } from '../utils.js';
import { settings } from '../storage.js';
import { pointInGeometry } from '../analysis/stormAnalyzer.js';

const KIND_ORDER = {
  'tor-warning': 0, 'svr-warning': 1, 'ffw-warning': 2,
  'tor-watch': 3, 'svr-watch': 4, 'ffw-watch': 5, other: 6,
};

export function renderAlerts(alerts, user) {
  const host = document.getElementById('alert-list');
  const badge = document.getElementById('alert-badge');
  host.textContent = '';

  const sorted = [...alerts].sort((a, b) => {
    const k = (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9);
    if (k !== 0) return k;
    if (user) return distToAlert(a, user) - distToAlert(b, user);
    return 0;
  });

  const warningCount = sorted.filter((a) => a.kind.endsWith('warning')).length;
  badge.hidden = warningCount === 0;
  badge.textContent = String(warningCount);

  if (!sorted.length) {
    host.appendChild(el('div', { class: 'card muted', text: 'No severe weather watches or warnings are active in the monitored feed.' }));
    return;
  }

  for (const a of sorted.slice(0, 80)) {
    const cls = a.kind.startsWith('tor') ? 'tor' : a.kind.startsWith('svr') ? 'svr' : a.kind.startsWith('ffw') ? 'ffw' : '';
    const card = el('div', { class: `card alert-card ${cls}` });
    card.appendChild(el('div', { class: 'alert-title', text: a.isEmergency ? `⚠️ ${a.event} — EMERGENCY` : a.event }));
    card.appendChild(el('div', { class: 'alert-area', text: a.areaDesc }));

    const bits = [];
    if (a.ends) bits.push(`until ${fmtTimeLocal(a.ends)}`);
    if (user && a.geometry) {
      const d = distToAlert(a, user);
      bits.push(d === 0 ? 'YOU ARE IN THIS ALERT' : `${fmtDistance(d, settings.units)} away`);
    }
    card.appendChild(el('div', { class: 'alert-times', text: bits.join(' · ') }));

    // Expandable description.
    const desc = el('div', { class: 'muted', style: 'display:none;margin-top:6px;white-space:pre-wrap', text: `${a.description}\n\n${a.instruction}`.trim() });
    card.appendChild(desc);
    card.addEventListener('click', () => {
      desc.style.display = desc.style.display === 'none' ? 'block' : 'none';
    });
    host.appendChild(card);
  }
}

/** Rough distance (km) from user to alert polygon: 0 if inside, else nearest vertex. */
export function distToAlert(alert, user) {
  if (!alert.geometry) return Infinity;
  if (pointInGeometry(user.lat, user.lon, alert.geometry)) return 0;
  let best = Infinity;
  const polys = alert.geometry.type === 'Polygon' ? [alert.geometry.coordinates]
    : alert.geometry.type === 'MultiPolygon' ? alert.geometry.coordinates : [];
  for (const poly of polys) {
    for (const [lon, lat] of poly[0] || []) {
      best = Math.min(best, haversineKm(user.lat, user.lon, lat, lon));
    }
  }
  return best;
}
