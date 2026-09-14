/**
 * Educational & Training Features
 *
 * Interactive storm identification games, radar tutorials, meteorology lessons,
 * certification paths, and quiz modes.
 */

export class RadarPatternTutorial {
  constructor() {
    this.lessons = [
      {
        id: 'supercell-basics',
        title: 'Supercell Identification',
        description: 'Learn to spot classic, high-precipitation, and low-precipitation supercells',
        difficulty: 1,
        content: `
          A supercell thunderstorm has rotating updraft, persistent mesocyclone.
          Look for: hook echo, eye wall, bounded weak echo region (BWER).
          Classic supercell: high reflectivity, moderate VIL (50-100 kg/m²).
          HP supercell: extreme reflectivity (>60 dBZ), very high VIL (>200).
          LP supercell: low reflectivity, weak echo, rapid rotation.
        `,
      },
      {
        id: 'tvs-detection',
        title: 'Tornado Vortex Signature (TVS)',
        description: 'Detect the radar signature of rotation in a storm',
        difficulty: 2,
        content: `
          TVS appears as tight couplet of strong inbound/outbound velocity.
          Indicates strong rotation, NOT guaranteed tornado.
          Look for: velocity couplet <1 km width, extreme values (>60 kt).
          TVS + rotation persistence = higher tornado probability.
          Remember: TVS ≠ Tornado. Always prioritize official NWS warnings.
        `,
      },
      {
        id: 'hail-indicators',
        title: 'Hail Probability Assessment',
        description: 'Predict hail size from radar data',
        difficulty: 2,
        content: `
          High reflectivity cores (>55 dBZ): hail likely.
          VIL > 100 kg/m²: large hail (2+ inches).
          Bright band (melting layer): indicates rain/wet hail.
          Weak echo region: very large hail aloft.
          Echo top > 40 kft: strong updraft, hail risk.
        `,
      },
      {
        id: 'wind-damage-patterns',
        title: 'Derecho & Wind Damage Patterns',
        description: 'Identify organized wind damage signatures',
        difficulty: 3,
        content: `
          Bow echo: linear structure with leading convective line.
          Mesovortex: small rotation within bow (local enhanced winds).
          Derecho: sustained >58 kt winds over 250+ miles.
          Look for: organized structure, high reflectivity, rapid motion.
          Rear inflow jet: invisible, causes wind damage at surface.
        `,
      },
    ];
  }

  /**
   * Get all lessons
   */
  getLessons() {
    return this.lessons;
  }

  /**
   * Get lesson by ID
   */
  getLesson(id) {
    return this.lessons.find((l) => l.id === id);
  }

  /**
   * Mark lesson as completed
   */
  completeLesson(id) {
    localStorage.setItem(`lesson-${id}`, 'completed');
  }

  /**
   * Get progress
   */
  getProgress() {
    const completed = this.lessons.filter((l) =>
      localStorage.getItem(`lesson-${l.id}`) === 'completed'
    ).length;
    return {
      completed,
      total: this.lessons.length,
      percentage: Math.round((completed / this.lessons.length) * 100),
    };
  }
}

export class StormQuiz {
  constructor() {
    this.quizzes = [
      {
        id: 'radar-basics',
        title: 'Radar Basics Quiz',
        difficulty: 1,
        questions: [
          {
            q: 'What does dBZ measure?',
            options: ['Wind speed', 'Reflectivity', 'Temperature', 'Pressure'],
            correct: 1,
            explanation: 'dBZ (decibel of reflectivity) measures how much radar energy is reflected by precipitation.',
          },
          {
            q: 'What does a mesocyclone indicate?',
            options: ['Rain', 'Rotation', 'Wind shear', 'Lightning'],
            correct: 1,
            explanation: 'A mesocyclone is a rotating column of air, which may produce a tornado.',
          },
          {
            q: 'What is a TVS?',
            options: ['Television signal', 'Tornado Vortex Signature', 'Total Vertical Scale', 'Trained Verification System'],
            correct: 1,
            explanation: 'TVS is a Tornado Vortex Signature, a strong velocity couplet indicating intense rotation.',
          },
        ],
      },
      {
        id: 'hail-assessment',
        title: 'Hail Assessment Quiz',
        difficulty: 2,
        questions: [
          {
            q: 'What VIL indicates large hail (2+ inches)?',
            options: ['<50 kg/m²', '50-100 kg/m²', '>100 kg/m²', '>200 kg/m²'],
            correct: 2,
            explanation: 'VIL > 100 kg/m² typically indicates large hail potential.',
          },
          {
            q: 'Which reflectivity level suggests hail?',
            options: ['>45 dBZ', '>50 dBZ', '>55 dBZ', '>60 dBZ'],
            correct: 2,
            explanation: 'Reflectivity > 55 dBZ in a strong updraft usually indicates hail.',
          },
        ],
      },
    ];

    this.userScores = new Map();
  }

  /**
   * Get all quizzes
   */
  getQuizzes() {
    return this.quizzes;
  }

  /**
   * Get quiz by ID
   */
  getQuiz(id) {
    return this.quizzes.find((q) => q.id === id);
  }

  /**
   * Submit quiz answers
   */
  submitQuiz(quizId, answers) {
    const quiz = this.getQuiz(quizId);
    if (!quiz) return null;

    let correct = 0;
    const results = quiz.questions.map((q, idx) => ({
      question: q.q,
      userAnswer: q.options[answers[idx]],
      correctAnswer: q.options[q.correct],
      isCorrect: answers[idx] === q.correct,
      explanation: q.explanation,
    }));

    correct = results.filter((r) => r.isCorrect).length;
    const score = Math.round((correct / quiz.questions.length) * 100);

    this.userScores.set(quizId, score);
    localStorage.setItem(`quiz-${quizId}`, score);

    return {
      score,
      correct,
      total: quiz.questions.length,
      results,
      passed: score >= 70,
    };
  }

  /**
   * Get user quiz score
   */
  getUserScore(quizId) {
    return this.userScores.get(quizId) || parseInt(localStorage.getItem(`quiz-${quizId}`) || '0');
  }
}

export class SpotterCertification {
  constructor() {
    this.requirements = [
      { name: 'Radar Basics', type: 'lesson', id: 'radar-basics' },
      { name: 'Radar Basics Quiz', type: 'quiz', id: 'radar-basics', minScore: 70 },
      { name: 'Hail Assessment', type: 'lesson', id: 'hail-assessment' },
      { name: 'Storm Safety', type: 'lesson', id: 'storm-safety' },
      { name: 'Final Exam', type: 'quiz', id: 'final-exam', minScore: 80 },
    ];
  }

  /**
   * Get certification progress
   */
  getProgress() {
    const completed = this.requirements.filter((req) => {
      if (req.type === 'lesson') {
        return localStorage.getItem(`lesson-${req.id}`) === 'completed';
      } else if (req.type === 'quiz') {
        const score = parseInt(localStorage.getItem(`quiz-${req.id}`) || '0');
        return score >= (req.minScore || 70);
      }
      return false;
    }).length;

    return {
      completed,
      total: this.requirements.length,
      percentage: Math.round((completed / this.requirements.length) * 100),
      isCertified: completed === this.requirements.length,
    };
  }

  /**
   * Get certification badge
   */
  getCertificationBadge() {
    const progress = this.getProgress();
    if (progress.isCertified) {
      return {
        name: 'Official StormLens Spotter',
        level: 'Certified',
        color: '#fbbf24',
        icon: '🎓',
      };
    }
    return null;
  }
}

export class StormIdentificationGame {
  constructor() {
    this.scenarios = [
      {
        id: 'scenario-1',
        radar: 'supercell-classic.gif',
        question: 'What type of storm is this?',
        options: ['Supercell', 'QLCS', 'Multicell', 'Air-mass'],
        correct: 0,
        difficulty: 1,
      },
      {
        id: 'scenario-2',
        radar: 'tvs-strong.gif',
        question: 'What do you see in the velocity?',
        options: ['No rotation', 'Weak mesocyclone', 'Strong TVS', 'Wind shear'],
        correct: 2,
        difficulty: 2,
      },
    ];

    this.userStats = {
      gamesPlayed: 0,
      correctAnswers: 0,
      streak: 0,
      highScore: 0,
    };

    this.loadStats();
  }

  /**
   * Get scenario
   */
  getScenario(id) {
    return this.scenarios.find((s) => s.id === id);
  }

  /**
   * Submit answer
   */
  submitAnswer(scenarioId, answerIdx) {
    const scenario = this.getScenario(scenarioId);
    if (!scenario) return null;

    const isCorrect = answerIdx === scenario.correct;
    const points = isCorrect ? (10 * scenario.difficulty) : 0;

    this.userStats.gamesPlayed += 1;
    if (isCorrect) {
      this.userStats.correctAnswers += 1;
      this.userStats.streak += 1;
    } else {
      this.userStats.streak = 0;
    }
    this.userStats.highScore = Math.max(this.userStats.highScore, points);

    this.saveStats();

    return {
      correct: isCorrect,
      points,
      feedback: isCorrect ? 'Correct! Good eye.' : `Incorrect. The answer is ${scenario.options[scenario.correct]}.`,
    };
  }

  saveStats() {
    localStorage.setItem('gameStats', JSON.stringify(this.userStats));
  }

  loadStats() {
    const data = localStorage.getItem('gameStats');
    if (data) {
      this.userStats = JSON.parse(data);
    }
  }

  /**
   * Get leaderboard (local only)
   */
  getLeaderboard() {
    const accuracy = this.userStats.gamesPlayed
      ? `${((this.userStats.correctAnswers / this.userStats.gamesPlayed) * 100).toFixed(1)}%`
      : 'N/A';
    return {
      accuracy,
      gamesPlayed: this.userStats.gamesPlayed,
      streak: this.userStats.streak,
      highScore: this.userStats.highScore,
    };
  }
}
