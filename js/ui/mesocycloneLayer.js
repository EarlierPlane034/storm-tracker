/**
 * Mesocyclone Visualization Layer
 *
 * Renders rotation centers on the Leaflet map:
 * - Rotation circles at detected locations
 * - Movement trails showing rotation center migration
 * - Strength indicators (color + size)
 */

const MESO_LAYER_NAME = 'Mesocyclones';
let mesoMarkers = new Map();
let mesoTrailLines = new Map();

/**
 * Initialize mesocyclone layer in map
 */
export function initMesocycloneLayer(map) {
  if (!map) return;
  window._mesoLayerGroup = L.featureGroup();
  window._mesoLayerGroup.addTo(map);
  map._mesoLayer = window._mesoLayerGroup;
}

/**
 * Render all mesocyclones on the map
 */
export function renderMesocyclones(storms, map) {
  if (!map || !map._mesoLayer) return;

  // Clear old markers
  mesoMarkers.forEach(m => {
    if (m.marker) m.marker.remove();
    if (m.trail) m.trail.remove();
  });
  mesoMarkers.clear();
  mesoTrailLines.clear();

  // Draw each mesocyclone
  storms.forEach(storm => {
    if (!storm.mesocyclones || storm.mesocyclones.length === 0) return;

    storm.mesocyclones.forEach(meso => {
      drawMesocyclone(meso, storm, map);
    });
  });
}

/**
 * Draw a single mesocyclone with trail
 */
function drawMesocyclone(meso, storm, map) {
  const key = `${storm.cell.id}-${meso.id}`;

  // --- Draw rotation indicator circle ---
  const circleOptions = {
    radius: getRadiusForStrength(meso.strength),
    fill: true,
    fillColor: getColorForStrength(meso.strength),
    fillOpacity: 0.6,
    stroke: true,
    color: meso.colorHint || '#ff6600',
    weight: 2,
    dashArray: '5,5'
  };

  const circle = L.circleMarker([meso.lat, meso.lon], circleOptions);

  // Popup with details
  const popupHtml = `
    <div style="font-size:12px; min-width:150px;">
      <strong>${meso.type}</strong><br>
      Strength: ${meso.strength}/100<br>
      Confidence: ${Math.round(meso.confidence * 100)}%<br>
      Persistence: ${meso.persistenceScans || 1} scan(s)<br>
      ${meso.movement ? `Movement: ${meso.movement.distanceKm} km at ${meso.movement.bearing}°` : 'Stationary'}
    </div>
  `;

  circle.bindPopup(popupHtml);
  circle.addTo(map._mesoLayer);

  // Label on circle
  const label = L.tooltip({
    permanent: true,
    direction: 'center',
    className: 'meso-label',
    content: `${meso.strength}<br>${meso.type === 'TVS' ? '⚡' : '◎'}`
  });
  circle.bindTooltip(label);

  mesoMarkers.set(key, { marker: circle });

  // --- Draw movement trail ---
  if (meso.movement && meso.persistenceScans > 1) {
    const trail = drawRotationTrail(meso, map);
    mesoTrailLines.set(key, trail);
    mesoMarkers.set(key, { marker: circle, trail });
  }

  // --- Draw strength indicator rings ---
  if (meso.strength > 70) {
    drawStrengthRings(meso.lat, meso.lon, map);
  }
}

/**
 * Get circle radius based on strength
 */
function getRadiusForStrength(strength) {
  return strength > 80 ? 15 : strength > 60 ? 12 : strength > 40 ? 10 : 8;
}

/**
 * Get color based on strength
 */
function getColorForStrength(strength) {
  if (strength > 85) return '#ff0000';  // Red = extreme
  if (strength > 70) return '#ff6600';  // Orange = strong
  if (strength > 50) return '#ffaa00';  // Yellow = moderate
  return '#ffdd00';                     // Light yellow = weak
}

/**
 * Draw predicted rotation trail
 */
function drawRotationTrail(meso, map) {
  const points = [[meso.lat, meso.lon]];

  // Extrapolate next position if movement available
  if (meso.movement) {
    const bearing = meso.movement.bearing * Math.PI / 180;
    const dist = meso.movement.distanceKm / 111; // km to degrees
    const nextLat = meso.lat + (dist * Math.cos(bearing));
    const nextLon = meso.lon + (dist * Math.sin(bearing));
    points.push([nextLat, nextLon]);
  }

  const line = L.polyline(points, {
    color: meso.colorHint || '#ff6600',
    weight: 2,
    opacity: 0.5,
    dashArray: '3,3'
  });

  line.addTo(map._mesoLayer);
  return line;
}

/**
 * Draw concentric rings around strong rotation
 */
function drawStrengthRings(lat, lon, map) {
  const radii = [0.5, 1.0, 1.5]; // km to degrees (approx)
  radii.forEach((r, i) => {
    const ring = L.circle([lat, lon], {
      radius: r * 1000, // Convert to meters
      fill: false,
      stroke: true,
      color: '#ff6600',
      weight: 1,
      opacity: 0.3 - (i * 0.1),
      dashArray: '2,4'
    });
    ring.addTo(map._mesoLayer);
  });
}

/**
 * Toggle mesocyclone layer visibility
 */
export function toggleMesocycloneLayer(map, visible) {
  if (!map || !map._mesoLayer) return;
  if (visible) {
    map._mesoLayer.addTo(map);
  } else {
    map.removeLayer(map._mesoLayer);
  }
}

/**
 * Get mesocyclone count for current view
 */
export function getMesocycloneCount() {
  return mesoMarkers.size;
}

/**
 * Add to layer control
 */
export function addToLayerControl(map, layerControl) {
  if (!layerControl) return;
  layerControl.addOverlay(window._mesoLayerGroup || L.featureGroup(), '🌀 Mesocyclones');
}

// Styling for meso labels
const style = document.createElement('style');
style.innerHTML = `
  .meso-label {
    background: rgba(20, 20, 30, 0.9);
    color: #ffaa00;
    border: 1px solid #ff6600;
    border-radius: 50%;
    padding: 2px 4px;
    font-size: 11px;
    font-weight: bold;
    text-align: center;
    line-height: 1.2;
    box-shadow: 0 0 4px rgba(255, 102, 0, 0.6);
  }
`;
document.head.appendChild(style);
