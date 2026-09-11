/**
 * Voice & Audio Features
 *
 * Text-to-speech narratives, voice alerts, CarPlay integration,
 * ambient radar sounds, voice commands.
 */

export class VoiceNarrator {
  constructor() {
    this.synth = window.speechSynthesis;
    this.speaking = false;
    this.voices = [];
    this.selectedVoice = null;
    this.loadVoices();
  }

  loadVoices() {
    this.voices = this.synth.getVoices();
    // Prefer natural-sounding voice
    this.selectedVoice = this.voices.find((v) =>
      v.name.includes('Google') || v.name.includes('Natural')
    ) || this.voices[0];
  }

  /**
   * Speak analysis narrative aloud
   */
  speakAnalysis(analysis) {
    if (!analysis) return;

    const narrative = this.buildNarrative(analysis);
    this.speak(narrative, { rate: 0.95, pitch: 1 });
  }

  /**
   * Speak alert message
   */
  speakAlert(message, priority = 'normal') {
    const rate = priority === 'urgent' ? 1.3 : 0.95;
    const pitch = priority === 'urgent' ? 1.2 : 1;
    this.speak(message, { rate, pitch });
  }

  /**
   * Core TTS function
   */
  speak(text, options = {}) {
    if (!this.synth) return;

    // Cancel any current speech
    this.synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = this.selectedVoice;
    utterance.rate = options.rate || 1;
    utterance.pitch = options.pitch || 1;
    utterance.volume = options.volume || 0.8;

    utterance.onstart = () => {
      this.speaking = true;
    };

    utterance.onend = () => {
      this.speaking = false;
    };

    this.synth.speak(utterance);
  }

  /**
   * Build natural-language narrative from analysis
   */
  buildNarrative(analysis) {
    const parts = [];

    parts.push(`Storm cell ${analysis.cell.id}.`);

    if (analysis.severeScore >= 80) {
      parts.push('Dangerous severe weather warning. Seek shelter immediately.');
    } else if (analysis.severeScore >= 60) {
      parts.push('Significant severe weather threat.');
    } else if (analysis.severeScore >= 40) {
      parts.push('Moderate thunderstorm threat.');
    }

    if (analysis.tornado.score >= 60) {
      parts.push(`High tornado potential. Confidence ${Math.round(analysis.tornado.confidence)}%.`);
    } else if (analysis.tornado.score >= 40) {
      parts.push('Rotation detected. Monitor closely.');
    }

    if (analysis.scores.hail >= 70) {
      parts.push('Large hail is very likely.');
    } else if (analysis.scores.hail >= 50) {
      parts.push('Hail is a significant threat.');
    }

    if (analysis.scores.wind >= 70) {
      parts.push('Damaging winds expected.');
    }

    if (analysis.cell.moveSpeedKts) {
      parts.push(`Moving ${Math.round(analysis.cell.moveSpeedKts)} knots.`);
    }

    if (analysis.userRel?.etaMin) {
      parts.push(`Arrival in approximately ${Math.round(analysis.userRel.etaMin)} minutes.`);
    }

    return parts.join(' ');
  }

  /**
   * Stop speaking
   */
  stop() {
    if (this.synth) {
      this.synth.cancel();
      this.speaking = false;
    }
  }
}

export class AudioAlerts {
  constructor() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.sounds = {};
    this.enabled = true;
  }

  /**
   * Generate simple warning tone (siren-like)
   */
  playWarningTone() {
    if (!this.enabled) return;

    const ctx = this.audioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.2);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.4);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0, ctx.currentTime + 0.4);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  }

  /**
   * Play tornado warning siren
   */
  playTornadoSiren() {
    if (!this.enabled) return;

    const ctx = this.audioContext;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(400, ctx.currentTime + i * 0.5);
      osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + i * 0.5 + 0.2);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + i * 0.5 + 0.4);

      gain.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.5);
      gain.gain.exponentialRampToValueAtTime(0, ctx.currentTime + i * 0.5 + 0.4);

      osc.start(ctx.currentTime + i * 0.5);
      osc.stop(ctx.currentTime + i * 0.5 + 0.4);
    }
  }

  /**
   * Play notification ping
   */
  playNotification() {
    if (!this.enabled) return;

    const ctx = this.audioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.setValueAtTime(800, ctx.currentTime);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0, ctx.currentTime + 0.1);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  }

  /**
   * Ambient radar sound (subtle background)
   */
  playRadarAmbi() {
    if (!this.enabled) return;

    const ctx = this.audioContext;
    const noise = ctx.createBufferSource();
    const gainNode = ctx.createGain();

    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    noise.buffer = buffer;
    noise.loop = true;
    noise.connect(gainNode);
    gainNode.connect(ctx.destination);
    gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0, ctx.currentTime + 2);

    noise.start(ctx.currentTime);
    noise.stop(ctx.currentTime + 2);
  }

  disable() {
    this.enabled = false;
  }

  enable() {
    this.enabled = true;
  }
}

export class VoiceCommands {
  constructor(narrator) {
    this.narrator = narrator;
    this.recognition = null;
    this.listening = false;

    if ('webkitSpeechRecognition' in window) {
      this.recognition = new webkitSpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.onresult = (event) => this.handleVoiceInput(event);
    }
  }

  /**
   * Start listening for voice commands
   */
  startListening() {
    if (!this.recognition) {
      this.narrator.speak('Voice recognition not supported on this device.');
      return;
    }

    this.listening = true;
    this.recognition.start();
  }

  /**
   * Stop listening
   */
  stopListening() {
    this.listening = false;
    if (this.recognition) {
      this.recognition.stop();
    }
  }

  /**
   * Process voice input and extract intent
   */
  handleVoiceInput(event) {
    const transcript = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join('')
      .toLowerCase();

    this.executeCommand(transcript);
  }

  /**
   * Execute voice command
   */
  executeCommand(command) {
    if (command.includes('analysis') || command.includes('summarize')) {
      return { action: 'speakAnalysis' };
    } else if (command.includes('closest') || command.includes('nearest')) {
      return { action: 'speakNearest' };
    } else if (command.includes('alerts')) {
      return { action: 'speakAlerts' };
    } else if (command.includes('tornado')) {
      return { action: 'speakTornadoRisk' };
    } else if (command.includes('location') || command.includes('position')) {
      return { action: 'speakLocation' };
    }

    return null;
  }
}

/**
 * CarPlay/Bluetooth audio integration
 */
export class CarAudioBridge {
  constructor() {
    this.isConnected = false;
    this.speaker = null;
  }

  /**
   * Request audio focus for CarPlay
   */
  requestCarAudio() {
    if (navigator.mediaSession) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'StormLens Alert',
        artist: 'Weather Alert',
        album: 'Live Storm Analysis',
      });

      navigator.mediaSession.setActionHandler('play', () => {});
      navigator.mediaSession.setActionHandler('pause', () => {});

      return true;
    }
    return false;
  }

  /**
   * Send alert to car speaker
   */
  sendCarAlert(message) {
    if (this.requestCarAudio()) {
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.volume = 1; // Max volume for car
      window.speechSynthesis.speak(utterance);
      return true;
    }
    return false;
  }
}

/**
 * Podcast-style briefing generator
 */
export function generateStormBriefing(analyses, environment) {
  const parts = [];

  parts.push('Storm briefing for your area.');

  if (analyses.length === 0) {
    parts.push('No significant storms detected.');
    return parts.join(' ');
  }

  const top3 = analyses.slice(0, 3);

  top3.forEach((analysis, idx) => {
    parts.push(`Storm ${idx + 1}:`);
    parts.push(`Severity score ${Math.round(analysis.severeScore)}.`);

    if (analysis.tornado.score > 50) {
      parts.push(`Tornado potential ${analysis.tornado.chanceBand}.`);
    }

    if (analysis.cell.moveSpeedKts) {
      parts.push(`Moving ${Math.round(analysis.cell.moveSpeedKts)} knots.`);
    }
  });

  parts.push('Stay weather aware and follow official NWS warnings.');

  return parts.join(' ');
}
