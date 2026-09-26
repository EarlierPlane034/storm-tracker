/** Post-storm outcome feedback — a lightweight personal log of "what
 * actually happened" for a storm you were tracking, entered by hand (there
 * is no ground-truth network access to verify against automatically). Lets
 * a chaser review afterward how the AI's tornado calls compared to reality
 * on a given storm day — not a rigorous verification score, just a rough
 * personal accuracy check. */
const KEY = 'stormlens.feedback.v1';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}

let log = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(log.slice(-200))); } catch { /* private mode — log just won't persist */ }
}

export function logStormOutcome(a, outcome) {
  log.push({
    t: Date.now(),
    stormId: a.cell.id,
    stormType: a.type.label,
    aiTornadoScore: a.tornado.score,
    aiTornadoLabel: a.tornado.label,
    outcome, // 'tornado' | 'funnel' | 'none' | 'unsure'
  });
  save();
}

export function getFeedbackLog() {
  return [...log].reverse();
}

export function clearFeedbackLog() {
  log = [];
  save();
}

export function getFeedbackAccuracy() {
  const scored = log.filter((e) => e.aiTornadoScore >= 41);
  if (!scored.length) return null;
  const hits = scored.filter((e) => e.outcome === 'tornado' || e.outcome === 'funnel').length;
  return { total: scored.length, hits, pct: Math.round((hits / scored.length) * 100) };
}
