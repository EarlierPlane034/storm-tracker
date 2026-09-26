/** Short-range "if this trend holds" projection of a storm's tornado score,
 * from a simple linear regression over its last few recorded samples. This
 * is NOT a physical forecast — it's an early heads-up extrapolation so a
 * fast-rising storm's trajectory is visible before the AI's own score
 * actually crosses into a higher band. */
export function projectTornadoScore(history, aheadMin = 15) {
  if (!history || history.length < 3) return null;
  const recent = history.slice(-6);
  const t0 = recent[0].t;
  const xs = recent.map((s) => (s.t - t0) / 60000);
  const ys = recent.map((s) => s.score);
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const lastX = xs[xs.length - 1];
  const projected = Math.max(0, Math.min(100, intercept + slope * (lastX + aheadMin)));
  const current = ys[ys.length - 1];
  if (Math.abs(projected - current) < 5) return null;
  return { current, projected: Math.round(projected), aheadMin, rising: projected > current };
}
