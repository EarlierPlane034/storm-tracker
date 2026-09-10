/** Map layers panel: overlay toggles. */
import { el } from '../utils.js';
import { settings, setSetting } from '../storage.js';

const LAYERS = [
  ['warnings', 'Warnings (polygons)', 'Tornado / severe / flash flood warning boxes'],
  ['watches', 'Watches', 'Tornado & severe watch outlines'],
  ['spcOutlook', 'SPC Day-1 Outlook', 'Categorical convective risk shading'],
  ['cells', 'Storm cells', 'AI-scored storm markers'],
  ['stormTracks', 'Storm tracks', 'Projected 60-minute paths'],
  ['stormReports', 'Storm reports', 'Spotter reports (hail/wind/tornado) last 6 h'],
  ['metar', 'Surface stations', 'Nearby METAR observations'],
  ['radarSites', 'Radar sites', 'WSR-88D locations; active site highlighted'],
  ['rangeRings', 'Range rings', '25/50/100 mi rings centered on your location'],
  ['satellite', 'Satellite basemap', 'Imagery under the radar layer'],
];

export function renderLayers({ onChanged, onGlance, onTornadoHistory }) {
  const host = document.getElementById('layers-body');
  host.textContent = '';

  if (onGlance) {
    host.appendChild(el('div', { class: 'setting-row' }, [
      el('label', { html: '👁 Glance mode<span class="hint">Giant-type status screen, readable across the room</span>' }),
      el('button', { class: 'product-btn', text: 'Open', onclick: onGlance }),
    ]));
  }
  if (onTornadoHistory) {
    host.appendChild(el('div', { class: 'setting-row' }, [
      el('label', { html: '🌪 Tornado history<span class="hint">Every recorded tornado since 1950 near the map view (one-time ~10 MB download from SPC)</span>' }),
      el('button', { class: 'product-btn', text: 'Load', onclick: onTornadoHistory }),
    ]));
  }
  // Overlay layers (exclude satellite, which is handled separately below)
  for (const [key, label, hint] of LAYERS.filter(([k]) => k !== 'satellite')) {
    const input = el('input', {
      type: 'checkbox',
      onchange: (e) => { setSetting(`layers.${key}`, e.target.checked); onChanged(key); },
    });
    input.checked = !!settings.layers[key];
    host.appendChild(el('div', { class: 'setting-row' }, [
      el('label', { html: `${label}<span class="hint">${hint}</span>` }),
      el('label', { class: 'switch' }, [input, el('span', { class: 'knob' })]),
    ]));
  }

  // Basemap section
  host.appendChild(el('div', {
    style: 'margin-top:16px; padding-top:12px; border-top:1px solid rgba(139,151,165,0.2)',
  }));
  host.appendChild(el('div', {
    style: 'font-size:11px; color:#8b97a5; text-transform:uppercase; letter-spacing:0.5px; padding:8px 4px 4px; font-weight:600',
    text: '🗺 Basemap',
  }));
  const satInput = el('input', {
    type: 'checkbox',
    onchange: (e) => { setSetting('layers.satellite', e.target.checked); onChanged('satellite'); },
  });
  satInput.checked = !!settings.layers.satellite;
  host.appendChild(el('div', { class: 'setting-row' }, [
    el('label', { html: 'Satellite<span class="hint">Imagery under the radar layer</span>' }),
    el('label', { class: 'switch' }, [satInput, el('span', { class: 'knob' })]),
  ]));

  host.appendChild(el('div', {
    class: 'muted', style: 'margin-top:10px; font-size:11px',
    text: 'County boundaries, rivers, roads and cities are part of the base map and label layers. GOES satellite, MRMS mosaics and model overlays ride the radar product selector.',
  }));
}
