/**
 * Storm list panel (ranked most→least dangerous) and the tap-to-open storm
 * detail sheet with full stats, AI narrative, tornado meter and trend charts.
 */
import { el, escapeHtml, fmtDistance, fmtSpeed, fmtHailSize, compassDir, fmtRelTime, severityColor, downloadFile } from '../utils.js';
import { settings, setSetting } from '../storage.js';
import { CONFIG } from '../config.js';
import { getHistory } from '../analysis/trends.js';
import { stormSummary, tornadoStatement, changeExplanation, technicalReadout } from '../analysis/narrative.js';
import { attachTrendInteraction, SERIES_COLORS } from './trendChart.js';
import { getState } from '../api/sources.js';
import { showToast } from './toasts.js';
import { selectStormForComparison } from './stormComparison.js';

export const scoreClass = (s) =>
  s >= 81 ? 'score-extreme' : s >= 61 ? 'score-high' : s >= 41 ? 'score-elev' : s >= 21 ? 'score-low' : 'score-verylow';

const riskClass = (s) => (s >= 61 ? 'on-high' : s >= 35 ? 'on-med' : s >= 15 ? 'on-low' : '');

const LIFECYCLE_LABEL = { newborn: '🆕 Newborn', growing: '📈 Growing', mature: '⬤ Mature', weakening: '📉 Weakening' };

function toggleBookmark(stormId) {
  const ids = settings.bookmarkedStormIds;
  const next = ids.includes(stormId) ? ids.filter((id) => id !== stormId) : [...ids, stormId];
  setSetting('bookmarkedStormIds', next);
}

/** True once a scan's timestamp is old enough that the UI should flag it. */
const isStale = (valid) => !!valid && Date.now() - valid.getTime() > CONFIG.refresh.staleAfterMs;

/** Dense comparison table of every visible storm — roadmap #30. */
function renderHazardMatrix(analyses, onSelect) {
  const wrap = el('div', { class: 'card', style: 'overflow-x:auto; padding:8px' });
  const table = el('table', { class: 'hazard-matrix' });
  table.appendChild(el('thead', {}, [
    el('tr', {}, [
      'Storm', 'Dist', 'Score', 'TOR%', 'Hail', 'Wind', 'LTG',
    ].map((h) => el('th', { text: h }))),
  ]));
  const tbody = el('tbody');
  for (const a of analyses.slice(0, 60)) {
    const c = a.cell;
    const tr = el('tr', { style: 'cursor:pointer' });
    tr.addEventListener('click', () => onSelect(a));
    tr.appendChild(el('td', { html: `<strong>${escapeHtml(a.type.label)}</strong><span class="hint">${escapeHtml(c.id)}</span>` }));
    tr.appendChild(el('td', { text: a.userRel ? fmtDistance(a.userRel.distKm, settings.units) : '—' }));
    tr.appendChild(el('td', {
      html: `<span class="score-pill ${scoreClass(a.severeScore)}" style="font-size:12px;padding:2px 7px">${a.severeScore}</span>`,
    }));
    tr.appendChild(el('td', { text: `${a.tornado.score}%` }));
    tr.appendChild(el('td', { text: c.maxHailIn != null ? fmtHailSize(c.maxHailIn, settings.units) : '—' }));
    tr.appendChild(el('td', { text: `${a.scores.wind}` }));
    tr.appendChild(el('td', { text: `${a.scores.lightning}` }));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

/** Structured JSON of every visible storm — roadmap #75, for import into a
 * spreadsheet or external analysis tool. */
function exportStormsJson(analyses) {
  const rows = analyses.map((a) => ({
    id: a.cell.id,
    type: a.type.label,
    lat: a.cell.lat,
    lon: a.cell.lon,
    validTime: a.cell.valid ? a.cell.valid.toISOString() : null,
    severeScore: a.severeScore,
    tornadoPct: a.tornado.score,
    hailIn: a.cell.maxHailIn ?? null,
    windScore: a.scores.wind,
    lightningScore: a.scores.lightning,
    maxDbz: a.cell.maxDbz,
    topKft: a.cell.topKft,
    vil: a.cell.vil,
    moveDirDeg: a.cell.moveDirDeg ?? null,
    moveSpeedKts: a.cell.moveSpeedKts ?? null,
    distanceKm: a.userRel ? a.userRel.distKm : null,
  }));
  const payload = { exportedAt: new Date().toISOString(), units: 'metric (raw values; km/kt/inches as noted)', storms: rows };
  downloadFile(JSON.stringify(payload, null, 2), `stormlens-storms-${Date.now()}.json`, 'application/json');
  showToast(`Exported ${rows.length} storm${rows.length === 1 ? '' : 's'} as JSON.`);
}

export function renderStormList(analyses, { onSelect, hiddenCount = 0 }) {
  const host = document.getElementById('storm-list');
  host.textContent = '';

  // Explain the numbers once, right where people look for them.
  host.appendChild(el('div', {
    class: 'muted', style: 'margin: 0 2px 10px; font-size: 11.5px',
    text: 'The number on each storm here — and on each circle on the map — is its AI Severe Score (0–100: how dangerous the storm looks right now). Tap a storm to zoom the map to it and see full details.',
  }));

  host.appendChild(el('div', { class: 'view-toggle', style: 'display:flex; gap:6px; margin: 0 2px 10px' }, [
    el('button', {
      class: settings.stormListView === 'table' ? 'product-btn' : 'product-btn active',
      text: 'Cards',
      onclick: () => { setSetting('stormListView', 'cards'); renderStormList(analyses, { onSelect, hiddenCount }); },
    }),
    el('button', {
      class: settings.stormListView === 'table' ? 'product-btn active' : 'product-btn',
      text: 'Table',
      onclick: () => { setSetting('stormListView', 'table'); renderStormList(analyses, { onSelect, hiddenCount }); },
    }),
    analyses.length ? el('button', {
      class: 'product-btn', text: '⬇ Export JSON', style: 'margin-left:auto',
      onclick: () => exportStormsJson(analyses),
    }) : null,
  ]));

  if (settings.stormListView === 'table' && analyses.length) {
    host.appendChild(renderHazardMatrix(analyses, onSelect));
    return;
  }

  if (settings.bookmarkedStormIds.length) {
    const pinnedCard = el('div', { class: 'card' });
    pinnedCard.appendChild(el('h3', { text: '📌 Pinned storms' }));
    for (const id of settings.bookmarkedStormIds) {
      const live = analyses.find((a) => a.cell.id === id);
      const row = el('div', { class: 'setting-row', style: 'padding:6px 0' });
      row.appendChild(el('label', {
        style: live ? 'cursor:pointer' : '',
        text: live ? `${id} — score ${live.severeScore}, ${motionText(live.cell)}` : `${id} — no longer detected`,
        onclick: live ? () => onSelect(live) : null,
      }));
      row.appendChild(el('button', {
        class: 'icon-btn', text: '✕', 'aria-label': 'Unpin',
        onclick: () => { toggleBookmark(id); renderStormList(analyses, { onSelect, hiddenCount }); },
      }));
      pinnedCard.appendChild(row);
    }
    host.appendChild(pinnedCard);
  }

  if (!analyses.length) {
    host.appendChild(el('div', { class: 'card muted', text: 'No storm cells are currently being detected by the NEXRAD network in range. The AI keeps watching and will rank storms here the moment cells appear.' }));
    if (hiddenCount > 0) {
      host.appendChild(el('div', { class: 'card muted', text: `${hiddenCount} storm${hiddenCount === 1 ? ' is' : 's are'} hidden by your display filters (Settings → AI analyst).` }));
    }
    return;
  }

  const shown = analyses.slice(0, 60);
  for (const a of shown) {
    const c = a.cell;
    const card = el('div', { class: 'card storm-card' });
    card.addEventListener('click', () => onSelect(a));

    const head = el('div', { class: 'storm-card-head' });
    head.appendChild(el('div', {}, [
      el('div', { class: 'storm-id', text: `#${a.rank}  ${c.id}${a.rapidIntensification ? ' ⚡' : ''}` }),
      el('div', { class: 'storm-meta', text: `${a.type.label} · ${LIFECYCLE_LABEL[a.lifecycle] || ''} · ${motionText(c)}${a.userRel ? ` · ${fmtDistance(a.userRel.distKm, settings.units)} away` : ''}` }),
      isStale(c.valid) ? el('div', { class: 'stale-tag', text: `⏱ stale — last scan ${fmtRelTime(c.valid)}` }) : null,
    ]));
    const trendArrow = a.trend.label === 'strengthening' ? '▲' : a.trend.label === 'weakening' ? '▼' : '—';
    const trendCls = a.trend.label === 'strengthening' ? 'trend-up' : a.trend.label === 'weakening' ? 'trend-down' : 'trend-flat';

    const scoreSection = el('div', { style: 'display:flex;align-items:center;gap:8px' });
    scoreSection.appendChild(el('span', { class: `trend-arrow ${trendCls}`, text: trendArrow }));
    scoreSection.appendChild(el('span', { class: `score-pill ${scoreClass(a.severeScore)}`, text: String(a.severeScore) }));

    // === NEW: Compare button ===
    const compareBtn = el('button', {
      class: 'storm-compare-btn',
      text: '⚖️',
      title: 'Add to comparison'
    });
    compareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectStormForComparison(a);
    });
    scoreSection.appendChild(compareBtn);

    const isPinned = settings.bookmarkedStormIds.includes(c.id);
    const pinBtn = el('button', {
      class: 'storm-compare-btn',
      text: isPinned ? '📌' : '📍',
      title: isPinned ? 'Unpin storm' : 'Pin storm',
    });
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleBookmark(c.id);
      renderStormList(analyses, { onSelect, hiddenCount });
    });
    scoreSection.appendChild(pinBtn);

    head.appendChild(scoreSection);
    card.appendChild(head);

    const risks = el('div', { class: 'risk-row' });
    const chips = [
      ['TOR', a.tornado.score], ['HAIL', a.scores.hail], ['WIND', a.scores.wind],
      ['FLOOD', a.scores.flood], ['LTG', a.scores.lightning],
    ];
    for (const [label, s] of chips) {
      risks.appendChild(el('span', { class: `risk-chip ${riskClass(s)}`, text: `${label} ${Math.round(s)}` }));
    }
    card.appendChild(risks);

    // One-line "why it's ranked here".
    if (a.factors.length) {
      card.appendChild(el('div', { class: 'muted', style: 'margin-top:6px', text: `Why: ${a.factors[0].text}.` }));
    }
    host.appendChild(card);
  }

  if (hiddenCount > 0) {
    host.appendChild(el('div', {
      class: 'muted', style: 'text-align:center; padding: 8px; font-size: 11.5px',
      text: `${hiddenCount} weaker storm${hiddenCount === 1 ? '' : 's'} hidden by your display filters (Settings → AI analyst).`,
    }));
  }
}

/** Hooks the app wires up once (ghost marker on the map, etc.). */
let sheetHooks = {};
export function configureStormSheet(hooks) {
  sheetHooks = hooks || {};
}

/** Full-detail bottom sheet for one storm. */
export function openStormSheet(a) {
  const sheet = document.getElementById('storm-sheet');
  const body = document.getElementById('storm-sheet-body');
  body.textContent = '';
  sheet.hidden = false;
  sheetHooks.ghost?.(null);

  const c = a.cell;
  const env = getState().environment;

  // Header row (with share).
  body.appendChild(el('div', { class: 'storm-card-head' }, [
    el('div', {}, [
      el('div', { class: 'storm-id', style: 'font-size:16px', text: c.id }),
      el('div', {
        class: `storm-meta${isStale(c.valid) ? ' stale-tag' : ''}`,
        text: `${a.type.label} · scanned ${c.valid ? fmtRelTime(c.valid) : 'now'}${isStale(c.valid) ? ' (stale)' : ''} · confidence ${a.confidence}`,
      }),
    ]),
    el('div', { style: 'display:flex;align-items:center;gap:8px' }, [
      el('button', { class: 'icon-btn', text: '📤', 'aria-label': 'Share storm', onclick: () => shareStorm(a) }),
      el('button', { class: 'icon-btn', text: '🖼️', 'aria-label': 'Share scorecard image', onclick: () => shareScorecard(a) }),
      el('span', { class: `score-pill ${scoreClass(a.severeScore)}`, text: `${a.severeScore}` }),
    ]),
  ]));
  body.appendChild(el('div', { class: 'muted', style: 'margin:4px 0 8px', text: a.type.desc }));

  // AI narrative.
  const ai = el('div', { class: 'ai-block' });
  ai.appendChild(el('p', { text: stormSummary(a) }));
  const change = changeExplanation(a);
  if (change) ai.appendChild(el('p', { style: 'margin-top:6px', text: change }));
  body.appendChild(ai);

  // Tornado meter.
  body.appendChild(buildTornadoMeter(a));

  // Score breakdown: which hazards are driving the headline number.
  body.appendChild(el('h4', { class: 'trend-title', style: 'margin-top:10px', text: `Why ${a.severeScore}/100 — score breakdown` }));
  const breakdown = el('div', { class: 'breakdown' });
  const bars = [
    ['Rotation', a.scores.rotation, SERIES_COLORS.rotation],
    ['Hail', a.scores.hail, SERIES_COLORS.hail],
    ['Wind', a.scores.wind, SERIES_COLORS.wind],
    ['Flooding', a.scores.flood, SERIES_COLORS.rain],
    ['Lightning', a.scores.lightning, SERIES_COLORS.lightning],
    ['Organization', a.scores.organization, SERIES_COLORS.organization],
  ];
  for (const [label, val, color] of bars) {
    breakdown.appendChild(el('div', { class: 'break-row' }, [
      el('span', { class: 'break-label', text: label }),
      el('div', { class: 'break-track' }, [
        el('div', { class: 'break-fill', style: `width:${Math.round(val)}%;background:${color}` }),
      ]),
      el('span', { class: 'break-val', text: String(Math.round(val)) }),
    ]));
  }
  const tc = a.tornado.components;
  breakdown.appendChild(el('div', {
    class: 'muted', style: 'font-size:11px;margin-top:4px',
    text: `Tornado score ingredients — radar rotation ${tc.radar}/45 · environment ${tc.environment}/35 · trend ${tc.trend}/10 · official context ${tc.context}/10`,
  }));
  body.appendChild(breakdown);

  // Stat grid.
  const stats = el('div', { class: 'stat-grid' });
  const add = (k, v) => stats.appendChild(el('div', { class: 'stat' }, [
    el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v ?? '—' }),
  ]));
  add('Movement', motionText(c));
  add('Distance', a.userRel ? fmtDistance(a.userRel.distKm, settings.units) : 'no GPS');
  add('Arrival', a.userRel?.etaMin != null ? `~${a.userRel.etaMin} min` : 'not toward you');
  add('Max dBZ', c.maxDbz != null ? `${c.maxDbz}` : null);
  add('Echo top', c.topKft != null ? `${c.topKft} kft` : null);
  add('VIL', c.vil != null ? `${c.vil} kg/m²` : null);
  add('Hail est.', c.maxHailIn != null ? fmtHailSize(c.maxHailIn, settings.units) : null);
  add('POSH', c.posh != null ? `${c.posh}%` : null);
  add('Rotation', c.tvs ? 'TVS!' : c.meso > 0 ? `meso r${c.meso}` : 'none');
  add('Persistence', `${a.persistence} scans`);
  add('Severe chance', `${a.severeScore}%-ile`);
  add('Lifecycle', LIFECYCLE_LABEL[a.lifecycle] || a.lifecycle);
  add('Radar', c.site);
  if (a.rapidIntensification) {
    add('⚡ Alert', 'Rapidly intensifying');
  }
  body.appendChild(stats);

  // Active warnings on this storm.
  if (a.warnings.length) {
    const wcard = el('div', { class: 'card alert-card ' + (a.warnings.some((w) => w.kind === 'tor-warning') ? 'tor' : 'svr') });
    wcard.appendChild(el('div', { class: 'alert-title', text: a.warnings.map((w) => w.event).join(' · ') }));
    body.appendChild(wcard);
  }

  // Trend charts.
  body.appendChild(el('h4', { class: 'trend-title', style: 'margin-top:10px', text: 'Trends (this storm, radar history)' }));
  const hist = getHistory(c.id);
  const charts = [
    ['Strength (max dBZ)', 'maxDbz', SERIES_COLORS.strength, ' dBZ'],
    ['Rotation (meso rank)', 'meso', SERIES_COLORS.rotation, ''],
    ['Hail (POSH %)', 'posh', SERIES_COLORS.hail, '%'],
    ['Cell VIL (wind/hail fuel)', 'vil', SERIES_COLORS.wind, ''],
    ['Echo top (lightning proxy)', 'topKft', SERIES_COLORS.lightning, ' kft'],
  ];
  for (const [title, field, color, unit] of charts) {
    const samples = hist.filter((s) => s[field] != null).map((s) => ({ t: s.t, v: Number(s[field]) || 0 }));
    if (samples.length < 2) continue;
    body.appendChild(el('div', { class: 'trend-title', text: title }));
    const canvas = el('canvas', { class: 'trend-chart' });
    body.appendChild(canvas);
    requestAnimationFrame(() => attachTrendInteraction(canvas, samples, { color, unit }));
  }
  if (hist.length < 2) {
    body.appendChild(el('div', { class: 'muted', text: 'Trend charts appear after this storm has been observed for a few scans.' }));
  }

  // Storm history scrubber: replay this storm's own past on the map.
  if (hist.length >= 3) {
    body.appendChild(el('h4', { class: 'trend-title', style: 'margin-top:10px', text: 'Replay this storm' }));
    const readout = el('div', { class: 'muted', style: 'font-family:var(--mono);font-size:11px' });
    const scrub = el('input', {
      type: 'range', min: '0', max: String(hist.length - 1),
      value: String(hist.length - 1), style: 'width:100%;accent-color:#38bdf8',
      oninput: (e) => {
        const s = hist[Number(e.target.value)];
        if (!s) return;
        const when = new Date(s.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        readout.textContent = `${when} — ${s.maxDbz ?? '—'} dBZ · VIL ${s.vil ?? '—'} · meso ${s.meso || 'none'}${s.tvs ? ' · TVS' : ''}`;
        if (s.lat != null) sheetHooks.ghost?.([s.lat, s.lon]);
      },
    });
    scrub.dispatchEvent(new Event('input'));
    body.appendChild(scrub);
    body.appendChild(readout);
    body.appendChild(el('div', { class: 'muted', style: 'font-size:10.5px', text: 'Drag to see where the storm was and how strong it looked — a white dashed circle marks its past position on the map.' }));
  }

  // Technical readout (optional).
  if (settings.showTechnical) {
    body.appendChild(el('h4', { class: 'trend-title', style: 'margin-top:10px', text: 'Technical readout' }));
    const grid = el('div', { class: 'stat-grid' });
    for (const [k, v] of technicalReadout(a, env)) {
      grid.appendChild(el('div', { class: 'stat' }, [
        el('div', { class: 'k', text: k }), el('div', { class: 'v', style: 'font-size:12px', text: String(v) }),
      ]));
    }
    body.appendChild(grid);
  }

  body.appendChild(el('div', {
    class: 'ai-disclaimer',
    text: 'All scores and chances above are automated estimates from public radar and model data — not official NWS forecasts or warnings.',
  }));
}

export function buildTornadoMeter(a) {
  const t = a.tornado;
  const wrap = el('div', { class: 'tor-meter' });
  const fillColor = t.score >= 81 ? '#e879f9' : t.score >= 61 ? '#ef4444' : t.score >= 41 ? '#fb923c' : t.score >= 21 ? '#fbbf24' : '#64748b';
  wrap.appendChild(el('div', { class: 'tor-meter-label' }, [
    el('span', { html: `<strong>Tornado chance: ${escapeHtml(t.label)}</strong> (${escapeHtml(t.pct)} in ~${t.windowMin} min)` }),
    el('span', { text: `${t.score}/100` }),
  ]));
  const track = el('div', { class: 'tor-meter-track' });
  track.appendChild(el('div', { class: 'tor-meter-fill', style: `width:${t.score}%;background:${fillColor}` }));
  wrap.appendChild(track);
  wrap.appendChild(el('p', { class: 'ai-block', style: 'margin-top:6px', text: tornadoStatement(a) }));
  return wrap;
}

function motionText(c) {
  if (c.moveDirDeg == null || c.moveSpeedKts == null) return 'motion unknown';
  return `${compassDir(c.moveDirDeg)} @ ${fmtSpeed(c.moveSpeedKts, settings.units)}`;
}

/** Share a storm summary via the system share sheet (clipboard fallback). */
async function shareStorm(a) {
  const c = a.cell;
  const text =
    `⛈ ${a.type.label} (${a.cell.id}) — StormLens severe score ${a.severeScore}/100. ` +
    `Tornado chance: ${a.tornado.label} (${a.tornado.pct}). ` +
    `Moving ${c.moveDirDeg != null ? compassDir(c.moveDirDeg) : '?'} at ${c.moveSpeedKts != null ? fmtSpeed(c.moveSpeedKts, settings.units) : '?'}. ` +
    `Unofficial AI estimate — follow NWS warnings. ${location.origin}${location.pathname}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'StormLens storm report', text });
      return;
    }
    await navigator.clipboard.writeText(text);
    showToast('Storm summary copied to the clipboard.');
  } catch { /* user cancelled the share sheet */ }
}

/** Render a shareable PNG "scorecard" for one storm — ID, scores, timestamp. */
async function shareScorecard(a) {
  const c = a.cell;
  const W = 800, H = 1000;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('⛈ StormLens', 40, 60);
  ctx.fillStyle = '#8b97a5';
  ctx.font = '14px monospace';
  ctx.fillText(new Date().toLocaleString(), 40, 86);

  ctx.fillStyle = '#e5eaf0';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText(c.id, 40, 160);
  ctx.font = '20px sans-serif';
  ctx.fillStyle = '#8b97a5';
  ctx.fillText(a.type.label, 40, 192);

  // Big severity score circle.
  const color = severityColor(a.severeScore);
  ctx.beginPath();
  ctx.arc(W / 2, 340, 130, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = a.severeScore >= 41 && a.severeScore < 61 ? '#04121a' : '#ffffff';
  ctx.font = 'bold 90px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(String(a.severeScore), W / 2, 365);
  ctx.font = '18px sans-serif';
  ctx.fillText('SEVERE SCORE', W / 2, 400);
  ctx.textAlign = 'left';

  // Hazard bars.
  const bars = [
    ['Tornado', a.tornado.score], ['Hail', a.scores.hail], ['Wind', a.scores.wind],
    ['Flood', a.scores.flood], ['Lightning', a.scores.lightning],
  ];
  let y = 560;
  for (const [label, score] of bars) {
    ctx.fillStyle = '#8b97a5';
    ctx.font = '16px sans-serif';
    ctx.fillText(label, 40, y);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(180, y - 16, 580, 18);
    ctx.fillStyle = severityColor(score);
    ctx.fillRect(180, y - 16, 580 * (Math.min(100, score) / 100), 18);
    ctx.fillStyle = '#e5eaf0';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(String(Math.round(score)), 770 - ctx.measureText(String(Math.round(score))).width, y - 2);
    y += 46;
  }

  ctx.fillStyle = '#e5eaf0';
  ctx.font = '16px sans-serif';
  ctx.fillText(`Movement: ${motionText(c)}`, 40, y + 20);
  if (c.maxDbz != null) ctx.fillText(`Max reflectivity: ${c.maxDbz} dBZ`, 40, y + 50);

  ctx.fillStyle = '#64748b';
  ctx.font = '12px sans-serif';
  wrapText(ctx, 'AI-generated interpretation of public radar data — NOT an official NWS warning or forecast.', 40, H - 40, W - 80, 16);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const file = new File([blob], `stormlens-${c.id}.png`, { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `StormLens — ${c.id}` });
      return;
    }
  } catch { /* fall through to download */ }
  downloadFile(blob, `stormlens-${c.id}.png`);
  showToast('Scorecard image saved.');
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

/** Wire up sheet dismissal once. */
export function initStormSheet() {
  const sheet = document.getElementById('storm-sheet');
  const close = () => {
    sheetHooks.ghost?.(null);
    sheet.classList.add('closing');
    setTimeout(() => { sheet.hidden = true; sheet.classList.remove('closing'); }, 180);
  };
  sheet.querySelector('.sheet-grab').addEventListener('click', close);
  let startY = null;
  sheet.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (startY != null && e.touches[0].clientY - startY > 90 && sheet.querySelector('.sheet-body').scrollTop === 0) {
      close();
      startY = null;
    }
  }, { passive: true });
}
