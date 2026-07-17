/**
 * Radar snapshot: composes the current view (dark basemap + labels + the
 * live radar frame + storm markers + user dot) onto a canvas with a
 * timestamp and attribution, then hands it to the share sheet.
 *
 * Tiles are re-fetched with CORS so the canvas stays untainted; if a tile
 * host refuses, we skip that layer rather than fail the whole capture.
 */
import { CONFIG } from '../config.js';
import { settings } from '../storage.js';
import { showToast } from './toasts.js';

function tileUrl(template, z, x, y) {
  return template
    .replace('{z}', z).replace('{x}', x).replace('{y}', y)
    .replace('{s}', 'a').replace('{r}', '');
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // missing tiles just leave gaps
    img.src = src;
  });
}

async function drawTileLayer(ctx, template, z, origin, w, h, alpha = 1) {
  const x0 = Math.floor(origin.x / 256), y0 = Math.floor(origin.y / 256);
  const x1 = Math.floor((origin.x + w) / 256), y1 = Math.floor((origin.y + h) / 256);
  const jobs = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      jobs.push(loadImage(tileUrl(template, z, x, y)).then((img) => {
        if (img) {
          ctx.globalAlpha = alpha;
          ctx.drawImage(img, x * 256 - origin.x, y * 256 - origin.y);
        }
      }));
    }
  }
  await Promise.all(jobs);
  ctx.globalAlpha = 1;
}

/**
 * @param {L.Map} map
 * @param {RadarController} radar
 * @param {Array} analyses  visible analyses for marker overlay
 * @param {{lat,lon}|null} user
 */
export async function captureMap(map, radar, analyses, user) {
  showToast('📷 Capturing radar snapshot…', { ttlMs: 4000 });
  try {
    const size = map.getSize();
    const z = Math.round(map.getZoom());
    const nw = map.getBounds().getNorthWest();
    const origin = map.project(nw, z);
    const canvas = document.createElement('canvas');
    canvas.width = size.x;
    canvas.height = size.y;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, size.x, size.y);

    await drawTileLayer(ctx, CONFIG.endpoints.basemapDark, z, origin, size.x, size.y);
    // Live radar frame (frame 0 of the current product).
    const prod = radar.currentProduct;
    if (prod?.available) {
      await drawTileLayer(ctx, radar.frameUrl(prod, 0), z, origin, size.x, size.y, settings.radarOpacity);
    }
    await drawTileLayer(ctx, CONFIG.endpoints.basemapLabels, z, origin, size.x, size.y);

    const toXY = (lat, lon) => {
      const p = map.project([lat, lon], z);
      return [p.x - origin.x, p.y - origin.y];
    };

    // Storm markers (score circles), matching the live map's colors.
    for (const a of analyses.slice(0, 100)) {
      const [x, y] = toXY(a.cell.lat, a.cell.lon);
      if (x < -20 || y < -20 || x > size.x + 20 || y > size.y + 20) continue;
      const color = a.severeScore >= 81 ? '#ef4444' : a.severeScore >= 61 ? '#fb923c'
        : a.severeScore >= 41 ? '#fbbf24' : a.severeScore >= 21 ? '#34d399' : '#64748b';
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '800 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(a.severeScore), x, y + 3);
    }
    ctx.textAlign = 'left';

    if (user) {
      const [x, y] = toXY(user.lat, user.lon);
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Timestamp + attribution bar.
    const stamp = `StormLens · ${prod?.name || 'Radar'} · ${new Date().toLocaleString()}`;
    ctx.fillStyle = 'rgba(11,15,20,0.85)';
    ctx.fillRect(0, size.y - 22, size.x, 22);
    ctx.fillStyle = '#e5eaf0';
    ctx.font = '600 11px -apple-system, sans-serif';
    ctx.fillText(stamp, 8, size.y - 7);
    ctx.fillStyle = '#8b97a5';
    ctx.font = '9px -apple-system, sans-serif';
    const attr = 'NEXRAD/NOAA via IEM · © OSM © CARTO';
    ctx.fillText(attr, size.x - ctx.measureText(attr).width - 8, size.y - 7);

    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('canvas export failed');
    const file = new File([blob], `stormlens-${Date.now()}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'StormLens radar snapshot' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      showToast('Snapshot downloaded.');
    }
  } catch (err) {
    console.warn('[snapshot] failed', err);
    showToast('Snapshot failed — a tile host may be blocking image capture. Try again or use the iPhone screenshot buttons.', { level: 'warn' });
  }
}
