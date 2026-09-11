/**
 * Quick Start Guide Modal
 *
 * Shows new users all available features and how to access them.
 */

export function showQuickStartGuide() {
  const modal = document.createElement('div');
  modal.className = 'quick-start-modal';
  modal.innerHTML = `
    <div class="quick-start-content">
      <div class="quick-start-header">
        <h1>🌪️ Welcome to StormLens</h1>
        <p>Your complete storm analysis & chasing companion</p>
      </div>

      <div class="quick-start-body">
        <div class="quick-start-section">
          <h2>📡 Start Here</h2>
          <div class="quick-start-grid">
            <div class="guide-card">
              <div class="guide-icon">🗺️</div>
              <div class="guide-text">
                <div class="guide-title">Live Radar</div>
                <div class="guide-desc">Real-time NEXRAD reflectivity & velocity</div>
              </div>
            </div>
            <div class="guide-card">
              <div class="guide-icon">⛈️</div>
              <div class="guide-text">
                <div class="guide-title">Storm Cells</div>
                <div class="guide-desc">AI-scored threats (severity 0-100)</div>
              </div>
            </div>
          </div>
        </div>

        <div class="quick-start-section">
          <h2>🎯 Analysis Tools (New!)</h2>
          <div class="guide-text-block">
            <p><strong>Analysis Tab:</strong> Hodographs, environmental overlays, storm trends</p>
            <p><strong>Week 3 Tab:</strong> 8 advanced features (ML, forecasting, voice, safety)</p>
            <p><strong>Features Tab:</strong> Dashboard showing all available tools</p>
          </div>
        </div>

        <div class="quick-start-section">
          <h2>💡 Pro Tips</h2>
          <ul class="quick-start-tips">
            <li>✅ Tap any storm circle on the map to see detailed analysis</li>
            <li>✅ Use the Analysis tab for environmental data & hodographs</li>
            <li>✅ Week 3 features unlock AI predictions & chase safety tools</li>
            <li>✅ Tap Features tab to see everything available</li>
            <li>✅ Chase Mode (Settings) keeps your screen on during the day</li>
          </ul>
        </div>

        <div class="quick-start-section">
          <h2>🚀 Week 3 Features (8 New Tools)</h2>
          <div class="feature-checklist">
            <div class="checklist-item">🤖 ML Predictions - Hail/tornado probability</div>
            <div class="checklist-item">👥 Community - Spotter reports & leaderboard</div>
            <div class="checklist-item">🔮 Forecasting - Hail swath, tornado zones</div>
            <div class="checklist-item">🎙️ Voice - Voice alerts & narration</div>
            <div class="checklist-item">🛡️ Chase Safety - Routes & safe havens</div>
            <div class="checklist-item">💾 History - Database & data export</div>
            <div class="checklist-item">📈 Charts - 3D storm visualization</div>
            <div class="checklist-item">🎓 Training - Lessons & certification</div>
          </div>
        </div>

        <div class="quick-start-section">
          <div class="disclaimer-box">
            ⚠️ <strong>Important:</strong> AI analysis is unofficial. Always follow NWS warnings and use professional judgment during storm chasing.
          </div>
        </div>
      </div>

      <div class="quick-start-footer">
        <button id="btn-start-guide" class="start-btn">Got it! Let's chase 🌪️</button>
        <button id="btn-features-menu" class="start-btn secondary">View Features Menu</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  applyQuickStartStyles();

  modal.querySelector('#btn-start-guide').addEventListener('click', () => {
    modal.remove();
  });

  modal.querySelector('#btn-features-menu').addEventListener('click', () => {
    modal.remove();
    // Trigger features tab
    const featuresTab = document.querySelector('[data-panel="features"]');
    if (featuresTab) featuresTab.click();
  });

  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

function applyQuickStartStyles() {
  if (document.getElementById('quick-start-styles')) return;

  const style = document.createElement('style');
  style.id = 'quick-start-styles';
  style.textContent = `
    .quick-start-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 16px;
      animation: fadeIn 0.2s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .quick-start-content {
      background: linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.95));
      border: 1px solid rgba(100,150,255,0.3);
      border-radius: 16px;
      max-width: 500px;
      max-height: 90vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    }

    .quick-start-header {
      background: linear-gradient(135deg, rgba(100,150,255,0.2), rgba(59,130,246,0.1));
      padding: 24px;
      border-bottom: 1px solid rgba(100,150,255,0.2);
      text-align: center;
    }

    .quick-start-header h1 {
      margin: 0 0 8px 0;
      font-size: 28px;
      color: #e5eaf0;
    }

    .quick-start-header p {
      margin: 0;
      font-size: 14px;
      color: #a0aec0;
    }

    .quick-start-body {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }

    .quick-start-section {
      margin-bottom: 20px;
    }

    .quick-start-section h2 {
      margin: 0 0 12px 0;
      font-size: 16px;
      font-weight: 600;
      color: #64b5f6;
    }

    .quick-start-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 10px;
    }

    .guide-card {
      background: rgba(100,150,255,0.1);
      border: 1px solid rgba(100,150,255,0.2);
      border-radius: 8px;
      padding: 12px;
      display: flex;
      gap: 8px;
    }

    .guide-icon {
      font-size: 24px;
      flex-shrink: 0;
    }

    .guide-text {
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .guide-title {
      font-size: 12px;
      font-weight: 600;
      color: #e5eaf0;
    }

    .guide-desc {
      font-size: 10px;
      color: #a0aec0;
    }

    .guide-text-block p {
      margin: 8px 0;
      font-size: 13px;
      color: #cbd5e1;
      line-height: 1.4;
    }

    .guide-text-block strong {
      color: #64b5f6;
    }

    .quick-start-tips {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .quick-start-tips li {
      padding: 8px 0;
      font-size: 13px;
      color: #cbd5e1;
      line-height: 1.4;
    }

    .feature-checklist {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 8px;
    }

    .checklist-item {
      background: rgba(100,150,255,0.08);
      border: 1px solid rgba(100,150,255,0.15);
      border-radius: 6px;
      padding: 8px;
      font-size: 12px;
      color: #cbd5e1;
    }

    .disclaimer-box {
      background: rgba(239,68,68,0.1);
      border: 1px solid rgba(239,68,68,0.3);
      border-radius: 8px;
      padding: 12px;
      font-size: 12px;
      color: #fca5a5;
      line-height: 1.5;
    }

    .quick-start-footer {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      padding: 16px;
      border-top: 1px solid rgba(100,150,255,0.2);
      background: rgba(0,0,0,0.2);
    }

    .start-btn {
      background: linear-gradient(135deg, rgba(100,150,255,0.3), rgba(59,130,246,0.2));
      border: 1px solid rgba(100,150,255,0.4);
      color: #e5eaf0;
      padding: 12px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
    }

    .start-btn:hover {
      background: linear-gradient(135deg, rgba(100,150,255,0.5), rgba(59,130,246,0.4));
      border-color: rgba(100,150,255,0.6);
    }

    .start-btn.secondary {
      background: transparent;
      border-color: rgba(100,150,255,0.3);
    }

    .start-btn.secondary:hover {
      background: rgba(100,150,255,0.1);
      border-color: rgba(100,150,255,0.5);
    }

    /* Scrollbar */
    .quick-start-content::-webkit-scrollbar {
      width: 6px;
    }

    .quick-start-content::-webkit-scrollbar-track {
      background: rgba(100,150,255,0.05);
    }

    .quick-start-content::-webkit-scrollbar-thumb {
      background: rgba(100,150,255,0.2);
      border-radius: 3px;
    }

    .quick-start-content::-webkit-scrollbar-thumb:hover {
      background: rgba(100,150,255,0.4);
    }

    @media (max-width: 480px) {
      .quick-start-modal {
        padding: 8px;
      }

      .quick-start-content {
        max-width: 100%;
      }

      .quick-start-footer {
        grid-template-columns: 1fr;
      }

      .feature-checklist {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
}
