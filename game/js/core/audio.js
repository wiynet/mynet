// Fully procedural Web Audio: city ambience, rain, engine, footsteps, impacts,
// UI sounds and a small generative car radio. No audio files are needed.
export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.volumes = { master: 0.8, sfx: 0.9, music: 0.5, ambient: 0.7 };
    this.radioOn = true;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.connect(this.master);
    this.amb = ctx.createGain(); this.amb.connect(this.master);
    this.applyVolumes();
    this.noiseBuf = this._makeNoise(2, 'white');
    this.brownBuf = this._makeNoise(4, 'brown');

    // Looping beds whose gains are driven every frame.
    this.city = this._loop(this.brownBuf, 'lowpass', 500, this.amb);
    this.rain = this._loop(this.noiseBuf, 'highpass', 1200, this.amb);
    this.rainLow = this._loop(this.brownBuf, 'lowpass', 900, this.amb);
    this.waves = this._loop(this.brownBuf, 'lowpass', 700, this.amb);
    this.wind = this._loop(this.noiseBuf, 'bandpass', 400, this.amb);
    this.skid = this._loop(this.noiseBuf, 'bandpass', 1800, this.sfx);
    this.skid.filter.Q.value = 3;

    // Engine: two detuned saws through a lowpass.
    const eg = ctx.createGain(); eg.gain.value = 0; eg.connect(this.sfx);
    const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 900; ef.connect(eg);
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 40; o1.connect(ef); o1.start();
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 20; const o2g = ctx.createGain(); o2g.gain.value = 0.35; o2.connect(o2g); o2g.connect(ef); o2.start();
    this.engine = { gain: eg, filter: ef, o1, o2 };

    // Siren for police pursuit.
    const sg = ctx.createGain(); sg.gain.value = 0; sg.connect(this.sfx);
    const so = ctx.createOscillator(); so.type = 'triangle'; so.frequency.value = 700; so.connect(sg); so.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.35; const lg = ctx.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(so.frequency); lfo.start();
    this.siren = { gain: sg };

    this.radio = new Radio(ctx, this.music);
    this._nextAmbientEvent = 0;
  }
  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfx.gain.value = this.volumes.sfx;
    this.music.gain.value = this.volumes.music;
    this.amb.gain.value = this.volumes.ambient;
  }
  _makeNoise(sec, kind) {
    const ctx = this.ctx, len = ctx.sampleRate * sec;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }
  _loop(buf, type, freq, dest) {
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const filter = this.ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = freq;
    const gain = this.ctx.createGain(); gain.gain.value = 0;
    src.connect(filter); filter.connect(gain); gain.connect(dest); src.start();
    return { src, filter, gain };
  }
  _set(param, v, t = 0.15) { if (this.ctx) param.setTargetAtTime(v, this.ctx.currentTime, t); }

  /** Called every frame with the state the soundscape depends on. */
  update(s) {
    if (!this.ctx) return;
    const ind = s.indoors ? 0.25 : 1;
    this._set(this.city.gain.gain, (0.05 + 0.12 * s.urban) * ind * (s.night ? 0.6 : 1));
    this._set(this.rain.gain.gain, 0.18 * s.rain * ind);
    this._set(this.rainLow.gain.gain, 0.25 * s.rain * ind);
    const wave = s.coast * (0.08 + 0.06 * Math.sin(this.ctx.currentTime * 0.6));
    this._set(this.waves.gain.gain, wave * ind, 0.4);
    this._set(this.wind.gain.gain, (0.01 + s.hills * 0.05 + s.speed * 0.0012) * ind);
    this._set(this.skid.gain.gain, Math.min(0.25, s.skid * 0.25));
    // Engine
    if (s.inCar) {
      const rpm = s.rpm; // 0..1
      this._set(this.engine.o1.frequency, 38 + rpm * 120, 0.05);
      this._set(this.engine.o2.frequency, 19 + rpm * 60, 0.05);
      this._set(this.engine.filter.frequency, 300 + rpm * 1400 + s.throttle * 500, 0.05);
      this._set(this.engine.gain.gain, s.engineOn ? 0.05 + rpm * 0.06 + s.throttle * 0.03 : 0, 0.08);
    } else this._set(this.engine.gain.gain, 0, 0.1);
    this._set(this.siren.gain.gain, s.siren ? Math.min(0.06, 0.06 * s.siren) : 0, 0.3);
    if (this.radio) this.radio.setActive(s.inCar && this.radioOn);

    // Occasional ambience one-shots: birds by day, crickets by night, distant horns downtown.
    const t = this.ctx.currentTime;
    if (t > this._nextAmbientEvent && !s.indoors) {
      this._nextAmbientEvent = t + 1.5 + Math.random() * 4;
      if (s.night && s.rain < 0.2) this.cricket();
      else if (!s.night && s.rain < 0.3 && (s.hills > 0.3 || s.park > 0.3 || Math.random() < 0.3)) this.bird();
      if (s.urban > 0.5 && Math.random() < 0.3) this.horn(0.02, 0.25, 300 + Math.random() * 120);
    }
  }

  _env(dest, a, d, peak) {
    const g = this.ctx.createGain(); const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); g.connect(dest); return g;
  }
  _noiseShot(type, freq, a, d, peak, dest = this.sfx, q = 1) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this._env(dest, a, d, peak); s.connect(f); f.connect(g);
    s.start(this.ctx.currentTime, Math.random()); s.stop(this.ctx.currentTime + a + d + 0.05);
  }
  _tone(type, f0, f1, a, d, peak, dest = this.sfx, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + a + d);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + a + d + 0.05);
  }
  footstep(wet, soft) { this._noiseShot(wet ? 'bandpass' : 'lowpass', wet ? 2200 : (soft ? 500 : 900), 0.005, 0.08, soft ? 0.05 : 0.09); }
  punch() { this._tone('sine', 160, 50, 0.005, 0.15, 0.5); this._noiseShot('lowpass', 1200, 0.002, 0.08, 0.3); }
  whoosh() { this._noiseShot('bandpass', 900, 0.03, 0.12, 0.08, this.sfx, 2); }
  zap() { this._tone('square', 1800, 300, 0.005, 0.18, 0.12); this._noiseShot('highpass', 3000, 0.002, 0.15, 0.1); }
  crash(power) { const p = Math.min(1, power); this._noiseShot('lowpass', 600 + p * 1400, 0.003, 0.3 + p * 0.5, 0.2 + p * 0.5); this._tone('sine', 90, 30, 0.005, 0.3, 0.3 * p); }
  horn(peak = 0.12, dur = 0.35, f = 410) { this._tone('square', f, f, 0.01, dur, peak); this._tone('square', f * 1.26, f * 1.26, 0.01, dur, peak * 0.8); }
  door() { this._tone('sine', 220, 120, 0.005, 0.12, 0.2); this._noiseShot('lowpass', 800, 0.002, 0.1, 0.15); }
  carDoor() { this._tone('sine', 120, 60, 0.004, 0.18, 0.4); this._noiseShot('lowpass', 500, 0.002, 0.15, 0.3); }
  thunder() { this._noiseShot('lowpass', 180, 0.3, 3.5, 0.7, this.amb); this._noiseShot('lowpass', 500, 0.02, 0.8, 0.4, this.amb); }
  bird() { const f = 2500 + Math.random() * 1500; for (let i = 0; i < 3; i++) this._tone('sine', f, f * 1.3, 0.01, 0.07, 0.025, this.amb, i * 0.12); }
  cricket() { for (let i = 0; i < 4; i++) this._tone('sine', 4200, 4300, 0.005, 0.03, 0.012, this.amb, i * 0.06); }
  click() { this._tone('sine', 900, 700, 0.002, 0.05, 0.08); }
  hover() { this._tone('sine', 1400, 1300, 0.002, 0.03, 0.03); }
  cash() { [1318, 1760, 2093].forEach((f, i) => this._tone('triangle', f, f, 0.005, 0.18, 0.08, this.sfx, i * 0.07)); }
  pickup() { [660, 990].forEach((f, i) => this._tone('sine', f, f, 0.005, 0.12, 0.1, this.sfx, i * 0.06)); }
  missionStart() { [392, 523, 659].forEach((f, i) => this._tone('triangle', f, f, 0.01, 0.4, 0.1, this.sfx, i * 0.12)); }
  missionPass() { [523, 659, 784, 1046].forEach((f, i) => this._tone('triangle', f, f, 0.01, 0.6, 0.12, this.sfx, i * 0.14)); }
  missionFail() { [392, 330, 262].forEach((f, i) => this._tone('sawtooth', f, f * 0.98, 0.01, 0.5, 0.06, this.sfx, i * 0.2)); }
  checkpoint() { this._tone('sine', 880, 1320, 0.005, 0.15, 0.12); }
  scream() { this._tone('sawtooth', 700 + Math.random() * 300, 1100, 0.05, 0.4, 0.03); }
}

/** Tiny generative lo-fi station: pad chords, bass and a soft beat. */
class Radio {
  constructor(ctx, out) {
    this.ctx = ctx; this.out = ctx.createGain(); this.out.gain.value = 0; this.out.connect(out);
    this.active = false; this.step = 0; this.nextTime = 0; this.bpm = 86;
    this.prog = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]];
    this.timer = setInterval(() => this._schedule(), 50);
  }
  setActive(a) {
    if (a === this.active) return;
    this.active = a; this.out.gain.setTargetAtTime(a ? 0.5 : 0, this.ctx.currentTime, 0.4);
    if (a) this.nextTime = this.ctx.currentTime + 0.1;
  }
  _note(midi, t, dur, type, vol, cutoff) {
    const ctx = this.ctx, f = 440 * Math.pow(2, (midi - 69) / 12);
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cutoff;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.08, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  }
  _drum(t, kind) {
    const ctx = this.ctx;
    if (kind === 'k') {
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.3);
    } else {
      const len = kind === 's' ? 0.15 : 0.04;
      const b = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const s = ctx.createBufferSource(); s.buffer = b;
      const f = ctx.createBiquadFilter(); f.type = kind === 's' ? 'bandpass' : 'highpass'; f.frequency.value = kind === 's' ? 1800 : 7000;
      const g = ctx.createGain(); g.gain.value = kind === 's' ? 0.25 : 0.08;
      s.connect(f); f.connect(g); g.connect(this.out); s.start(t);
    }
  }
  _schedule() {
    if (!this.active) return;
    const spb = 60 / this.bpm / 2; // eighth notes
    while (this.nextTime < this.ctx.currentTime + 0.3) {
      const t = this.nextTime, st = this.step % 32, bar = Math.floor(this.step / 8) % 4;
      const chord = this.prog[bar];
      if (st % 8 === 0) chord.forEach((m) => this._note(m, t, spb * 8, 'triangle', 0.035, 1400));
      if (st % 4 === 0) this._note(chord[0] - 24, t, spb * 2.5, 'sine', 0.18, 400);
      if (st % 8 === 0 || st % 8 === 5) this._drum(t, 'k');
      if (st % 8 === 4) this._drum(t, 's');
      this._drum(t, 'h');
      if (Math.random() < 0.35) this._note(chord[Math.floor(Math.random() * 4)] + 12, t, spb * 1.5, 'sine', 0.04, 3000);
      this.nextTime += spb; this.step++;
    }
  }
}
