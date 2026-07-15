/**
 * Narrative layer — the "AI meteorologist voice".
 *
 * Turns structured analysis output into:
 *   - plain-English storm summaries,
 *   - tornado-chance statements with explicit uncertainty,
 *   - explanations of WHY a score changed since the previous update,
 *   - an optional technical readout for advanced users,
 *   - the one-line headline ticker.
 *
 * Style rules enforced here:
 *   - never guarantees an outcome; always hedged as an estimate,
 *   - always distinguishes itself from official NWS products,
 *   - explains every threat change with the factors that drove it.
 */
import { fmtDistance, fmtSpeed, compassDir } from '../utils.js';
import { settings } from '../storage.js';

/** cellId -> snapshot of last spoken analysis, for change explanations. */
const previous = new Map();

export function rememberAnalysis(a) {
  previous.set(a.cell.id, {
    severe: a.severeScore,
    tor: a.tornado.score,
    trend: a.trend.label,
    t: Date.now(),
  });
}

export function getScoreChange(a) {
  const prev = previous.get(a.cell.id);
  if (!prev || Date.now() - prev.t > 45 * 60_000) return null;
  return {
    severeDelta: a.severeScore - prev.severe,
    torDelta: a.tornado.score - prev.tor,
  };
}

/** One-paragraph plain-English storm summary. */
export function stormSummary(a) {
  const c = a.cell;
  const parts = [];

  parts.push(`${a.type.label} ${motionPhrase(c)}.`);

  // Threat headline.
  if (a.severeScore >= 61) {
    parts.push(`This is a dangerous storm (severe score ${a.severeScore}/100).`);
  } else if (a.severeScore >= 41) {
    parts.push(`This storm has elevated severe potential (score ${a.severeScore}/100).`);
  } else {
    parts.push(`Severe potential is currently ${a.threatRating.label.toLowerCase()} (score ${a.severeScore}/100).`);
  }

  // Top factors — the "why".
  const top = a.factors.slice(0, 4).map((f) => f.text);
  if (top.length) {
    parts.push(`Key evidence: ${joinClauses(top)}.`);
  }

  // Trend statement.
  if (a.trend.label !== 'steady') {
    parts.push(`The storm is ${a.trend.label}.`);
  }

  return parts.join(' ');
}

/** Explicit tornado-chance statement, always hedged. */
export function tornadoStatement(a) {
  const t = a.tornado;
  const why = t.reasons.slice(0, 4);
  const buts = t.negatives.slice(0, 2);

  let s;
  if (t.score <= 5) {
    s = 'A tornado is not expected from this storm right now — no meaningful rotation is being detected.';
  } else {
    s = `A tornado currently has a ${t.label.toLowerCase()} estimated chance (${t.pct}) of developing within the next ${t.windowMin} minutes`;
    if (why.length) s += ` because ${joinClauses(why)}`;
    s += '.';
  }
  if (buts.length && t.score > 5) {
    s += ` However, ${joinClauses(buts)}.`;
  }
  s += ` Confidence: ${t.confidence.toLowerCase()}. This is an automated estimate from radar and model data — not an official forecast or warning.`;
  return s;
}

/** Explain what changed since the last analysis pass. */
export function changeExplanation(a) {
  const change = getScoreChange(a);
  if (!change) return null;
  const moves = [];
  if (Math.abs(change.severeDelta) >= 5) {
    moves.push(`severe score ${change.severeDelta > 0 ? 'rose' : 'fell'} ${Math.abs(change.severeDelta)} points`);
  }
  if (Math.abs(change.torDelta) >= 5) {
    moves.push(`tornado potential ${change.torDelta > 0 ? 'rose' : 'fell'} ${Math.abs(change.torDelta)} points`);
  }
  if (!moves.length) return null;

  const drivers = a.factors.slice(0, 3).map((f) => f.text);
  let s = `Since the last update, ${joinClauses(moves)}`;
  if (drivers.length) {
    s += ` — driven by ${joinClauses(drivers)}`;
  }
  return `${s}.`;
}

/** Technical readout for advanced users (settings.showTechnical). */
export function technicalReadout(a, env) {
  const c = a.cell;
  const rows = [
    ['Radar site', c.site],
    ['Max reflectivity', c.maxDbz != null ? `${c.maxDbz} dBZ @ ${c.maxDbzHeightKft ?? '?'} kft` : '—'],
    ['VIL', c.vil != null ? `${c.vil} kg/m²` : '—'],
    ['Echo top', c.topKft != null ? `${c.topKft} kft` : '—'],
    ['Mesocyclone rank', c.meso || 'none'],
    ['TVS', c.tvs ? 'YES' : 'no'],
    ['POSH / max hail', `${c.posh ?? '—'}% / ${c.maxHailIn != null ? c.maxHailIn.toFixed(1) + '"' : '—'}`],
    ['Rotation persistence', `${a.persistence} scans`],
  ];
  if (env) {
    rows.push(
      ['CAPE / CIN', `${fmt(env.cape, 'J/kg')} / ${fmt(env.cin, 'J/kg')}`],
      ['Lifted index', fmt(env.liftedIndex)],
      ['SRH (est 0–1km)', fmt(env.srh, 'm²/s²')],
      ['Bulk shear (sfc–500mb)', fmt(env.bulkShearKts, 'kt')],
      ['Low-level shear (sfc–850mb)', fmt(env.lowShearKts, 'kt')],
      ['LCL', fmt(env.lclM, 'm')],
      ['850–500mb lapse rate', fmt(env.lapseRate850_500, '°C/km')],
      ['Model', env.model],
    );
  }
  rows.push(['Tor components (radar/env/trend/ctx)',
    `${a.tornado.components.radar}/${a.tornado.components.environment}/${a.tornado.components.trend}/${a.tornado.components.context}`]);
  return rows;
}

function fmt(v, unit = '') {
  if (v == null || Number.isNaN(v)) return '—';
  const n = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return unit ? `${n} ${unit}` : String(n);
}

/** Headline for the top ticker: most dangerous relevant storm. */
export function tickerHeadline(analyses, user) {
  if (!analyses.length) {
    return 'No storm cells detected in the monitored area. StormLens is watching radar, alerts and the model environment.';
  }
  const relevant = user
    ? analyses.filter((a) => a.userRel && a.userRel.distKm <= settings.monitorRadiusKm)
    : analyses;
  const top = (relevant.length ? relevant : analyses)[0];
  const c = top.cell;
  const bits = [`${top.type.label} (${top.threatRating.label} threat, ${top.severeScore}/100)`];
  if (top.userRel) bits.push(`${fmtDistance(top.userRel.distKm, settings.units)} away`);
  if (top.tornado.score > 20) bits.push(`tornado chance ${top.tornado.label.toLowerCase()} (${top.tornado.pct})`);
  if (top.trend.label !== 'steady') bits.push(top.trend.label);
  return bits.join(' • ');
}

function motionPhrase(c) {
  if (c.moveDirDeg == null || c.moveSpeedKts == null) {
    return 'with uncertain motion';
  }
  // drct is the direction the storm is moving toward in the IEM feed.
  return `moving ${compassDir(c.moveDirDeg)} at ${fmtSpeed(c.moveSpeedKts, settings.units)}`;
}

function joinClauses(items) {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}
