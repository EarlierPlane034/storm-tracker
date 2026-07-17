/** Active NWS alerts panel, sorted by severity and proximity. */
import { el, fmtDistance, haversineKm, fmtTimeLocal } from '../utils.js';
import { settings } from '../storage.js';
import { pointInGeometry } from '../analysis/stormAnalyzer.js';
import { getAlertLog, clearAlertLog } from '../alerts/alertEngine.js';

const KIND_ORDER = {
  'tor-warning': 0, 'svr-warning': 1, 'ffw-warning': 2,
  'tor-watch': 3, 'svr-watch': 4, 'ffw-watch': 5, other: 6,
};

let showHistory = false;

export function renderAlerts(alerts, user) {
  const host = document.getElementById('alert-list');
  const badge = document.getElementById('alert-badge');
  host.textContent = '';

  // Active / History switcher.
  const chips = el('div', { class: 'chat-chips', style: 'padding:0 0 8px' });
  chips.appendChild(el('button', {
    class: `chat-chip ${!showHistory ? 'chip-active' : ''}`, text: 'Active alerts',
    onclick: () => { showHistory = false; renderAlerts(alerts, user); },
  }));
  chips.appendChild(el('button', {
    class: `chat-chip ${showHistory ? 'chip-active' : ''}`, text: '🕓 Event history',
    onclick: () => { showHistory = true; renderAlerts(alerts, user); },
  }));
  host.appendChild(chips);

  if (showHistory) {
    renderHistory(host, () => renderAlerts(alerts, user));
    return;
  }

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

    const times = el('div', { class: 'alert-times' });
    if (a.ends) {
      const cd = el('span', { class: 'countdown', 'data-ends': String(a.ends.getTime()) });
      cd.textContent = countdownText(a.ends);
      times.appendChild(cd);
    }
    if (user && a.geometry) {
      const d = distToAlert(a, user);
      times.appendChild(el('span', {
        text: `${a.ends ? ' · ' : ''}${d === 0 ? 'YOU ARE IN THIS ALERT' : `${fmtDistance(d, settings.units)} away`}`,
      }));
    }
    card.appendChild(times);

    // Expandable description.
    const desc = el('div', { class: 'muted', style: 'display:none;margin-top:6px;white-space:pre-wrap', text: `${a.description}\n\n${a.instruction}`.trim() });
    card.appendChild(desc);
    card.addEventListener('click', () => {
      desc.style.display = desc.style.display === 'none' ? 'block' : 'none';
    });
    host.appendChild(card);
  }
}

/** Timeline of everything the alert engine has fired — storm-day review. */
function renderHistory(host, rerender) {
  const log = getAlertLog();
  if (!log.length) {
    host.appendChild(el('div', { class: 'card muted', text: 'No events logged yet. Every alert and AI event the app fires is recorded here for reviewing a storm day afterward.' }));
    return;
  }
  let lastDay = '';
  for (const ev of [...log].reverse()) {
    const d = new Date(ev.t);
    const day = d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    if (day !== lastDay) {
      lastDay = day;
      host.appendChild(el('h4', { class: 'trend-title', style: 'margin:10px 4px 4px', text: day }));
    }
    const card = el('div', { class: `card alert-card ${ev.level === 'danger' ? 'tor' : 'svr'}`, style: 'padding:9px 12px' });
    card.appendChild(el('div', { class: 'alert-title', style: 'font-size:12.5px', text: `${fmtTimeLocal(d)} — ${ev.title}` }));
    card.appendChild(el('div', { class: 'muted', style: 'font-size:11px', text: ev.body }));
    host.appendChild(card);
  }
  host.appendChild(el('div', { class: 'setting-row' }, [
    el('label', { class: 'muted', text: `${log.length} events (last 300 kept)` }),
    el('button', {
      class: 'product-btn', text: 'Clear',
      onclick: () => { clearAlertLog(); rerender(); },
    }),
  ]));
}

function countdownText(ends) {
  const mins = Math.round((ends.getTime() - Date.now()) / 60000);
  if (mins <= 0) return `expired ${fmtTimeLocal(ends)}`;
  if (mins < 90) return `until ${fmtTimeLocal(ends)} (${mins} min left)`;
  return `until ${fmtTimeLocal(ends)}`;
}

// Live countdown refresh — one lightweight pass over rendered spans.
setInterval(() => {
  document.querySelectorAll('#alert-list .countdown').forEach((span) => {
    span.textContent = countdownText(new Date(Number(span.dataset.ends)));
  });
}, 30_000);

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
