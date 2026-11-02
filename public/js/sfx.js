/* LEVIATHAN - Sonido sintetizado en tiempo real (WebAudio). Sin archivos externos.
   Limita voces simultáneas y repeticiones para no saturar la CPU con 10 jugadores. */
G.Sfx = {
  ctx: null, master: null, noiseBuf: null, muted: false, voices: 0, last: {},

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },

  // Ambiente del Refugio: dron grave con filtro "respirando" (3 osciladores, sin buffers)
  ambient(on) {
    if (!this.ctx) return;
    if (on && !this.amb) {
      const c = this.ctx, g = c.createGain(), f = c.createBiquadFilter(), lfo = c.createOscillator(), lg = c.createGain();
      f.type = 'lowpass'; f.frequency.value = 260; g.gain.value = 0; g.gain.linearRampToValueAtTime(0.06, c.currentTime + 2);
      lfo.frequency.value = 0.07; lg.gain.value = 140; lfo.connect(lg); lg.connect(f.frequency);
      const oscs = [55, 55.6, 82.4].map((fr, i) => { const o = c.createOscillator(); o.type = i === 2 ? 'sine' : 'sawtooth'; o.frequency.value = fr; o.connect(f); o.start(); return o; });
      f.connect(g); g.connect(this.master); lfo.start();
      this.amb = { g, oscs: oscs.concat([lfo]) };
    } else if (!on && this.amb) {
      const a = this.amb, t = this.ctx.currentTime; this.amb = null;
      a.g.gain.linearRampToValueAtTime(0, t + 0.8);
      setTimeout(() => { for (const o of a.oscs) { try { o.stop(); o.disconnect(); } catch (_) {} } a.g.disconnect(); }, 900);
    }
  },
  // ---- Música dinámica: dos capas con fundido cruzado según el estado (explorar / combate / crítico)
  music(state) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.mus) {
      const mk = () => { const g = c.createGain(); g.gain.value = 0; g.connect(this.master); return g; };
      this.mus = { calm: mk(), war: mk(), state: 'off', step: 0, next: c.currentTime + 0.1, timer: null };
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; f.connect(this.mus.calm);
      for (const fr of [110, 164.8, 220.5]) { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = fr; const g = c.createGain(); g.gain.value = 0.25; o.connect(g); g.connect(f); o.start(); }
      const ws = c.createWaveShaper(), curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 4); }
      ws.curve = curve; ws.connect(this.mus.war); this.mus.dist = ws;
      // Secuenciador con lookahead (140 BPM, semicorcheas): agenda notas 200 ms por delante
      this.mus.timer = setInterval(() => {
        const M = this.mus;
        if (M.state === 'off' || this.muted) { M.next = c.currentTime + 0.1; return; }
        while (M.next < c.currentTime + 0.2) {
          const t = M.next, s = M.step % 16;
          if (M.war.gain.value > 0.01) {
            if (s % 4 === 0) this.hit(t, 'kick'); if (s === 4 || s === 12) this.hit(t, 'snare'); if (s % 2 === 1) this.hit(t, 'hat');
            const o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth'; o.frequency.value = [55, 55, 65.4, 49][Math.floor(M.step / 16) % 4] * (s % 8 === 6 ? 2 : 1);
            g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1); o.connect(g); g.connect(M.dist); o.start(t); o.stop(t + 0.11);
          }
          M.step++; M.next += 60 / 140 / 4;
        }
      }, 50);
    }
    if (this.mus.state === state) return;
    this.mus.state = state;
    const t = c.currentTime, M = this.mus;
    const calm = state === 'explore' ? 0.07 : state === 'off' ? 0 : 0.02, war = state === 'combat' ? 0.13 : state === 'critical' ? 0.18 : 0;
    M.calm.gain.cancelScheduledValues(t); M.calm.gain.linearRampToValueAtTime(calm, t + 1.5);
    M.war.gain.cancelScheduledValues(t); M.war.gain.linearRampToValueAtTime(war, t + (war ? 0.6 : 2.5));
  },
  hit(t, kind) {
    const c = this.ctx, g = c.createGain(); g.connect(this.mus.war);
    if (kind === 'kick') { const o = c.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); o.connect(g); o.start(t); o.stop(t + 0.2); return; }
    const n = c.createBufferSource(), f = c.createBiquadFilter(); n.buffer = this.noiseBuf; f.type = 'highpass'; f.frequency.value = kind === 'hat' ? 7000 : 1500;
    g.gain.setValueAtTime(kind === 'hat' ? 0.15 : 0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'hat' ? 0.04 : 0.14));
    n.connect(f); f.connect(g); n.start(t); n.stop(t + 0.15);
  },
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.55; return this.muted; },

  gate(id, minMs) {
    const now = performance.now();
    if (this.last[id] && now - this.last[id] < minMs) return false;
    this.last[id] = now;
    return true;
  },

  tone(o) {
    const c = this.ctx; if (!c || this.muted || this.voices > 28) return;
    const t = c.currentTime;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 || o.f0), t + o.dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + o.dur + 0.02);
    this.voices++; osc.onended = () => { this.voices--; osc.disconnect(); g.disconnect(); };
  },

  noise(o) {
    const c = this.ctx; if (!c || this.muted || this.voices > 28) return;
    const t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = o.rate || 1;
    const f = c.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.f0 || 3000, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1 || o.f0 || 3000), t + o.dur);
    f.Q.value = o.q || 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(o.vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.5); src.stop(t + o.dur + 0.02);
    this.voices++; src.onended = () => { this.voices--; src.disconnect(); f.disconnect(); g.disconnect(); };
  },

  play(name, vol) {
    if (!this.ctx || this.muted) return;
    const v = vol === undefined ? 1 : vol;
    switch (name) {
      case 'rifle': if (!this.gate('rifle', 30)) return;
        this.noise({ dur: 0.09, vol: 0.35 * v, f0: 4000, f1: 600, filter: 'lowpass' });
        this.tone({ type: 'square', f0: 220, f1: 70, dur: 0.07, vol: 0.12 * v }); break;
      case 'cannon': if (!this.gate('cannon', 60)) return;
        this.noise({ dur: 0.28, vol: 0.55 * v, f0: 2200, f1: 120 });
        this.tone({ type: 'sawtooth', f0: 120, f1: 35, dur: 0.25, vol: 0.25 * v }); break;
      case 'eshot': if (!this.gate('eshot', 45)) return;
        this.tone({ type: 'sawtooth', f0: 900, f1: 300, dur: 0.08, vol: 0.06 * v }); break;
      case 'slash': this.noise({ dur: 0.14, vol: 0.3 * v, f0: 1200, f1: 6000, filter: 'bandpass', q: 2 });
        this.tone({ type: 'sine', f0: 1600, f1: 400, dur: 0.1, vol: 0.06 * v }); break;
      case 'heavy': this.noise({ dur: 0.3, vol: 0.45 * v, f0: 900, f1: 120, filter: 'bandpass', q: 1.5 });
        this.tone({ type: 'sawtooth', f0: 160, f1: 40, dur: 0.3, vol: 0.2 * v }); break;
      case 'wave': this.tone({ type: 'sawtooth', f0: 300, f1: 1400, dur: 0.22, vol: 0.12 * v });
        this.noise({ dur: 0.2, vol: 0.2 * v, f0: 800, f1: 5000, filter: 'highpass' }); break;
      case 'hit': if (!this.gate('hit', 35)) return;
        this.tone({ type: 'square', f0: 520, f1: 180, dur: 0.05, vol: 0.09 * v }); break;
      case 'crit': this.tone({ type: 'square', f0: 1400, f1: 700, dur: 0.09, vol: 0.12 * v }); break;
      case 'shield': if (!this.gate('shield', 50)) return;
        this.tone({ type: 'triangle', f0: 1800, f1: 2400, dur: 0.08, vol: 0.09 * v }); break;
      case 'kill': if (!this.gate('kill', 40)) return;
        this.noise({ dur: 0.25, vol: 0.3 * v, f0: 3000, f1: 200 });
        this.tone({ type: 'square', f0: 300, f1: 60, dur: 0.2, vol: 0.1 * v }); break;
      case 'explosion': if (!this.gate('expl', 50)) return;
        this.noise({ dur: 0.7, vol: 0.7 * v, f0: 1800, f1: 60, rate: 0.7 });
        this.tone({ type: 'sine', f0: 90, f1: 28, dur: 0.6, vol: 0.4 * v }); break;
      case 'jump': this.tone({ type: 'square', f0: 260, f1: 520, dur: 0.08, vol: 0.06 * v }); break;
      case 'jump2': this.tone({ type: 'square', f0: 420, f1: 900, dur: 0.1, vol: 0.06 * v }); break;
      case 'land': this.noise({ dur: 0.06, vol: 0.12 * v, f0: 500, f1: 200 }); break;
      case 'dash': this.noise({ dur: 0.18, vol: 0.25 * v, f0: 600, f1: 4000, filter: 'bandpass', q: 1.2 }); break;
      case 'hurt': this.tone({ type: 'sawtooth', f0: 200, f1: 90, dur: 0.18, vol: 0.2 * v });
        this.noise({ dur: 0.12, vol: 0.2 * v, f0: 2000, f1: 400 }); break;
      case 'down': this.tone({ type: 'sawtooth', f0: 400, f1: 60, dur: 0.8, vol: 0.2 * v }); break;
      case 'revive': this.tone({ type: 'sine', f0: 400, f1: 1200, dur: 0.35, vol: 0.18 * v });
        this.tone({ type: 'sine', f0: 600, f1: 1800, dur: 0.45, vol: 0.12 * v }); break;
      case 'reload': this.tone({ type: 'square', f0: 900, f1: 900, dur: 0.04, vol: 0.06 * v });
        setTimeout(() => this.tone({ type: 'square', f0: 1300, f1: 1300, dur: 0.05, vol: 0.06 * v }), 160); break;
      case 'transform': this.tone({ type: 'sawtooth', f0: 80, f1: 400, dur: 0.3, vol: 0.15 * v });
        this.noise({ dur: 0.25, vol: 0.2 * v, f0: 3000, f1: 800, filter: 'bandpass', q: 3 }); break;
      case 'pickup': this.tone({ type: 'sine', f0: 700, f1: 1400, dur: 0.15, vol: 0.15 * v }); break;
      case 'coins': this.tone({ type: 'square', f0: 1200, f1: 1200, dur: 0.06, vol: 0.08 * v });
        setTimeout(() => this.tone({ type: 'square', f0: 1800, f1: 1800, dur: 0.1, vol: 0.08 * v }), 70); break;
      case 'alarm': this.tone({ type: 'square', f0: 700, f1: 500, dur: 0.35, vol: 0.12 * v });
        setTimeout(() => this.tone({ type: 'square', f0: 700, f1: 500, dur: 0.35, vol: 0.12 * v }), 420); break;
      case 'laser': if (!this.gate('laser', 120)) return;
        this.tone({ type: 'sawtooth', f0: 90, f1: 110, dur: 0.14, vol: 0.12 * v }); break;
      case 'charge': this.tone({ type: 'sawtooth', f0: 100, f1: 900, dur: 0.8, vol: 0.12 * v }); break;
      case 'zap': this.noise({ dur: 0.5, vol: 0.5 * v, f0: 6000, f1: 300, filter: 'bandpass', q: 0.6 });
        this.tone({ type: 'square', f0: 60, f1: 30, dur: 0.5, vol: 0.2 * v }); break;
      case 'gate': this.tone({ type: 'sawtooth', f0: 60, f1: 30, dur: 1.2, vol: 0.25 * v });
        this.noise({ dur: 1, vol: 0.2 * v, f0: 400, f1: 100 }); break;
      case 'spawn': if (!this.gate('spawn', 120)) return;
        this.tone({ type: 'sine', f0: 1600, f1: 200, dur: 0.25, vol: 0.06 * v }); break;
      case 'ui_move': this.tone({ type: 'square', f0: 900, f1: 900, dur: 0.03, vol: 0.04 }); break;
      case 'ui_ok': this.tone({ type: 'square', f0: 700, f1: 1400, dur: 0.08, vol: 0.07 }); break;
      case 'ui_hover': if (!this.gate('ui_hover', 45)) return; this.tone({ type: 'triangle', f0: 1800, f1: 2200, dur: 0.03, vol: 0.025 }); break;
      case 'medal': this.tone({ type: 'triangle', f0: 660, f1: 990, dur: 0.12, vol: 0.09 }); this.tone({ type: 'sine', f0: 1320, f1: 1980, dur: 0.22, vol: 0.06 }); break;
      case 'chat': this.tone({ type: 'sine', f0: 900, f1: 1200, dur: 0.05, vol: 0.05 }); break;
      case 'ui_err': this.tone({ type: 'square', f0: 200, f1: 140, dur: 0.15, vol: 0.08 }); break;
      case 'ui_open': this.tone({ type: 'sine', f0: 300, f1: 900, dur: 0.18, vol: 0.08 }); break;
      case 'type': if (!this.gate('type', 40)) return; this.tone({ type: 'square', f0: 1800 + Math.random() * 400, f1: 1800, dur: 0.015, vol: 0.015 }); break;
      case 'victory': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone({ type: 'square', f0: f, f1: f, dur: 0.25, vol: 0.1 }), i * 140)); break;
      case 'fail': [400, 300, 200, 120].forEach((f, i) => setTimeout(() => this.tone({ type: 'sawtooth', f0: f, f1: f * 0.9, dur: 0.35, vol: 0.12 }), i * 220)); break;
    }
  }
};
