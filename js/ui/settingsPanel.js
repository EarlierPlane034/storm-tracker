/** Settings panel: units, refresh, radar, AI + notification sensitivity, favorites. */
import { el } from '../utils.js';
import { settings, setSetting } from '../storage.js';

export function renderSettings({ onChanged, onRequestNotifications, onRouteCheck, onConnectPush, onDisconnectPush }) {
  const host = document.getElementById('settings-body');
  host.textContent = '';

  const section = (title) => host.appendChild(el('h4', { class: 'trend-title', style: 'margin:14px 4px 4px', text: title }));

  const selectRow = (label, hint, path, options) => {
    const sel = el('select', {
      onchange: (e) => { setSetting(path, coerce(e.target.value)); onChanged(path); },
    }, options.map(([v, t]) => el('option', { value: String(v), text: t })));
    sel.value = String(getPath(path));
    host.appendChild(el('div', { class: 'setting-row' }, [
      el('label', { html: `${label}${hint ? `<span class="hint">${hint}</span>` : ''}` }), sel,
    ]));
  };

  const toggleRow = (label, hint, path) => {
    const input = el('input', {
      type: 'checkbox',
      onchange: (e) => { setSetting(path, e.target.checked); onChanged(path); },
    });
    input.checked = !!getPath(path);
    host.appendChild(el('div', { class: 'setting-row' }, [
      el('label', { html: `${label}${hint ? `<span class="hint">${hint}</span>` : ''}` }),
      el('label', { class: 'switch' }, [input, el('span', { class: 'knob' })]),
    ]));
  };

  const rangeRow = (label, hint, path, min, max, step) => {
    const input = el('input', {
      type: 'range', min, max, step,
      oninput: (e) => { setSetting(path, Number(e.target.value)); onChanged(path); },
    });
    input.value = String(getPath(path));
    host.appendChild(el('div', { class: 'setting-row' }, [
      el('label', { html: `${label}${hint ? `<span class="hint">${hint}</span>` : ''}` }), input,
    ]));
  };

  section('Units & data');
  selectRow('Distance / weather units', null, 'units', [['imperial', 'Imperial (mi, mph, °F)'], ['metric', 'Metric (km, km/h, °C)']]);
  selectRow('Refresh interval', 'How often radar & alerts re-poll', 'refreshIntervalSec',
    [[30, '30 s'], [60, '1 min'], [120, '2 min'], [300, '5 min']]);

  section('Radar');
  rangeRow('Radar transparency', null, 'radarOpacity', 0.2, 1, 0.05);
  selectRow('Animation speed', null, 'animFps', [[1, 'Slow (1 fps)'], [2, '2 fps'], [4, 'Normal (4 fps)'], [6, '6 fps'], [8, 'Fast (8 fps)']]);
  selectRow('Color table', null, 'colorTable', [['classic', 'Classic'], ['enhanced', 'Enhanced contrast'], ['grayscale', 'Grayscale']]);
  toggleRow('Radar smoothing', 'Softens pixel edges', 'radarSmoothing');
  toggleRow('Night mode', 'Dim red theme for driving in the dark', 'nightMode');

  section('AI analyst');
  selectRow('AI sensitivity', 'How readily scores climb', 'aiSensitivity',
    [['conservative', 'Conservative'], ['balanced', 'Balanced'], ['aggressive', 'Aggressive']]);
  rangeRow('Monitoring radius (km)', 'Storms inside this range drive the ticker & alerts', 'monitorRadiusKm', 50, 800, 25);
  selectRow('Storm display filter', 'Hide weaker storms from the map & lists (alerts still watch everything)', 'minCellScore',
    [[0, 'Show all storms'], [20, 'Score 20+ only'], [40, 'Score 40+ (elevated)'], [60, 'Score 60+ (high)']]);
  toggleRow('Only storms near me', 'Show only storms inside your monitoring radius (needs location)', 'onlyNearby');
  toggleRow('Technical readout', 'Show raw parameters in storm details', 'showTechnical');

  section('Notifications');
  const notifBtn = el('button', {
    class: 'product-btn', style: 'min-width:120px',
    text: typeof Notification !== 'undefined' && Notification.permission === 'granted'
      ? 'Enabled ✓' : 'Enable notifications',
    onclick: onRequestNotifications,
  });
  host.appendChild(el('div', { class: 'setting-row' }, [
    el('label', { html: 'Browser notifications<span class="hint">Requires installing to Home Screen on iOS</span>' }), notifBtn,
  ]));
  // Background push via the user's own Cloudflare worker.
  section('Background alerts (works when app is closed)');
  if (settings.pushEnabled) {
    host.appendChild(el('div', { class: 'setting-row' }, [
      el('label', { html: `Background alerts: <strong style="color:var(--ok)">ON</strong><span class="hint">${settings.pushServerUrl}</span>` }),
      el('button', { class: 'product-btn', text: 'Turn off', onclick: () => { onDisconnectPush?.(); } }),
    ]));
  } else {
    const pushInput = el('input', {
      type: 'text',
      placeholder: 'your-worker.workers.dev',
      value: settings.pushServerUrl || '',
      style: 'flex:1;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px;font-size:13px',
    });
    host.appendChild(el('div', { class: 'setting-row' }, [pushInput,
      el('button', {
        class: 'product-btn', text: 'Connect',
        onclick: () => { if (pushInput.value.trim()) onConnectPush?.(pushInput.value.trim()); },
      }),
    ]));
    host.appendChild(el('div', {
      class: 'muted', style: 'font-size:11px;margin:0 4px 8px',
      text: 'Paste your Cloudflare push worker URL to get warnings even when StormLens is closed. Setup guide: docs/PUSH_SETUP.md in the project. Requires iOS 16.4+ and Home Screen install.',
    }));
  }

  selectRow('Notification sensitivity', null, 'notifySensitivity',
    [['all', 'All activity'], ['high-only', 'High threats only'], ['off', 'In-app banners only']]);
  toggleRow('Tornado warnings', null, 'alertsEnabled.tornadoWarning');
  toggleRow('Tornado watches', null, 'alertsEnabled.tornadoWatch');
  toggleRow('Severe t-storm warnings', null, 'alertsEnabled.severeWarning');
  toggleRow('Flash flood warnings', null, 'alertsEnabled.flashFloodWarning');
  toggleRow('Rotation detected nearby', null, 'alertsEnabled.rotationDetected');
  toggleRow('Tornado chance rising', null, 'alertsEnabled.torChanceRising');
  toggleRow('Rapid intensification', null, 'alertsEnabled.rapidIntensification');
  toggleRow('Storm approaching me', null, 'alertsEnabled.approachingStorm');

  section('Favorite locations');
  host.appendChild(el('div', { class: 'muted', style: 'font-size:11px;margin:0 4px 4px', text: 'Tap a favorite to fly the map there. Favorites are also watched by the alert engine — warnings and strong rotation near them will notify you.' }));
  for (const [i, fav] of settings.favorites.entries()) {
    host.appendChild(el('div', { class: 'setting-row' }, [
      el('label', {
        text: `📍 ${fav.name}`,
        style: 'cursor:pointer',
        onclick: () => onChanged(`favorites.goto.${i}`),
      }),
      el('button', {
        class: 'icon-btn', text: '✕',
        onclick: () => {
          settings.favorites.splice(i, 1);
          setSetting('favorites', settings.favorites);
          renderSettings({ onChanged, onRequestNotifications, onRouteCheck });
        },
      }),
    ]));
  }
  host.appendChild(el('div', { class: 'setting-row' }, [
    el('label', { html: 'Add current map view<span class="hint">Saves the map centre as a favorite</span>' }),
    el('button', { class: 'product-btn', text: '+ Save', onclick: () => onChanged('favorites.add') }),
  ]));

  section('Route check');
  const routeInput = el('input', {
    type: 'text', placeholder: 'Destination (city or address)',
    style: 'flex:1;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px;font-size:13px',
  });
  host.appendChild(el('div', { class: 'setting-row' }, [routeInput,
    el('button', {
      class: 'product-btn', text: 'Check',
      onclick: () => { if (routeInput.value.trim()) onRouteCheck?.(routeInput.value.trim()); },
    }),
    el('button', { class: 'product-btn', text: 'Clear', onclick: () => onRouteCheck?.(null) }),
  ]));
  host.appendChild(el('div', { class: 'muted', style: 'font-size:11px;margin:0 4px', text: 'Draws the driving route from your location (or the map centre) and reports which tracked storms pass near it.' }));

  host.appendChild(el('div', {
    class: 'ai-disclaimer', style: 'margin-top:16px',
    text: 'StormLens combines NOAA/NWS radar & alerts (via api.weather.gov and the Iowa Environmental Mesonet) with Open-Meteo model data. All AI interpretation is unofficial.',
  }));
}

function getPath(path) {
  return path.split('.').reduce((o, k) => o?.[k], settings);
}

function coerce(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  const n = Number(v);
  return Number.isNaN(n) || v === '' || /[a-z]/i.test(v) ? v : n;
}
