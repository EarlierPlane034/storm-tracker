/** Settings panel: units, refresh, radar, AI + notification sensitivity, favorites. */
import { el, fmtRelTime } from '../utils.js';
import { settings, setSetting, DEFAULT_SETTINGS } from '../storage.js';
import { renderJournalSection } from './journal.js';
import { getState } from '../api/sources.js';
import { getLocation } from '../location.js';
import { showToast } from './toasts.js';

// One-tap bundles of settings for how the app is being used right now,
// instead of hunting down and re-toggling several individual switches.
const PRESETS = {
  casual: {
    label: 'Casual Viewing',
    hint: 'Slower refresh, chase HUD off — just keeping an eye on things.',
    values: {
      refreshIntervalSec: 120, animFps: 4, chaseMode: false, followMe: false,
      voiceAlerts: false, hapticAlerts: false, soundAlerts: false, notifySensitivity: 'high-only',
    },
  },
  activeChase: {
    label: 'Active Chase',
    hint: 'Fast refresh, chase HUD, and every alert channel on.',
    values: {
      refreshIntervalSec: 30, animFps: 6, chaseMode: true, followMe: true,
      voiceAlerts: true, hapticAlerts: true, soundAlerts: true, notifySensitivity: 'all',
      interceptGuidance: true,
    },
  },
  overnight: {
    label: 'Overnight Watch',
    hint: 'Dim red theme; only urgent alerts break through to wake you.',
    values: {
      nightMode: true, chaseMode: false, followMe: false, refreshIntervalSec: 60, animFps: 2,
      voiceAlerts: true, hapticAlerts: true, soundAlerts: true, notifySensitivity: 'high-only',
      quietHours: { enabled: true, startHour: 22, endHour: 7 },
    },
  },
  silent: {
    label: 'Silent Mode',
    hint: 'No sound, voice or vibration — visual alerts only.',
    values: { voiceAlerts: false, hapticAlerts: false, soundAlerts: false, notifySensitivity: 'high-only' },
  },
  weakSignal: {
    label: 'Weak Signal',
    hint: 'Aggressive data saving (5 min refresh) for spotty cell service.',
    values: { dataSaver: true },
  },
};

// One-tap bundles of *which tabs are visible* — same idea as PRESETS above,
// but for decluttering the tab bar down to just what a given use case needs
// instead of toggling each "Visible tabs" checkbox by hand.
const VISIBILITY_PRESETS = {
  essentials: {
    label: 'Essentials Only',
    hint: 'Just Radar, Storms and Alerts — everything else hidden.',
    values: { hiddenTabs: ['reports', 'analysis', 'week3', 'ai', 'features'] },
  },
  research: {
    label: 'Storm Research',
    hint: 'Adds Analysis and Week 3\'s deep-dive tools; AI chat and Features stay hidden.',
    values: { hiddenTabs: ['reports', 'ai', 'features'] },
  },
  everything: {
    label: 'Everything On',
    hint: 'Show every tab and tool.',
    values: { hiddenTabs: [], hiddenWeek3Tabs: [] },
  },
};

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

  const applyPreset = (preset) => {
    for (const [path, value] of Object.entries(preset.values)) {
      setSetting(path, value);
      onChanged(path);
    }
    showToast(`Applied “${preset.label}” preset.`);
    onChanged('journal.refresh'); // redraw settings to reflect the new values
  };
  const presetButtonRow = (presets) => {
    const row = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin:0 4px 12px' });
    for (const preset of Object.values(presets)) {
      row.appendChild(el('button', {
        class: 'product-btn',
        text: preset.label,
        title: preset.hint,
        onclick: () => applyPreset(preset),
      }));
    }
    return row;
  };

  section('Quick presets');
  host.appendChild(el('div', { class: 'muted', style: 'font-size:11px;margin:0 4px 8px', text: 'One tap to bundle the settings below for how you\'re using the app right now.' }));
  host.appendChild(presetButtonRow(PRESETS));

  host.appendChild(el('div', { class: 'muted', style: 'font-size:11px;margin:0 4px 8px', text: 'Or just pick which features are turned on — same as the checkboxes below, bundled.' }));
  host.appendChild(presetButtonRow(VISIBILITY_PRESETS));

  const RESET_EXCLUDE = ['favorites', 'bookmarkedStormIds', 'checklist', 'pushServerUrl', 'pushEnabled', 'firstRunDone'];
  host.appendChild(el('button', {
    class: 'product-btn', text: '↺ Reset all settings to defaults', style: 'margin:0 4px 14px',
    onclick: () => {
      if (!window.confirm('Reset every setting to its default? Your saved spots, pinned storms and chase checklist are not touched.')) return;
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (RESET_EXCLUDE.includes(key)) continue;
        // Deep-clone so nested defaults (layers, alertsEnabled, quietHours...)
        // never end up aliased to the live settings object.
        setSetting(key, JSON.parse(JSON.stringify(value)));
        onChanged(key);
      }
      showToast('All settings reset to defaults.');
      onChanged('journal.refresh');
    },
  }));

  section('Units & data');
  selectRow('Distance / weather units', null, 'units', [['imperial', 'Imperial (mi, mph, °F)'], ['metric', 'Metric (km, km/h, °C)']]);
  selectRow('Refresh interval', 'How often radar & alerts re-poll', 'refreshIntervalSec',
    [[30, '30 s'], [60, '1 min'], [120, '2 min'], [300, '5 min']]);

  // Roadmap ask: an easy way to turn whole features off — hides the tab
  // entirely (decluttering the bar and skipping its render work), not
  // just a buried preference. Radar and Settings itself always stay on.
  section('Visible tabs');
  // Its own container so this section (whose checkbox count changes when
  // Week 3's sub-tab rows appear/disappear) can be identified and skipped by
  // generic "click every checkbox" sweeps elsewhere.
  const tabVisibilitySection = el('div', { id: 'tab-visibility-section' });
  host.appendChild(tabVisibilitySection);
  tabVisibilitySection.appendChild(el('div', { class: 'muted', style: 'font-size:11px;margin:0 4px 8px', text: 'Turn off tabs you don\'t use — fewer things on screen, less for the app to compute.' }));
  const HIDEABLE_TABS = [
    ['storms', 'Storms'], ['alerts', 'Alerts'], ['reports', 'Reports'],
    ['analysis', 'Analysis'], ['week3', 'Week 3'], ['ai', 'AI'], ['features', 'Features'],
  ];
  for (const [key, label] of HIDEABLE_TABS) {
    const input = el('input', {
      type: 'checkbox',
      onchange: (e) => {
        const hidden = new Set(settings.hiddenTabs || []);
        if (e.target.checked) hidden.delete(key); else hidden.add(key);
        setSetting('hiddenTabs', [...hidden]);
        onChanged('hiddenTabs');
      },
    });
    input.checked = !(settings.hiddenTabs || []).includes(key);
    tabVisibilitySection.appendChild(el('div', { class: 'setting-row', style: 'padding:6px 4px' }, [
      el('label', { text: label }),
      el('label', { class: 'switch' }, [input, el('span', { class: 'knob' })]),
    ]));
  }

  if (!(settings.hiddenTabs || []).includes('week3')) {
    tabVisibilitySection.appendChild(el('div', { class: 'muted', style: 'font-size:11px;margin:10px 4px 4px', text: 'Week 3 sub-tabs' }));
    const HIDEABLE_WEEK3 = [
      ['ml-predictions', 'ML Predictions'], ['community', 'Community'], ['forecasting', 'Forecasting'],
      ['voice', 'Voice'], ['chase-safety', 'Chase Safety'], ['database', 'History'],
      ['charts', 'Charts'], ['education', 'Training'],
    ];
    for (const [key, label] of HIDEABLE_WEEK3) {
      const input = el('input', {
        type: 'checkbox',
        onchange: (e) => {
          const hidden = new Set(settings.hiddenWeek3Tabs || []);
          if (e.target.checked) hidden.delete(key); else hidden.add(key);
          setSetting('hiddenWeek3Tabs', [...hidden]);
          onChanged('hiddenWeek3Tabs');
        },
      });
      input.checked = !(settings.hiddenWeek3Tabs || []).includes(key);
      tabVisibilitySection.appendChild(el('div', { class: 'setting-row', style: 'padding:6px 4px' }, [
        el('label', { text: label }),
        el('label', { class: 'switch' }, [input, el('span', { class: 'knob' })]),
      ]));
    }
  }

  section('Radar');
  rangeRow('Radar transparency', null, 'radarOpacity', 0.2, 1, 0.05);
  selectRow('Animation speed', null, 'animFps', [[1, 'Slow (1 fps)'], [2, '2 fps'], [4, 'Normal (4 fps)'], [6, '6 fps'], [8, 'Fast (8 fps)']]);
  selectRow('Color table', null, 'colorTable', [['classic', 'Classic'], ['enhanced', 'Enhanced contrast'], ['grayscale', 'Grayscale']]);
  toggleRow('Radar smoothing', 'Softens pixel edges', 'radarSmoothing');

  // Roadmap #100: one clearly-labeled home for every readability/sensory
  // setting, instead of the visual ones being buried under "Radar" (where
  // they used to live) while haptics/voice sit elsewhere under their own
  // delivery-channel sections. Reduced-motion isn't listed here — it
  // already follows the OS-level prefers-reduced-motion setting in CSS,
  // which needs no in-app toggle.
  section('Accessibility');
  toggleRow('Night mode', 'Dim red theme for driving in the dark', 'nightMode');
  toggleRow('Color-blind friendly colors', 'Blue/yellow/orange/purple severity scale instead of green/red', 'colorblindMode');
  toggleRow('Large text', 'Bigger text on storm cards, stats and lists', 'largeText');
  toggleRow('High contrast', 'Brighter text and borders for bright-sunlight readability', 'highContrast');
  selectRow('Font', null, 'fontFamily', [['sans', 'Sans-serif (default)'], ['serif', 'Serif']]);
  toggleRow('Haptic alerts', 'Vibration patterns by severity (Android only — iOS blocks web vibration)', 'hapticAlerts');
  toggleRow('Spoken alerts', 'Speak dangerous alerts aloud — plays through CarPlay/Bluetooth car audio', 'voiceAlerts');

  section('Storm chasing');
  toggleRow('Intercept guidance', 'Map pin + route showing where the nearest dangerous storm is headed and how to get there', 'interceptGuidance');
  toggleRow('Chase mode', 'On-map HUD with bearing/ETA to your target storm, your speed, and keeps the screen awake', 'chaseMode');
  selectRow('Tailgate distance', 'Chase HUD warns if you get closer than this to your target storm', 'tailgateDistanceKm',
    [[1, '1 km (~0.6 mi)'], [2, '2 km (~1.2 mi)'], [3, '3 km (~1.9 mi) — default'], [5, '5 km (~3.1 mi)'], [8, '8 km (~5 mi)']]);
  toggleRow('Follow me', 'Auto-center the map on your position as you drive', 'followMe');
  toggleRow('Data saver', 'Slower refresh (5 min) for weak cell signal in the field', 'dataSaver');
  host.appendChild(el('div', { class: 'setting-row' }, [
    el('label', { html: 'Share my location<span class="hint">Sends your exact GPS coordinates + a timestamp — for texting a contact in an emergency</span>' }),
    el('button', {
      class: 'product-btn', text: '📍 Share',
      onclick: async () => {
        const loc = getLocation();
        if (!loc) { showToast('No GPS fix yet — enable location (⌖) first.', { level: 'warn' }); return; }
        const text = `📍 My location (StormLens, ${new Date().toLocaleString()}): ` +
          `${loc.lat.toFixed(5)}, ${loc.lon.toFixed(5)} — https://maps.google.com/?q=${loc.lat},${loc.lon}`;
        try {
          if (navigator.share) await navigator.share({ title: 'My location', text });
          else { await navigator.clipboard.writeText(text); showToast('Location copied to the clipboard.'); }
        } catch { /* user cancelled */ }
      },
    }),
  ]));

  // Pre-chase checklist (persisted; reset before each chase).
  host.appendChild(el('div', { class: 'muted', style: 'font-size:11px;margin:8px 4px 2px', text: 'Pre-chase checklist' }));
  const CHECK_ITEMS = [
    'Fuel topped off', 'Phone + battery pack charged', 'Water & snacks',
    'First aid kit', 'Flashlight / headlamp', 'Paper map (cell backup)',
    'Escape routes reviewed', 'Someone knows your plan',
    'Checked CAPE/shear/LCL for today', 'Tire pressure & spare checked',
    'GMRS/CB channel agreed with any chase partners', 'Rally/regroup point set',
  ];
  for (const item of CHECK_ITEMS) {
    const input = el('input', {
      type: 'checkbox',
      onchange: (e) => {
        settings.checklist[item] = e.target.checked;
        setSetting('checklist', settings.checklist);
      },
    });
    input.checked = !!settings.checklist[item];
    host.appendChild(el('div', { class: 'setting-row', style: 'padding:8px 4px' }, [
      el('label', { text: item }),
      el('label', { class: 'switch' }, [input, el('span', { class: 'knob' })]),
    ]));
  }
  host.appendChild(el('div', { class: 'setting-row' }, [
    el('label', { class: 'muted', text: 'Reset checklist for a new chase' }),
    el('button', {
      class: 'product-btn', text: 'Reset',
      onclick: () => { setSetting('checklist', {}); onChanged('journal.refresh'); },
    }),
  ]));

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
  toggleRow('Storms merging nearby', 'Two significant storms converging can spike combined severity', 'alertsEnabled.stormMerger');
  selectRow('Alert language', 'Alert titles, shelter instructions and spoken alerts', 'language',
    [['en', 'English'], ['es', 'Español']]);
  toggleRow('Sound alerts', 'Play a tone (tornado siren / warning tone / ping by hazard) in addition to vibration', 'soundAlerts');
  toggleRow('Quiet hours', 'Mute sound/vibration/voice/push overnight — tornado-warning-level alerts still break through', 'quietHours.enabled');
  const hourOptions = Array.from({ length: 24 }, (_, h) => [h, hourLabel(h)]);
  selectRow('Quiet hours start', null, 'quietHours.startHour', hourOptions);
  selectRow('Quiet hours end', null, 'quietHours.endHour', hourOptions);
  toggleRow('Custom thresholds', 'Alert on your own tornado %/hail/wind numbers, on top of the categories above', 'customThresholds.enabled');
  const thresholdRow = (label, path, min, max, step, suffix = '') => {
    const value = el('span', { class: 'hint', text: `${getPath(path)}${suffix}` });
    const input = el('input', {
      type: 'range', min, max, step,
      oninput: (e) => {
        setSetting(path, Number(e.target.value));
        value.textContent = `${e.target.value}${suffix}`;
        onChanged(path);
      },
    });
    input.value = String(getPath(path));
    host.appendChild(el('div', { class: 'setting-row' }, [
      el('label', {}, [document.createTextNode(label), value]), input,
    ]));
  };
  thresholdRow('Tornado % threshold', 'customThresholds.tornadoPct', 10, 90, 5, '%');
  thresholdRow('Hail size threshold', 'customThresholds.hailIn', 0.5, 3, 0.25, '"');
  thresholdRow('Wind score threshold', 'customThresholds.windScore', 20, 90, 5);

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

  section('Chase journal');
  renderJournalSection(host, {
    onChanged: () => onChanged('journal.refresh'),
    onShowTrack: () => onChanged('chase.replay'),
  });

  section('Data feeds (last update)');
  const feeds = [
    ['cells', 'Storm cells'], ['alerts', 'NWS alerts'], ['reports', 'Storm reports'],
    ['environment', 'Model environment'], ['forecast', 'NWS forecast'],
    ['outlook', 'SPC outlook'], ['week', 'Week outlook'],
  ];
  const updated = getState().lastUpdated || {};
  for (const [key, label] of feeds) {
    const at = updated[key];
    host.appendChild(el('div', { class: 'setting-row', style: 'padding:7px 4px' }, [
      el('label', { text: label }),
      el('span', {
        class: 'muted', style: 'font-family:var(--mono);font-size:11px',
        text: at ? fmtRelTime(new Date(at)) : 'not yet',
      }),
    ]));
  }

  section('About');
  host.appendChild(el('div', { class: 'setting-row' }, [
    el('label', { html: 'About StormLens<span class="hint">Everything the app can do, data sources, credits</span>' }),
    el('button', { class: 'product-btn', text: 'Open →', onclick: () => onChanged('about.open') }),
  ]));

  host.appendChild(el('div', {
    class: 'ai-disclaimer', style: 'margin-top:16px',
    text: 'StormLens combines NOAA/NWS radar & alerts (via api.weather.gov and the Iowa Environmental Mesonet) with Open-Meteo model data. All AI interpretation is unofficial.',
  }));
}

function hourLabel(h) {
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${period}`;
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
