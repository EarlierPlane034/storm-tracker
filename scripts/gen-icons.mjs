/**
 * Generates StormLens PWA icons as PNGs with no dependencies
 * (raw RGBA buffer -> zlib -> hand-built PNG chunks).
 *
 * Original artwork: dark disc with radar range rings, a cyan sweep,
 * and a hook-echo-style reflectivity blob. Run: node scripts/gen-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, rgba) {
  // Filter type 0 (None) per scanline.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function drawIcon(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  // Maskable icons need content inside the ~80% safe zone.
  const R = maskable ? size * 0.36 : size * 0.44;

  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const na = a / 255;
    px[i] = px[i] * (1 - na) + r * na;
    px[i + 1] = px[i + 1] * (1 - na) + g * na;
    px[i + 2] = px[i + 2] * (1 - na) + b * na;
    px[i + 3] = Math.min(255, px[i + 3] + a);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c, dy = y - c;
      const d = Math.hypot(dx, dy);

      // Background: rounded dark square (full bleed when maskable).
      const corner = maskable ? 0 : size * 0.22;
      const inSquare =
        Math.abs(dx) < c - 1 && Math.abs(dy) < c - 1 &&
        (Math.abs(dx) < c - corner || Math.abs(dy) < c - corner ||
          Math.hypot(Math.abs(dx) - (c - corner), Math.abs(dy) - (c - corner)) < corner);
      if (maskable || inSquare) set(x, y, 11, 15, 20, 255);
      if (!maskable && !inSquare) continue;

      if (d > R) continue;

      // Radar disc backdrop.
      set(x, y, 15, 23, 34, 255);

      // Sweep wedge (cyan, fading with angular distance from the beam).
      let ang = Math.atan2(dy, dx); // -PI..PI, beam points to upper-right
      const beam = -Math.PI / 4;
      let da = ang - beam;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      if (da > 0 && da < 1.2) {
        const fade = 1 - da / 1.2;
        set(x, y, 56, 189, 248, 110 * fade * (1 - (d / R) * 0.25));
      }

      // Range rings.
      for (const rr of [0.33, 0.66, 0.99]) {
        if (Math.abs(d - R * rr) < size * 0.008) set(x, y, 71, 85, 105, 200);
      }

      // Reflectivity blob with a hook on the lower-left (green->yellow->red core).
      const bx = c - R * 0.32, by = c + R * 0.28;
      const bd = Math.hypot(x - bx, y - by);
      const hookAng = Math.atan2(y - by, x - bx);
      const hook = bd < R * 0.34 && hookAng > 1.1 && hookAng < 2.9 ? R * 0.1 : 0;
      const blobR = R * 0.30 + hook * Math.sin(hookAng * 2);
      if (bd < blobR) {
        const t = bd / blobR;
        if (t > 0.72) set(x, y, 34, 197, 94, 235);       // green fringe
        else if (t > 0.42) set(x, y, 250, 204, 21, 245); // yellow
        else set(x, y, 239, 68, 68, 255);                // red core
      }

      // Beam line + centre dot.
      if (Math.abs(da) < 0.02 && d < R * 0.98) set(x, y, 165, 243, 252, 255);
      if (d < size * 0.02) set(x, y, 226, 232, 240, 255);
    }
  }
  return encodePNG(size, px);
}

mkdirSync('icons', { recursive: true });
writeFileSync('icons/icon-180.png', drawIcon(180));
writeFileSync('icons/icon-192.png', drawIcon(192));
writeFileSync('icons/icon-512.png', drawIcon(512));
writeFileSync('icons/icon-512-maskable.png', drawIcon(512, { maskable: true }));
console.log('icons written');
