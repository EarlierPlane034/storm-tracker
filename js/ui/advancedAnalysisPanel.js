/**
 * Advanced Analysis Panel
 *
 * Unified interface for hodograph, environmental overlays, trend charts,
 * performance metrics, and storm comparisons.
 */

import { HodographView, calculateSRH, calculateShear } from './hodographView.js';
import { formatEnvironment, calculateERV } from './environmentalOverlay.js';
import { getStormTrends, predictStormMovement, calculateGrowthRate } from '../analysis/stormTrendAnalysis.js';
import { StormMetricsAnimation, HailScatterPlot, renderLeaderboard } from './dataVisualizations.js';
import { MobileOptimizer } from './renderOptimization.js';
import { debounce } from '../utils.js';
import { settings, setSetting } from '../storage.js';

export class AdvancedAnalysisPanel {
  constructor(containerId, map, mapView, getAllAnalyses) {
    this.container = document.getElementById(containerId);
    this.map = map;
    this.mapView = mapView;
    this.getAllAnalyses = getAllAnalyses;
    this.activeTab = 'overview';
    this.selectedStorm = null;

    this.hodograph = null;
    this.metricsAnimation = null;
    this.hailScatter = null;
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
    this.applyTabVisibility();
  }

  /** Hide sub-tab buttons the user turned off in Settings → Visible tabs.
   * If the active one just got hidden, fall back to the first visible one. */
  applyTabVisibility() {
    const hidden = settings.hiddenAnalysisTabs || [];
    const buttons = this.container?.querySelectorAll('.tab-btn') || [];
    let activeStillVisible = false;
    buttons.forEach((btn) => {
      const isHidden = hidden.includes(btn.dataset.tab);
      btn.hidden = isHidden;
      if (!isHidden && btn.dataset.tab === this.activeTab) activeStillVisible = true;
    });
    if (!activeStillVisible) {
      const firstVisible = [...buttons].find((b) => !b.hidden);
      if (firstVisible) { this.activeTab = firstVisible.dataset.tab; this.switchTab(this.activeTab); }
    }
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

  /** Real wind-profile levels from the environment fetch (js/api/openmeteo.js
   * returns `windProfile: {sfc, w850, w700, w500}`, each a real {u,v}
   * vector) - falls back to a labeled placeholder only when real data is
   * genuinely missing (e.g. wind fields absent from a given API response). */
  buildWindProfile(env) {
    const realLevels = [
      { m: 0, w: env?.windProfile?.sfc },
      { m: 1500, w: env?.windProfile?.w850 },
      { m: 3000, w: env?.windProfile?.w700 },
      { m: 5500, w: env?.windProfile?.w500 },
    ].filter((l) => l.w);
    if (realLevels.length >= 2) {
      return { levels: realLevels.map((l) => l.m), uWind: realLevels.map((l) => l.w.u), vWind: realLevels.map((l) => l.w.v) };
    }
    return { levels: [0, 1000, 3000, 5000, 7000, 10000], uWind: [0, 5, 10, 12, 8, 5], vWind: [0, 3, 8, 10, 6, 3] };
  }

  renderHodograph(content) {
    if (!this.selectedStorm?.environment) {
      content.innerHTML = '<p style="color: #888;">No environment data available</p>';
      return;
    }

    const env = this.selectedStorm.environment;
    const windProfile = this.buildWindProfile(env);

    // u = east component, v = north component (matches windVector()'s own
    // convention in openmeteo.js: sin for u, cos for v on a compass
    // bearing) - this used to be swapped, mixing two different conventions
    // into the same SRH/shear vector-difference math below as the real
    // wind profile.
    const stormMotion = {
      u: this.selectedStorm.cell.moveSpeedKts ? Math.sin(this.selectedStorm.cell.moveDirDeg * Math.PI / 180) * this.selectedStorm.cell.moveSpeedKts : 0,
      v: this.selectedStorm.cell.moveSpeedKts ? Math.cos(this.selectedStorm.cell.moveDirDeg * Math.PI / 180) * this.selectedStorm.cell.moveSpeedKts : 0,
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
    // Was always fed a hardcoded fake wind profile regardless of real
    // conditions - now reuses the same real profile the Hodograph tab uses.
    const shear = calculateShear(this.buildWindProfile(this.selectedStorm.environment));
    const erv = calculateERV(this.selectedStorm.cell, shear);

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

    // content.innerHTML is rebuilt below on every call, which detaches
    // whatever canvas any previous instance was drawing to - stop that
    // animation loop and build fresh instances against the new container.
    this.metricsAnimation?.stop();
    content.innerHTML = '<div id="metrics-container"></div><div id="hail-scatter"></div>';

    this.metricsAnimation = new StormMetricsAnimation('metrics-container');
    this.metricsAnimation.initialize();
    this.metricsAnimation.renderMetrics(trends);

    this.hailScatter = new HailScatterPlot('hail-scatter');
    this.hailScatter.initialize();
    this.hailScatter.render(this.getAllAnalyses?.() || [this.selectedStorm]);
  }

  renderRanking(content) {
    const storms = this.getAllAnalyses?.() || [];
    if (!storms.length) {
      content.innerHTML = '<p style="color: #888;">No storms currently detected</p>';
      return;
    }
    content.innerHTML = '<div id="leaderboard-container"></div>';
    renderLeaderboard('leaderboard-container', storms);
  }

  renderPerformance(content) {
    // Real numbers from the map's last actual marker/track render pass
    // (mapView.renderCells), not a simulated/never-updated placeholder.
    const renderTimeMs = this.mapView?.lastRenderMs ?? 0;
    const stormsRendered = this.mapView?.lastRenderCount ?? 0;
    const isOptimal = renderTimeMs <= 50;

    content.innerHTML = `
      <div class="performance-content">
        <div class="perf-metric">
          <span>Last Render Time:</span> <strong>${renderTimeMs}ms</strong>
        </div>
        <div class="perf-metric">
          <span>Storms Rendered:</span> <strong>${stormsRendered}</strong>
        </div>
        <div class="perf-metric">
          <span>Status:</span> <strong style="color: ${isOptimal ? '#34d399' : '#ef4444'}">
            ${isOptimal ? '✓ Optimal' : '⚠ Degraded'}
          </strong>
        </div>
        <div class="perf-metric" style="margin-top: 10px; opacity: 0.75; font-size: 12px;">
          Data Saver is ${settings.dataSaver ? 'on' : 'off'} — change it in Settings → Quick presets / Units &amp; data.
        </div>
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
        color: var(--text);
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
        background: var(--accent);
        border-color: var(--accent);
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
        color: var(--text-dim);
        margin-bottom: 5px;
      }

      .stat-value {
        font-size: 18px;
        font-weight: bold;
        color: var(--warn);
      }

      .env-param {
        padding: 10px;
        margin: 8px 0;
        background: rgba(20, 30, 50, 0.85);
        border-left: 3px solid var(--accent);
        border-radius: 4px;
        font-size: 12px;
        color: var(--text);
      }

      .env-btn {
        width: 100%;
        padding: 8px;
        margin-top: 10px;
        background: rgba(100,150,255,0.2);
        border: 1px solid rgba(100,150,255,0.4);
        color: var(--accent);
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
