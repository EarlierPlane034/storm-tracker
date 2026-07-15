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

export function renderAiPanel(analyses, env, alerts, user, { onSelect, hiddenCount = 0 }) {
  const host = document.getElementById('ai-analysis');
  host.textContent = '';

  // ---- Situation overview -------------------------------------------------
  const overview = el('div', { class: 'card ai-block' });
  overview.appendChild(el('h4', { text: 'Situation overview' }));
  overview.appendChild(el('p', { text: buildOverview(analyses, alerts, user) }));
  host.appendChild(overview);

  // ---- Environment discussion ----------------------------------------------
  const envCard = el('div', { class: 'card ai-block' });
  envCard.appendChild(el('h4', { text: 'Environment (near your focus point)' }));
  envCard.appendChild(el('p', { text: buildEnvDiscussion(env) }));
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

  if (hiddenCount > 0) {
    host.appendChild(el('div', {
      class: 'muted', style: 'text-align:center; padding: 6px; font-size: 11px',
      text: `${hiddenCount} weaker storm${hiddenCount === 1 ? '' : 's'} hidden by your display filters (Settings → AI analyst).`,
    }));
  }
  host.appendChild(el('div', { class: 'ai-disclaimer', text: CONFIG.disclaimer }));
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
