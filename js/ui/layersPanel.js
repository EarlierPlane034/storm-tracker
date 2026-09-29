/** Map layers panel: overlay toggles. */
import { el } from '../utils.js';
import { settings, setSetting } from '../storage.js';
import { getClimatology } from '../analysis/climatology.js';

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
  ['mesocyclones', 'Mesocyclones', 'Rotation centers and movement trails detected on radar'],
  ['tornadoCones', 'Tornado risk corridors', 'Widening "cone of concern" along the track of any storm with Elevated+ tornado chance'],
];

export function renderLayers({ onChanged, onGlance, onTornadoHistory, onCheckLevel2 }) {
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
    const clim = getClimatology();
    if (clim) {
      host.appendChild(el('div', {
        class: 'card muted', style: 'margin:0 0 10px; font-size:11.5px',
        text: `📊 Local climatology (from the loaded archive): ${clim.count} tornadoes recorded near this view since 1950 · peak month ${clim.peakMonth} · strongest EF${clim.strongestEF}${clim.totalFatalities ? ` · ${clim.totalFatalities} fatalities total` : ''}.`,
      }));
    }
  }
  if (onCheckLevel2) {
    host.appendChild(el('div', { class: 'setting-row' }, [
      el('label', { html: '📡 Raw Level II data<span class="hint">Same raw radar feed RadarScope renders (info only — full decoding/rendering isn\'t built here yet)</span>' }),
      el('button', { class: 'product-btn', text: 'Check', onclick: onCheckLevel2 }),
    ]));
  }
  // Overlay layers.
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
    text: 'Basemap style (Topo/Satellite/OSM) is on the map itself, top-right. County boundaries, rivers, roads and cities are part of the base map. GOES satellite, MRMS mosaics and model overlays ride the radar product selector.',
  }));
}
