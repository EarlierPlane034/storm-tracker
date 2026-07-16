/**
 * Radar controller: owns the Leaflet radar layers, product switching,
 * single-site vs mosaic selection, smooth frame animation and playback.
 *
 * Animation approach: every frame is a live L.tileLayer kept in the map at
 * opacity 0; playback only flips opacities, so frame changes never wait on
 * the network and the loop runs at a stable frame rate.
 */
import { CONFIG } from '../config.js';
import { settings, saveSettings } from '../storage.js';
import { PRODUCTS, getProduct, colorTableFilter } from './products.js';
import { fetchRadarSites } from '../api/iem.js';
import { haversineKm } from '../utils.js';

const IEM_TILES = CONFIG.endpoints.iemTiles;

export class RadarController {
  constructor(map, { onFrameChange, onProductChange, onNotice } = {}) {
    this.map = map;
    this.onFrameChange = onFrameChange || (() => {});
    this.onProductChange = onProductChange || (() => {});
    this.onNotice = onNotice || (() => {});

    this.productId = CONFIG.radar.defaultProduct;
    this.tiltIndex = 0;
    this.site = null;          // nearest WSR-88D {id, name, lat, lon}
    this.frames = [];          // [{layer, offsetMin}] oldest -> newest
    this.frameIndex = 0;
    this.playing = false;
    this.playTimer = null;
    this.refreshTimer = null;
    this.paneName = 'radarPane';

    const pane = map.createPane(this.paneName);
    pane.style.zIndex = 350; // below overlays/markers, above basemap
    this.applyStyle();
  }

  /** Apply opacity + colour table + smoothing to the radar pane. */
  applyStyle() {
    const pane = this.map.getPane(this.paneName);
    pane.style.opacity = settings.radarOpacity;
    pane.style.filter = colorTableFilter(settings.colorTable);
    pane.style.imageRendering = settings.radarSmoothing ? 'auto' : 'pixelated';
  }

  /**
   * Resolve the active radar site. Respects a manually pinned site
   * (settings.radarSite) — auto-switching to the nearest site only happens
   * in 'auto' mode, so panning the map never yanks the radar out from
   * under the user mid-analysis.
   */
  async pickSite(lat, lon) {
    const sites = await fetchRadarSites();
    let next = null;
    if (settings.radarSite && settings.radarSite !== 'auto') {
      next = sites.find((s) => s.id === settings.radarSite) || null;
    }
    if (!next) {
      let bestD = Infinity;
      for (const s of sites) {
        const d = haversineKm(lat, lon, s.lat, s.lon);
        if (d < bestD) { bestD = d; next = s; }
      }
    }
    if (next && (!this.site || next.id !== this.site.id)) {
      this.site = next;
      const prod = getProduct(this.productId);
      if (prod?.mode === 'site' || prod?.mosaicFallback) this.rebuild();
    }
    return this.site;
  }

  /** Manually pin a site ('auto' returns to nearest-site behaviour). */
  async setSite(idOrAuto, centerLat, centerLon) {
    settings.radarSite = idOrAuto;
    saveSettings();
    this.site = null; // force re-resolution + rebuild
    return this.pickSite(centerLat, centerLon);
  }

  setProduct(id) {
    const prod = getProduct(id);
    if (!prod) return;
    if (!prod.available) {
      this.onNotice(`${prod.name}: ${prod.unavailableNote}`);
      return; // keep the current layer on screen
    }
    this.productId = id;
    this.tiltIndex = 0;
    this.rebuild();
    this.onProductChange(prod);
  }

  /** Cycle radar tilt for multi-tilt products (repeat-tap on active product). */
  cycleTilt() {
    const prod = getProduct(this.productId);
    if (!prod?.tilts || prod.tilts.length < 2) return null;
    this.tiltIndex = (this.tiltIndex + 1) % prod.tilts.length;
    this.rebuild();
    return this.tiltIndex;
  }

  /** Build tile URL for a product/frame. */
  frameUrl(prod, frameOffset) {
    if (prod.mode === 'mosaic' || (prod.mosaicFallback && !this.site)) {
      const layer = prod.layer || 'nexrad-n0q-900913';
      const suffix = frameOffset === 0
        ? '' : `-m${String(frameOffset).padStart(2, '0')}m`;
      return `${IEM_TILES}/${layer}${suffix}/{z}/{x}/{y}.png`;
    }
    // Single-site "ridge" cache keeps the 5 most recent scans per product.
    const tiltProd = prod.tilts ? prod.tilts[this.tiltIndex] : prod.id;
    const idx = Math.round(frameOffset / CONFIG.radar.frameStepMin);
    return `${IEM_TILES}/ridge::${this.site.id}-${tiltProd}-${Math.min(idx, 4)}/{z}/{x}/{y}.png`;
  }

  /**
   * Tear down and recreate the frame stack for the current product.
   *
   * Performance: only the LIVE frame gets a real tile layer up front.
   * History frames are descriptors ({layer:null}) materialized on first
   * playback/scrub, so idle browsing never downloads or composites the
   * other ~10 layers — the main battery/lag saver on phones.
   */
  rebuild() {
    const prod = getProduct(this.productId);
    if (!prod || !prod.available) return;

    this.stop();
    for (const f of this.frames) if (f.layer) this.map.removeLayer(f.layer);
    this.frames = [];

    const isMosaic = prod.mode === 'mosaic' || (prod.mosaicFallback && !this.site);
    const frameCount = prod.noHistory ? 1 : isMosaic ? CONFIG.radar.frameCount : 5;
    const step = CONFIG.radar.frameStepMin;

    for (let i = frameCount - 1; i >= 0; i--) {
      this.frames.push({ layer: null, offsetMin: i * step });
    }
    this.frameIndex = this.frames.length - 1; // newest
    this.showFrame(this.frameIndex);

    // Live refresh: re-key the newest frame's tiles on the user cadence.
    clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(
      () => this.refreshLive(),
      Math.max(30, settings.refreshIntervalSec) * 1000,
    );
  }

  /** Create the tile layer for frame i if it doesn't exist yet. */
  ensureLayer(i) {
    const f = this.frames[i];
    if (!f || f.layer) return;
    const prod = getProduct(this.productId);
    const isSiteMode = prod.mode === 'site' && this.site;
    // Single-site products only have data within ~230 km of the radar.
    // Bounding the layer stops Leaflet requesting hundreds of guaranteed-404
    // tiles when the map is panned/zoomed away — the main cause of velocity
    // feeling laggy and "empty".
    const opts = {
      pane: this.paneName,
      opacity: 0,
      maxNativeZoom: 10,
      maxZoom: 16,
      updateWhenZooming: false,
      updateWhenIdle: true,
      keepBuffer: 1,
      attribution: 'NEXRAD via IEM/NOAA',
      crossOrigin: true,
    };
    if (isSiteMode) {
      opts.bounds = L.latLngBounds(
        [this.site.lat - 2.5, this.site.lon - 3.2],
        [this.site.lat + 2.5, this.site.lon + 3.2],
      );
    }
    f.layer = L.tileLayer(this.frameUrl(prod, f.offsetMin), opts);
    // Some optional layers (satellite, SRV) may not be served for every
    // sector/time; tell the user once instead of failing silently.
    if (prod.mayBeMissing) {
      let errCount = 0;
      f.layer.on('tileerror', () => {
        this._warnedMissing = this._warnedMissing || {};
        if (++errCount === 10 && !this._warnedMissing[prod.id]) {
          this._warnedMissing[prod.id] = true;
          this.onNotice(`${prod.name} tiles appear unavailable from the public cache right now — try again later or switch products.`);
        }
      });
    }
    f.layer.addTo(this.map);
  }

  /** Force the newest frame to re-download (cache-busted) tiles. */
  refreshLive() {
    const newest = this.frames[this.frames.length - 1];
    if (!newest?.layer) return;
    const prod = getProduct(this.productId);
    newest.layer.setUrl(`${this.frameUrl(prod, 0)}?t=${Math.floor(Date.now() / 30000)}`);
  }

  showFrame(idx) {
    this.frameIndex = Math.max(0, Math.min(this.frames.length - 1, idx));
    this.ensureLayer(this.frameIndex);
    this.frames.forEach((f, i) => f.layer?.setOpacity(i === this.frameIndex ? 1 : 0));
    const f = this.frames[this.frameIndex];
    this.onFrameChange({
      index: this.frameIndex,
      total: this.frames.length,
      offsetMin: f?.offsetMin ?? 0,
      isLive: this.frameIndex === this.frames.length - 1,
    });
  }

  play() {
    if (this.playing || this.frames.length < 2) return;
    // Materialize all history frames so the loop never stalls mid-play.
    this.frames.forEach((_, i) => this.ensureLayer(i));
    this.playing = true;
    const tick = () => {
      if (!this.playing) return;
      const next = (this.frameIndex + 1) % this.frames.length;
      this.showFrame(next);
      // Dwell on the newest frame so "now" is readable in the loop.
      const dwell = next === this.frames.length - 1 ? 3 : 1;
      this.playTimer = setTimeout(tick, (1000 / Math.max(1, settings.animFps)) * dwell);
    };
    tick();
  }

  stop() {
    this.playing = false;
    clearTimeout(this.playTimer);
  }

  toggle() {
    this.playing ? this.stop() : this.play();
    return this.playing;
  }

  get productList() {
    return PRODUCTS;
  }

  get currentProduct() {
    return getProduct(this.productId);
  }
}
