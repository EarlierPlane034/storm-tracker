/**
 * Environmental Overlay System
 *
 * Renders environmental parameters (CAPE, CIN, LCL, freezing level) as
 * heat maps and indicators on the Leaflet map for visual analysis.
 */

import L from 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet-es.js';

export class EnvironmentalOverlay {
  constructor(map) {
    this.map = map;
    this.layers = {};
    this.activeOverlay = null;
  }

  /**
   * Add environmental overlay layer to map
   * @param {string} type - 'CAPE', 'CIN', 'LCL', 'FREEZING_LEVEL'
   */
  showOverlay(type) {
    this.hideOverlay();

    const overlay = L.canvasImageLayer({
      render: (canvas) => this.renderCanvas(canvas, type),
    });

    overlay.addTo(this.map);
    this.activeOverlay = { type, layer: overlay };
  }

  hideOverlay() {
    if (this.activeOverlay) {
      this.map.removeLayer(this.activeOverlay.layer);
      this.activeOverlay = null;
    }
  }

  /**
   * Render canvas image layer for environmental data
   */
  renderCanvas(canvas, type) {
    const ctx = canvas.getContext('2d');
    const bounds = this.map.getBounds();
    const size = this.map.getSize();

    canvas.width = size.x;
    canvas.height = size.y;

    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < canvas.width; i++) {
      for (let j = 0; j < canvas.height; j++) {
        const lat = bounds.getNorth() - (j / canvas.height) * (bounds.getNorth() - bounds.getSouth());
        const lng = bounds.getWest() + (i / canvas.width) * (bounds.getEast() - bounds.getWest());

        const pixelIndex = (j * canvas.width + i) * 4;
        const color = this.getColorForCoordinate(lat, lng, type);

        data[pixelIndex] = color.r;
        data[pixelIndex + 1] = color.g;
        data[pixelIndex + 2] = color.b;
        data[pixelIndex + 3] = color.a;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Get color value for a coordinate based on environmental parameter
   */
  getColorForCoordinate(lat, lng, type) {
    // In production, fetch gridded data from Open-Meteo or similar
    // For now, return placeholder based on distance from center
    const value = Math.random() * 100;
    return this.getColorScale(value, type);
  }

  /**
   * Convert parameter value to color using appropriate scale
   */
  getColorScale(value, type) {
    let color = { r: 0, g: 0, b: 0, a: 50 };

    switch (type) {
      case 'CAPE':
        // 0-7000 J/kg: blue (low) → red (high)
        color = this.linearColorScale(value, 0, 7000,
          [100, 150, 255], [255, 0, 0]);
        break;

      case 'CIN':
        // 0-500 J/kg: green (none) → red (strong)
        color = this.linearColorScale(value, 0, 500,
          [0, 200, 0], [255, 100, 0]);
        break;

      case 'LCL':
        // 0-2000 m: high LCL is bad → red, low LCL is good → blue
        color = this.linearColorScale(2000 - value, 0, 2000,
          [255, 0, 0], [0, 100, 255]);
        break;

      case 'FREEZING_LEVEL':
        // 3000-5500 m: low (cold aloft) → blue, high (warm) → red
        color = this.linearColorScale(value, 3000, 5500,
          [0, 100, 255], [255, 100, 0]);
        break;
    }

    return { ...color, a: 60 };
  }

  /**
   * Linear interpolation between two colors
   */
  linearColorScale(value, minVal, maxVal, colorMin, colorMax) {
    const t = Math.max(0, Math.min(1, (value - minVal) / (maxVal - minVal)));
    return {
      r: Math.round(colorMin[0] + (colorMax[0] - colorMin[0]) * t),
      g: Math.round(colorMin[1] + (colorMax[1] - colorMin[1]) * t),
      b: Math.round(colorMin[2] + (colorMax[2] - colorMin[2]) * t),
      a: 60,
    };
  }
}

/**
 * Display environmental parameters as text overlay on storm cards
 */
export function formatEnvironment(env) {
  if (!env) return null;

  const cape = Math.round(env.cape || 0);
  const cin = Math.round(env.cin || 0);
  const lclM = Math.round(env.lclM || 0);
  const freezingM = Math.round(env.freezingM || 0);

  return {
    cape: `${cape} J/kg`,
    cin: `${cin} J/kg`,
    lcl: `${lclM.toLocaleString()} m`,
    freezing: `${freezingM.toLocaleString()} m`,
    summary: `CAPE ${cape} | CIN ${cin} | LCL ${lclM}m | Frz ${freezingM}m`,
  };
}

/**
 * Calculate estimated rotational velocity (ERV) from radar and shear
 * ERV = (mid-level wind shear) × (storm depth) × (rotation strength)
 */
export function calculateERV(stormCell, shear) {
  if (!stormCell || !shear) return 0;

  const depthKm = (stormCell.topKft || 40) * 0.3048; // feet to km
  const maxDV = Math.min((stormCell.maxDV || 0) / 5, 1); // normalized 0-1
  const shearNorm = Math.min(shear / 40, 1); // normalize to 40 kt max

  // ERV in knots (simplified)
  return Math.round(shearNorm * depthKm * 10 * maxDV);
}

/**
 * Classify freezing level height for hail potential
 */
export function classifyFreezingLevel(freezingM) {
  if (freezingM > 4500) return { level: 'Very High', color: '#ff0000', threat: 'Small hail risk' };
  if (freezingM > 4000) return { level: 'High', color: '#ff6600', threat: 'Moderate hail possible' };
  if (freezingM > 3500) return { level: 'Moderate', color: '#fbbf24', threat: 'Hail more likely' };
  if (freezingM > 3000) return { level: 'Low', color: '#34d399', threat: 'Large hail likely' };
  return { level: 'Very Low', color: '#3b82f6', threat: 'Very large hail possible' };
}

/**
 * Estimate LCL cloud base height effect on updraft
 */
export function assessLCLHeight(lclM) {
  if (lclM < 1000) return { rating: 'Excellent', score: 100 };
  if (lclM < 1500) return { rating: 'Good', score: 85 };
  if (lclM < 2000) return { rating: 'Fair', score: 70 };
  if (lclM < 2500) return { rating: 'Marginal', score: 50 };
  return { rating: 'Poor', score: 30 };
}
