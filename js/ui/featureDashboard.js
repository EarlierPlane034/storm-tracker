/**
 * Feature Dashboard & Navigation
 *
 * Unified dashboard showing all available features with quick access,
 * organized by category with visual indicators and badges.
 */

import { el, debounce } from '../utils.js';

export class FeatureDashboard {
  constructor() {
    this.features = [
      {
        category: 'Radar & Map',
        items: [
          { id: 'map', icon: '🗺️', label: 'Live Radar', badge: 'LIVE', desc: 'Real-time NEXRAD data' },
          { id: 'layers', icon: '🎨', label: 'Map Layers', desc: 'Basemap & overlay controls' },
        ]
      },
      {
        category: 'Storm Analysis (Week 1)',
        items: [
          { id: 'storms', icon: '⛈️', label: 'Storm Cells', desc: 'Active storm list & scores' },
          { id: 'alerts', icon: '🚨', label: 'Alerts', badge: 'NEW', desc: 'NWS warnings & alerts' },
        ]
      },
      {
        category: 'Advanced Analysis (Week 2)',
        items: [
          { id: 'analysis', icon: '📊', label: 'Analysis Panel', badge: 'NEW', desc: 'Hodographs, environment, trends' },
          { id: 'reports', icon: '📝', label: 'Reports', desc: 'Storm reports & community data' },
        ]
      },
      {
        category: 'Week 3 Features (All New)',
        items: [
          { id: 'week3', icon: '🤖', label: 'ML Predictions', badge: 'NEW', desc: 'AI hail/tornado probability' },
          { id: 'week3', icon: '👥', label: 'Community', badge: 'NEW', desc: 'Spotter reports & leaderboard' },
          { id: 'week3', icon: '🔮', label: 'Forecasting', badge: 'NEW', desc: 'Hail swath, tornado zones' },
          { id: 'week3', icon: '🎙️', label: 'Voice', badge: 'NEW', desc: 'Voice alerts & narration' },
          { id: 'week3', icon: '🛡️', label: 'Chase Safety', badge: 'NEW', desc: 'Routes & safe havens' },
          { id: 'week3', icon: '💾', label: 'History', badge: 'NEW', desc: 'Database & replay' },
          { id: 'week3', icon: '📈', label: 'Charts', badge: 'NEW', desc: '3D visualization' },
          { id: 'week3', icon: '🎓', label: 'Training', badge: 'NEW', desc: 'Lessons & certification' },
        ]
      },
      {
        category: 'Intelligence & Settings',
        items: [
          { id: 'ai', icon: '🧠', label: 'AI Meteorologist', desc: 'Chat with AI analysis' },
          { id: 'settings', icon: '⚙️', label: 'Settings', desc: 'Preferences & configuration' },
        ]
      },
    ];
  }

  /**
   * Render the feature dashboard as a modal/drawer
   */
  render(container, onSelectFeature) {
    if (!container) return;

    container.innerHTML = `
      <div class="feature-dashboard">
        <div class="dashboard-header">
          <h2>📡 StormLens Features</h2>
          <p>All available tools and analysis features</p>
        </div>

        <div class="dashboard-content">
          ${this.features.map((category) => `
            <div class="feature-category">
              <h3 class="category-title">${category.category}</h3>
              <div class="feature-grid">
                ${category.items.map((item) => `
                  <div class="feature-card" data-feature="${item.id}" data-label="${item.label}">
                    <div class="feature-icon">${item.icon}</div>
                    <div class="feature-info">
                      <div class="feature-label">${item.label}</div>
                      <div class="feature-desc">${item.desc}</div>
                    </div>
                    ${item.badge ? `<span class="feature-badge">${item.badge}</span>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>

        <div class="dashboard-footer">
          <div class="muted">💡 Tap any feature to navigate. Select a storm on the map for detailed analysis.</div>
        </div>
      </div>
    `;

    this.applyStyles(container);
    this.setupEventListeners(container, onSelectFeature);
  }

  /**
   * Setup click handlers for feature navigation
   */
  setupEventListeners(container, onSelectFeature) {
    container.querySelectorAll('.feature-card').forEach((card) => {
      card.addEventListener('click', () => {
        const feature = card.dataset.feature;
        const label = card.dataset.label;
        onSelectFeature(feature, label);
      });
    });
  }

  /**
   * Apply dashboard styles
   */
  applyStyles(container) {
    if (!container) return;
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    `;

    if (document.getElementById('feature-dashboard-styles')) return;

    const style = document.createElement('style');
    style.id = 'feature-dashboard-styles';
    style.textContent = `
      .feature-dashboard {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }

      .dashboard-header {
        padding: 16px;
        background: linear-gradient(135deg, rgba(100,150,255,0.2), rgba(59,130,246,0.1));
        border-bottom: 1px solid rgba(100,150,255,0.2);
      }

      .dashboard-header h2 {
        margin: 0 0 4px 0;
        font-size: 20px;
        color: #e5eaf0;
      }

      .dashboard-header p {
        margin: 0;
        font-size: 12px;
        color: #a0aec0;
      }

      .dashboard-content {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
      }

      .feature-category {
        margin-bottom: 20px;
      }

      .category-title {
        margin: 0 0 10px 0;
        font-size: 13px;
        font-weight: 600;
        color: #64b5f6;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .feature-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 8px;
      }

      .feature-card {
        background: linear-gradient(135deg, rgba(30,41,59,0.8), rgba(15,23,42,0.6));
        border: 1px solid rgba(100,150,255,0.2);
        border-radius: 10px;
        padding: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }

      .feature-card:hover {
        background: linear-gradient(135deg, rgba(50,80,120,0.8), rgba(30,50,100,0.6));
        border-color: rgba(100,150,255,0.5);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(100,150,255,0.2);
      }

      .feature-icon {
        font-size: 32px;
        margin-bottom: 8px;
      }

      .feature-info {
        flex: 1;
      }

      .feature-label {
        font-size: 12px;
        font-weight: 600;
        color: #e5eaf0;
        margin-bottom: 2px;
      }

      .feature-desc {
        font-size: 10px;
        color: #94a3b8;
        line-height: 1.3;
      }

      .feature-badge {
        position: absolute;
        top: 4px;
        right: 4px;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: white;
        font-size: 9px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
        letter-spacing: 0.5px;
      }

      .dashboard-footer {
        padding: 12px 16px;
        background: rgba(0,0,0,0.3);
        border-top: 1px solid rgba(100,150,255,0.1);
        font-size: 11px;
      }

      .muted {
        color: #64748b;
      }

      /* Scrollbar styling */
      .dashboard-content::-webkit-scrollbar {
        width: 6px;
      }

      .dashboard-content::-webkit-scrollbar-track {
        background: rgba(100,150,255,0.05);
      }

      .dashboard-content::-webkit-scrollbar-thumb {
        background: rgba(100,150,255,0.2);
        border-radius: 3px;
      }

      .dashboard-content::-webkit-scrollbar-thumb:hover {
        background: rgba(100,150,255,0.4);
      }

      @media (max-width: 480px) {
        .feature-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Tab indicator showing all available tabs with visual hierarchy
 */
export function createTabIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'tab-indicator';
  indicator.innerHTML = `
    <div class="tab-indicator-content">
      <span class="indicator-label">📊 Tabs:</span>
      <span class="indicator-count">8 features</span>
      <span class="indicator-hint">Scroll to see all →</span>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    .tab-indicator {
      background: linear-gradient(90deg, rgba(100,150,255,0.1), rgba(59,130,246,0.05));
      border: 1px solid rgba(100,150,255,0.15);
      padding: 8px 12px;
      margin: 4px 0 0 0;
      border-radius: 6px;
      font-size: 11px;
    }

    .tab-indicator-content {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #a0aec0;
    }

    .indicator-label {
      font-weight: 600;
      color: #64b5f6;
    }

    .indicator-count {
      background: rgba(100,150,255,0.2);
      padding: 2px 6px;
      border-radius: 3px;
      color: #e5eaf0;
      font-weight: 600;
    }

    .indicator-hint {
      margin-left: auto;
      font-style: italic;
      opacity: 0.7;
    }
  `;
  document.head.appendChild(style);

  return indicator;
}
