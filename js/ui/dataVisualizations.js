/**
 * Data Visualizations
 *
 * Animated metrics, scatter plots, risk maps, environmental profiles,
 * and storm ranking leaderboard for comprehensive analysis.
 */

/**
 * Animated Storm Growth/Decay Metrics
 */
export class StormMetricsAnimation {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.canvas = null;
    this.ctx = null;
    this.animationId = null;
  }

  initialize() {
    this.canvas = document.createElement('canvas');
    const width = this.container?.clientWidth || 400;
    this.canvas.width = width;
    this.canvas.height = 200;
    this.canvas.style.cssText = 'display: block; width: 100%; height: auto; background: rgba(20,20,30,0.9); border-radius: 8px; margin: 10px 0;';
    this.container?.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
  }

  /**
   * Render animated metrics with trend lines
   */
  stop() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.animationId = null;
  }

  renderMetrics(trends, duration = 2000) {
    if (!this.ctx || !trends) return;
    this.stop(); // a re-render while a previous animation is still playing shouldn't stack loops

    let startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);

      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // Draw reflectivity trend
      this.drawTrendLine(trends.reflectivity, '#ff6600', 'Reflectivity (dBZ)', progress);

      // Draw VIL trend
      this.drawTrendLine(trends.vil, '#ef4444', 'VIL (kg/m²)', progress, 50);

      // Draw severity trend
      this.drawTrendLine(trends.severity, '#fbbf24', 'Severity Score', progress, 100);

      if (progress < 1) {
        this.animationId = requestAnimationFrame(animate);
      }
    };

    animate();
  }

  drawTrendLine(values, color, label, progress, maxValue = 100) {
    if (!values || values.length === 0) return;

    const padding = 30;
    const width = this.canvas.width - padding * 2;
    const height = this.canvas.height - padding * 2;
    const pointCount = Math.ceil(values.length * progress);

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();

    for (let i = 0; i < pointCount; i++) {
      const x = padding + (i / (values.length - 1)) * width;
      const y = padding + height - (values[i] / maxValue) * height;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    this.ctx.stroke();

    // Draw label
    this.ctx.fillStyle = color;
    this.ctx.font = '10px sans-serif';
    this.ctx.fillText(label, padding, padding - 5);
  }
}

/**
 * Hail Probability vs Reflectivity Scatter Plot
 */
export class HailScatterPlot {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.canvas = null;
    this.ctx = null;
  }

  initialize() {
    this.canvas = document.createElement('canvas');
    const width = this.container?.clientWidth || 300;
    this.canvas.width = width;
    this.canvas.height = 250;
    this.canvas.style.cssText = 'display: block; width: 100%; height: auto; background: rgba(20,20,30,0.9); border-radius: 8px; margin: 10px 0;';
    this.container?.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
  }

  /**
   * Render scatter plot of storms
   */
  render(storms) {
    if (!this.ctx || !storms) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const padding = 40;
    const width = this.canvas.width - padding * 2;
    const height = this.canvas.height - padding * 2;

    // Draw axes
    this.ctx.strokeStyle = 'rgba(100,150,255,0.3)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(padding, padding);
    this.ctx.lineTo(padding, this.canvas.height - padding);
    this.ctx.lineTo(this.canvas.width - padding, this.canvas.height - padding);
    this.ctx.stroke();

    // Axis labels
    this.ctx.fillStyle = '#e5eaf0';
    this.ctx.font = '10px sans-serif';
    this.ctx.fillText('Reflectivity (dBZ)', padding + 5, padding - 10);
    this.ctx.save();
    this.ctx.translate(10, padding + height / 2);
    this.ctx.rotate(-Math.PI / 2);
    this.ctx.fillText('Hail Probability (%)', 0, 0);
    this.ctx.restore();

    // Plot storms
    storms.forEach((storm) => {
      if (storm.scores?.hail == null || !storm.cell?.maxDbz) return;

      const x = padding + (storm.cell.maxDbz / 80) * width;
      const y = this.canvas.height - padding - (storm.scores.hail / 100) * height;

      // Color by severity
      const color = storm.severeScore >= 61 ? '#ef4444' : storm.severeScore >= 41 ? '#fbbf24' : '#34d399';

      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(x, y, 5, 0, Math.PI * 2);
      this.ctx.fill();

      // Label dangerous storms
      if (storm.severeScore >= 61) {
        this.ctx.fillStyle = '#e5eaf0';
        this.ctx.font = 'bold 9px sans-serif';
        this.ctx.fillText(Math.round(storm.severeScore), x - 10, y - 8);
      }
    });
  }
}

/**
 * Environmental Profile Comparison Tool
 */
export function createProfileComparison(storms) {
  const comparison = [];

  storms.forEach((storm) => {
    if (!storm.environment) return;

    comparison.push({
      stormId: storm.cell.id,
      severity: storm.severeScore,
      cape: storm.environment.cape || 0,
      cin: storm.environment.cin || 0,
      shear: storm.environment.shear || 0,
      srh: storm.environment.srh || 0,
      lclM: storm.environment.lclM || 0,
      freezingM: storm.environment.freezingM || 0,
    });
  });

  return comparison.sort((a, b) => b.severity - a.severity);
}

/**
 * Storm Ranking Leaderboard
 */
export function generateLeaderboard(storms) {
  const ranked = storms
    .map((storm) => ({
      rank: 0,
      stormId: storm.cell.id,
      lat: storm.cell.lat,
      lon: storm.cell.lon,
      severity: storm.severeScore,
      tornado: storm.tornado.score,
      hail: storm.scores.hail,
      wind: storm.scores.wind,
      maxDbz: storm.cell.maxDbz,
      vil: storm.cell.vil,
      age: storm.age || 0,
      movement: `${storm.cell.moveSpeedKts || 0} kt ${storm.cell.moveDirDeg ? `${Math.round(storm.cell.moveDirDeg)}°` : ''}`,
    }))
    .sort((a, b) => b.severity - a.severity);

  ranked.forEach((s, i) => {
    s.rank = i + 1;
  });

  return ranked;
}

/**
 * Render HTML leaderboard
 */
export function renderLeaderboard(containerId, storms) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const leaderboard = generateLeaderboard(storms);

  const html = `
    <div class="leaderboard">
      <h3>🏆 Storm Rankings</h3>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Severity</th>
            <th>Tornado</th>
            <th>Hail</th>
            <th>Wind</th>
            <th>ReflectivityMax</th>
            <th>VIL</th>
            <th>Movement</th>
          </tr>
        </thead>
        <tbody>
          ${leaderboard.slice(0, 10).map((s) => `
            <tr class="rank-${s.rank}">
              <td>${s.rank}</td>
              <td><strong>${s.severity}</strong></td>
              <td>${s.tornado}</td>
              <td>${s.hail}</td>
              <td>${s.wind}</td>
              <td>${s.maxDbz} dBZ</td>
              <td>${s.vil} kg/m²</td>
              <td>${s.movement}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;

  // Style leaderboard
  const style = document.createElement('style');
  style.innerHTML = `
    .leaderboard {
      background: rgba(20,20,30,0.9);
      border-radius: 8px;
      padding: 15px;
      margin: 10px 0;
      max-height: 400px;
      overflow-y: auto;
    }
    .leaderboard h3 {
      color: #fbbf24;
      margin: 0 0 10px 0;
      font-size: 14px;
    }
    .leaderboard table {
      width: 100%;
      font-size: 11px;
      border-collapse: collapse;
    }
    .leaderboard th {
      background: rgba(100,150,255,0.1);
      color: #38bdf8;
      padding: 8px;
      text-align: left;
      border-bottom: 1px solid rgba(100,150,255,0.2);
    }
    .leaderboard td {
      padding: 6px 8px;
      border-bottom: 1px solid rgba(100,150,255,0.1);
      color: #e5eaf0;
    }
    .leaderboard tr.rank-1 { background: rgba(255,102,0,0.1); }
    .leaderboard tr.rank-2 { background: rgba(255,187,0,0.05); }
    .leaderboard tr.rank-3 { background: rgba(52,211,153,0.05); }
  `;
  document.head.appendChild(style);
}
