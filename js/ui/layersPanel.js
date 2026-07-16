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

export function renderLayers({ onChanged }) {
  const host = document.getElementById('layers-body');
  host.textContent = '';
  for (const [key, label, hint] of LAYERS) {
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
  host.appendChild(el('div', {
    class: 'muted', style: 'margin-top:10px; font-size:11px',
    text: 'County boundaries, rivers, roads and cities are part of the base map and label layers. GOES satellite, MRMS mosaics and model overlays ride the radar product selector.',
  }));
}
