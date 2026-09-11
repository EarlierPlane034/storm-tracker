/**
 * Community & Social Features
 *
 * Spotter reports, chaser leaderboard, shared storm tracking,
 * and photo/video integration.
 */

export class SpotterReportManager {
  constructor() {
    this.reports = new Map(); // reportId → report data
    this.userProfile = {
      username: localStorage.getItem('spotterUsername') || 'Anonymous',
      catchCount: parseInt(localStorage.getItem('spotterCatches') || '0'),
      interceptCount: parseInt(localStorage.getItem('spotterIntercepts') || '0'),
      verificationScore: parseFloat(localStorage.getItem('spotterScore') || '0'),
    };
  }

  /**
   * Submit a new spotter report with GPS location
   */
  submitReport(stormId, lat, lon, observations, photoUrl = null) {
    const reportId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const report = {
      id: reportId,
      stormId,
      timestamp: Date.now(),
      location: { lat, lon },
      username: this.userProfile.username,
      observations, // e.g., "Baseball-sized hail", "Funnel cloud", "Damage"
      photoUrl,
      upvotes: 0,
      verified: false,
    };

    this.reports.set(reportId, report);
    this.saveReport(report);
    return report;
  }

  /**
   * Save report locally and sync to server
   */
  saveReport(report) {
    localStorage.setItem(`report-${report.id}`, JSON.stringify(report));
    // In production: POST to server/Cloudflare worker
  }

  /**
   * Verify a report (mark as confirmed by official source)
   */
  verifyReport(reportId) {
    const report = this.reports.get(reportId);
    if (report) {
      report.verified = true;
      this.saveReport(report);
      return true;
    }
    return false;
  }

  /**
   * Upvote a report (community validation)
   */
  upvoteReport(reportId) {
    const report = this.reports.get(reportId);
    if (report) {
      report.upvotes += 1;
      this.saveReport(report);
      return report.upvotes;
    }
    return 0;
  }

  /**
   * Get all reports for a storm
   */
  getStormReports(stormId) {
    return Array.from(this.reports.values())
      .filter((r) => r.stormId === stormId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get every report, most recent first
   */
  getAllReports() {
    return Array.from(this.reports.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get nearby reports (within radius)
   */
  getNearbyReports(lat, lon, radiusKm = 50) {
    const reports = Array.from(this.reports.values());
    return reports.filter((r) => {
      const dist = Math.sqrt(
        Math.pow(r.location.lat - lat, 2) + Math.pow(r.location.lon - lon, 2)
      ) * 111; // rough km conversion
      return dist < radiusKm;
    });
  }
}

export class ChaserLeaderboard {
  constructor() {
    this.leaderboard = new Map(); // username → stats
    this.loadFromStorage();
  }

  /**
   * Record a storm catch
   */
  recordCatch(username, stormId, photoUrl = null) {
    if (!this.leaderboard.has(username)) {
      this.leaderboard.set(username, {
        username,
        catches: 0,
        intercepts: 0,
        score: 0,
        recentStorms: [],
      });
    }

    const stats = this.leaderboard.get(username);
    stats.catches += 1;
    stats.score += 50; // 50 points per catch
    stats.recentStorms.push({ stormId, timestamp: Date.now(), photoUrl });

    this.saveToStorage();
    return stats;
  }

  /**
   * Record a successful intercept (within 10 mi of storm)
   */
  recordIntercept(username, stormId) {
    if (!this.leaderboard.has(username)) {
      this.recordCatch(username, stormId);
    }

    const stats = this.leaderboard.get(username);
    stats.intercepts += 1;
    stats.score += 100; // 100 points per intercept

    this.saveToStorage();
    return stats;
  }

  /**
   * Get top N chasers
   */
  getTopChasers(n = 10) {
    return Array.from(this.leaderboard.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .map((stats, idx) => ({ ...stats, rank: idx + 1 }));
  }

  /**
   * Get chaser stats
   */
  getChaserStats(username) {
    return this.leaderboard.get(username) || null;
  }

  saveToStorage() {
    const data = Array.from(this.leaderboard.entries());
    localStorage.setItem('chaserLeaderboard', JSON.stringify(data));
  }

  loadFromStorage() {
    const data = localStorage.getItem('chaserLeaderboard');
    if (data) {
      this.leaderboard = new Map(JSON.parse(data));
    }
  }
}

export class SharedStormTracking {
  constructor() {
    this.trackedStorms = new Map(); // stormId → { followers, updates }
    this.followers = new Set();
  }

  /**
   * Start following a storm
   */
  followStorm(stormId, username) {
    if (!this.trackedStorms.has(stormId)) {
      this.trackedStorms.set(stormId, {
        followers: new Set(),
        updates: [],
        startTime: Date.now(),
      });
    }

    const storm = this.trackedStorms.get(stormId);
    storm.followers.add(username);
    return storm;
  }

  /**
   * Unfollow a storm
   */
  unfollowStorm(stormId, username) {
    const storm = this.trackedStorms.get(stormId);
    if (storm) {
      storm.followers.delete(username);
      if (storm.followers.size === 0) {
        this.trackedStorms.delete(stormId);
      }
    }
  }

  /**
   * Post update to followed storm
   */
  postUpdate(stormId, username, message, lat, lon) {
    const storm = this.trackedStorms.get(stormId);
    if (!storm) return null;

    const update = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      username,
      message,
      location: { lat, lon },
      timestamp: Date.now(),
      likes: 0,
    };

    storm.updates.push(update);
    return update;
  }

  /**
   * Get followers of a storm
   */
  getFollowerCount(stormId) {
    return this.trackedStorms.get(stormId)?.followers.size || 0;
  }

  /**
   * Get all updates for a storm
   */
  getStormUpdates(stormId) {
    return this.trackedStorms.get(stormId)?.updates || [];
  }

  /**
   * Get every storm currently being followed, most followers first
   */
  getActiveSharedStorms() {
    return Array.from(this.trackedStorms.entries())
      .map(([stormId, storm]) => ({
        stormId,
        followers: storm.followers.size,
        updates: storm.updates.length,
      }))
      .sort((a, b) => b.followers - a.followers);
  }

  /**
   * Like an update
   */
  likeUpdate(stormId, updateId) {
    const storm = this.trackedStorms.get(stormId);
    if (storm) {
      const update = storm.updates.find((u) => u.id === updateId);
      if (update) update.likes += 1;
    }
  }
}

/**
 * Render leaderboard HTML
 */
export function renderLeaderboardHTML(leaderboard) {
  const topChasers = leaderboard.getTopChasers(10);

  return `
    <div class="leaderboard-container">
      <h3>🏆 Chaser Leaderboard</h3>
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Chaser</th>
            <th>Catches</th>
            <th>Intercepts</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          ${topChasers.map((chaser) => `
            <tr class="rank-${chaser.rank}">
              <td class="rank-num">${chaser.rank}</td>
              <td class="rank-name">${chaser.username}</td>
              <td>${chaser.catches}</td>
              <td>${chaser.intercepts}</td>
              <td class="rank-score">${chaser.score}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Format spotter report for display
 */
export function formatSpotterReport(report) {
  const date = new Date(report.timestamp).toLocaleTimeString();
  return {
    title: report.observations.split('\n')[0],
    user: report.username,
    time: date,
    verified: report.verified ? '✓ Verified' : 'Pending',
    upvotes: report.upvotes,
    photo: report.photoUrl,
  };
}
