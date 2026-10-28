// Every sound is synthesised with WebAudio: no audio files to download.
export class Sound {
  constructor() { this.ctx = null; this.master = 0.8; this.sfx = 0.8; this.music = 0.35; this.musicOn = false; this.noiseBuf = null; this.nextNote = 0; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.out = this.ctx.createGain(); this.out.gain.value = this.master; this.out.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = this.sfx; this.sfxBus.connect(this.out);
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = this.music; this.musicBus.connect(this.out);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // a soft reverb for the music
    const ir = this.ctx.createBuffer(2, this.ctx.sampleRate * 2.5, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 3); }
    this.verb = this.ctx.createConvolver(); this.verb.buffer = ir; this.verb.connect(this.musicBus);
  }
  setVolumes(master, sfx, music, musicOn) {
    this.master = master; this.sfx = sfx; this.music = music; this.musicOn = musicOn;
    if (this.ctx) { this.out.gain.value = master; this.sfxBus.gain.value = sfx; this.musicBus.gain.value = music; }
  }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  noise(dur, freq, q, gain, type = 'bandpass', pan = 0) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node = g;
    if (this.ctx.createStereoPanner && pan) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    s.connect(f); f.connect(g); node.connect(this.sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  tone(freq, dur, gain, type = 'sine', slide = 0, bus) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || this.sfxBus); o.start(t); o.stop(t + dur + 0.02);
  }

  material(kind, strength = 1) {
    const r = 0.85 + Math.random() * 0.3;
    switch (kind) {
      case 'stone': case 'metal': this.noise(0.09, 2400 * r, 1.4, 0.5 * strength); this.noise(0.05, 900 * r, 2, 0.25 * strength); if (kind === 'metal') this.tone(1800 * r, 0.12, 0.05 * strength, 'triangle'); break;
      case 'wood': this.noise(0.08, 700 * r, 3, 0.55 * strength); this.tone(220 * r, 0.06, 0.12 * strength, 'triangle', 0.8); break;
      case 'grass': this.noise(0.11, 3600 * r, 0.7, 0.32 * strength, 'highpass'); break;
      case 'dirt': this.noise(0.1, 500 * r, 0.8, 0.5 * strength, 'lowpass'); break;
      case 'sand': case 'snow': this.noise(0.13, 2600 * r, 0.5, 0.25 * strength, 'highpass'); break;
      case 'glass': this.noise(0.15, 5200 * r, 4, 0.35 * strength); this.tone(2600 * r, 0.18, 0.05 * strength, 'sine', 1.4); break;
      case 'wool': this.noise(0.08, 400 * r, 0.6, 0.25 * strength, 'lowpass'); break;
      default: this.noise(0.08, 1200 * r, 1, 0.4 * strength);
    }
  }
  play(name, opt = {}) {
    const r = 0.9 + Math.random() * 0.2;
    switch (name) {
      case 'dig': this.material(opt.mat, 0.6); break;
      case 'break': this.material(opt.mat, 1.1); break;
      case 'place': this.material(opt.mat, 0.9); break;
      case 'step': this.material(opt.mat, 0.32); break;
      case 'hurt': this.tone(300 * r, 0.18, 0.25, 'square', 0.6); this.noise(0.1, 600, 1, 0.3, 'lowpass'); break;
      case 'pickup': this.tone(880 * r, 0.07, 0.12, 'sine', 1.6); break;
      case 'eat': for (let i = 0; i < 3; i++) setTimeout(() => this.noise(0.06, 1400 * r, 1.2, 0.4), i * 110); break;
      case 'burp': this.tone(140, 0.25, 0.2, 'sawtooth', 0.7); break;
      case 'swing': this.noise(0.08, 1800, 0.8, 0.12, 'bandpass'); break;
      case 'hit': this.noise(0.07, 800, 1, 0.5, 'lowpass'); this.tone(160 * r, 0.08, 0.2, 'triangle', 0.6); break;
      case 'splash': this.noise(0.4, 900, 0.6, 0.4, 'lowpass'); break;
      case 'land': this.noise(0.12, 300, 0.7, 0.4 * Math.min(1, (opt.d || 2) / 5), 'lowpass'); break;
      case 'bow': this.tone(420, 0.12, 0.15, 'triangle', 1.8); this.noise(0.1, 2000, 1, 0.15); break;
      case 'arrowHit': this.noise(0.05, 1500, 2, 0.25); break;
      case 'craft': this.noise(0.06, 900, 2, 0.3); setTimeout(() => this.tone(660, 0.09, 0.1, 'triangle', 1.2), 70); break;
      case 'click': this.tone(1200, 0.03, 0.05, 'square'); break;
      case 'poof': this.noise(0.3, 700, 0.5, 0.3, 'lowpass'); break;
      case 'door': this.noise(0.12, 500, 1.5, 0.4); break;
      case 'fire': this.noise(0.2, 400, 0.4, 0.2, 'lowpass'); break;
      case 'sheep': this.bleat(380 * r, 0.45); break;
      case 'cow': this.bleat(120 * r, 0.7, 'sawtooth'); break;
      case 'chicken': for (let i = 0; i < 2; i++) setTimeout(() => this.tone(900 * r, 0.06, 0.08, 'square', 1.3), i * 90); break;
      case 'camel': this.bleat(170 * r, 0.6, 'sawtooth'); break;
      case 'zombie': this.bleat(90 * r, 0.9, 'sawtooth', 0.5); this.noise(0.6, 200, 0.8, 0.15, 'lowpass'); break;
      case 'skeleton': for (let i = 0; i < 3; i++) setTimeout(() => this.noise(0.04, 2500, 6, 0.2), i * 70); break;
      case 'spider': this.noise(0.25, 3000, 2, 0.15, 'highpass'); break;
      case 'levelup': [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.15, 0.1, 'triangle'), i * 90)); break;
    }
  }
  bleat(f, dur, type = 'triangle', gain = 0.12) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 9; const lg = this.ctx.createGain(); lg.gain.value = f * 0.06; lfo.connect(lg); lg.connect(o.frequency);
    const flt = this.ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = f * 5;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(flt); flt.connect(g); g.connect(this.sfxBus);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }
  // sparse, calm generative music on a pentatonic scale
  tickMusic(now) {
    if (!this.musicOn || !this.ctx || this.ctx.state !== 'running') return;
    if (now < this.nextNote) return;
    const scale = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3];
    if (!this.phrase || this.phrase.length === 0) {
      if (Math.random() < 0.5 && this.phrase) { this.nextNote = now + 20 + Math.random() * 40; this.phrase = null; return; }
      const n = 5 + ((Math.random() * 6) | 0); this.phrase = [];
      let idx = (Math.random() * scale.length) | 0;
      for (let i = 0; i < n; i++) { idx = Math.max(0, Math.min(scale.length - 1, idx + ((Math.random() * 5) | 0) - 2)); this.phrase.push(scale[idx] * (Math.random() < 0.2 ? 0.5 : 1)); }
    }
    const f = this.phrase.shift();
    const t = this.ctx.currentTime;
    for (const [mult, g] of [[1, 0.09], [2, 0.025], [3, 0.01]]) {
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mult;
      const gg = this.ctx.createGain(); gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(g, t + 0.02); gg.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      o.connect(gg); gg.connect(this.verb); gg.connect(this.musicBus); o.start(t); o.stop(t + 2.7);
    }
    this.nextNote = now + 0.45 + Math.random() * 0.9;
  }
}
