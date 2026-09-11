/**
 * Advanced Charting & 3D Visualization
 *
 * Storm structure visualization, cross-section views, animated loops,
 * multi-storm comparison, and forecast graphs.
 */

export class StormStructureVisualizer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.canvas = null;
    this.ctx = null;
  }

  initialize() {
    this.canvas = document.createElement('canvas');
    const width = this.container?.clientWidth || 400;
    this.canvas.width = width;
    this.canvas.height = 220;
    this.canvas.style.cssText = 'display: block; width: 100%; height: 100%; border-radius: 8px;';
    this.container?.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
  }

  /**
   * Render 2D storm cross-section (N-S or E-W)
   */
  renderCrossSection(storm, direction = 'N-S') {
    if (!this.ctx) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height - 40;
    const maxHeight = this.canvas.height - 60;
    const stormWidth = 40; // km visual width

    // Draw ground
    this.ctx.strokeStyle = 'rgba(100,150,255,0.3)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, centerY);
    this.ctx.lineTo(this.canvas.width, centerY);
    this.ctx.stroke();

    // Draw storm profile (simplified bell curve)
    const peakHeight = (storm.topKft || 40) / 55 * maxHeight; // 55 kft typical max
    const peakDbz = storm.maxDbz || 50;

    this.ctx.fillStyle = `rgba(255, ${Math.max(100, 255 - peakDbz * 2)}, 0, 0.5)`;
    this.ctx.beginPath();

    for (let x = centerX - stormWidth * 2; x <= centerX + stormWidth * 2; x += 2) {
      const distFromCenter = Math.abs(x - centerX);
      const heightRatio = Math.max(0, 1 - Math.pow(distFromCenter / (stormWidth * 2), 2));
      const y = centerY - (heightRatio * peakHeight);

      if (x === centerX - stormWidth * 2) {
        this.ctx.moveTo(x, centerY);
        this.ctx.lineTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.lineTo(centerX + stormWidth * 2, centerY);
    this.ctx.fill();

    // Labels
    this.ctx.fillStyle = '#e5eaf0';
    this.ctx.font = '11px sans-serif';
    this.ctx.fillText(`${storm.topKft} kft`, centerX + 10, centerY - peakHeight - 5);
    this.ctx.fillText(`${storm.maxDbz} dBZ`, centerX + 10, centerY - peakHeight / 2);
    this.ctx.fillText(direction, 10, 15);
  }

  /**
   * Render 3D-perspective storm cube
   */
  render3DStorm(storm) {
    if (!this.ctx) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const scale = 1;

    // Simplified 3D cube projection
    const corners = [
      { x: -20, y: -20, z: 0, label: 'Base' },
      { x: 20, y: -20, z: 0 },
      { x: 20, y: 20, z: 0 },
      { x: -20, y: 20, z: 0 },
      { x: -20, y: -20, z: (storm.topKft || 40) / 2, label: 'Top' },
      { x: 20, y: -20, z: (storm.topKft || 40) / 2 },
      { x: 20, y: 20, z: (storm.topKft || 40) / 2 },
      { x: -20, y: 20, z: (storm.topKft || 40) / 2 },
    ];

    // Project 3D to 2D with rotation
    const angle = Date.now() / 3000;
    const projected = corners.map((c) => {
      const rotX = c.x * Math.cos(angle) - c.z * Math.sin(angle);
      const rotZ = c.x * Math.sin(angle) + c.z * Math.cos(angle);

      return {
        x: centerX + rotX * scale,
        y: centerY - c.y * scale - rotZ * scale * 0.3,
      };
    });

    // Draw cube edges
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

    this.ctx.strokeStyle = 'rgba(100,150,255,0.5)';
    this.ctx.lineWidth = 1.5;

    edges.forEach(([a, b]) => {
      this.ctx.beginPath();
      this.ctx.moveTo(projected[a].x, projected[a].y);
      this.ctx.lineTo(projected[b].x, projected[b].y);
      this.ctx.stroke();
    });

    // Fill with color gradient
    this.ctx.fillStyle = `rgba(255, ${255 - (storm.maxDbz || 50) * 2}, 0, 0.3)`;
    this.ctx.beginPath();
    this.ctx.moveTo(projected[4].x, projected[4].y);
    this.ctx.lineTo(projected[5].x, projected[5].y);
    this.ctx.lineTo(projected[6].x, projected[6].y);
    this.ctx.lineTo(projected[7].x, projected[7].y);
    this.ctx.fill();
  }
}

export class MultiStormComparison {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.canvas = null;
    this.ctx = null;
  }

  initialize() {
    this.canvas = document.createElement('canvas');
    const width = this.container?.clientWidth || 500;
    this.canvas.width = width;
    this.canvas.height = 220;
    this.canvas.style.cssText = 'display: block; width: 100%; height: 100%; border-radius: 8px;';
    this.container?.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
  }

  /**
   * Render multi-storm comparison bars
   */
  renderComparison(storms, metric = 'severeScore') {
    if (!this.ctx || storms.length === 0) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const padding = 40;
    const barWidth = (this.canvas.width - padding * 2) / storms.length;
    const maxScore = 100;

    storms.forEach((storm, idx) => {
      const value = storm[metric] || storm.severeScore || 0;
      const barHeight = (value / maxScore) * (this.canvas.height - padding - 20);
      const x = padding + idx * barWidth + barWidth * 0.1;
      const y = this.canvas.height - padding + 5 - barHeight;

      // Color by value
      const hue = Math.max(0, 120 - (value * 1.2));
      this.ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
      this.ctx.fillRect(x, y, barWidth * 0.8, barHeight);

      // Label
      this.ctx.fillStyle = '#e5eaf0';
      this.ctx.font = '10px sans-serif';
      this.ctx.fillText(storm.cell.id, x, this.canvas.height - padding + 15);
      this.ctx.fillText(Math.round(value), x + 5, y - 5);
    });

    // Axis
    this.ctx.strokeStyle = 'rgba(100,150,255,0.3)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(padding - 10, this.canvas.height - padding + 5);
    this.ctx.lineTo(this.canvas.width - padding, this.canvas.height - padding + 5);
    this.ctx.stroke();
  }
}

export class ForecastGraph {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.canvas = null;
    this.ctx = null;
  }

  initialize() {
    this.canvas = document.createElement('canvas');
    const width = this.container?.clientWidth || 400;
    this.canvas.width = width;
    this.canvas.height = 220;
    this.canvas.style.cssText = 'display: block; width: 100%; height: 100%; border-radius: 8px;';
    this.container?.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
  }

  /**
   * Render forecast line graph
   */
  renderForecast(forecast, label = 'Reflectivity') {
    if (!this.ctx) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const padding = 30;
    const width = this.canvas.width - padding * 2;
    const height = this.canvas.height - padding * 2;

    // Get data points
    const data = [
      forecast.dbz.current,
      forecast.dbz.forecast15,
      forecast.dbz.forecast30,
    ];
    const labels = ['Now', '+15 min', '+30 min'];
    const maxValue = 80;

    // Draw line
    this.ctx.strokeStyle = '#ff6600';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();

    data.forEach((val, idx) => {
      const x = padding + (idx / (data.length - 1)) * width;
      const y = padding + height - (val / maxValue) * height;

      if (idx === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    });

    this.ctx.stroke();

    // Draw points and labels
    this.ctx.fillStyle = '#ff6600';
    data.forEach((val, idx) => {
      const x = padding + (idx / (data.length - 1)) * width;
      const y = padding + height - (val / maxValue) * height;

      this.ctx.beginPath();
      this.ctx.arc(x, y, 4, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.fillStyle = '#e5eaf0';
      this.ctx.font = '10px sans-serif';
      this.ctx.fillText(labels[idx], x - 15, this.canvas.height - padding + 15);
      this.ctx.fillText(Math.round(val), x - 8, y - 10);
      this.ctx.fillStyle = '#ff6600';
    });

    // Axis labels
    this.ctx.fillStyle = '#e5eaf0';
    this.ctx.font = '11px sans-serif';
    this.ctx.fillText(label, 10, 15);
  }
}

/**
 * Animated radar loop with playback controls
 */
export function createAnimatedRadarLoop(frames, duration = 5000) {
  let currentFrame = 0;
  const frameInterval = duration / frames.length;

  return {
    play: () => {
      const interval = setInterval(() => {
        currentFrame = (currentFrame + 1) % frames.length;
      }, frameInterval);
      return interval;
    },
    pause: (interval) => clearInterval(interval),
    seek: (frame) => {
      currentFrame = Math.max(0, Math.min(frame, frames.length - 1));
    },
    getCurrentFrame: () => frames[currentFrame],
  };
}
