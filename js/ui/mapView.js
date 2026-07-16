/**
 * Map view: Leaflet map, basemap, overlay layers (warnings, watches, SPC
 * outlook, storm reports, cells, tracks, METAR, counties, radar sites),
 * storm-cell markers and projected tracks.
 */
import { CONFIG } from '../config.js';
import { settings } from '../storage.js';
import { destinationPoint, fmtSpeed, compassDir } from '../utils.js';

const ALERT_STYLE = {
  'tor-warning': { color: '#ef4444', weight: 2.5, fillOpacity: 0.12 },
  'tor-watch':   { color: '#f97316', weight: 1.5, fillOpacity: 0.05, dashArray: '6 4' },
  'svr-warning': { color: '#f59e0b', weight: 2, fillOpacity: 0.10 },
  'svr-watch':   { color: '#eab308', weight: 1.5, fillOpacity: 0.04, dashArray: '6 4' },
  'ffw-warning': { color: '#22c55e', weight: 2, fillOpacity: 0.08 },
  'ffw-watch':   { color: '#16a34a', weight: 1.5, fillOpacity: 0.04, dashArray: '6 4' },
  other:         { color: '#94a3b8', weight: 1, fillOpacity: 0.03 },
};

const SPC_STYLE = {
  TSTM: '#c0e8c0', MRGL: '#66a366', SLGT: '#f6f67f',
  ENH: '#e6c27f', MDT: '#e67f7f', HIGH: '#ff66ff',
};

export class MapView {
  constructor(containerId, { onCellTap } = {}) {
    this.onCellTap = onCellTap || (() => {});

    this.map = L.map(containerId, {
      center: [37.5, -96.5], // CONUS
      zoom: 5,
      zoomControl: false,
      attributionControl: true,
      touchZoom: true,
      bounceAtZoomLimits: false,
      // Whole-integer zoom steps keep tiles at native scale — fractional
      // zooms force continuous CSS rescaling of every tile (heavy on iOS).
      zoomSnap: 1,
      zoomDelta: 1,
      inertia: true,
      fadeAnimation: false,       // tile cross-fade costs paint time on mobile
      preferCanvas: true,
      // One shared canvas renderer with generous padding so pans/zooms
      // reuse the already-drawn area instead of redrawing every frame.
      renderer: L.canvas({ padding: 0.5 }),
    });

    // Tile layers only fetch when the gesture settles — never mid-pinch.
    const calmTiles = { updateWhenZooming: false, updateWhenIdle: true, keepBuffer: 2 };

    L.tileLayer(CONFIG.endpoints.basemapDark, {
      attribution: '&copy; OSM &copy; CARTO', subdomains: 'abcd', maxZoom: 19, ...calmTiles,
    }).addTo(this.map);

    this.labelPane = this.map.createPane('labels');
    this.labelPane.style.zIndex = 420;
    this.labelPane.style.pointerEvents = 'none';
    L.tileLayer(CONFIG.endpoints.basemapLabels, {
      pane: 'labels', subdomains: 'abcd', maxZoom: 19, ...calmTiles,
    }).addTo(this.map);

    this.satelliteLayer = L.tileLayer(CONFIG.endpoints.basemapSatellite, {
      attribution: 'Esri', maxZoom: 19, opacity: 0.85, ...calmTiles,
    });

    // Overlay groups.
    this.groups = {
      spcOutlook: L.layerGroup(),
      watches: L.layerGroup(),
      warnings: L.layerGroup(),
      stormReports: L.layerGroup(),
      stormTracks: L.layerGroup(),
      cells: L.layerGroup(),
      metar: L.layerGroup(),
      counties: L.layerGroup(),
      radarSites: L.layerGroup(),
    };
    this.syncLayerVisibility();

    this.userMarker = null;
  }

  syncLayerVisibility() {
    for (const [name, group] of Object.entries(this.groups)) {
      const want = !!settings.layers[name];
      const has = this.map.hasLayer(group);
      if (want && !has) group.addTo(this.map);
      if (!want && has) this.map.removeLayer(group);
    }
    const wantSat = !!settings.layers.satellite;
    const hasSat = this.map.hasLayer(this.satelliteLayer);
    if (wantSat && !hasSat) this.satelliteLayer.addTo(this.map);
    if (!wantSat && hasSat) this.map.removeLayer(this.satelliteLayer);
  }

  setUserLocation(lat, lon, accuracyM) {
    if (!this.userMarker) {
      this.userMarker = L.circleMarker([lat, lon], {
        radius: 7, color: '#38bdf8', fillColor: '#38bdf8',
        fillOpacity: 0.9, weight: 2,
      }).addTo(this.map);
      this.userAccuracy = L.circle([lat, lon], {
        radius: accuracyM || 50, color: '#38bdf8', weight: 1,
        fillOpacity: 0.06, interactive: false,
      }).addTo(this.map);
    } else {
      this.userMarker.setLatLng([lat, lon]);
      this.userAccuracy.setLatLng([lat, lon]).setRadius(accuracyM || 50);
    }
  }

  flyToUser(lat, lon) {
    this.map.flyTo([lat, lon], Math.max(this.map.getZoom(), 8), { duration: 0.8 });
  }

  /** Zoom to a storm cell and drop a temporary highlight ring on it. */
  focusCell(cell) {
    this.map.flyTo([cell.lat, cell.lon], Math.max(this.map.getZoom(), 8.5), { duration: 0.7 });
    if (this._focusRing) this.map.removeLayer(this._focusRing);
    this._focusRing = L.circleMarker([cell.lat, cell.lon], {
      radius: 26, color: '#38bdf8', weight: 3, fill: false,
      interactive: false, dashArray: '6 6',
    }).addTo(this.map);
    clearTimeout(this._focusTimer);
    this._focusTimer = setTimeout(() => {
      if (this._focusRing) { this.map.removeLayer(this._focusRing); this._focusRing = null; }
    }, 8000);
  }

  /**
   * Time-matched loop playback: slide every storm marker back along its
   * (reversed) motion vector to where it was `offsetMin` minutes ago, so
   * markers track the radar history frame being shown.
   */
  offsetCells(offsetMin) {
    for (const { marker, cell } of this.cellMarkers || []) {
      if (!offsetMin || cell.moveDirDeg == null || !cell.moveSpeedKts) {
        marker.setLatLng([cell.lat, cell.lon]);
        continue;
      }
      const distKm = (cell.moveSpeedKts * 1.852 * offsetMin) / 60;
      marker.setLatLng(
        destinationPoint(cell.lat, cell.lon, (cell.moveDirDeg + 180) % 360, distKm));
    }
  }

  /** Ghost marker used by the storm-history scrubber in the detail sheet. */
  setGhost(lat, lon) {
    if (!this._ghost) {
      this._ghost = L.circleMarker([lat, lon], {
        radius: 12, color: '#e5eaf0', weight: 2, dashArray: '4 4',
        fillColor: '#e5eaf0', fillOpacity: 0.15, interactive: false,
      }).addTo(this.map);
    } else {
      this._ghost.setLatLng([lat, lon]);
    }
  }

  clearGhost() {
    if (this._ghost) { this.map.removeLayer(this._ghost); this._ghost = null; }
  }

  /** Draw (or replace) the checked travel route. */
  setRoute(latlngs) {
    this.clearRoute();
    this._route = L.polyline(latlngs, {
      color: '#38bdf8', weight: 4, opacity: 0.75, interactive: false,
    }).addTo(this.map);
    this.map.fitBounds(this._route.getBounds(), { padding: [40, 40] });
  }

  clearRoute() {
    if (this._route) { this.map.removeLayer(this._route); this._route = null; }
  }

  renderAlerts(alerts) {
    this.groups.warnings.clearLayers();
    this.groups.watches.clearLayers();
    for (const a of alerts) {
      if (!a.geometry) continue;
      // Misc statements ('other') stay in the Alerts panel but aren't drawn —
      // hundreds of extra polygons make zooming stutter for no map value.
      if (a.kind === 'other') continue;
      const style = ALERT_STYLE[a.kind];
      const isWatch = a.kind.endsWith('watch');
      // Watch outlines are county-aggregated MultiPolygons with thousands of
      // vertices; a higher smoothFactor collapses sub-pixel detail so canvas
      // redraws during zoom stay cheap. Storm-based warnings are small
      // polygons and keep full fidelity.
      const layer = L.geoJSON(a.geometry, { style, smoothFactor: isWatch ? 3 : 1.2 });
      layer.bindPopup(
        `<strong>${escape(a.event)}</strong><br>${escape(a.headline)}<br>` +
        `<em>${a.ends ? `until ${a.ends.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</em>`,
      );
      (isWatch ? this.groups.watches : this.groups.warnings).addLayer(layer);
    }
  }

  renderOutlook(features) {
    this.groups.spcOutlook.clearLayers();
    for (const f of features) {
      const label = f.properties?.LABEL || '';
      const color = SPC_STYLE[label] || '#64748b';
      const layer = L.geoJSON(f.geometry, {
        style: { color, weight: 1, fillColor: color, fillOpacity: 0.10, interactive: false },
        smoothFactor: 2.5, // outlook areas are huge; fine detail is invisible anyway
      });
      this.groups.spcOutlook.addLayer(layer);
    }
  }

  renderReports(reports) {
    this.groups.stormReports.clearLayers();
    for (const r of reports) {
      const icon = /tornado/i.test(r.type) ? '🌪' : /hail/i.test(r.type) ? '🧊'
        : /wind/i.test(r.type) ? '💨' : /flood|rain/i.test(r.type) ? '💧' : '⚠️';
      const m = L.marker([r.lat, r.lon], {
        icon: L.divIcon({ className: '', html: `<div style="font-size:14px">${icon}</div>`, iconSize: [16, 16] }),
      });
      m.bindPopup(
        `<strong>${escape(r.type)}</strong> ${r.magnitude ?? ''} ${escape(r.unit)}<br>` +
        `${escape(r.city)}, ${escape(r.state)}<br><em>${escape(r.remark).slice(0, 160)}</em>`,
      );
      this.groups.stormReports.addLayer(m);
    }
  }

  renderRadarSites(sites, activeSiteId) {
    this.groups.radarSites.clearLayers();
    for (const s of sites) {
      const m = L.circleMarker([s.lat, s.lon], {
        radius: 4,
        color: s.id === activeSiteId ? '#38bdf8' : '#475569',
        fillOpacity: 0.8, weight: 1.5,
      }).bindTooltip(`${s.id} ${s.name}`);
      this.groups.radarSites.addLayer(m);
    }
  }

  renderObservations(obs) {
    this.groups.metar.clearLayers();
    for (const o of obs) {
      if (o.tempC == null) continue;
      const tempF = Math.round(o.tempC * 9 / 5 + 32);
      const html = `<div style="font:600 10px monospace;color:#e5eaf0;background:rgba(11,15,20,.8);padding:2px 4px;border-radius:4px;white-space:nowrap">${tempF}° ${o.windDirDeg != null ? compassDir(o.windDirDeg) : ''} ${o.windKmh != null ? Math.round(o.windKmh / 1.852) + 'kt' : ''}</div>`;
      const m = L.marker([o.lat, o.lon], {
        icon: L.divIcon({ className: '', html, iconSize: null }),
      }).bindTooltip(`${o.station} — ${escape(o.name)}`);
      this.groups.metar.addLayer(m);
    }
  }

  /**
   * Storm cell markers, sized/colored by severe score, with projected tracks.
   * @param {Array} analyses sorted analyses from stormAnalyzer
   */
  renderCells(analyses) {
    this.groups.cells.clearLayers();
    this.groups.stormTracks.clearLayers();
    this.cellMarkers = []; // kept for time-matched loop playback

    // Cap DOM markers on very active days; analyses arrive sorted most
    // dangerous first, so the cap only ever drops the weakest cells.
    for (const a of analyses.slice(0, 100)) {
      const c = a.cell;
      const color = a.severeScore >= 81 ? '#ef4444' : a.severeScore >= 61 ? '#fb923c'
        : a.severeScore >= 41 ? '#fbbf24' : a.severeScore >= 21 ? '#34d399' : '#64748b';
      const size = a.severeScore >= 61 ? 30 : a.severeScore >= 41 ? 26 : 22;
      const pulse = a.tornado.score >= 41 ? ' pulse' : '';

      const marker = L.marker([c.lat, c.lon], {
        icon: L.divIcon({
          className: '',
          html: `<div class="cell-marker${pulse}" style="width:${size}px;height:${size}px;background:${color}">${a.severeScore}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        zIndexOffset: 1000 - a.rank,
      });
      marker.on('click', () => this.onCellTap(a));
      this.groups.cells.addLayer(marker);
      this.cellMarkers.push({ marker, cell: c });

      // Projected track: 15/30/45/60-minute positions along storm motion.
      if (c.moveDirDeg != null && c.moveSpeedKts > 3) {
        const pts = [[c.lat, c.lon]];
        for (const min of [15, 30, 45, 60]) {
          const distKm = (c.moveSpeedKts * 1.852 * min) / 60;
          pts.push(destinationPoint(c.lat, c.lon, c.moveDirDeg, distKm));
        }
        const line = L.polyline(pts, {
          color, weight: 2, opacity: 0.7, dashArray: '4 6', interactive: false,
        });
        this.groups.stormTracks.addLayer(line);
        // Tick marks at each projected position.
        for (const p of pts.slice(1)) {
          this.groups.stormTracks.addLayer(L.circleMarker(p, {
            radius: 2.5, color, fillOpacity: 0.9, weight: 1, interactive: false,
          }));
        }
        line.bindTooltip(`moving ${compassDir(c.moveDirDeg)} at ${fmtSpeed(c.moveSpeedKts, settings.units)}`);
      }
    }
  }
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"]/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
  ));
}
