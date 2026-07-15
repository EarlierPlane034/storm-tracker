/**
 * Compact single-series trend charts (canvas), used in the storm detail
 * sheet for strength / rotation / hail / wind / rain / lightning /
 * organization histories.
 *
 * Design rules applied (dataviz method):
 *  - one series per chart, titled — no legend needed;
 *  - 2px line, recessive gridlines, text in text tokens (never series color);
 *  - direct label on the latest value only;
 *  - touch/hover readout (crosshair + value) since the chart has a plot;
 *  - series colors are validated categorical steps for dark surfaces.
 */

/** Validated dark-mode categorical steps (see docs/DESIGN.md). */
export const SERIES_COLORS = {
  strength: '#3987e5',     // blue
  rotation: '#d55181',     // magenta
  hail: '#199e70',         // aqua
  wind: '#c98500',         // yellow
  rain: '#9085e9',         // violet
  lightning: '#d95926',    // orange
  organization: '#008300', // green
};

const INK = { primary: '#e5eaf0', secondary: '#8b97a5', grid: 'rgba(139,151,165,0.18)' };

/**
 * Render a sparkline into `canvas`.
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{t:number,v:number}>} samples chronological
 * @param {{color:string, unit?:string, min?:number, max?:number}} opts
 */
export function drawTrend(canvas, samples, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 300;
  const cssH = canvas.clientHeight || 90;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = { l: 6, r: 44, t: 10, b: 14 };
  const w = cssW - pad.l - pad.r;
  const h = cssH - pad.t - pad.b;

  const pts = (samples || []).filter((s) => s.v != null && Number.isFinite(s.v));
  if (pts.length < 2) {
    ctx.fillStyle = INK.secondary;
    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillText('collecting data…', pad.l, cssH / 2);
    return null;
  }

  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t;
  let vMin = opts.min ?? Math.min(...pts.map((p) => p.v));
  let vMax = opts.max ?? Math.max(...pts.map((p) => p.v));
  if (vMax === vMin) { vMax += 1; vMin -= 1; }
  const span = vMax - vMin;
  vMin -= span * 0.08;
  vMax += span * 0.08;

  const X = (t) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * w;
  const Y = (v) => pad.t + (1 - (v - vMin) / (vMax - vMin)) * h;

  // Recessive grid: 3 horizontal lines only.
  ctx.strokeStyle = INK.grid;
  ctx.lineWidth = 1;
  for (const f of [0, 0.5, 1]) {
    const y = pad.t + f * h;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + w, y);
    ctx.stroke();
  }

  // The line (2px) with a soft area fill under it.
  const color = opts.color || SERIES_COLORS.strength;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(X(p.t), Y(p.v)) : ctx.moveTo(X(p.t), Y(p.v))));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.lineTo(X(t1), pad.t + h);
  ctx.lineTo(X(t0), pad.t + h);
  ctx.closePath();
  ctx.fillStyle = `${color}22`;
  ctx.fill();

  // Latest-value marker + direct label (text token ink, not series color).
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(X(last.t), Y(last.v), 3.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#121821'; // 2px surface ring
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = INK.primary;
  ctx.font = '600 11px "SF Mono", ui-monospace, monospace';
  const label = `${roundNice(last.v)}${opts.unit || ''}`;
  ctx.fillText(label, pad.l + w + 6, Y(last.v) + 4);

  // Time-span caption.
  ctx.fillStyle = INK.secondary;
  ctx.font = '9px -apple-system, sans-serif';
  const mins = Math.round((t1 - t0) / 60000);
  ctx.fillText(`last ${mins} min`, pad.l, cssH - 3);

  // Return a hit-test readout function for the hover layer.
  return {
    readout(clientX) {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      let best = pts[0], bd = Infinity;
      for (const p of pts) {
        const d = Math.abs(X(p.t) - x);
        if (d < bd) { bd = d; best = p; }
      }
      return { x: X(best.t), y: Y(best.v), t: best.t, v: best.v };
    },
    redrawWithCrosshair(clientX) {
      const r = this.readout(clientX);
      drawTrend(canvas, samples, opts);
      const c2 = canvas.getContext('2d');
      c2.save();
      c2.scale(1, 1);
      c2.strokeStyle = INK.secondary;
      c2.setLineDash([3, 3]);
      c2.beginPath();
      c2.moveTo(r.x, pad.t);
      c2.lineTo(r.x, pad.t + h);
      c2.stroke();
      c2.setLineDash([]);
      c2.beginPath();
      c2.arc(r.x, r.y, 4, 0, Math.PI * 2);
      c2.fillStyle = color;
      c2.fill();
      // Tooltip: value + local time, ink on raised surface.
      const time = new Date(r.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const text = `${roundNice(r.v)}${opts.unit || ''} · ${time}`;
      c2.font = '600 10px -apple-system, sans-serif';
      const tw = c2.measureText(text).width + 12;
      const tx = Math.min(Math.max(r.x - tw / 2, 2), cssW - tw - 2);
      const ty = Math.max(r.y - 26, 2);
      c2.fillStyle = 'rgba(11,15,20,0.95)';
      c2.strokeStyle = INK.grid;
      c2.beginPath();
      c2.roundRect(tx, ty, tw, 18, 5);
      c2.fill();
      c2.stroke();
      c2.fillStyle = INK.primary;
      c2.fillText(text, tx + 6, ty + 12);
      c2.restore();
    },
  };
}

/** Attach touch/pointer readout behaviour to a rendered trend canvas. */
export function attachTrendInteraction(canvas, samples, opts) {
  let handle = drawTrend(canvas, samples, opts);
  if (!handle) return;
  const move = (e) => {
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    handle.redrawWithCrosshair(cx);
  };
  const end = () => { handle = drawTrend(canvas, samples, opts) || handle; };
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerleave', end);
  canvas.addEventListener('touchmove', move, { passive: true });
  canvas.addEventListener('touchend', end);
}

function roundNice(v) {
  return Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
}
