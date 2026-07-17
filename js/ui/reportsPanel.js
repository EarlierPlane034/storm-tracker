/**
 * Reports panel — RadarScope-style storm reports view.
 *
 * Two sources, clearly labelled:
 *  - Official: NWS Local Storm Reports (trained spotters, emergency
 *    managers, law enforcement) via the IEM database feed.
 *  - Community: this household's own reports, stored in the user's
 *    Cloudflare worker (Settings → Background alerts URL) with a 24 h TTL.
 */
import { el, fmtDistance, fmtRelTime, haversineKm } from '../utils.js';
import { settings } from '../storage.js';
import { getLocation } from '../location.js';
import { showToast } from './toasts.js';

const FILTERS = [
  ['all', 'All'],
  ['tornado', '🌪 Tornado'],
  ['hail', '🧊 Hail'],
  ['wind', '💨 Wind'],
  ['flood', '💧 Flood'],
];
let activeFilter = 'all';

export function reportIcon(type) {
  return /tornado|funnel/i.test(type) ? '🌪' : /hail/i.test(type) ? '🧊'
    : /wind|wnd/i.test(type) ? '💨' : /flood|rain/i.test(type) ? '💧' : '⚠️';
}

function matchesFilter(type) {
  if (activeFilter === 'all') return true;
  const map = {
    tornado: /tornado|funnel/i, hail: /hail/i,
    wind: /wind|wnd/i, flood: /flood|rain/i,
  };
  return map[activeFilter].test(type);
}

/**
 * @param {Array} lsr        official reports from iem.fetchStormReports
 * @param {Array} community  reports from the user's worker (may be empty)
 * @param {{onSubmit, onRefresh}} handlers
 */
export function renderReports(lsr, community, { onSubmit, onRefresh }) {
  const host = document.getElementById('reports-list');
  host.textContent = '';
  const user = getLocation();

  // Filter chips.
  const chips = el('div', { class: 'chat-chips', style: 'padding:0 0 8px' });
  for (const [id, label] of FILTERS) {
    chips.appendChild(el('button', {
      class: `chat-chip ${activeFilter === id ? 'chip-active' : ''}`,
      text: label,
      onclick: () => { activeFilter = id; onRefresh(); },
    }));
  }
  host.appendChild(chips);

  // Submit-a-report card.
  const submit = el('div', { class: 'card' });
  submit.appendChild(el('h3', { text: 'Submit a spotter report' }));
  if (!settings.pushServerUrl) {
    submit.appendChild(el('div', { class: 'muted', text: 'Connect your Cloudflare worker (Settings → Background alerts) to enable your own report database. Reports you submit appear on the map for 24 h.' }));
  } else if (!user) {
    submit.appendChild(el('div', { class: 'muted', text: 'Enable location (⌖) — reports are stamped with your GPS position.' }));
  } else {
    const typeSel = el('select', {}, [
      ['Tornado', 'Funnel Cloud', 'Wall Cloud', 'Hail', 'Wind Damage', 'Flooding', 'Heavy Rain', 'Other']
        .map((t) => el('option', { value: t, text: t })),
    ].flat());
    const textIn = el('input', {
      type: 'text', placeholder: 'Details (size, damage, direction…)',
      style: 'flex:1;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px;font-size:16px',
    });
    submit.appendChild(el('div', { style: 'display:flex;gap:8px;margin-top:6px' }, [typeSel, textIn]));
    submit.appendChild(el('button', {
      class: 'product-btn', style: 'margin-top:8px;width:100%',
      text: 'Report at my location',
      onclick: () => onSubmit(typeSel.value, textIn.value.trim(), () => { textIn.value = ''; }),
    }));
    submit.appendChild(el('div', { class: 'muted', style: 'font-size:10px;margin-top:4px', text: 'Only report what you can visually confirm. For life-threatening events call 911 first; your NWS office also takes reports at weather.gov/spotter.' }));
  }
  host.appendChild(submit);

  // Merge, tag, sort by distance (or recency without GPS).
  const rows = [
    ...community.map((r) => ({ ...r, source: 'community', valid: new Date(r.t) })),
    ...lsr.map((r) => ({ ...r, source: 'official' })),
  ].filter((r) => r.lat != null && matchesFilter(r.type));

  for (const r of rows) {
    r.distKm = user ? haversineKm(user.lat, user.lon, r.lat, r.lon) : null;
  }
  rows.sort((a, b) => (a.distKm ?? 1e9) - (b.distKm ?? 1e9) || (b.valid?.getTime?.() ?? 0) - (a.valid?.getTime?.() ?? 0));

  host.appendChild(el('h4', { class: 'trend-title', style: 'margin:12px 4px 6px', text: `${rows.length} report${rows.length === 1 ? '' : 's'} (last 6 h official · 24 h community)` }));
  if (!rows.length) {
    host.appendChild(el('div', { class: 'card muted', text: 'No storm reports match this filter right now. Reports appear here as spotters file them with the NWS.' }));
    return;
  }

  for (const r of rows.slice(0, 120)) {
    const card = el('div', { class: 'card report-card' });
    const head = el('div', { class: 'storm-card-head' });
    head.appendChild(el('div', {}, [
      el('div', { class: 'alert-title', text: `${reportIcon(r.type)} ${r.type}${r.magnitude ? ` — ${r.magnitude} ${r.unit || ''}` : ''}` }),
      el('div', { class: 'storm-meta', text: `${r.city ? `${r.city}, ${r.state}` : `${r.lat.toFixed(2)}, ${r.lon.toFixed(2)}`}${r.valid ? ` · ${fmtRelTime(r.valid)}` : ''}` }),
    ]));
    head.appendChild(el('div', { style: 'text-align:right' }, [
      r.distKm != null ? el('div', { class: 'muted', style: 'font-family:var(--mono);font-size:11px', text: fmtDistance(r.distKm, settings.units) }) : null,
      el('span', {
        class: 'risk-chip ' + (r.source === 'official' ? 'on-low' : 'on-med'),
        text: r.source === 'official' ? 'NWS LSR' : 'community',
      }),
    ]));
    card.appendChild(head);
    const remark = r.source === 'official' ? r.remark : r.text;
    if (remark) card.appendChild(el('div', { class: 'muted', style: 'margin-top:4px;font-size:11.5px', text: String(remark).slice(0, 220) }));
    host.appendChild(card);
  }
}

/** POST a community report to the user's worker. */
export async function submitReport(type, text, done) {
  const user = getLocation();
  if (!settings.pushServerUrl || !user) return;
  try {
    const res = await fetch(`${settings.pushServerUrl}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, text, lat: user.lat, lon: user.lon }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast('✅ Report saved to your database — it will show on the map for 24 h.');
    done?.();
  } catch (err) {
    showToast(`Couldn't submit the report (${err.message}). Check your worker URL in Settings.`, { level: 'warn' });
  }
}

/** Fetch community reports from the user's worker (empty if not set up). */
export async function fetchCommunityReports() {
  if (!settings.pushServerUrl) return [];
  try {
    const res = await fetch(`${settings.pushServerUrl}/reports`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.reports || [];
  } catch {
    return [];
  }
}
