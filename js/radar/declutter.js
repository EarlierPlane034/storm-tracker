/**
 * Heuristic ground-clutter/AP suppression for single-site reflectivity
 * tiles — applied entirely client-side by analyzing already-loaded tile
 * pixels. This is NOT real dual-pol filtering: this app has no access to
 * Correlation Coefficient data from the pre-rendered IEM tile cache it
 * uses (a real fix needs the raw Level II decode — see js/radar/level2.js).
 *
 * Ground clutter/AP haze tends to be spatially flat: near-uniform low
 * reflectivity spread over a wide area, unlike real precipitation, which
 * has texture and gradients even in light stratiform rain. This looks for
 * large uniform low-value blocks and fades them toward transparent — a
 * guess based on texture, not physics, which is exactly why it ships as an
 * opt-in "experimental" toggle rather than a silent default: genuinely
 * light, uniform rain can look similar and get faded along with the
 * clutter.
 */
const BLOCK = 16; // px per analysis block
const FLAT_STD_DEV = 3; // per-channel stddev at/below this reads as "flat"
const MIN_MEAN = 20; // ignore near-black/transparent blocks (no data, not clutter)
const FADE_TO = 0.35; // opacity multiplier applied to flat blocks

/** Returns a new ImageData with flat/uniform low-signal regions faded.
 * Never throws — any unexpected input just returns the original data. */
export function declutterImageData(imageData) {
  try {
    const { width, height, data } = imageData;
    const out = new Uint8ClampedArray(data);
    for (let by = 0; by < height; by += BLOCK) {
      for (let bx = 0; bx < width; bx += BLOCK) {
        const stats = blockStats(data, width, height, bx, by, BLOCK);
        if (!stats || stats.mean < MIN_MEAN) continue;
        if (stats.maxStdDev <= FLAT_STD_DEV) fadeBlock(out, width, height, bx, by, BLOCK, FADE_TO);
      }
    }
    return new ImageData(out, width, height);
  } catch {
    return imageData;
  }
}

function blockStats(data, width, height, bx, by, size) {
  let n = 0, sumR = 0, sumG = 0, sumB = 0;
  const w2 = Math.min(bx + size, width), h2 = Math.min(by + size, height);
  for (let y = by; y < h2; y++) {
    for (let x = bx; x < w2; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 10) continue; // fully transparent — not part of the visible image
      n++; sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2];
    }
  }
  if (!n) return null;
  const meanR = sumR / n, meanG = sumG / n, meanB = sumB / n;
  let varR = 0, varG = 0, varB = 0;
  for (let y = by; y < h2; y++) {
    for (let x = bx; x < w2; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 10) continue;
      varR += (data[i] - meanR) ** 2;
      varG += (data[i + 1] - meanG) ** 2;
      varB += (data[i + 2] - meanB) ** 2;
    }
  }
  const sd = (v) => Math.sqrt(v / n);
  return { mean: (meanR + meanG + meanB) / 3, maxStdDev: Math.max(sd(varR), sd(varG), sd(varB)) };
}

function fadeBlock(data, width, height, bx, by, size, factor) {
  const w2 = Math.min(bx + size, width), h2 = Math.min(by + size, height);
  for (let y = by; y < h2; y++) {
    for (let x = bx; x < w2; x++) {
      const i = (y * width + x) * 4 + 3;
      data[i] = Math.round(data[i] * factor);
    }
  }
}

/** Runs a loaded <img> tile through declutterImageData() and swaps its
 * src for the processed version. Silently leaves the tile untouched if
 * anything goes wrong — a tainted canvas (no CORS header from the tile
 * host) is the expected failure mode on some deployments, and this must
 * never be allowed to break the tile from displaying at all. */
export function declutterTileImage(img) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    if (!canvas.width || !canvas.height) return;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    ctx.putImageData(declutterImageData(data), 0, 0);
    img.src = canvas.toDataURL();
  } catch {
    /* tainted canvas / unsupported — leave the tile exactly as loaded */
  }
}
