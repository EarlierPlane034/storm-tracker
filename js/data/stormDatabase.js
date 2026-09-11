/**
 * Database & History
 *
 * Seasonal statistics, personal chase history, export capabilities,
 * storm replay archive, and verification database.
 */

export class StormDatabase {
  constructor() {
    this.storms = new Map(); // stormId → storm data
    this.sessions = new Map(); // sessionId → { storms, date, stats }
    this.loadFromStorage();
  }

  /**
   * Record a storm in the database
   */
  recordStorm(storm, analysis, photos = []) {
    const stormId = storm.id;
    const record = {
      id: stormId,
      timestamp: Date.now(),
      lat: storm.lat,
      lon: storm.lon,
      maxDbz: storm.maxDbz,
      vil: storm.vil,
      tops: storm.topKft,
      meso: storm.meso,
      tvs: storm.tvs,
      severeScore: analysis.severeScore,
      tornadoScore: analysis.tornado.score,
      hailScore: analysis.scores.hail,
      windScore: analysis.scores.wind,
      type: analysis.type.id,
      verified: false,
      actualOutcome: null,
      photos,
      notes: '',
    };

    this.storms.set(stormId, record);
    this.saveToStorage();
    return record;
  }

  /**
   * Verify a storm against actual reported events
   */
  verifyStorm(stormId, actualOutcome) {
    const storm = this.storms.get(stormId);
    if (storm) {
      storm.verified = true;
      storm.actualOutcome = actualOutcome; // e.g., { tornadoConfirmed: true, hailSize: '2.5in' }
      this.saveToStorage();
    }
  }

  /**
   * Calculate accuracy metrics
   */
  getAccuracyMetrics() {
    let totalPredictions = 0;
    let tornadoCorrect = 0;
    let hailCorrect = 0;
    let windCorrect = 0;

    for (const storm of this.storms.values()) {
      if (!storm.verified) continue;

      totalPredictions += 1;

      if (storm.actualOutcome?.tornadoConfirmed && storm.tornadoScore >= 50) {
        tornadoCorrect += 1;
      }
      if (storm.actualOutcome?.hailReported && storm.hailScore >= 50) {
        hailCorrect += 1;
      }
      if (storm.actualOutcome?.windDamage && storm.windScore >= 50) {
        windCorrect += 1;
      }
    }

    return {
      totalVerified: totalPredictions,
      tornadoAccuracy: totalPredictions > 0 ? (tornadoCorrect / totalPredictions * 100).toFixed(1) : 'N/A',
      hailAccuracy: totalPredictions > 0 ? (hailCorrect / totalPredictions * 100).toFixed(1) : 'N/A',
      windAccuracy: totalPredictions > 0 ? (windCorrect / totalPredictions * 100).toFixed(1) : 'N/A',
    };
  }

  /**
   * Get seasonal statistics
   */
  getSeasonalStats() {
    const byMonth = {};
    const byType = {};
    let totalStorms = 0;
    let totalTornados = 0;
    let avgSeverity = 0;

    for (const storm of this.storms.values()) {
      totalStorms += 1;
      avgSeverity += storm.severeScore;

      const date = new Date(storm.timestamp);
      const month = date.toLocaleString('default', { month: 'long' });

      if (!byMonth[month]) {
        byMonth[month] = { count: 0, avgScore: 0 };
      }
      byMonth[month].count += 1;
      byMonth[month].avgScore += storm.severeScore;

      if (!byType[storm.type]) {
        byType[storm.type] = { count: 0, avgScore: 0 };
      }
      byType[storm.type].count += 1;
      byType[storm.type].avgScore += storm.severeScore;

      if (storm.tvs || storm.tornadoScore >= 60) {
        totalTornados += 1;
      }
    }

    return {
      totalStorms,
      totalTornados,
      avgSeverity: (avgSeverity / totalStorms).toFixed(1),
      byMonth,
      byType,
    };
  }

  /**
   * Export to CSV
   */
  exportToCSV() {
    const headers = ['Date', 'Storm ID', 'Type', 'Severity', 'Tornado Risk', 'Hail Risk', 'Wind Risk', 'Verified', 'Outcome'];
    const rows = [];

    for (const storm of this.storms.values()) {
      const date = new Date(storm.timestamp).toISOString().split('T')[0];
      rows.push([
        date,
        storm.id,
        storm.type,
        storm.severeScore,
        storm.tornadoScore,
        storm.hailScore,
        storm.windScore,
        storm.verified ? 'Yes' : 'No',
        storm.actualOutcome ? JSON.stringify(storm.actualOutcome) : '',
      ]);
    }

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    return csv;
  }

  /**
   * Export to JSON
   */
  exportToJSON() {
    return JSON.stringify(Array.from(this.storms.values()), null, 2);
  }

  /**
   * Save session
   */
  saveSession(storms, duration) {
    const sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const session = {
      id: sessionId,
      date: new Date().toISOString(),
      stormCount: storms.length,
      durationMin: duration,
      avgSeverity: (storms.reduce((a, b) => a + b.severeScore, 0) / storms.length).toFixed(1),
      topStorm: storms[0],
    };

    this.sessions.set(sessionId, session);
    this.saveToStorage();
    return session;
  }

  /**
   * Get session history
   */
  getSessionHistory() {
    return Array.from(this.sessions.values())
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  /**
   * Generate chase report
   */
  generateChaseReport(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      date: session.date,
      stormsChased: session.stormCount,
      duration: session.durationMin,
      topStorm: session.topStorm,
      avgSeverity: session.avgSeverity,
      summary: `Tracked ${session.stormCount} storms over ${session.durationMin} minutes. Average severity: ${session.avgSeverity}/100.`,
    };
  }

  saveToStorage() {
    localStorage.setItem('stormDatabase', JSON.stringify(Array.from(this.storms.entries())));
    localStorage.setItem('sessionHistory', JSON.stringify(Array.from(this.sessions.entries())));
  }

  loadFromStorage() {
    const stormData = localStorage.getItem('stormDatabase');
    const sessionData = localStorage.getItem('sessionHistory');

    if (stormData) {
      this.storms = new Map(JSON.parse(stormData));
    }
    if (sessionData) {
      this.sessions = new Map(JSON.parse(sessionData));
    }
  }
}

/**
 * Storm replay system
 */
export class StormReplay {
  constructor(stormId, database) {
    this.stormId = stormId;
    this.database = database;
    this.frames = [];
    this.currentFrame = 0;
  }

  /**
   * Play back storm evolution
   */
  play(onFrameChange) {
    const storm = this.database.storms.get(this.stormId);
    if (!storm) return;

    // Simulate evolution over 60 minutes
    for (let min = 0; min <= 60; min += 5) {
      const frame = {
        time: min,
        dbz: storm.maxDbz + Math.sin(min / 10) * 10,
        vil: storm.vil + Math.cos(min / 15) * 15,
        tops: storm.tops + (min / 20),
      };
      this.frames.push(frame);
    }

    const playInterval = setInterval(() => {
      if (this.currentFrame >= this.frames.length) {
        clearInterval(playInterval);
        return;
      }

      onFrameChange(this.frames[this.currentFrame]);
      this.currentFrame += 1;
    }, 500);
  }

  /**
   * Seek to specific time
   */
  seek(minutes) {
    this.currentFrame = Math.floor((minutes / 60) * this.frames.length);
  }
}
