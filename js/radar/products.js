/**
 * Radar product registry.
 *
 * Tile sources are IEM's public NEXRAD caches:
 *  - CONUS mosaics:  nexrad-{prod}-900913[-mNNm]   (composite, 5-min history)
 *  - Single site:    ridge::{SITE}-{PROD}-{frame}  (frame 0=latest .. 4)
 *
 * Dual-pol products (CC, ZDR, SW) and some derived products (echo tops,
 * VIL grids) have no free public tile service; they are registered with
 * `available:false` and the app explains where that data appears instead
 * (per-cell VIL/top come from the Level III attribute feed).
 */
export const PRODUCTS = [
  {
    id: 'N0Q', label: 'REF', name: 'Base Reflectivity',
    mode: 'site', mosaicFallback: true, tilts: ['N0Q', 'N1Q', 'N2Q', 'N3Q'],
    unit: 'dBZ', available: true,
    legend: { stops: ['#02f7f7', '#019ff4', '#0300f4', '#02fd02', '#01c501', '#008e00', '#fdf802', '#e5bc00', '#fd9500', '#fd0000', '#d40000', '#bc0000', '#f800fd', '#9854c6'], min: 5, max: 75 },
  },
  {
    id: 'CREF', label: 'CREF', name: 'Composite Reflectivity',
    mode: 'mosaic', layer: 'nexrad-n0q-900913',
    unit: 'dBZ', available: true,
    legend: { stops: ['#02f7f7', '#019ff4', '#0300f4', '#02fd02', '#01c501', '#008e00', '#fdf802', '#e5bc00', '#fd9500', '#fd0000', '#d40000', '#bc0000', '#f800fd', '#9854c6'], min: 5, max: 75 },
  },
  {
    id: 'N0U', label: 'VEL', name: 'Base Velocity',
    mode: 'site', tilts: ['N0U', 'N1U', 'N2U', 'N3U'],
    unit: 'kt', available: true,
    legend: { stops: ['#00e0a0', '#00b070', '#007a4a', '#0a3d2e', '#3d0a0a', '#7a1f1f', '#c03030', '#ff5050'], min: -70, max: 70, note: 'green = toward radar' },
  },
  {
    id: 'N0S', label: 'SRV', name: 'Storm Relative Velocity',
    mode: 'site', tilts: ['N0S', 'N1S', 'N2S', 'N3S'],
    unit: 'kt', available: true, mayBeMissing: true,
    legend: { stops: ['#00e0a0', '#00b070', '#007a4a', '#0a3d2e', '#3d0a0a', '#7a1f1f', '#c03030', '#ff5050'], min: -50, max: 50, note: 'storm motion removed' },
  },
  {
    id: 'CC', label: 'CC', name: 'Correlation Coefficient',
    mode: 'none', available: false,
    unavailableNote: 'Dual-pol CC grids are not served by free public tile caches. StormLens instead infers debris potential from TVS + rotation + report data in each cell’s analysis.',
  },
  {
    id: 'ZDR', label: 'ZDR', name: 'Differential Reflectivity',
    mode: 'none', available: false,
    unavailableNote: 'Dual-pol ZDR grids are not publicly tiled. Hail sizing here uses the Level III hail algorithm (POSH/MEHS) shown per storm cell.',
  },
  {
    id: 'SW', label: 'SW', name: 'Spectrum Width',
    mode: 'none', available: false,
    unavailableNote: 'Spectrum width grids are not publicly tiled. Rotation confidence uses mesocyclone + TVS detections instead.',
  },
  {
    id: 'ET', label: 'TOPS', name: 'Echo Tops',
    mode: 'none', available: false,
    unavailableNote: 'Echo-top grids are not publicly tiled; per-cell echo tops from the storm attribute feed are shown on each storm card.',
  },
  {
    id: 'VIL', label: 'VIL', name: 'Vertically Integrated Liquid',
    mode: 'none', available: false,
    unavailableNote: 'VIL grids are not publicly tiled; per-cell VIL from the storm attribute feed is shown on each storm card and drives the hail score.',
  },
];

export function getProduct(id) {
  return PRODUCTS.find((p) => p.id === id);
}

/**
 * CSS filter strings implementing selectable colour tables.
 * Smoothing is handled purely via image-rendering (auto = bilinear-smoothed
 * tiles, pixelated = crisp bins) — a whole-pane blur filter was measurably
 * janky on iPhones, so it's intentionally not used.
 */
export function colorTableFilter(table) {
  switch (table) {
    case 'enhanced': return 'saturate(1.35) contrast(1.12)';
    case 'grayscale': return 'grayscale(1) brightness(1.15)';
    default: return 'none';
  }
}
