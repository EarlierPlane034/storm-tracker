/**
 * Advanced Analysis Panel
 *
 * Unified interface for hodograph, environmental overlays, trend charts,
 * performance metrics, and storm comparisons.
 */

import { HodographView, calculateSRH, calculateShear } from './hodographView.js';
import { EnvironmentalOverlay, formatEnvironment, calculateERV } from './environmentalOverlay.js';
import { getStormTrends, predictStormMovement, calculateGrowthRate } from '../analysis/stormTrendAnalysis.js';
import { StormMetricsAnimation, HailScatterPlot, TornadoRiskMap, renderLeaderboard } from './dataVisualizations.js';
import { RenderOptimizer, MobileOptimizer } from './renderOptimization.js';
import { debounce } from '../utils.js';

export class AdvancedAnalysisPanel {
  constructor(containerId, map) {
    this.container = document.getElementById(containerId);
    this.map = map;
    this.activeTab = 'overview';
    this.selectedStorm = null;

    this.hodograph = null;
    this.envOverlay = null;
    this.metricsAnimation = null;
    this.hailScatter = null;
    this.tornadoRiskMap = null;
    this.renderOptimizer = new RenderOptimizer(map);
    this.mobileOptimizer = new MobileOptimizer(window.innerHeight > window.innerWidth);

    this.initialize();
  }

  initialize() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="advanced-panel">
        <div class="panel-tabs">
          <button class="tab-btn active" data-tab="overview">📊 Overview</button>
          <button class="tab-btn" data-tab="hodograph">🌀 Hodograph</button>
          <button class="tab-btn" data-tab="environment">🌍 Environment</button>
          <button class="tab-btn" data-tab="trends">📈 Trends</button>
          <button class="tab-btn" data-tab="ranking">🏆 Rankings</button>
          <button class="tab-btn" data-tab="performance">⚡ Performance</button>
        </div>

        <div class="panel-content">
          <div id="tab-overview" class="tab-content active"></div>
          <div id="tab-hodograph" class="tab-content"></div>
          <div id="tab-environment" class="tab-content"></div>
          <div id="tab-trends" class="tab-content"></div>
          <div id="tab-ranking" class="tab-content"></div>
          <div id="tab-performance" class="tab-content"></div>
        </div>
      </div>
    `;

    this.setupEventListeners();
    this.applyStyles();
  }

  setupEventListeners() {
    this.container?.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this.activeTab = e.target.dataset.tab;
        this.switchTab(e.target.dataset.tab);
      });
    });

    window.addEventListener('resize', debounce(() => {
      this.mobileOptimizer.isPortrait = window.innerHeight > window.innerWidth;
      this.layout();
    }, 150));
  }

  /**
   * Switch to a tab and render its content
   */
  switchTab(tabName) {
    // Update active button
    this.container?.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update active content
    this.container?.querySelectorAll('.tab-content').forEach((content) => {
      content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    // Render tab content
    this.renderTabContent(tabName);
  }

  /**
   * Render content for a specific tab
   */
  renderTabContent(tabName) {
    const content = this.container?.querySelector(`#tab-${tabName}`);
    if (!content) return;

    switch (tabName) {
      case 'overview':
        this.renderOverview(content);
        break;
      case 'hodograph':
        this.renderHodograph(content);
        break;
      case 'environment':
        this.renderEnvironment(content);
        break;
      case 'trends':
        this.renderTrends(content);
        break;
      case 'ranking':
        this.renderRanking(content);
        break;
      case 'performance':
        this.renderPerformance(content);
        break;
    }
  }

  renderOverview(content) {
    if (!this.selectedStorm) {
      content.innerHTML = '<p style="color: #888;">Select a storm to view details</p>';
      return;
    }

    const trends = getStormTrends(this.selectedStorm.cell.id);
    const growth = calculateGrowthRate(this.selectedStorm.cell.id);
    const prediction = predictStormMovement(this.selectedStorm.cell);

    content.innerHTML = `
      <div class="overview-content">
        <h3>${this.selectedStorm.cell.id}</h3>
        <div class="stat-grid">
          <div class="stat-item">
            <div class="stat-label">Severity</div>
            <div class="stat-value">${this.selectedStorm.severeScore}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Tornado Risk</div>
            <div class="stat-value">${this.selectedStorm.tornado.score}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Growth Rate</div>
            <div class="stat-value">${growth?.severity?.toFixed(1) || 'N/A'} pts/min</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Movement</div>
            <div class="stat-value">${this.selectedStorm.cell.moveSpeedKts || 0} kt</div>
          </div>
        </div>
        ${prediction ? `
          <div class="prediction-box">
            <strong>Predicted Position (+30 min)</strong>
            <p>${prediction.lat.toFixed(3)}°, ${prediction.lon.toFixed(3)}°</p>
          </div>
        ` : ''}
      </div>
    `;
  }

  renderHodograph(content) {
    if (!this.selectedStorm?.environment) {
      content.innerHTML = '<p style="color: #888;">No environment data available</p>';
      return;
    }

    const env = this.selectedStorm.environment;
    const windProfile = {
      levels: [0, 1000, 3000, 5000, 7000, 10000],
      uWind: env.uWinds || [0, 5, 10, 12, 8, 5],
      vWind: env.vWinds || [0, 3, 8, 10, 6, 3],
    };

    const stormMotion = {
      u: this.selectedStorm.cell.moveSpeedKts ? Math.cos(this.selectedStorm.cell.moveDirDeg * Math.PI / 180) * this.selectedStorm.cell.moveSpeedKts : 0,
      v: this.selectedStorm.cell.moveSpeedKts ? Math.sin(this.selectedStorm.cell.moveDirDeg * Math.PI / 180) * this.selectedStorm.cell.moveSpeedKts : 0,
    };

    const srh0_1 = calculateSRH(windProfile, stormMotion, 'low');
    const shear = calculateShear(windProfile);

    if (!this.hodograph) {
      content.innerHTML = '<div id="hodograph-container" style="display: flex; justify-content: center;"></div>';
      this.hodograph = new HodographView('hodograph-container');
      this.hodograph.initialize();
    }

    this.hodograph.render(windProfile, stormMotion);

    content.innerHTML += `
      <div class="hodograph-stats">
        <div class="stat-row">
          <span>0-1 km SRH:</span> <strong>${Math.round(srh0_1)} m²/s²</strong>
        </div>
        <div class="stat-row">
          <span>0-6 km Shear:</span> <strong>${Math.round(shear)} kt</strong>
        </div>
      </div>
    `;
  }

  renderEnvironment(content) {
    if (!this.selectedStorm?.environment) {
      content.innerHTML = '<p style="color: #888;">No environment data available</p>';
      return;
    }

    const env = formatEnvironment(this.selectedStorm.environment);
    const erv = calculateERV(this.selectedStorm.cell, calculateShear({
      uWind: [0, 10],
      vWind: [0, 8],
    }));

    content.innerHTML = `
      <div class="environment-content">
        <div class="env-param">
          <strong>CAPE:</strong> ${env.cape}
        </div>
        <div class="env-param">
          <strong>CIN:</strong> ${env.cin}
        </div>
        <div class="env-param">
          <strong>LCL:</strong> ${env.lcl}
        </div>
        <div class="env-param">
          <strong>Freezing Level:</strong> ${env.freezing}
        </div>
        <div class="env-param">
          <strong>Estimated Rotational Velocity:</strong> ${erv} kt
        </div>
        <button class="env-btn" onclick="alert('Toggling CAPE overlay...')">🌍 Show CAPE Overlay</button>
        <button class="env-btn" onclick="alert('Toggling LCL overlay...')">☁️ Show LCL Overlay</button>
      </div>
    `;
  }

  renderTrends(content) {
    if (!this.selectedStorm) {
      content.innerHTML = '<p style="color: #888;">Select a storm to view trends</p>';
      return;
    }

    const trends = getStormTrends(this.selectedStorm.cell.id);
    if (!trends) {
      content.innerHTML = '<p style="color: #888;">No trend data available</p>';
      return;
    }

    content.innerHTML = '<div id="metrics-container"></div><div id="hail-scatter"></div>';

    if (!this.metricsAnimation) {
      this.metricsAnimation = new StormMetricsAnimation('metrics-container');
      this.metricsAnimation.initialize();
    }
    this.metricsAnimation.renderMetrics(trends);

    if (!this.hailScatter) {
      this.hailScatter = new HailScatterPlot('hail-scatter');
      this.hailScatter.initialize();
    }
  }

  renderRanking(content) {
    content.innerHTML = '<div id="leaderboard-container"></div>';
    // This would be populated with actual storm data in production
  }

  renderPerformance(content) {
    const metrics = this.renderOptimizer.getMetrics();

    content.innerHTML = `
      <div class="performance-content">
        <div class="perf-metric">
          <span>FPS:</span> <strong>${metrics.fps}</strong>
        </div>
        <div class="perf-metric">
          <span>Render Time:</span> <strong>${metrics.renderTimeMs}ms</strong>
        </div>
        <div class="perf-metric">
          <span>Storms Rendered:</span> <strong>${metrics.stormsRendered}</strong>
        </div>
        <div class="perf-metric">
          <span>Status:</span> <strong style="color: ${metrics.isOptimal ? '#34d399' : '#ef4444'}">
            ${metrics.isOptimal ? '✓ Optimal' : '⚠ Degraded'}
          </strong>
        </div>
        <label style="display: flex; align-items: center; gap: 8px; margin-top: 10px;">
          <input type="checkbox" id="battery-saver" /> Battery Saver Mode
        </label>
        <label style="display: flex; align-items: center; gap: 8px; margin-top: 10px;">
          <input type="checkbox" id="landscape-mode" /> Landscape Mode
        </label>
      </div>
    `;
  }

  applyStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
      .advanced-panel {
        background: rgba(20,20,30,0.95);
        border-radius: 8px;
        overflow: hidden;
      }

      .panel-tabs {
        display: flex;
        gap: 5px;
        padding: 10px;
        background: rgba(10,10,15,0.8);
        overflow-x: auto;
      }

      .tab-btn {
        padding: 8px 12px;
        background: rgba(100,150,255,0.1);
        border: 1px solid rgba(100,150,255,0.2);
        color: #e5eaf0;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        white-space: nowrap;
        transition: all 0.2s;
      }

      .tab-btn:hover {
        background: rgba(100,150,255,0.2);
      }

      .tab-btn.active {
        background: #0099ff;
        border-color: #0099ff;
      }

      .panel-content {
        padding: 15px;
        max-height: 500px;
        overflow-y: auto;
      }

      .tab-content {
        display: none;
      }

      .tab-content.active {
        display: block;
      }

      .stat-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin: 15px 0;
      }

      .stat-item {
        background: rgba(20, 30, 50, 0.9);
        padding: 12px;
        border-radius: 6px;
        border: 1px solid rgba(100,150,255,0.3);
      }

      .stat-label {
        font-size: 11px;
        color: #888;
        margin-bottom: 5px;
      }

      .stat-value {
        font-size: 18px;
        font-weight: bold;
        color: #fbbf24;
      }

      .env-param {
        padding: 10px;
        margin: 8px 0;
        background: rgba(20, 30, 50, 0.85);
        border-left: 3px solid #38bdf8;
        border-radius: 4px;
        font-size: 12px;
        color: #d1d5db;
      }

      .env-btn {
        width: 100%;
        padding: 8px;
        margin-top: 10px;
        background: rgba(100,150,255,0.2);
        border: 1px solid rgba(100,150,255,0.4);
        color: #0099ff;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
      }

      .env-btn:hover {
        background: rgba(100,150,255,0.3);
      }
    `;
    document.head.appendChild(style);
  }

  selectStorm(storm) {
    this.selectedStorm = storm;
    if (this.activeTab === 'overview' || this.activeTab === 'hodograph') {
      this.renderTabContent(this.activeTab);
    }
  }

  layout() {
    if (this.mobileOptimizer.isPortrait) {
      // Portrait layout
      this.container?.style.setProperty('height', '40vh');
    } else {
      // Landscape layout
      this.container?.style.setProperty('width', '35%');
    }
  }
}
