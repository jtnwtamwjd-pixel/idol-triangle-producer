// ============================================================
// Web Audio API による楽曲の再生(music.js が作ったイベント列を合成して鳴らす)
// ============================================================

const AudioSys = { ctx: null, master: null, music: null, se: null, noise: null };

function ensureAudio() {
  if (!AudioSys.ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(ctx.destination);
    AudioSys.master = ctx.createGain(); AudioSys.master.connect(comp);
    AudioSys.music = ctx.createGain(); AudioSys.music.connect(AudioSys.master);
    AudioSys.se = ctx.createGain(); AudioSys.se.connect(AudioSys.master);
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    AudioSys.noise = buf;
    AudioSys.ctx = ctx;
  }
  if (AudioSys.ctx.state === 'suspended') AudioSys.ctx.resume();
  return AudioSys.ctx;
}

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function envGain(ctx, dest, t, a, peak, dur, rel) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  g.gain.setValueAtTime(Math.max(peak, 0.0002), t + Math.max(a, dur - rel));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);
  g.connect(dest);
  return g;
}
function osc(ctx, type, freq, t, end, dest, detune) {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (detune) o.detune.value = detune;
  o.connect(dest); o.start(t); o.stop(end + 0.05);
  return o;
}
function noiseSrc(ctx, t, dur, dest) {
  const s = ctx.createBufferSource();
  s.buffer = AudioSys.noise; s.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

const INSTR = {
  lead(ctx, dest, t, e, spb, calm) {
    const dur = e.dur * spb;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = calm ? 1800 : 3200; f.connect(dest);
    const g = envGain(ctx, f, t, 0.01, e.vel * (calm ? 0.13 : 0.16), dur, 0.08);
    osc(ctx, calm ? 'triangle' : 'square', midiHz(e.midi), t, t + dur + 0.1, g);
    if (!calm) osc(ctx, 'sawtooth', midiHz(e.midi), t, t + dur + 0.1, g, 8);
  },
  chord(ctx, dest, t, e, spb, calm) {
    const dur = e.dur * spb;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = calm ? 900 : 1400; f.connect(dest);
    const g = envGain(ctx, f, t, calm ? 0.3 : 0.05, e.vel * 0.06, dur * 0.95, 0.2);
    e.notes.forEach((m) => { osc(ctx, 'sawtooth', midiHz(m), t, t + dur + 0.3, g, -6); osc(ctx, 'triangle', midiHz(m), t, t + dur + 0.3, g, 5); });
  },
  bass(ctx, dest, t, e, spb) {
    const dur = e.dur * spb;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; f.connect(dest);
    const g = envGain(ctx, f, t, 0.005, e.vel * 0.35, dur, 0.04);
    osc(ctx, 'triangle', midiHz(e.midi), t, t + dur + 0.1, g);
    osc(ctx, 'square', midiHz(e.midi), t, t + dur + 0.1, envGain(ctx, f, t, 0.005, e.vel * 0.06, dur, 0.04));
  },
  kick(ctx, dest, t, e) {
    const g = envGain(ctx, dest, t, 0.002, e.vel * 0.9, 0.12, 0.12);
    const o = osc(ctx, 'sine', 150, t, t + 0.3, g);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.15);
  },
  snare(ctx, dest, t, e) {
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7; f.connect(dest);
    noiseSrc(ctx, t, 0.2, envGain(ctx, f, t, 0.002, e.vel * 0.5, 0.06, 0.12));
    osc(ctx, 'triangle', 190, t, t + 0.12, envGain(ctx, dest, t, 0.002, e.vel * 0.25, 0.04, 0.06));
  },
  hat(ctx, dest, t, e) {
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; f.connect(dest);
    noiseSrc(ctx, t, 0.06, envGain(ctx, f, t, 0.001, e.vel * 0.35, 0.02, 0.04));
  },
  crash(ctx, dest, t, e) {
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 4000; f.connect(dest);
    noiseSrc(ctx, t, 1.2, envGain(ctx, f, t, 0.003, e.vel * 0.3, 0.1, 1.0));
  },
};

// 先読みスケジューラで、少しずつイベントを予約していく
class SongPlayer {
  constructor(song, opts) {
    this.song = song;
    this.loop = !!(opts && opts.loop);
    this.calm = !!(opts && opts.calm);
    this.volume = opts && opts.volume != null ? opts.volume : 0.8;
    this.timer = null;
  }
  start(when) {
    const ctx = ensureAudio();
    if (!ctx) return;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(AudioSys.music);
    this.t0 = when != null ? when : ctx.currentTime + 0.1;
    this.idx = 0;
    this.loopN = 0;
    this.spb = 60 / this.song.bpm;
    this.timer = setInterval(() => this.tick(), 25);
    this.tick();
  }
  tick() {
    const ctx = this.ctx, ev = this.song.events, ahead = ctx.currentTime + 0.3;
    for (;;) {
      if (this.idx >= ev.length) {
        if (!this.loop) return;
        this.idx = 0; this.loopN++;
      }
      const e = ev[this.idx];
      const t = this.t0 + (e.beat + this.loopN * this.song.totalBeats) * this.spb;
      if (t > ahead) return;
      if (t >= ctx.currentTime - 0.02) INSTR[e.type](ctx, this.out, Math.max(t, ctx.currentTime), e, this.spb, this.calm);
      this.idx++;
    }
  }
  stop(fade) {
    clearInterval(this.timer);
    this.timer = null;
    if (this.out && this.ctx) {
      const g = this.out.gain, now = this.ctx.currentTime;
      g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + (fade || 0.3));
      const out = this.out;
      setTimeout(() => out.disconnect(), ((fade || 0.3) + 0.5) * 1000);
    }
  }
}

function playSE(kind) {
  const ctx = AudioSys.ctx;
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime, d = AudioSys.se;
  const tone = (f, dur, type, v, at) => osc(ctx, type || 'sine', f, t + (at || 0), t + (at || 0) + dur, envGain(ctx, d, t + (at || 0), 0.003, v || 0.15, dur, 0.05));
  switch (kind) {
    case 'perfect': tone(1568, 0.05, 'sine', 0.1); break;
    case 'good': tone(1046, 0.05, 'sine', 0.07); break;
    case 'select': tone(880, 0.06, 'triangle', 0.12); tone(1320, 0.08, 'triangle', 0.1, 0.05); break;
    case 'fever': [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.12, 'square', 0.08, i * 0.06)); break;
    case 'win': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.2, 'triangle', 0.15, i * 0.12)); break;
  }
}
