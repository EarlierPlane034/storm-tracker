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
export function renderJournalSection(host, { onChanged }) {
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
