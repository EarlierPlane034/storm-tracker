/**
 * Hodograph Visualization
 *
 * Renders wind shear profile (hodograph) showing wind vector at multiple levels,
 * storm motion vector, and storm-relative wind profile for visualization and analysis.
 */

export class HodographView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.canvas = null;
    this.ctx = null;
    this.windData = null;
    this.stormMotion = null;
  }

  initialize() {
    if (!this.container) return;

    this.canvas = document.createElement('canvas');
    this.canvas.width = 300;
    this.canvas.height = 300;
    this.canvas.style.cssText = 'background: rgba(20,20,30,0.8); border-radius: 8px; border: 1px solid rgba(100,150,255,0.3);';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
  }

  /**
   * Update hodograph with wind profile data
   * @param {Object} windProfile - { levels: [m], uWind: [m/s], vWind: [m/s] }
   * @param {Object} stormMotion - { u: m/s, v: m/s }
   */
  render(windProfile, stormMotion) {
    if (!this.ctx || !windProfile) return;

    this.windData = windProfile;
    this.stormMotion = stormMotion;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const scale = 25; // pixels per m/s

    // Draw concentric circles (wind speed rings)
    this.ctx.strokeStyle = 'rgba(100,150,255,0.2)';
    this.ctx.lineWidth = 1;
    for (let speed = 5; speed <= 25; speed += 5) {
      const radius = speed * scale;
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // Draw axes
    this.ctx.strokeStyle = 'rgba(100,150,255,0.3)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, 0);
    this.ctx.lineTo(centerX, this.canvas.height);
    this.ctx.moveTo(0, centerY);
    this.ctx.lineTo(this.canvas.width, centerY);
    this.ctx.stroke();

    // Draw wind profile (hodograph curve)
    if (windProfile.uWind && windProfile.vWind && windProfile.uWind.length > 0) {
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();

      for (let i = 0; i < windProfile.uWind.length; i++) {
        const x = centerX + windProfile.uWind[i] * scale;
        const y = centerY - windProfile.vWind[i] * scale;

        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      }
      this.ctx.stroke();

      // Draw dots at each level
      this.ctx.fillStyle = '#38bdf8';
      windProfile.uWind.forEach((u, i) => {
        const x = centerX + u * scale;
        const y = centerY - windProfile.vWind[i] * scale;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 3, 0, Math.PI * 2);
        this.ctx.fill();
      });
    }

    // Draw storm motion vector
    if (stormMotion) {
      const stormX = centerX + stormMotion.u * scale;
      const stormY = centerY - stormMotion.v * scale;

      this.ctx.strokeStyle = '#ef4444';
      this.ctx.lineWidth = 2.5;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX, centerY);
      this.ctx.lineTo(stormX, stormY);
      this.ctx.stroke();

      // Storm motion arrow
      this.drawArrow(centerX, centerY, stormX, stormY, '#ef4444');

      // Storm motion dot
      this.ctx.fillStyle = '#ef4444';
      this.ctx.beginPath();
      this.ctx.arc(stormX, stormY, 5, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Draw storm-relative wind (SRW)
    if (windProfile.uWind && windProfile.vWind && stormMotion) {
      this.ctx.strokeStyle = '#fbbf24';
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([4, 4]);
      this.ctx.beginPath();

      for (let i = 0; i < windProfile.uWind.length; i++) {
        const srwU = windProfile.uWind[i] - stormMotion.u;
        const srwV = windProfile.vWind[i] - stormMotion.v;
        const x = centerX + srwU * scale;
        const y = centerY - srwV * scale;

        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      }
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    // Draw legend
    this.drawLegend();
  }

  drawArrow(fromX, fromY, toX, toY, color) {
    const headlen = 8;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    this.ctx.strokeStyle = color;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    this.ctx.lineTo(toX, toY);
    this.ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    this.ctx.stroke();
  }

  drawLegend() {
    const legends = [
      { color: '#38bdf8', label: 'Wind Profile' },
      { color: '#ef4444', label: 'Storm Motion' },
      { color: '#fbbf24', label: 'Storm-Relative Wind' },
    ];

    this.ctx.font = 'bold 10px sans-serif';
    this.ctx.fillStyle = '#e5eaf0';
    let y = 15;

    legends.forEach((leg, i) => {
      this.ctx.fillStyle = leg.color;
      this.ctx.fillRect(10, y - 5, 8, 8);
      this.ctx.fillStyle = '#e5eaf0';
      this.ctx.fillText(leg.label, 22, y + 2);
      y += 14;
    });
  }

  clear() {
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

/**
 * Calculate storm-relative helicity (SRH) from wind profile and storm motion
 */
export function calculateSRH(windProfile, stormMotion, layer = 'low') {
  if (!windProfile || !windProfile.levels) return 0;

  const layerRange = layer === 'low' ? [0, 1000] : [0, 3000];
  let srh = 0;

  for (let i = 0; i < windProfile.levels.length - 1; i++) {
    const z1 = windProfile.levels[i];
    const z2 = windProfile.levels[i + 1];
    if (z1 > layerRange[1] || z2 < layerRange[0]) continue;

    const u1 = windProfile.uWind[i] - (stormMotion?.u || 0);
    const v1 = windProfile.vWind[i] - (stormMotion?.v || 0);
    const u2 = windProfile.uWind[i + 1] - (stormMotion?.u || 0);
    const v2 = windProfile.vWind[i + 1] - (stormMotion?.v || 0);

    const crossProduct = u1 * v2 - u2 * v1;
    const dz = Math.min(z2, layerRange[1]) - Math.max(z1, layerRange[0]);
    srh += (crossProduct * dz) / 1000; // Normalize by dz
  }

  return Math.max(0, srh);
}

/**
 * Calculate deep-layer shear (0-6 km)
 */
export function calculateShear(windProfile) {
  if (!windProfile || windProfile.uWind.length < 2) return 0;

  const u0 = windProfile.uWind[0] || 0;
  const v0 = windProfile.vWind[0] || 0;
  const uTop = windProfile.uWind[windProfile.uWind.length - 1] || 0;
  const vTop = windProfile.vWind[windProfile.vWind.length - 1] || 0;

  return Math.sqrt(Math.pow(uTop - u0, 2) + Math.pow(vTop - v0, 2));
}

/**
 * Calculate wind shear in a specific layer
 */
export function calculateLayerShear(windProfile, layer) {
  if (!windProfile || !windProfile.levels) return 0;

  const [zBottom, zTop] = layer;
  let bottomIdx = -1, topIdx = -1;

  for (let i = 0; i < windProfile.levels.length; i++) {
    if (windProfile.levels[i] >= zBottom && bottomIdx === -1) bottomIdx = i;
    if (windProfile.levels[i] >= zTop) {
      topIdx = i;
      break;
    }
  }

  if (bottomIdx === -1 || topIdx === -1) return 0;

  const uDiff = windProfile.uWind[topIdx] - windProfile.uWind[bottomIdx];
  const vDiff = windProfile.vWind[topIdx] - windProfile.vWind[bottomIdx];

  return Math.sqrt(uDiff * uDiff + vDiff * vDiff);
}
