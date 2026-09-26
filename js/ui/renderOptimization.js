/**
 * Render Optimization
 *
 * Mobile/battery/layout adaptation and offline/touch helpers.
 */

/**
 * Mobile optimization settings
 */
export class MobileOptimizer {
  constructor(isPortrait = true) {
    this.isPortrait = isPortrait;
    this.isTouchDevice = this.detectTouchDevice();
    this.batteryMode = this.detectBatteryMode();
  }

  /**
   * Detect if device supports touch
   */
  detectTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  /**
   * Detect low battery mode
   */
  async detectBatteryMode() {
    if ('getBattery' in navigator) {
      const battery = await navigator.getBattery?.();
      return battery?.level < 0.2 || battery?.charging === false;
    }
    return false;
  }

  /**
   * Get optimized tile layer settings for mobile
   */
  getOptimizedTileSettings() {
    return {
      updateWhenZooming: false,
      updateWhenIdle: true,
      keepBuffer: this.isTouchDevice ? 1 : 2,
      maxNativeZoom: this.batteryMode ? 17 : 19,
      crossOrigin: true,
    };
  }

  /**
   * Get landscape mode panel configuration
   */
  getLandscapeConfig() {
    return {
      panelWidth: '35%',
      mapWidth: '65%',
      layout: 'horizontal',
      compactMode: true,
      hideAnimation: true, // Disable CSS animations in landscape
    };
  }

  /**
   * Get portrait mode panel configuration
   */
  getPortraitConfig() {
    return {
      panelHeight: '40%',
      mapHeight: '60%',
      layout: 'vertical',
      compactMode: false,
      hideAnimation: false,
    };
  }

  /**
   * Get battery saver settings
   */
  getBatterySaverSettings() {
    return {
      refreshIntervalMs: this.batteryMode ? 120000 : 60000, // 2 min vs 1 min
      animationEnabled: false,
      historyFrames: 10, // Reduced from 50
      tileQuality: 'low',
      autoRefreshDisabled: true,
    };
  }
}

/**
 * Offline capability tracking
 */
export class OfflineManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.cachedData = new Map();
    this.lastSuccessfulFetch = {};

    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  handleOnline() {
    this.isOnline = true;
    this.syncCachedData();
  }

  handleOffline() {
    this.isOnline = false;
  }

  /**
   * Get cached data if offline
   */
  getCachedData(key) {
    return this.cachedData.get(key);
  }

  /**
   * Cache data for offline use
   */
  setCachedData(key, data) {
    this.cachedData.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Sync cached data when back online
   */
  syncCachedData() {
    // Push any cached storm reports, alerts, etc.
    for (const [key, cached] of this.cachedData.entries()) {
      if (cached.timestamp + 3600000 < Date.now()) {
        // Expire after 1 hour
        this.cachedData.delete(key);
      }
    }
  }
}

/**
 * Touch gesture optimization
 */
export class TouchOptimizer {
  constructor(map) {
    this.map = map;
    this.lastPinchZoom = 0;
    this.lastPan = { x: 0, y: 0 };
  }

  /**
   * Debounced zoom handler
   */
  onZoomEnd() {
    // Only update data feeds on zoom end, not during drag
    const now = Date.now();
    if (now - this.lastPinchZoom > 500) {
      this.lastPinchZoom = now;
      // Trigger refresh
      return true;
    }
    return false;
  }

  /**
   * Debounced pan handler
   */
  onPanEnd() {
    const now = Date.now();
    if (now - this.lastPan.time > 300) {
      this.lastPan.time = now;
      return true;
    }
    return false;
  }
}

/**
 * Auto-scale marker sizes based on zoom level
 */
export function getMarkerSize(zoomLevel, baseSize = 22) {
  if (zoomLevel < 5) return baseSize * 0.8;
  if (zoomLevel < 7) return baseSize;
  if (zoomLevel < 9) return baseSize * 1.2;
  return baseSize * 1.4;
}

/**
 * Auto-scale label sizes based on zoom level
 */
export function getLabelFontSize(zoomLevel) {
  if (zoomLevel < 5) return '9px';
  if (zoomLevel < 7) return '10px';
  if (zoomLevel < 9) return '11px';
  return '12px';
}
