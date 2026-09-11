/**
 * Storm Comparison Panel
 *
 * Side-by-side comparison of 2+ storms:
 * - Tornado, hail, wind, lightning scores
 * - Trend directions (intensifying vs weakening)
 * - Storm type and position
 * - Confidence levels
 */

import { compareStorms } from '../ai/stormScoringV2.js';
import { toasts } from './toasts.js';

let selectedStorms = [];
const MAX_COMPARISONS = 3;

/**
 * Open storm comparison panel
 * User can select multiple storms to compare
 */
export function openStormComparison(storms) {
  const panel = document.getElementById('storm-comparison');
  if (!panel) createComparisonPanel();

  const html = renderComparisonUI(storms);
  document.getElementById('storm-comparison').innerHTML = html;
  document.getElementById('storm-comparison').hidden = false;

  attachComparisonEvents();
}

/**
 * Create the comparison panel if it doesn't exist
 */
function createComparisonPanel() {
  const container = document.querySelector('.panels-container') || document.body;
  const panel = document.createElement('div');
  panel.id = 'storm-comparison';
  panel.className = 'panel storm-comparison-panel';
  panel.hidden = true;
  container.appendChild(panel);
}

/**
 * Render comparison table
 */
function renderComparisonUI(storms) {
  if (storms.length < 2) {
    return '<div style="padding:20px; text-align:center; color:#888;">Select 2+ storms to compare</div>';
  }

  const comparisons = [];
  for (let i = 0; i < storms.length - 1; i++) {
    for (let j = i + 1; j < storms.length; j++) {
      comparisons.push(compareStorms(storms[i], storms[j]));
    }
  }

  return `
    <div class="comparison-header">
      <h3>Storm Comparison</h3>
      <button class="close-btn" data-action="closeComparison">×</button>
    </div>

    <div class="comparison-grid">
      ${storms.map((s, i) => `
        <div class="comparison-storm-card">
          <div class="comparison-header-row">
            <strong>Storm ${i + 1}</strong>
            <span class="rank-badge">#${s.rank}</span>
          </div>

          <div class="comparison-info">
            <div class="info-row">
              <label>Location</label>
              <span>${s.cell.lat.toFixed(2)}°, ${s.cell.lon.toFixed(2)}°</span>
            </div>

            <div class="info-row">
              <label>Type</label>
              <span>${s.type.label}</span>
            </div>

            <div class="info-row">
              <label>Trend</label>
              <span class="trend-badge trend-${s.trend?.label}">${s.trend?.label || 'stable'}</span>
            </div>
          </div>

          <div class="comparison-scores">
            <div class="score-item">
              <label>Tornado</label>
              <div class="score-bar">
                <div class="score-fill" style="width:${s.scores.rotation}%; background:#ff6600;"></div>
              </div>
              <span class="score-value">${s.scores.rotation}</span>
            </div>

            <div class="score-item">
              <label>Hail</label>
              <div class="score-bar">
                <div class="score-fill" style="width:${s.scores.hail}%; background:#ffaa00;"></div>
              </div>
              <span class="score-value">${s.scores.hail}</span>
            </div>

            <div class="score-item">
              <label>Wind</label>
              <div class="score-bar">
                <div class="score-fill" style="width:${s.scores.wind}%; background:#0099ff;"></div>
              </div>
              <span class="score-value">${s.scores.wind}</span>
            </div>

            <div class="score-item">
              <label>Lightning</label>
              <div class="score-bar">
                <div class="score-fill" style="width:${s.scores.lightning}%; background:#ffff00;"></div>
              </div>
              <span class="score-value">${s.scores.lightning}</span>
            </div>

            <div class="score-item overall">
              <label>Overall</label>
              <div class="score-large">${s.severeScore}</div>
              <span class="threat-rating">${s.threatRating}</span>
            </div>
          </div>

          <div class="comparison-meta">
            <span class="confidence">Confidence: ${s.confidence}%</span>
            ${s.persistence ? `<span class="persistence">Rotation: ${s.persistence} scans</span>` : ''}
          </div>
        </div>
      `).join('')}
    </div>

    ${comparisons.length > 0 ? `
      <div class="comparison-deltas">
        <h4>Differences</h4>
        ${comparisons.map((comp, i) => `
          <div class="delta-row">
            <span class="delta-label">Storm 1 vs ${i + 2}</span>
            <div class="delta-scores">
              <span class="delta ${comp.tornado.delta > 0 ? 'positive' : 'negative'}">
                Tornado: ${comp.tornado.delta > 0 ? '+' : ''}${comp.tornado.delta}
              </span>
              <span class="delta ${comp.hail.delta > 0 ? 'positive' : 'negative'}">
                Hail: ${comp.hail.delta > 0 ? '+' : ''}${comp.hail.delta}
              </span>
              <span class="delta ${comp.wind.delta > 0 ? 'positive' : 'negative'}">
                Wind: ${comp.wind.delta > 0 ? '+' : ''}${comp.wind.delta}
              </span>
              <span class="delta ${comp.overall.delta > 0 ? 'positive' : 'negative'}">
                Overall: ${comp.overall.delta > 0 ? '+' : ''}${comp.overall.delta}
              </span>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <style>
      .storm-comparison-panel {
        position: absolute;
        right: 20px;
        top: 100px;
        width: 90%;
        max-width: 1200px;
        max-height: 80vh;
        overflow-y: auto;
        background: rgba(20, 20, 30, 0.95);
        border: 1px solid #0099ff;
        border-radius: 8px;
        padding: 20px;
        backdrop-filter: blur(10px);
      }

      .comparison-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 1px solid #0099ff40;
      }

      .comparison-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 15px;
        margin-bottom: 20px;
      }

      .comparison-storm-card {
        background: rgba(40, 40, 60, 0.8);
        border: 1px solid #0099ff60;
        border-radius: 6px;
        padding: 15px;
      }

      .comparison-header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        font-weight: bold;
        color: #0099ff;
      }

      .rank-badge {
        background: #0099ff;
        color: #000;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 12px;
      }

      .comparison-info {
        font-size: 13px;
        margin-bottom: 15px;
        color: #aaa;
      }

      .info-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 6px;
      }

      .info-row label {
        font-weight: 600;
        color: #888;
      }

      .trend-badge {
        padding: 2px 8px;
        border-radius: 3px;
        font-size: 11px;
        font-weight: bold;
      }

      .trend-badge.trend-intensifying {
        background: #ff6600;
        color: #fff;
      }

      .trend-badge.trend-stable {
        background: #0099ff;
        color: #fff;
      }

      .trend-badge.trend-weakening {
        background: #666;
        color: #fff;
      }

      .comparison-scores {
        margin-bottom: 15px;
      }

      .score-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-bottom: 10px;
      }

      .score-item label {
        font-size: 12px;
        color: #888;
        font-weight: bold;
        text-transform: uppercase;
      }

      .score-bar {
        height: 8px;
        background: #222;
        border-radius: 4px;
        overflow: hidden;
      }

      .score-fill {
        height: 100%;
        transition: width 0.3s ease;
      }

      .score-value {
        font-size: 13px;
        font-weight: bold;
        color: #0099ff;
      }

      .score-item.overall {
        background: rgba(0, 153, 255, 0.1);
        padding: 10px;
        border-radius: 4px;
        margin-top: 8px;
      }

      .score-large {
        font-size: 32px;
        font-weight: bold;
        color: #0099ff;
        text-align: center;
      }

      .threat-rating {
        font-size: 12px;
        color: #aaa;
        text-align: center;
        display: block;
      }

      .comparison-meta {
        display: flex;
        gap: 10px;
        font-size: 11px;
        color: #666;
        flex-wrap: wrap;
      }

      .confidence, .persistence {
        background: rgba(0, 153, 255, 0.1);
        padding: 4px 8px;
        border-radius: 3px;
      }

      .comparison-deltas {
        background: rgba(40, 40, 60, 0.8);
        border: 1px solid #0099ff40;
        border-radius: 6px;
        padding: 15px;
      }

      .comparison-deltas h4 {
        color: #0099ff;
        margin-bottom: 10px;
        font-size: 14px;
      }

      .delta-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        padding: 8px;
        background: rgba(0, 153, 255, 0.05);
        border-radius: 4px;
      }

      .delta-label {
        font-weight: bold;
        font-size: 12px;
        color: #aaa;
      }

      .delta-scores {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .delta {
        font-size: 12px;
        font-weight: bold;
        padding: 2px 6px;
        border-radius: 3px;
      }

      .delta.positive {
        color: #00ff00;
      }

      .delta.negative {
        color: #ff6600;
      }

      .close-btn {
        background: none;
        border: none;
        color: #0099ff;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
      }

      .close-btn:hover {
        color: #00ccff;
      }
    </style>
  `;
}

/**
 * Attach event listeners to comparison UI
 */
function attachComparisonEvents() {
  document.querySelectorAll('[data-action="closeComparison"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('storm-comparison').hidden = true;
    });
  });
}

/**
 * Add storm to comparison selection
 */
export function selectStormForComparison(storm) {
  if (selectedStorms.find(s => s.id === storm.id)) {
    selectedStorms = selectedStorms.filter(s => s.id !== storm.id);
    toasts.show(`Removed ${storm.type.label} from comparison`, 'info', 2000);
  } else {
    if (selectedStorms.length >= MAX_COMPARISONS) {
      toasts.show(`Max ${MAX_COMPARISONS} storms to compare`, 'warn', 2000);
      return;
    }
    selectedStorms.push(storm);
    toasts.show(`Added ${storm.type.label} to comparison`, 'success', 2000);
  }

  if (selectedStorms.length > 0) {
    openStormComparison(selectedStorms);
  }
}

/**
 * Clear comparison selection
 */
export function clearComparison() {
  selectedStorms = [];
  document.getElementById('storm-comparison').hidden = true;
}

/**
 * Get currently selected storms
 */
export function getSelectedStorms() {
  return [...selectedStorms];
}
