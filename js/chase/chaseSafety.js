/**
 * Chase Support & Safety
 *
 * Route collision warnings, lightning proximity alerts, road conditions,
 * safe haven finder, and chase decision scoring.
 */

export class ChaseRouter {
  constructor(map) {
    this.map = map;
    this.route = null;
    this.stormPath = null;
  }

  /**
   * Calculate safest intercept route
   */
  calculateInterceptRoute(userLat, userLon, stormLat, stormLon, stormMovement) {
    // Simple intercept calculation: intercept point ahead of storm
    const interceptDistance = 30; // km ahead
    const moveDeg = stormMovement.bearing || 270;

    const interceptLat = stormLat + (Math.cos(moveDeg * Math.PI / 180) * interceptDistance / 111);
    const interceptLon = stormLon + (Math.sin(moveDeg * Math.PI / 180) * interceptDistance / 111);

    return {
      from: { lat: userLat, lon: userLon },
      to: { lat: interceptLat, lon: interceptLon },
      estimatedDistanceKm: this.haversine(userLat, userLon, interceptLat, interceptLon),
      estimatedTimeMin: 0, // Would calculate with road routing API
    };
  }

  /**
   * Check for route-storm collision
   */
  checkRouteCollision(routePoints, stormPath, collisionRadiusKm = 5) {
    const collisions = [];

    routePoints.forEach((routePoint) => {
      stormPath.forEach((stormPoint) => {
        const dist = this.haversine(
          routePoint.lat, routePoint.lon,
          stormPoint.lat, stormPoint.lon
        );

        if (dist < collisionRadiusKm) {
          collisions.push({
            routeIndex: routePoints.indexOf(routePoint),
            stormIndex: stormPath.indexOf(stormPoint),
            distance: dist,
            severity: dist < 2 ? 'Critical' : dist < 4 ? 'Warning' : 'Caution',
          });
        }
      });
    });

    return collisions;
  }

  haversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

export class LightningProximityAlert {
  constructor() {
    this.strikes = new Map(); // strikeId → { lat, lon, time, distance }
    this.alertThresholdKm = 10;
    this.lastAlertTime = 0;
    this.alertDebounceMs = 5000;
  }

  /**
   * Register a lightning strike
   */
  recordStrike(lat, lon) {
    const strikeId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.strikes.set(strikeId, {
      lat,
      lon,
      time: Date.now(),
    });

    // Keep only last 60 minutes
    const oneHourAgo = Date.now() - 3600000;
    for (const [id, strike] of this.strikes) {
      if (strike.time < oneHourAgo) {
        this.strikes.delete(id);
      }
    }

    return strikeId;
  }

  /**
   * Get proximity alert for user location
   */
  checkProximity(userLat, userLon) {
    let closestStrike = null;
    let minDist = Infinity;

    for (const strike of this.strikes.values()) {
      const dist = this.haversine(userLat, userLon, strike.lat, strike.lon);
      if (dist < minDist) {
        minDist = dist;
        closestStrike = { ...strike, distance: dist };
      }
    }

    if (closestStrike && minDist < this.alertThresholdKm) {
      const now = Date.now();
      if (now - this.lastAlertTime > this.alertDebounceMs) {
        this.lastAlertTime = now;
        return {
          alert: true,
          distance: Math.round(minDist),
          severity: minDist < 3 ? 'CRITICAL' : minDist < 7 ? 'WARNING' : 'CAUTION',
          message: `Lightning ${Math.round(minDist)}km away!`,
        };
      }
    }

    return { alert: false };
  }

  haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

export class SafeHavenFinder {
  constructor() {
    this.shelters = [
      // In production, load from building database
      { type: 'building', name: 'Downtown Shelter', lat: 37.5, lon: -96.5, rating: 5 },
      { type: 'parking', name: 'Underground Garage', lat: 37.51, lon: -96.49, rating: 4 },
    ];
  }

  /**
   * Find nearest safe haven
   */
  findNearestShelter(userLat, userLon, radiusKm = 20) {
    const candidates = this.shelters.filter((s) => {
      const dist = this.haversine(userLat, userLon, s.lat, s.lon);
      return dist < radiusKm;
    });

    candidates.sort((a, b) => {
      const distA = this.haversine(userLat, userLon, a.lat, a.lon);
      const distB = this.haversine(userLat, userLon, b.lat, b.lon);
      return distA - distB;
    });

    return candidates.slice(0, 5).map((s) => ({
      ...s,
      distance: Math.round(this.haversine(userLat, userLon, s.lat, s.lon)),
    }));
  }

  /**
   * Rank safety by type
   */
  getSafetyRanking() {
    return [
      { type: 'underground', rating: 10, description: 'Basement or underground' },
      { type: 'interior', rating: 9, description: 'Interior room, away from windows' },
      { type: 'building', rating: 8, description: 'Sturdy building, interior' },
      { type: 'vehicle', rating: 4, description: 'Hardtop vehicle (last resort)' },
      { type: 'mobile_home', rating: 1, description: 'Mobile home (evacuate!)' },
    ];
  }

  haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

export class ChaseDecisionScore {
  /**
   * Calculate go/no-go recommendation
   */
  static score(userLocation, storm, environment, route) {
    let goScore = 50; // Start neutral

    // Storm factors
    if (storm.severeScore >= 80) goScore += 20; // High reward
    else if (storm.severeScore < 30) goScore -= 30; // Not interesting

    // Environmental factors (can you intercept safely?)
    if (environment.cape > 2000 && environment.shear > 25) {
      goScore += 10; // Stable environment for chase
    }

    // Distance factors
    if (route.estimatedDistanceKm > 200) {
      goScore -= 20; // Too far
    } else if (route.estimatedDistanceKm < 50) {
      goScore += 15; // Close enough
    }

    // Tornado probability
    if (storm.tornado?.score >= 70) {
      goScore += 25; // High tornado potential
    } else if (storm.tornado?.score >= 50) {
      goScore += 10;
    }

    // Normalize
    goScore = Math.max(0, Math.min(100, goScore));

    return {
      score: goScore,
      recommendation: this.recommendationFromScore(goScore),
      factors: {
        stormValue: `${storm.severeScore}/100`,
        tornadoPotential: `${storm.tornado?.score || 0}/100`,
        distance: `${route.estimatedDistanceKm.toFixed(1)} km`,
      },
    };
  }

  static recommendationFromScore(score) {
    if (score >= 75) return 'GO! — Excellent chase opportunity';
    if (score >= 60) return 'GOOD — Chase if prepared';
    if (score >= 40) return 'MARGINAL — Might not be worth it';
    return 'NO-GO — Too risky or low value';
  }
}

/**
 * Road condition checker (in production, integrate with real API)
 */
export function checkRoadConditions(route) {
  return {
    flooding: [],
    hailDamage: [],
    windDamage: [],
    closures: [],
    status: 'OK',
  };
}
