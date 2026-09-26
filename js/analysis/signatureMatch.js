/** Classic tornadic-supercell "checklist" — the handful of radar and
 * environment markers spotters and warning forecasters actually look for,
 * surfaced explicitly rather than folded invisibly into the single tornado
 * score, so it's clear WHY a storm looks tornadic instead of just a number
 * asserting that it does. */
export function matchTornadicSignature(cell, environment, hookEcho) {
  const markers = [
    { key: 'hook', label: 'Hook echo present', met: !!(hookEcho && hookEcho.level !== 'none') },
    { key: 'tvs', label: 'Tornado vortex signature (TVS)', met: !!cell.tvs },
    { key: 'meso', label: 'Strong mesocyclone (rank 12+/25)', met: (cell.meso || 0) >= 12 },
    { key: 'vil', label: 'High VIL (storm well-fueled)', met: (cell.vil || 0) >= 40 },
    { key: 'posh', label: 'High probability of severe hail (POSH)', met: (cell.posh || 0) >= 50 },
    { key: 'srh', label: 'Favorable storm-relative helicity', met: (environment?.srh || 0) >= 150 },
    { key: 'shear', label: 'Strong deep-layer shear', met: (environment?.bulkShearKts || 0) >= 40 },
  ];
  const metCount = markers.filter((m) => m.met).length;
  return { markers, metCount, total: markers.length };
}
