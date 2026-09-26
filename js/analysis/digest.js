/** Running daily digest — the day's peak numbers, updated once per analysis
 * cycle so opening the digest never has to re-scan the full alert log or
 * every storm's history. Persisted to localStorage and rolled over
 * automatically the first time recordDigestSample()/getDigest() notices the
 * stored day no longer matches today's date. */
const KEY = 'stormlens.digest.v1';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fresh() {
  return {
    day: today(),
    peakSevereScore: 0, peakSevereStormId: null,
    peakTornadoScore: 0, peakTornadoStormId: null, peakTornadoPct: null,
    peakHailIn: 0, peakHailStormId: null,
    torWarningIds: [], svrWarningIds: [], ffwWarningIds: [],
    stormIds: [],
  };
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.day === today()) return raw;
  } catch { /* private-browsing or corrupt save — start fresh */ }
  return fresh();
}

let state = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode — digest just won't persist */ }
}

export function recordDigestSample(analyses) {
  if (state.day !== today()) state = fresh();
  for (const a of analyses) {
    const id = a.cell.id;
    if (!state.stormIds.includes(id)) state.stormIds.push(id);
    if (a.severeScore > state.peakSevereScore) {
      state.peakSevereScore = a.severeScore; state.peakSevereStormId = id;
    }
    if (a.tornado.score > state.peakTornadoScore) {
      state.peakTornadoScore = a.tornado.score; state.peakTornadoStormId = id; state.peakTornadoPct = a.tornado.pct;
    }
    if (a.cell.maxHailIn > state.peakHailIn) {
      state.peakHailIn = a.cell.maxHailIn; state.peakHailStormId = id;
    }
    for (const w of a.warnings || []) {
      if (w.kind === 'tor-warning' && !state.torWarningIds.includes(id)) state.torWarningIds.push(id);
      if (w.kind === 'svr-warning' && !state.svrWarningIds.includes(id)) state.svrWarningIds.push(id);
      if (w.kind === 'ffw-warning' && !state.ffwWarningIds.includes(id)) state.ffwWarningIds.push(id);
    }
  }
  save();
}

export function getDigest() {
  if (state.day !== today()) state = fresh();
  return state;
}

export function clearDigest() {
  state = fresh();
  save();
}
