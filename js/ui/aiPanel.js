/**
 * AI Meteorologist panel: regional situation overview, environment
 * discussion, ranked storm threats with reasoning, and the standing
 * "not an official product" disclaimer.
 */
import { el, fmtDistance } from '../utils.js';
import { settings } from '../storage.js';
import { CONFIG } from '../config.js';
import { stormSummary, tornadoStatement, changeExplanation } from '../analysis/narrative.js';
import { buildTornadoMeter, scoreClass } from './stormPanel.js';
import { pointInGeometry } from '../analysis/stormAnalyzer.js';
import { drawHodograph, attachTrendInteraction, SERIES_COLORS } from './trendChart.js';
import { getFocusPoint } from '../api/sources.js';

const SPC_RANK = ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH'];
const SPC_NAMES = {
  TSTM: 'general thunderstorm', MRGL: 'Marginal (level 1 of 5)',
  SLGT: 'Slight (level 2 of 5)', ENH: 'Enhanced (level 3 of 5)',
  MDT: 'Moderate (level 4 of 5)', HIGH: 'High (level 5 of 5)',
};

export function renderAiPanel(analyses, env, alerts, user, {
  onSelect, hiddenCount = 0, outlook = [], week = [], outlookDay2 = [], outlookDay3 = [],
  forecast = { daily: [], hourly: [], afd: null }, onOpenChat,
}) {
  const host = document.getElementById('ai-analysis');
  host.textContent = '';

  // ---- Ask-the-AI entry point -------------------------------------------------
  if (onOpenChat) {
    host.appendChild(el('button', {
      class: 'chat-open-btn',
      html: '💬 <strong>Ask the AI</strong> — “which storm could produce a tornado?”, “when will it hit?”, “what about this week?”',
      onclick: onOpenChat,
    }));
  }

  // ---- Today's outlook briefing ---------------------------------------------
  const briefing = el('div', { class: 'card ai-block' });
  briefing.appendChild(el('h4', { text: "Today's outlook" }));
  briefing.appendChild(el('p', { text: buildBriefing(outlook, env, user) }));
  host.appendChild(briefing);

  // ---- Week ahead ---------------------------------------------------------------
  if (week.length) {
    const card = el('div', { class: 'card ai-block' });
    card.appendChild(el('h4', { text: 'Week ahead (storm potential at your location)' }));
    const at = user || getFocusPoint();
    for (const [i, d] of week.entries()) {
      const dayName = i === 0 ? 'Today'
        : new Date(`${d.date}T12:00`).toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
      // Official SPC categories exist for days 2-3; append when available.
      let spcNote = '';
      if (at) {
        const feats = i === 1 ? outlookDay2 : i === 2 ? outlookDay3 : null;
        if (feats) {
          const cat = highestSpcCategory(feats, at);
          if (cat) spcNote = ` · SPC: ${cat}`;
        }
      }
      const colors = ['#64748b', '#34d399', '#fbbf24', '#fb923c'];
      card.appendChild(el('div', { class: 'week-row' }, [
        el('span', { class: 'week-day', text: dayName }),
        el('div', { class: 'week-track' }, [
          el('div', { class: 'week-fill', style: `width:${25 + d.level * 25}%;background:${colors[d.level]}` }),
        ]),
        el('span', { class: 'week-label', text: `${d.label}${spcNote}` }),
      ]));
    }
    const best = [...week].sort((a, b) => b.level - a.level || b.capeMax - a.capeMax)[0];
    if (best.level >= 1) {
      card.appendChild(el('p', { class: 'muted', style: 'margin-top:6px; font-size:11.5px', text: `Most interesting day: ${new Date(`${best.date}T12:00`).toLocaleDateString([], { weekday: 'long' })} — ${best.note} CAPE to ~${best.capeMax} J/kg, deep shear to ~${best.shearMaxKts} kt, precip chance ${best.precipProbMax}%. Outlooks beyond 2–3 days shift; recheck daily.` }));
    } else {
      card.appendChild(el('p', { class: 'muted', style: 'margin-top:6px; font-size:11.5px', text: 'A quiet stretch — no day shows meaningful storm fuel at your location.' }));
    }
    host.appendChild(card);
  }

  // ---- Official NWS 7-day forecast --------------------------------------------
  if (forecast.daily.length) {
    const card = el('div', { class: 'card ai-block' });
    card.appendChild(el('h4', { text: `NWS forecast${forecast.office ? ` (office: ${forecast.office})` : ''} — official` }));

    // Next-24h temperature sparkline (one series; title carries identity).
    if (forecast.hourly.length >= 4) {
      card.appendChild(el('div', { class: 'trend-title', text: 'Temperature next 24 h (°F)' }));
      const tCanvas = el('canvas', { class: 'trend-chart' });
      card.appendChild(tCanvas);
      const temps = forecast.hourly.map((h) => ({ t: h.t, v: h.tempF }));
      requestAnimationFrame(() => attachTrendInteraction(tCanvas, temps, { color: SERIES_COLORS.strength, unit: '°' }));
      card.appendChild(el('div', { class: 'trend-title', text: 'Precip chance next 24 h (%)' }));
      const pCanvas = el('canvas', { class: 'trend-chart' });
      card.appendChild(pCanvas);
      const precip = forecast.hourly.map((h) => ({ t: h.t, v: h.precip }));
      requestAnimationFrame(() => attachTrendInteraction(pCanvas, precip, { color: SERIES_COLORS.rain, unit: '%', min: 0, max: 100 }));
    }

    for (const pd of forecast.daily.slice(0, 9)) {
      const row = el('div', { class: 'fc-row', onclick: (e) => {
        const d = e.currentTarget.querySelector('.fc-detail');
        if (d) d.style.display = d.style.display === 'none' ? 'block' : 'none';
      } });
      row.appendChild(el('div', { class: 'fc-head' }, [
        el('span', { class: 'fc-name', text: pd.name }),
        el('span', { class: 'fc-temp', text: `${pd.tempF}°${pd.precip ? ` · ${pd.precip}%💧` : ''}` }),
      ]));
      row.appendChild(el('div', { class: 'muted', style: 'font-size:11.5px', text: pd.short }));
      row.appendChild(el('div', { class: 'fc-detail muted', style: 'display:none;font-size:11px;margin-top:3px', text: pd.detailed }));
      card.appendChild(row);
    }
    host.appendChild(card);
  }

  // ---- Forecaster discussion (AFD) ------------------------------------------------
  if (forecast.afd?.text) {
    const card = el('div', { class: 'card ai-block' });
    const toggle = el('button', {
      class: 'chat-open-btn', style: 'margin-bottom:0',
      html: `📄 <strong>Forecaster discussion (AFD${forecast.office ? ` · ${forecast.office}` : ''})</strong> — the local NWS office's own technical write-up${forecast.afd.time ? `, issued ${forecast.afd.time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}. Tap to read.`,
    });
    const body = el('pre', {
      style: 'display:none;white-space:pre-wrap;font-family:var(--mono);font-size:10.5px;line-height:1.4;margin-top:8px;max-height:50vh;overflow-y:auto',
      text: forecast.afd.text,
    });
    toggle.addEventListener('click', () => {
      body.style.display = body.style.display === 'none' ? 'block' : 'none';
    });
    card.appendChild(toggle);
    card.appendChild(body);
    host.appendChild(card);
  }

  // ---- Situation overview -------------------------------------------------
  const overview = el('div', { class: 'card ai-block' });
  overview.appendChild(el('h4', { text: 'Situation overview' }));
  overview.appendChild(el('p', { text: buildOverview(analyses, alerts, user) }));
  host.appendChild(overview);

  // ---- Environment discussion ----------------------------------------------
  const envCard = el('div', { class: 'card ai-block' });
  envCard.appendChild(el('h4', { text: 'Environment (near your focus point)' }));
  envCard.appendChild(el('p', { text: buildEnvDiscussion(env) }));
  if (env?.windProfile) {
    const canvas = el('canvas', { style: 'width:100%;height:180px;margin-top:8px' });
    envCard.appendChild(canvas);
    envCard.appendChild(el('div', { class: 'muted', style: 'font-size:10.5px', text: 'Hodograph: how the wind turns with height (sfc → 850 → 700 → 500 mb). A long, curving path favors rotating storms. × marks the estimated storm motion.' }));
    requestAnimationFrame(() => drawHodograph(canvas, env));
  }
  host.appendChild(envCard);

  // ---- Per-storm analyses ---------------------------------------------------
  const relevant = user
    ? analyses.filter((a) => a.userRel && a.userRel.distKm <= settings.monitorRadiusKm)
    : analyses;
  const list = (relevant.length ? relevant : analyses).slice(0, 8);

  if (list.length) {
    host.appendChild(el('h4', { class: 'trend-title', style: 'margin:10px 4px 6px', text: `Storm-by-storm analysis (${relevant.length ? 'within your radius' : 'strongest nationwide'})` }));
    host.appendChild(el('div', {
      class: 'muted', style: 'margin: 0 4px 8px; font-size: 11px',
      text: 'The colored number matches the storm\'s circle on the radar map. Tap an entry to zoom the map to that storm.',
    }));
  }
  for (const a of list) {
    const card = el('div', { class: 'card ai-block' });
    const head = el('div', { class: 'storm-card-head' });
    head.appendChild(el('strong', { text: `#${a.rank} ${a.cell.id} — ${a.type.label}` }));
    head.appendChild(el('div', { style: 'display:flex;align-items:center;gap:8px' }, [
      a.userRel ? el('span', { class: 'muted', text: fmtDistance(a.userRel.distKm, settings.units) }) : null,
      el('span', { class: `score-pill ${scoreClass(a.severeScore)}`, text: String(a.severeScore) }),
    ]));
    card.appendChild(head);
    card.appendChild(el('p', { style: 'margin-top:6px', text: stormSummary(a) }));
    const change = changeExplanation(a);
    if (change) card.appendChild(el('p', { style: 'margin-top:6px', text: change }));
    if (a.tornado.score > 10) card.appendChild(buildTornadoMeter(a));
    else card.appendChild(el('p', { class: 'confidence', text: tornadoStatement(a) }));
    card.appendChild(el('div', { class: 'confidence', text: `Analysis confidence: ${a.confidence}` }));
    card.addEventListener('click', () => onSelect(a));
    host.appendChild(card);
  }

  // ---- SPC Mesoanalysis viewer (chaser staple) --------------------------------
  host.appendChild(buildMesoanalysisCard());

  if (hiddenCount > 0) {
    host.appendChild(el('div', {
      class: 'muted', style: 'text-align:center; padding: 6px; font-size: 11px',
      text: `${hiddenCount} weaker storm${hiddenCount === 1 ? '' : 's'} hidden by your display filters (Settings → AI analyst).`,
    }));
  }
  host.appendChild(el('div', { class: 'ai-disclaimer', text: CONFIG.disclaimer }));
}

/**
 * SPC Mesoanalysis viewer — live parameter maps straight from the Storm
 * Prediction Center (national sector). These are official graphics loaded
 * as images; a broken image means SPC is regenerating that panel.
 */
const MESO_PARAMS = [
  ['pmsl', 'Surface map'],
  ['ttd', 'Temp / dewpoint'],
  ['sbcp', 'SBCAPE'],
  ['eshr', 'Effective shear'],
  ['srh1', '0–1 km SRH'],
  ['scp', 'Supercell composite'],
  ['stor', 'Sig tornado (STP)'],
];
let mesoParam = 'sbcp';
let mesoOpen = false;

function buildMesoanalysisCard() {
  const card = el('div', { class: 'card ai-block' });
  const toggle = el('button', {
    class: 'chat-open-btn', style: 'margin-bottom:0',
    html: '🗺 <strong>SPC Mesoanalysis</strong> — live CAPE, shear, SRH and composite-parameter maps from the Storm Prediction Center. Tap to view.',
  });
  const body = el('div', { style: mesoOpen ? '' : 'display:none' });
  toggle.addEventListener('click', () => {
    mesoOpen = !mesoOpen;
    body.style.display = mesoOpen ? 'block' : 'none';
  });

  const chips = el('div', { class: 'chat-chips' });
  const img = el('img', {
    style: 'width:100%;border-radius:8px;background:#fff;margin-top:6px',
    alt: 'SPC mesoanalysis graphic',
  });
  const err = el('div', { class: 'muted', style: 'display:none;font-size:11px', text: 'That panel isn\'t loading right now — SPC regenerates them every hour; try another parameter.' });
  const setParam = (p) => {
    mesoParam = p;
    err.style.display = 'none';
    img.style.display = 'block';
    img.src = `https://www.spc.noaa.gov/exper/mesoanalysis/s19/${p}/${p}.gif?t=${Math.floor(Date.now() / 600000)}`;
    [...chips.children].forEach((c) => c.classList.toggle('chip-active', c.dataset.p === p));
  };
  img.onerror = () => { img.style.display = 'none'; err.style.display = 'block'; };
  for (const [p, label] of MESO_PARAMS) {
    chips.appendChild(el('button', {
      class: `chat-chip ${p === mesoParam ? 'chip-active' : ''}`, 'data-p': p, text: label,
      onclick: () => setParam(p),
    }));
  }
  body.appendChild(chips);
  body.appendChild(img);
  body.appendChild(err);
  body.appendChild(el('div', { class: 'muted', style: 'font-size:10px;margin-top:4px', text: 'Official SPC graphics (national sector), updated hourly. spc.noaa.gov/exper/mesoanalysis' }));
  if (mesoOpen) setParam(mesoParam);
  else toggle.addEventListener('click', () => { if (mesoOpen && !img.src) setParam(mesoParam); }, { once: false });

  card.appendChild(toggle);
  card.appendChild(body);
  return card;
}

/** Highest SPC category label whose polygon contains the point. */
function highestSpcCategory(features, at) {
  let best = -1;
  for (const f of features) {
    const rank = SPC_RANK.indexOf(f.properties?.LABEL);
    if (rank > best && f.geometry && pointInGeometry(at.lat, at.lon ?? at.lng, f.geometry)) {
      best = rank;
    }
  }
  return best >= 0 ? SPC_NAMES[SPC_RANK[best]] : null;
}

/** Morning-briefing style narrative from the SPC outlook + environment. */
function buildBriefing(outlook, env, user) {
  const at = user || getFocusPoint();
  if (!at) return 'Set a location (⌖) or move the map to get a severe-weather briefing for that spot.';

  // Highest SPC category whose polygon contains the focus point.
  let best = -1;
  for (const f of outlook) {
    const label = f.properties?.LABEL;
    const rank = SPC_RANK.indexOf(label);
    if (rank > best && f.geometry && pointInGeometry(at.lat, at.lon ?? at.lng, f.geometry)) {
      best = rank;
    }
  }

  const parts = [];
  if (best < 0) {
    parts.push('The Storm Prediction Center has no severe weather risk area over your location today.');
  } else if (best === 0) {
    parts.push('The Storm Prediction Center outlook shows general (non-severe) thunderstorms possible at your location today.');
  } else {
    parts.push(`The Storm Prediction Center has your location in a ${SPC_NAMES[SPC_RANK[best]]} risk of severe storms today.`);
  }

  if (env) {
    const modes = [];
    if ((env.bulkShearKts ?? 0) >= 40 && (env.cape ?? 0) >= 1000) modes.push('supercells capable of all severe hazards');
    else if ((env.bulkShearKts ?? 0) >= 25 && (env.cape ?? 0) >= 500) modes.push('organized storms with hail and gusty winds');
    else if ((env.cape ?? 0) >= 500) modes.push('pulse-type storms with brief heavy rain and lightning');
    if (modes.length) parts.push(`If storms develop, the environment supports ${modes[0]}.`);
    if ((env.cin ?? 0) < -75) parts.push('A capping inversion is currently holding storms off — watch for it to erode.');
    if ((env.srh ?? 0) >= 150 && (env.lclM ?? 9999) < 1200) parts.push('Low-level turning and low cloud bases mean any strong storm deserves close attention for tornado potential.');
  }
  parts.push('This is an automated summary of official SPC/model data — not a forecast of its own.');
  return parts.join(' ');
}

function buildOverview(analyses, alerts, user) {
  const tor = alerts.filter((a) => a.kind === 'tor-warning').length;
  const svr = alerts.filter((a) => a.kind === 'svr-warning').length;
  const watches = alerts.filter((a) => a.kind.endsWith('watch')).length;
  const dangerous = analyses.filter((a) => a.severeScore >= 61).length;
  const rotating = analyses.filter((a) => a.cell.meso > 0 || a.cell.tvs).length;

  const parts = [];
  if (!analyses.length) {
    parts.push('The radar network is quiet — no storm cells are currently being tracked.');
  } else {
    parts.push(`Tracking ${analyses.length} storm cell${analyses.length === 1 ? '' : 's'} nationally: ${dangerous} rated High/Extreme, ${rotating} showing rotation.`);
  }
  if (tor) parts.push(`${tor} Tornado Warning${tor === 1 ? ' is' : 's are'} active.`);
  if (svr) parts.push(`${svr} Severe Thunderstorm Warning${svr === 1 ? ' is' : 's are'} active.`);
  if (watches) parts.push(`${watches} watch box${watches === 1 ? '' : 'es'} in effect.`);
  if (user) {
    const near = analyses.filter((a) => a.userRel && a.userRel.distKm <= settings.monitorRadiusKm);
    parts.push(near.length
      ? `Within your ${Math.round(settings.monitorRadiusKm)} km monitoring radius: ${near.length} storm${near.length === 1 ? '' : 's'}, the closest ${fmtDistance(Math.min(...near.map((a) => a.userRel.distKm)), settings.units)} away.`
      : 'No tracked storms are inside your monitoring radius right now.');
  } else {
    parts.push('Enable location (⌖) for distance, arrival-time and proximity alerts.');
  }
  return parts.join(' ');
}

function buildEnvDiscussion(env) {
  if (!env) return 'Model environment data has not loaded yet. Set a location or move the map to fetch CAPE, shear and helicity for that point.';
  const p = [];
  const cape = env.cape ?? 0;
  if (cape >= 2500) p.push(`The atmosphere is strongly unstable (CAPE ≈ ${Math.round(cape)} J/kg)`);
  else if (cape >= 1000) p.push(`Moderate instability is in place (CAPE ≈ ${Math.round(cape)} J/kg)`);
  else if (cape >= 250) p.push(`Instability is marginal (CAPE ≈ ${Math.round(cape)} J/kg)`);
  else p.push(`The atmosphere is stable to weakly unstable (CAPE ≈ ${Math.round(cape)} J/kg)`);

  if (env.cin != null && env.cin < -75) p.push(`but a significant cap (CIN ${Math.round(env.cin)} J/kg) is suppressing new development`);
  if (env.bulkShearKts != null) {
    if (env.bulkShearKts >= 40) p.push(`Deep-layer shear is strong (~${Math.round(env.bulkShearKts)} kt), enough for supercells`);
    else if (env.bulkShearKts >= 25) p.push(`Deep-layer shear (~${Math.round(env.bulkShearKts)} kt) supports organized multicells`);
    else p.push(`Deep-layer shear is weak (~${Math.round(env.bulkShearKts)} kt), favoring disorganized storms`);
  }
  if (env.srh != null && Math.abs(env.srh) >= 150) p.push(`low-level helicity is significant (≈ ${env.srh} m²/s²), which supports rotating updrafts`);
  if (env.lclM != null) {
    p.push(env.lclM < 1000
      ? `cloud bases are low (LCL ≈ ${Math.round(env.lclM)} m) — a tornado-favorable signal`
      : `cloud bases sit near ${Math.round(env.lclM)} m`);
  }
  let out = `${p.join('; ')}.`;
  out += ` Source: ${env.model}, valid ${env.time.toUTCString().slice(17, 22)}Z.`;
  return out;
}
