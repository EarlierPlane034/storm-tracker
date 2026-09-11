/** Plain-English definitions for the weather terms/abbreviations used throughout the app. */
export const GLOSSARY = [
  { term: 'dBZ', def: 'Decibels of reflectivity — how much energy a radar beam bounces back off precipitation. Higher = heavier rain, hail, or a bigger storm. Light rain is ~20-30 dBZ; severe hail cores often exceed 60 dBZ.' },
  { term: 'VIL', def: 'Vertically Integrated Liquid — an estimate of total water/ice in a storm\'s vertical column, in kg/m². High VIL relative to the storm\'s height often signals hail potential.' },
  { term: 'TVS', def: 'Tornado Vortex Signature — a tight, strong rotation couplet on velocity radar data that suggests a tornado may be occurring or about to occur.' },
  { term: 'Meso / Mesocyclone', def: 'A rotating updraft within a supercell thunderstorm, several miles wide. Most strong tornadoes form from a mesocyclone, though most mesocyclones never produce one.' },
  { term: 'POSH', def: 'Probability Of Severe Hail — an NWS radar algorithm estimating the chance a storm is producing hail 1" or larger.' },
  { term: 'CAPE', def: 'Convective Available Potential Energy — a measure of atmospheric instability/fuel for storms, in J/kg. Higher CAPE generally means stronger potential updrafts. 1000-2500 is moderate; 3000+ is extreme.' },
  { term: 'CIN', def: 'Convective Inhibition — a "cap" of warm air aloft that suppresses storm formation. Some CIN keeps storms isolated and strong; too much can prevent storms from forming at all.' },
  { term: 'SRH', def: 'Storm-Relative Helicity — measures how much the wind turns with height relative to a storm\'s motion. High low-level SRH favors rotating updrafts and tornado potential.' },
  { term: 'LCL', def: 'Lifted Condensation Level — the height clouds form at. A lower LCL (closer to the ground) is generally more favorable for tornadoes, since the rotating column has less distance to stretch down to the surface.' },
  { term: 'Shear (wind shear)', def: 'The change in wind speed and/or direction with height. Strong shear organizes storms into long-lived supercells instead of short-lived, disorganized cells.' },
  { term: 'Hodograph', def: 'A plot of wind speed and direction at different heights, used to visualize wind shear and estimate storm motion and rotation potential.' },
  { term: 'Supercell', def: 'A thunderstorm with a persistent, rotating updraft (mesocyclone). The most likely storm type to produce strong tornadoes, large hail, and damaging straight-line winds.' },
  { term: 'QLCS', def: 'Quasi-Linear Convective System — a line of storms (a squall line), as opposed to isolated cells. Can produce damaging straight-line winds and brief, fast-spinning-up tornadoes.' },
  { term: 'Bow echo', def: 'A bow-shaped segment of a storm line on radar, associated with a concentrated area of damaging straight-line wind.' },
  { term: 'Hook echo', def: 'A hook-shaped appendage on radar reflectivity, often on the back/southwest side of a supercell, marking where a mesocyclone and possible tornado are located.' },
  { term: 'RFD', def: 'Rear-Flank Downdraft — a pocket of sinking air on the back side of a supercell. Its interaction with the updraft is critical to tornado formation, but a strong RFD can also cut off (occlude) an existing tornado.' },
  { term: 'Echo top', def: 'The highest altitude at which a storm still returns detectable radar reflectivity — a rough proxy for updraft strength.' },
  { term: 'Tornado Warning', def: 'Issued by the NWS when a tornado has been spotted or indicated by radar. Take shelter immediately.' },
  { term: 'Tornado Watch', def: 'Conditions are favorable for tornadoes to develop over the watch area — stay alert and ready to act, but no confirmed threat yet.' },
  { term: 'Severe Thunderstorm Warning', def: 'A storm is producing or expected to produce damaging wind (58+ mph) and/or hail 1"+ in diameter.' },
  { term: 'Rotation persistence', def: 'How many consecutive radar scans a storm has shown rotation — longer persistence generally means a more mature, established mesocyclone.' },
  { term: 'AI Severe Score', def: "StormLens's own 0-100 estimate of how dangerous a storm currently looks, combining radar signatures, environment data, and trend — an unofficial estimate, not an NWS product." },
];

/** Case-insensitive substring match on term or definition. */
export function searchGlossary(query) {
  const q = query.trim().toLowerCase();
  if (!q) return GLOSSARY;
  return GLOSSARY.filter((g) => g.term.toLowerCase().includes(q) || g.def.toLowerCase().includes(q));
}
