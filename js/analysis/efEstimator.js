/** Rough EF-scale POTENTIAL estimate from radar-observable rotation
 * strength — NOT a forecast that a tornado will occur, and NOT a
 * substitute for an official NWS damage survey (the only way an EF rating
 * is ever actually assigned, after the fact, from ground damage). This
 * just answers "if this rotation did produce a tornado, how strong could
 * it plausibly be", loosely anchored to the well-documented correlation
 * between mesocyclone/TVS strength and observed tornado intensity in
 * supercells — the same meso-rank/TVS signals already driving the app's
 * tornado score, just re-expressed on the public-facing EF scale. */
export function estimateEfPotential(cell, tornadoScore) {
  const meso = cell.meso || 0;
  if (!cell.tvs && meso < 3) return null;
  let lo, hi;
  if (cell.tvs) {
    if (meso >= 18) { lo = 3; hi = 5; }
    else if (meso >= 12) { lo = 2; hi = 4; }
    else { lo = 1; hi = 3; }
  } else if (meso >= 15) { lo = 1; hi = 3; }
  else if (meso >= 8) { lo = 0; hi = 2; }
  else { lo = 0; hi = 1; }
  if (tornadoScore >= 81 && hi < 5) hi += 1;
  return { lo, hi, label: lo === hi ? `EF${lo}` : `EF${lo}–EF${hi}` };
}
