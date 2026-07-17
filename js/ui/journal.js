/**
 * Chase journal: quick GPS/time-stamped notes taken from the chase HUD,
 * listed (and exportable via the share sheet) in Settings. Stored only in
 * localStorage on this device.
 */
import { el, fmtTimeLocal } from '../utils.js';
import { showToast } from './toasts.js';

const KEY = 'stormlens.journal.v1';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}

function save(notes) {
  try { localStorage.setItem(KEY, JSON.stringify(notes.slice(-200))); } catch { /* full */ }
}

export function addNote(text, loc) {
  const notes = load();
  notes.push({
    t: Date.now(),
    text: String(text).slice(0, 500),
    lat: loc?.lat ?? null,
    lon: loc?.lon ?? null,
  });
  save(notes);
  showToast('📝 Note saved to your chase journal (Settings → Chase journal).');
}

export function getNotes() {
  return load();
}

/** Render the journal section inside the Settings panel. */
export function renderJournalSection(host, { onChanged, onShowTrack }) {
  // Chase-day replay controls.
  const track = getTrack();
  host.appendChild(el('div', { class: 'setting-row' }, [
    el('label', { html: `Chase track<span class="hint">${track.length ? `${track.length} GPS points recorded while chase mode was on` : 'Turn on Chase mode to record your route'}</span>` }),
    el('div', { style: 'display:flex;gap:6px' }, [
      track.length >= 2 ? el('button', { class: 'product-btn', text: 'Replay', onclick: () => onShowTrack?.() }) : null,
      track.length ? el('button', { class: 'product-btn', text: 'Clear', onclick: () => { clearTrack(); onChanged(); } }) : null,
    ]),
  ]));
  const summary = chaseSummaryText();
  if (summary) {
    host.appendChild(el('div', { class: 'setting-row' }, [
      el('label', { class: 'muted', text: 'Share the full chase log (track + notes)' }),
      el('button', {
        class: 'product-btn', text: 'Share log',
        onclick: async () => {
          try {
            if (navigator.share) await navigator.share({ title: 'StormLens chase log', text: summary });
            else { await navigator.clipboard.writeText(summary); showToast('Chase log copied.'); }
          } catch { /* cancelled */ }
        },
      }),
    ]));
  }

  const notes = load();
  if (!notes.length) {
    host.appendChild(el('div', { class: 'muted', style: 'font-size:11px;margin:0 4px 8px', text: 'No notes yet. In Chase mode, tap 📝 on the HUD to log a time/GPS-stamped observation ("wall cloud NW of Anadarko").' }));
    return;
  }
  for (const [i, n] of [...notes.entries()].reverse().slice(0, 30)) {
    const when = new Date(n.t);
    const where = n.lat != null ? ` @ ${n.lat.toFixed(3)}, ${n.lon.toFixed(3)}` : '';
    host.appendChild(el('div', { class: 'setting-row' }, [
      el('label', { html: `${escapeText(n.text)}<span class="hint">${when.toLocaleDateString()} ${fmtTimeLocal(when)}${where}</span>` }),
      el('button', {
        class: 'icon-btn', text: '✕',
        onclick: () => {
          const all = load();
          all.splice(i, 1);
          save(all);
          onChanged();
        },
      }),
    ]));
  }
  host.appendChild(el('div', { class: 'setting-row' }, [
    el('label', { text: `${notes.length} note${notes.length === 1 ? '' : 's'} total` }),
    el('button', {
      class: 'product-btn', text: 'Export',
      onclick: async () => {
        const text = load().map((n) => {
          const gps = n.lat != null ? ` (${n.lat.toFixed(4)}, ${n.lon.toFixed(4)})` : '';
          return `${new Date(n.t).toLocaleString()}${gps}: ${n.text}`;
        }).join('\n');
        try {
          if (navigator.share) await navigator.share({ title: 'StormLens chase journal', text });
          else { await navigator.clipboard.writeText(text); showToast('Journal copied to clipboard.'); }
        } catch { /* user cancelled */ }
      },
    }),
  ]));
}

function escapeText(s) {
  return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

/* ---------------- Chase track: GPS breadcrumb while chase mode is on ---------------- */

const TRACK_KEY = 'stormlens.chasetrack.v1';
let lastTrackPoint = 0;

/** Record a breadcrumb (throttled to one point / 30 s, capped at 2000). */
export function recordTrackPoint(loc) {
  if (Date.now() - lastTrackPoint < 30_000) return;
  lastTrackPoint = Date.now();
  try {
    const track = getTrack();
    track.push({ t: Date.now(), lat: +loc.lat.toFixed(5), lon: +loc.lon.toFixed(5) });
    localStorage.setItem(TRACK_KEY, JSON.stringify(track.slice(-2000)));
  } catch { /* best effort */ }
}

export function getTrack() {
  try { return JSON.parse(localStorage.getItem(TRACK_KEY)) || []; } catch { return []; }
}

export function clearTrack() {
  try { localStorage.removeItem(TRACK_KEY); } catch { /* ok */ }
}

/** Human chase-day summary combining the track and the journal. */
export function chaseSummaryText() {
  const track = getTrack();
  const notes = getNotes();
  if (!track.length && !notes.length) return null;
  const lines = ['⛈ StormLens chase log'];
  if (track.length) {
    let km = 0;
    for (let i = 1; i < track.length; i++) {
      const a = track[i - 1], b = track[i];
      const dLat = (b.lat - a.lat) * 111, dLon = (b.lon - a.lon) * 111 * Math.cos(a.lat * Math.PI / 180);
      km += Math.hypot(dLat, dLon);
    }
    const from = new Date(track[0].t), to = new Date(track[track.length - 1].t);
    lines.push(`Track: ${track.length} points, ~${Math.round(km * 0.621)} mi, ${from.toLocaleString()} → ${to.toLocaleTimeString()}`);
  }
  for (const n of notes) {
    const gps = n.lat != null ? ` (${n.lat.toFixed(3)}, ${n.lon.toFixed(3)})` : '';
    lines.push(`${new Date(n.t).toLocaleTimeString()}${gps}: ${n.text}`);
  }
  return lines.join('\n');
}
