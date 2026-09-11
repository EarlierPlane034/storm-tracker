/**
 * Week 3 Features Integration Panel
 *
 * Wires all 8 Week 3 features into the UI:
 * 1. ML Storm Prediction
 * 2. Community & Social Features
 * 3. Advanced Forecasting
 * 4. Voice & Audio
 * 5. Chase Support & Safety
 * 6. Database & History
 * 7. Advanced Charting & 3D
 * 8. Educational & Training
 */

import {
  predictHailProbability, predictTornadoGenesis, classifyStormType,
  predictStormLongevity, predictRapidIntensification, scoreStormSimilarity,
} from '../ai/stormPredictionML.js';
import { SpotterReportManager, ChaserLeaderboard, SharedStormTracking } from '../social/communityFeatures.js';
import { predictHailSwath, predictTornadoTouchdownZone, predictSupercellSplitting, forecastReflectivityTrends, generateForecastNarrative } from '../forecast/advancedForecasting.js';
import { VoiceNarrator, AudioAlerts, VoiceCommands, generateStormBriefing } from '../audio/voiceAlerts.js';
import { ChaseRouter, LightningProximityAlert, SafeHavenFinder, ChaseDecisionScore } from '../chase/chaseSafety.js';
import { StormDatabase, StormReplay } from '../data/stormDatabase.js';
import { StormStructureVisualizer, MultiStormComparison, ForecastGraph } from '../ui/advancedCharting.js';
import { RadarPatternTutorial, StormQuiz, SpotterCertification, StormIdentificationGame } from '../education/stormTraining.js';
import { el } from '../utils.js';

export class Week3FeaturesPanel {
  constructor(containerId, map) {
    this.container = document.getElementById(containerId);
    this.map = map;
    this.activeTab = 'ml-predictions';

    // Feature instances
    this.spotterReportManager = new SpotterReportManager();
    this.chaserLeaderboard = new ChaserLeaderboard();
    this.sharedTracking = new SharedStormTracking();
    this.voiceNarrator = new VoiceNarrator();
    this.audioAlerts = new AudioAlerts();
    this.voiceCommands = new VoiceCommands();
    this.chaseRouter = new ChaseRouter(map);
    this.lightningAlert = new LightningProximityAlert();
    this.safeHavenFinder = new SafeHavenFinder();
    this.stormDatabase = new StormDatabase();
    this.radarTutorial = new RadarPatternTutorial();
    this.stormQuiz = new StormQuiz();
    this.certification = new SpotterCertification();
    this.identificationGame = new StormIdentificationGame();

    this.selectedStorm = null;
    this.selectedStorms = [];
    this.selectedAnalyses = [];

    this.initialize();
  }

  initialize() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="week3-panel">
        <div class="panel-tabs">
          <button class="tab-btn active" data-tab="ml-predictions">🤖 ML Predictions</button>
          <button class="tab-btn" data-tab="community">👥 Community</button>
          <button class="tab-btn" data-tab="forecasting">🔮 Forecasting</button>
          <button class="tab-btn" data-tab="voice">🎙️ Voice</button>
          <button class="tab-btn" data-tab="chase-safety">🛡️ Chase Safety</button>
          <button class="tab-btn" data-tab="database">💾 History</button>
          <button class="tab-btn" data-tab="charts">📊 Charts</button>
          <button class="tab-btn" data-tab="education">🎓 Training</button>
        </div>

        <div class="panel-content">
          <div id="tab-ml-predictions" class="tab-content active"></div>
          <div id="tab-community" class="tab-content"></div>
          <div id="tab-forecasting" class="tab-content"></div>
          <div id="tab-voice" class="tab-content"></div>
          <div id="tab-chase-safety" class="tab-content"></div>
          <div id="tab-database" class="tab-content"></div>
          <div id="tab-charts" class="tab-content"></div>
          <div id="tab-education" class="tab-content"></div>
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
  }

  switchTab(tabName) {
    this.container?.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    this.container?.querySelectorAll('.tab-content').forEach((content) => {
      content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    this.renderTabContent(tabName);
  }

  /**
   * Render content for a specific tab
   */
  renderTabContent(tabName) {
    const content = this.container?.querySelector(`#tab-${tabName}`);
    if (!content) return;

    content.innerHTML = '';

    switch (tabName) {
      case 'ml-predictions':
        this.renderMLPredictions(content);
        break;
      case 'community':
        this.renderCommunity(content);
        break;
      case 'forecasting':
        this.renderForecasting(content);
        break;
      case 'voice':
        this.renderVoice(content);
        break;
      case 'chase-safety':
        this.renderChaseSafety(content);
        break;
      case 'database':
        this.renderDatabase(content);
        break;
      case 'charts':
        this.renderCharts(content);
        break;
      case 'education':
        this.renderEducation(content);
        break;
    }
  }

  /**
   * 1. ML Predictions Tab
   */
  renderMLPredictions(container) {
    if (!this.selectedStorm) {
      container.innerHTML = '<div class="muted">Select a storm from the map to view ML predictions</div>';
      return;
    }

    const env = this.selectedStormEnv || {};
    const hailProb = predictHailProbability(this.selectedStorm, env);
    const tornadoGen = predictTornadoGenesis(this.selectedStorm, env);
    const stormType = classifyStormType(this.selectedStorm, env, {});
    const longevity = predictStormLongevity(this.selectedStorm, env);
    const intensification = predictRapidIntensification(this.selectedStorm, this.priorStormMetrics || null);
    const similarity = scoreStormSimilarity(this.selectedStorm, this.selectedStorms[1] || null);

    container.innerHTML = `
      <div class="ml-predictions">
        <div class="prediction-card">
          <div class="prediction-title">Hail Probability</div>
          <div class="prediction-bar">
            <div class="prediction-fill" style="width: ${hailProb}%"></div>
          </div>
          <div class="prediction-text">${Math.round(hailProb)}% chance of hail</div>
        </div>

        <div class="prediction-card">
          <div class="prediction-title">Tornado Genesis Risk</div>
          <div class="prediction-bar">
            <div class="prediction-fill" style="width: ${tornadoGen}%"></div>
          </div>
          <div class="prediction-text">${Math.round(tornadoGen)}% chance of tornado development</div>
        </div>

        <div class="prediction-card">
          <div class="prediction-title">Storm Type</div>
          <div class="prediction-text">${stormType.type} (confidence: ${stormType.confidence}%)</div>
        </div>

        <div class="prediction-card">
          <div class="prediction-title">Expected Longevity</div>
          <div class="prediction-text">${longevity} minutes</div>
        </div>

        <div class="prediction-card">
          <div class="prediction-title">Rapid Intensification</div>
          <div class="prediction-text">${intensification.willIntensify ? '🔴 YES — Rapid growth detected' : '🟢 No rapid intensification'}</div>
        </div>

        <div class="prediction-card">
          <div class="prediction-title">Storm Similarity</div>
          <div class="prediction-text">Similarity score: ${similarity}%</div>
        </div>
      </div>
    `;
  }

  /**
   * 2. Community & Social Features Tab
   */
  renderCommunity(container) {
    const reports = this.spotterReportManager.getAllReports();
    const leaderboard = this.chaserLeaderboard.getTopChasers();
    const activeTracks = this.sharedTracking.getActiveSharedStorms();

    container.innerHTML = `
      <div class="community-panel">
        <div class="community-section">
          <h3>📝 Spotter Reports</h3>
          <div class="reports-list">
            ${reports.length === 0 ? '<div class="muted">No reports yet</div>' : ''}
            ${reports.slice(0, 5).map((r) => `
              <div class="report-card">
                <div class="report-meta">${r.verified ? '✅ Verified' : '⏳ Pending'} · ${r.username}</div>
                <div class="report-text">${r.observations}</div>
                <div class="report-time">${new Date(r.timestamp).toLocaleTimeString()}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="community-section">
          <h3>🏆 Top Chasers</h3>
          <div class="leaderboard">
            ${leaderboard.length === 0 ? '<div class="muted">No chasers ranked yet</div>' : ''}
            ${leaderboard.slice(0, 5).map((c, i) => `
              <div class="leaderboard-row">
                <span class="rank">#${i + 1}</span>
                <span class="name">${c.username}</span>
                <span class="score">${c.score} points</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="community-section">
          <h3>📍 Active Storm Tracking</h3>
          <div class="tracking-list">
            ${activeTracks.length === 0 ? '<div class="muted">No active shared tracking</div>' : ''}
            ${activeTracks.slice(0, 5).map((t) => `
              <div class="tracking-card">
                <div class="tracking-name">${t.stormId}</div>
                <div class="tracking-count">${t.followers} followers</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 3. Advanced Forecasting Tab
   */
  renderForecasting(container) {
    if (!this.selectedStorm) {
      container.innerHTML = '<div class="muted">Select a storm from the map to view forecasts</div>';
      return;
    }

    const hailSwath = predictHailSwath(this.selectedStorm, 60);
    const tornadoZone = predictTornadoTouchdownZone(this.selectedStorm, {});
    const splitting = predictSupercellSplitting(this.selectedStorm, {});

    container.innerHTML = `
      <div class="forecasting-panel">
        <div class="forecast-card">
          <h3>Hail Swath (Next 60 min)</h3>
          <div class="forecast-content">
            <div>Width: ${hailSwath.width} km</div>
            <div>Severity: ${hailSwath.severity}</div>
            <div>Waypoints: ${hailSwath.path.length}</div>
          </div>
        </div>

        <div class="forecast-card">
          <h3>Tornado Touchdown Zone</h3>
          <div class="forecast-content">
            <div>Location: ${tornadoZone.centerLat.toFixed(3)}, ${tornadoZone.centerLon.toFixed(3)}</div>
            <div>Confidence: ${tornadoZone.confidence}%</div>
            <div>Likeliness: ${tornadoZone.likeliness}</div>
            <div>ETA: ${tornadoZone.timeToTouchdownMin} min</div>
          </div>
        </div>

        <div class="forecast-card">
          <h3>Supercell Splitting Prediction</h3>
          <div class="forecast-content">
            <div>Will Split: ${splitting.willSplit ? 'Yes ⚠️' : 'No ✅'}</div>
            <div>Risk: ${splitting.riskPercentage}%</div>
            ${splitting.timeToSplitMin ? `<div>Time to Split: ${splitting.timeToSplitMin} min</div>` : ''}
            <div>Expected Storms: ${splitting.expectedStorms}</div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 4. Voice & Audio Tab
   */
  renderVoice(container) {
    container.innerHTML = `
      <div class="voice-panel">
        <div class="voice-card">
          <h3>🎙️ Voice Alerts</h3>
          <button class="voice-btn" id="btn-voice-alerts">Enable Voice Alerts</button>
          <div class="voice-status" id="voice-status">Inactive</div>
        </div>

        <div class="voice-card">
          <h3>🔊 Audio Warning Tone</h3>
          <button class="voice-btn" id="btn-warning-tone">Play Warning Tone</button>
        </div>

        <div class="voice-card">
          <h3>🎧 Podcast Briefing</h3>
          <button class="voice-btn" id="btn-podcast">Generate Podcast Briefing</button>
          <div class="podcast-info" id="podcast-info"></div>
        </div>

        <div class="voice-card">
          <h3>🎤 Voice Commands</h3>
          <button class="voice-btn" id="btn-voice-commands">Start Listening</button>
          <div class="voice-commands-list">
            <div class="muted">Say: "Show nearest storm"</div>
            <div class="muted">Say: "Play warning"</div>
            <div class="muted">Say: "What's the tornado risk?"</div>
          </div>
        </div>
      </div>
    `;

    this.container?.querySelector('#btn-voice-alerts')?.addEventListener('click', () => {
      this.voiceNarrator.speak('Voice alerts enabled. You will receive spoken warnings for severe storms.');
      document.getElementById('voice-status').textContent = 'Active - Ready for alerts';
    });

    this.container?.querySelector('#btn-warning-tone')?.addEventListener('click', () => {
      this.audioAlerts.playWarningTone();
    });

    this.container?.querySelector('#btn-podcast')?.addEventListener('click', () => {
      const briefing = generateStormBriefing(this.selectedAnalyses || []);
      this.voiceNarrator.speak(briefing);
      document.getElementById('podcast-info').innerHTML = `<div class="muted">Now playing: ${briefing.substring(0, 80)}...</div>`;
    });

    this.container?.querySelector('#btn-voice-commands')?.addEventListener('click', () => {
      this.voiceCommands.startListening();
      document.querySelector('.voice-commands-list').innerHTML += '<div class="highlight">Listening...</div>';
    });
  }

  /**
   * 5. Chase Support & Safety Tab
   */
  renderChaseSafety(container) {
    if (!this.selectedStorm) {
      container.innerHTML = '<div class="muted">Select a storm from the map for chase guidance</div>';
      return;
    }

    const route = this.chaseRouter.calculateInterceptRoute(
      37.5, -96.5, this.selectedStorm.lat, this.selectedStorm.lon, this.selectedStorm
    );
    const shelters = this.safeHavenFinder.findNearestShelter(37.5, -96.5, 20);
    // severeScore/tornado live on the analysis, not the bare cell.
    const decision = ChaseDecisionScore.score(
      { lat: 37.5, lon: -96.5 }, this.selectedAnalyses[0] || this.selectedStorm, {}, route
    );

    container.innerHTML = `
      <div class="chase-safety-panel">
        <div class="chase-card">
          <h3>📍 Route to Intercept</h3>
          <div class="chase-info">
            <div>Distance: ${route.estimatedDistanceKm.toFixed(1)} km</div>
            <div>Coordinates: ${route.to.lat.toFixed(3)}, ${route.to.lon.toFixed(3)}</div>
          </div>
        </div>

        <div class="chase-card">
          <h3>🛡️ Nearest Safe Havens</h3>
          <div class="shelters-list">
            ${shelters.map((s) => `
              <div class="shelter-card">
                <div class="shelter-name">${s.name}</div>
                <div class="shelter-info">${s.distance} km away · Rating: ${s.rating}/5</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="chase-card">
          <h3>⚡ Chase Decision</h3>
          <div class="decision">
            <div class="score" style="font-size: 32px; font-weight: bold; color: ${this.getScoreColor(decision.score)}">
              ${decision.score}/100
            </div>
            <div class="recommendation">${decision.recommendation}</div>
            <div class="factors">
              <div>Storm Value: ${decision.factors.stormValue}</div>
              <div>Tornado Potential: ${decision.factors.tornadoPotential}</div>
              <div>Distance: ${decision.factors.distance}</div>
            </div>
          </div>
        </div>

        <div class="chase-card">
          <h3>⚡ Lightning Proximity</h3>
          <div id="lightning-status" class="lightning-status">No recent strikes nearby</div>
        </div>
      </div>
    `;
  }

  /**
   * 6. Database & History Tab
   */
  renderDatabase(container) {
    const metrics = this.stormDatabase.getAccuracyMetrics();
    const seasonalStats = this.stormDatabase.getSeasonalStats();
    const sessions = this.stormDatabase.getSessionHistory();
    const { badges, streak, personalBests } = this.stormDatabase.getAchievements();

    container.innerHTML = `
      <div class="database-panel">
        <div class="db-card">
          <h3>📊 Accuracy Metrics</h3>
          <div class="metrics-grid">
            <div class="metric">
              <div class="metric-value">${metrics.totalVerified}</div>
              <div class="metric-label">Storms Verified</div>
            </div>
            <div class="metric">
              <div class="metric-value">${metrics.tornadoAccuracy}</div>
              <div class="metric-label">Tornado Accuracy</div>
            </div>
            <div class="metric">
              <div class="metric-value">${metrics.hailAccuracy}</div>
              <div class="metric-label">Hail Accuracy</div>
            </div>
            <div class="metric">
              <div class="metric-value">${metrics.windAccuracy}</div>
              <div class="metric-label">Wind Accuracy</div>
            </div>
          </div>
        </div>

        <div class="db-card">
          <h3>📅 Seasonal Statistics</h3>
          <div class="seasonal-info">
            <div>Total Storms: ${seasonalStats.totalStorms}</div>
            <div>Tornados: ${seasonalStats.totalTornados}</div>
            <div>Avg Severity: ${seasonalStats.avgSeverity}/100</div>
          </div>
        </div>

        <div class="db-card">
          <h3>🎯 Recent Sessions</h3>
          <div class="sessions-list">
            ${sessions.length === 0 ? '<div class="muted">No sessions yet — turn on Chase mode in Settings and track a storm to start building your history.</div>' : ''}
            ${sessions.slice(0, 5).map((s) => `
              <div class="session-card">
                <div class="session-date">${new Date(s.date).toLocaleDateString()}</div>
                <div class="session-info">${s.stormCount} storms · ${s.durationMin} min</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="db-card">
          <h3>🏅 Achievements${streak > 0 ? ` · 🔥 ${streak}-day streak` : ''}</h3>
          <div class="badge-grid">
            ${badges.map((b) => `
              <div class="badge-item ${b.earned ? 'earned' : 'locked'}" title="${b.earned ? 'Earned' : 'Not earned yet'}">
                <div class="badge-icon">${b.earned ? b.icon : '🔒'}</div>
                <div class="badge-name">${b.name}</div>
              </div>
            `).join('')}
          </div>
          <div class="metrics-grid" style="margin-top:12px">
            <div class="metric">
              <div class="metric-value">${personalBests.highestScore ?? '—'}</div>
              <div class="metric-label">Highest score seen</div>
            </div>
            <div class="metric">
              <div class="metric-value">${personalBests.mostInOneDay}</div>
              <div class="metric-label">Most storms, 1 day</div>
            </div>
            <div class="metric">
              <div class="metric-value">${personalBests.longestChaseMin}m</div>
              <div class="metric-label">Longest chase</div>
            </div>
          </div>
        </div>

        <div class="db-card">
          <h3>💾 Export Data</h3>
          <button class="export-btn" id="btn-export-csv">Export as CSV</button>
          <button class="export-btn" id="btn-export-json">Export as JSON</button>
        </div>
      </div>
    `;

    this.container?.querySelector('#btn-export-csv')?.addEventListener('click', () => {
      const csv = this.stormDatabase.exportToCSV();
      this.downloadFile(csv, 'storms.csv', 'text/csv');
    });

    this.container?.querySelector('#btn-export-json')?.addEventListener('click', () => {
      const json = this.stormDatabase.exportToJSON();
      this.downloadFile(json, 'storms.json', 'application/json');
    });
  }

  /**
   * 7. Advanced Charts & 3D Tab
   */
  renderCharts(container) {
    if (!this.selectedStorm) {
      container.innerHTML = '<div class="muted">Select a storm from the map to view charts</div>';
      return;
    }

    container.innerHTML = `
      <div class="charts-panel">
        <div class="chart-card">
          <h3>📈 Storm Structure Visualizer</h3>
          <div id="chart-structure" class="chart-container"></div>
        </div>

        <div class="chart-card">
          <h3>📊 Multi-Storm Comparison</h3>
          <div id="chart-comparison" class="chart-container">
            ${this.selectedStorms.length > 1 ? '' : '<div class="muted chart-empty">Select 2+ storms to compare them here</div>'}
          </div>
        </div>

        <div class="chart-card">
          <h3>📉 Forecast Graph</h3>
          <div id="chart-forecast" class="chart-container"></div>
        </div>
      </div>
    `;

    const structureViz = new StormStructureVisualizer('chart-structure');
    structureViz.initialize();
    structureViz.renderCrossSection(this.selectedStorm, 'N-S');

    if (this.selectedStorms.length > 1) {
      const comparison = new MultiStormComparison('chart-comparison');
      comparison.initialize();
      comparison.renderComparison(this.selectedStorms, 'severeScore');
    }

    const forecastGraph = new ForecastGraph('chart-forecast');
    forecastGraph.initialize();
    forecastGraph.renderForecast({
      dbz: { current: this.selectedStorm.maxDbz, forecast15: this.selectedStorm.maxDbz + 5, forecast30: this.selectedStorm.maxDbz + 8 }
    }, 'Reflectivity (dBZ)');
  }

  /**
   * 8. Educational & Training Tab
   */
  renderEducation(container) {
    const progress = this.certification.getProgress();
    const badge = this.certification.getCertificationBadge();
    const lessons = this.radarTutorial.getLessons();
    const gameStats = this.identificationGame.getLeaderboard();

    container.innerHTML = `
      <div class="education-panel">
        <div class="edu-card">
          <h3>🎓 Spotter Certification</h3>
          <div class="certification-progress">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${progress.percentage}%"></div>
            </div>
            <div class="progress-text">${progress.completed}/${progress.total} requirements</div>
            ${badge ? `<div class="badge" style="background: ${badge.color}">${badge.icon} ${badge.name}</div>` : ''}
          </div>
        </div>

        <div class="edu-card">
          <h3>📚 Lessons</h3>
          <div class="lessons-list">
            ${lessons.map((l) => `
              <div class="lesson-card">
                <div class="lesson-title">${l.title}</div>
                <div class="lesson-diff">Difficulty: ${l.difficulty}</div>
                <button class="lesson-btn" data-lesson="${l.id}">Study</button>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="edu-card">
          <h3>🎮 Storm Identification Game</h3>
          <div class="game-stats">
            <div>Games Played: ${gameStats.gamesPlayed}</div>
            <div>Accuracy: ${gameStats.accuracy}</div>
            <div>Current Streak: ${gameStats.streak}</div>
            <div>High Score: ${gameStats.highScore}</div>
          </div>
          <button class="game-btn" id="btn-play-game">Play Now</button>
        </div>
      </div>
    `;
  }

  /**
   * Select a storm to update predictions and forecasts
   */
  selectStorm(analysis) {
    this.selectedStorm = analysis.cell;
    this.selectedStorms = [analysis.cell, ...this.selectedStorms].slice(0, 3);
    this.selectedAnalyses = [analysis, ...(this.selectedAnalyses || [])].slice(0, 3);
    // Personal chase history (Week 3 → History tab) only accumulates
    // storms you actually looked at — recordStorm() existed with a full
    // API (seasonal stats, accuracy tracking, CSV/JSON export) but was
    // never called anywhere, so that tab was permanently empty.
    this.stormDatabase.recordStorm(analysis.cell, analysis);

    // Rerender the currently active tab
    if (this.activeTab !== 'education' && this.activeTab !== 'community') {
      this.renderTabContent(this.activeTab);
    }
  }

  /**
   * Utility: Get color for score
   */
  getScoreColor(score) {
    if (score >= 75) return '#22c55e';
    if (score >= 60) return '#eab308';
    if (score >= 40) return '#f97316';
    return '#ef4444';
  }

  /**
   * Utility: Download file
   */
  downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Apply styling
   */
  applyStyles() {
    if (!this.container) return;
    this.container.style.cssText = `
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    `;

    const style = document.createElement('style');
    style.textContent = `
      .week3-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }

      .panel-tabs {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
        padding: 10px;
        background: rgba(15, 20, 35, 0.9);
        border-bottom: 2px solid rgba(100,150,255,0.3);
        flex-shrink: 0;
      }

      .tab-btn {
        padding: 8px 4px;
        border: 1.5px solid rgba(100,150,255,0.3);
        background: rgba(30, 40, 60, 0.95);
        color: #9ca3af;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
        line-height: 1.3;
        white-space: normal;
        word-break: break-word;
        transition: all 0.2s;
        font-weight: 500;
      }

      .tab-btn.active {
        background: rgba(59, 130, 246, 0.25);
        color: #e5eaf0;
        border-color: rgba(100,150,255,0.7);
      }

      .panel-content {
        flex: 1;
        overflow-y: auto;
        padding: 14px;
        background: rgba(10, 15, 25, 0.8);
      }

      .tab-content {
        display: none;
      }

      .tab-content.active {
        display: block;
      }

      .ml-predictions, .community-panel, .forecasting-panel, .voice-panel,
      .chase-safety-panel, .database-panel, .charts-panel, .education-panel {
        display: grid;
        gap: 14px;
      }

      .prediction-card, .community-section, .forecast-card, .voice-card,
      .chase-card, .db-card, .chart-card, .edu-card {
        background: rgba(20, 30, 50, 0.95);
        border: 1px solid rgba(100,150,255,0.4);
        border-radius: 8px;
        padding: 14px;
      }

      .prediction-card h3, .community-section h3, .forecast-card h3,
      .voice-card h3, .chase-card h3, .db-card h3, .chart-card h3, .edu-card h3 {
        margin: 0 0 12px 0;
        font-size: 14px;
        color: #e5eaf0;
        font-weight: 600;
      }

      .prediction-bar {
        height: 8px;
        background: rgba(0,0,0,0.3);
        border-radius: 4px;
        overflow: hidden;
        margin: 6px 0;
      }

      .prediction-fill {
        height: 100%;
        background: linear-gradient(90deg, #3b82f6, #10b981);
        transition: width 0.3s;
      }

      .prediction-text {
        font-size: 12px;
        color: #a0aec0;
      }

      .reports-list, .leaderboard, .tracking-list, .shelters-list,
      .sessions-list, .lessons-list {
        display: grid;
        gap: 8px;
      }

      .report-card, .leaderboard-row, .tracking-card, .shelter-card,
      .session-card, .lesson-card {
        background: rgba(25, 35, 55, 0.9);
        padding: 10px;
        border-radius: 6px;
        font-size: 12px;
        border: 1px solid rgba(100,150,255,0.15);
        color: #d1d5db;
      }

      .muted {
        color: #64748b;
        font-size: 12px;
      }

      .forecast-content, .chase-info, .metrics-grid, .seasonal-info, .game-stats {
        color: #d1d5db;
        font-size: 13px;
        line-height: 1.6;
      }

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }

      .metric {
        background: rgba(59, 130, 246, 0.1);
        padding: 12px;
        border-radius: 6px;
        text-align: center;
      }

      .metric-value {
        font-size: 18px;
        font-weight: bold;
        color: #60a5fa;
      }

      .metric-label {
        font-size: 12px;
        color: #9ca3af;
        margin-top: 4px;
      }

      .badge-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
        gap: 10px;
      }
      .badge-item {
        text-align: center;
        padding: 10px 6px;
        border-radius: 8px;
        background: rgba(59, 130, 246, 0.08);
      }
      .badge-item.locked { opacity: 0.4; }
      .badge-icon { font-size: 26px; }
      .badge-name { font-size: 10px; color: #cbd5e1; margin-top: 4px; line-height: 1.3; }

      button.voice-btn, button.export-btn, button.lesson-btn, button.game-btn {
        background: rgba(59, 130, 246, 0.25);
        border: 1.5px solid rgba(100,150,255,0.4);
        color: #e5eaf0;
        padding: 10px 14px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.2s;
      }

      button.voice-btn:hover, button.export-btn:hover, button.lesson-btn:hover, button.game-btn:hover {
        background: rgba(59, 130, 246, 0.4);
        border-color: rgba(100,150,255,0.6);
      }

      .chart-container {
        height: 220px;
        background: rgba(25, 35, 55, 0.85);
        border-radius: 6px;
        border: 1px solid rgba(100,150,255,0.15);
      }

      .chart-container .chart-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        text-align: center;
        padding: 0 16px;
      }
    `;
    document.head.appendChild(style);
  }
}
