/**
 * Storm list panel (ranked most→least dangerous) and the tap-to-open storm
 * detail sheet with full stats, AI narrative, tornado meter and trend charts.
 */
import { el, escapeHtml, fmtDistance, fmtSpeed, fmtHailSize, compassDir, fmtRelTime } from '../utils.js';
import { settings } from '../storage.js';
import { getHistory } from '../analysis/trends.js';
import { stormSummary, tornadoStatement, changeExplanation, technicalReadout } from '../analysis/narrative.js';
import { attachTrendInteraction, SERIES_COLORS } from './trendChart.js';
import { getState } from '../api/sources.js';

const scoreClass = (s) =>
  s >= 81 ? 'score-extreme' : s >= 61 ? 'score-high' : s >= 41 ? 'score-elev' : s >= 21 ? 'score-low' : 'score-verylow';

const riskClass = (s) => (s >= 61 ? 'on-high' : s >= 35 ? 'on-med' : s >= 15 ? 'on-low' : '');

export function renderStormList(analyses, { onSelect }) {
  const host = document.getElementById('storm-list');
  host.textContent = '';

  if (!analyses.length) {
    host.appendChild(el('div', { class: 'card muted', text: 'No storm cells are currently being detected by the NEXRAD network in range. The AI keeps watching and will rank storms here the moment cells appear.' }));
    return;
  }

  const shown = analyses.slice(0, 60);
  for (const a of shown) {
    const c = a.cell;
    const card = el('div', { class: 'card storm-card' });
    card.addEventListener('click', () => onSelect(a));

    const head = el('div', { class: 'storm-card-head' });
    head.appendChild(el('div', {}, [
      el('div', { class: 'storm-id', text: `#${a.rank}  ${c.id}` }),
      el('div', { class: 'storm-meta', text: `${a.type.label} · ${motionText(c)}${a.userRel ? ` · ${fmtDistance(a.userRel.distKm, settings.units)} away` : ''}` }),
    ]));
    const trendArrow = a.trend.label === 'strengthening' ? '▲' : a.trend.label === 'weakening' ? '▼' : '—';
    const trendCls = a.trend.label === 'strengthening' ? 'trend-up' : a.trend.label === 'weakening' ? 'trend-down' : 'trend-flat';
    head.appendChild(el('div', { style: 'display:flex;align-items:center;gap:8px' }, [
      el('span', { class: `trend-arrow ${trendCls}`, text: trendArrow }),
      el('span', { class: `score-pill ${scoreClass(a.severeScore)}`, text: String(a.severeScore) }),
    ]));
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
}

/** Full-detail bottom sheet for one storm. */
export function openStormSheet(a) {
  const sheet = document.getElementById('storm-sheet');
  const body = document.getElementById('storm-sheet-body');
  body.textContent = '';
  sheet.hidden = false;

  const c = a.cell;
  const env = getState().environment;

  // Header row.
  body.appendChild(el('div', { class: 'storm-card-head' }, [
    el('div', {}, [
      el('div', { class: 'storm-id', style: 'font-size:16px', text: c.id }),
      el('div', { class: 'storm-meta', text: `${a.type.label} · scanned ${c.valid ? fmtRelTime(c.valid) : 'now'} · confidence ${a.confidence}` }),
    ]),
    el('span', { class: `score-pill ${scoreClass(a.severeScore)}`, text: `${a.severeScore}` }),
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
  add('Radar', c.site);
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

/** Wire up sheet dismissal once. */
export function initStormSheet() {
  const sheet = document.getElementById('storm-sheet');
  sheet.querySelector('.sheet-grab').addEventListener('click', () => { sheet.hidden = true; });
  let startY = null;
  sheet.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (startY != null && e.touches[0].clientY - startY > 90 && sheet.querySelector('.sheet-body').scrollTop === 0) {
      sheet.hidden = true;
      startY = null;
    }
  }, { passive: true });
}
