/* LEVIATHAN - Capa de red del cliente.
   - Sesión (auth) separada de la sala (join) para el menú multijugador.
   - Reconexión automática: re-autentica con el token de sesión y recupera su ranura en la sala.
   - Snapshots delta: reconstruye el estado completo a partir de la base confirmada (ack) y la confirma.
   - Búfer de fluctuación adaptativo: el retardo de interpolación se ajusta a la red real (sin tirones).
   - Envío de inputs por fotograma simulado (60 Hz) con la confirmación de la última instantánea recibida. */
window.G = window.G || {};

G.Net = {
  socket: null,
  id: 0,
  room: '',
  mode: 'coop',
  phase: 'hub',
  profile: null,
  roster: new Map(),
  sel: { variant: 'solo', idx: 0, name: '', layer: 1 },
  runInfo: null,
  snaps: [],
  lastSnap: null,
  offset: null,
  rtt: 0,
  seq: 0,
  outbox: [],
  listeners: {},
  INTERP_DELAY: 100,
  session: null,        // { token, room, mode } para reconectar
  hist: new Map(),      // seq -> { p: Map, e: Map } estados reconstruidos (base de los deltas)
  ack: -1,
  arrMean: 50, arrJit: 5, lastArr: 0,
  pingId: 0,

  on(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); },
  off(evt, fn) { const l = this.listeners[evt]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } },
  fire(evt, data) { const l = this.listeners[evt]; if (l) for (const fn of l.slice()) { try { fn(data); } catch (e) { console.error('[net]', evt, e); } } },

  resetState() {
    this.snaps.length = 0; this.lastSnap = null; this.offset = null;
    this.hist.clear(); this.ack = -1; this.outbox.length = 0;
  },

  // Abre el socket y autentica. cb(res) con { ok, name, token, profile }
  connect(auth, cb) {
    if (this.socket) { this.socket.removeAllListeners(); this.socket.disconnect(); }
    // WebSocket primero; si un proxy/antivirus/firewall lo bloquea, cae a long-polling en vez de no conectar nunca
    const s = io({ transports: ['websocket', 'polling'], tryAllTransports: true, reconnection: true, reconnectionDelay: 400, reconnectionDelayMax: 3000, reconnectionAttempts: 40, timeout: 8000 });
    this.socket = s;
    let first = true;
    s.on('connect', () => {
      if (first) {
        first = false;
        s.timeout(10000).emit('auth', auth, (err, res) => {
          if (err) res = { ok: false, msg: 'El servidor no respondió. Reintenta.' };
          if (res && res.ok) { this.profile = res.profile; this.session = { token: res.token, room: null, mode: null }; }
          cb(res || { ok: false, msg: 'Sin respuesta' });
        });
        return;
      }
      // Reconexión: re-autenticar con el token y volver a la sala (el servidor reserva la ranura 25 s)
      if (!this.session || !this.session.token) return;
      s.timeout(10000).emit('auth', { mode: 'token', token: this.session.token }, (err, res) => {
        if (err) { if (s.connected) s.disconnect().connect(); return; }   // sin respuesta: reintentar el ciclo de reconexión
        if (!res || !res.ok) { this.fire('fatal', 'La sesión expiró. Vuelve a iniciar sesión.'); return; }
        this.profile = res.profile;
        if (res.token) this.session.token = res.token;
        if (this.session.room) {
          this.resetState();
          s.timeout(10000).emit('join', { room: this.session.room, mode: this.session.mode }, (err, j) => {
            if (err) j = { ok: false, msg: 'El servidor no respondió al volver a la sala.' };
            if (j && j.ok) this.fire('reconnected');
            else { this.session.room = null; this.fire('leftroom', (j && j.msg) || 'No se pudo volver a la sala.'); }
          });
        } else this.fire('reconnected');
      });
    });
    s.on('connect_error', () => { if (first) { first = false; cb({ ok: false, msg: 'No se pudo conectar con el servidor.' }); } });
    s.on('welcome', (w) => {
      this.id = w.id; this.room = w.room; this.phase = w.phase; this.sel = w.sel;
      this.runInfo = w.run || null;
      this.resetState();
      this.fire('welcome', w);
    });
    s.on('profile', (p) => { this.profile = p; this.fire('profile', p); });
    s.on('roster', (r) => {
      this.roster.clear();
      for (const e of r.list) this.roster.set(e.id, e);
      this.sel = r.sel;
      this.fire('roster', r);
    });
    s.on('s', (snap) => this.onSnap(snap));
    s.on('e', (evs) => this.fire('events', evs));
    s.on('run', (info) => { this.phase = 'run'; this.runInfo = info; this.resetState(); this.fire('run', info); });
    s.on('hub', (info) => { this.phase = 'hub'; this.sel = info.sel || this.sel; this.runInfo = null; this.resetState(); this.fire('hub', info); });
    s.on('notify', (n) => this.fire('notify', n));
    s.on('chat', (c) => this.fire('chat', c));
    s.on('vc', (id, buf) => { if (G.Voice) G.Voice.play(id, buf); });
    // La sala se cerró (error interno o fallo al entrar): volver al menú sin perder la sesión
    s.on('roomclosed', (k) => { if (this.session) this.session.room = null; this.roster.clear(); this.resetState(); this.fire('leftroom', (k && k.msg) || 'La sala se cerró.'); });
    s.on('kicked', (k) => { this.session = null; this.fire('fatal', (k && k.msg) || 'Desconectado.'); });
    s.on('disconnect', (reason) => this.fire('disconnect', reason));
    s.io.on('reconnect_failed', () => this.fire('fatal', 'No se pudo restablecer la conexión. Recarga la página.'));
    if (!this.pingId) {
      this.pingId = setInterval(() => {
        const sk = this.socket;
        const t0 = performance.now();
        if (sk && sk.connected) sk.emit('png', t0, () => { const r = performance.now() - t0; this.rtt = this.rtt ? this.rtt * 0.8 + r * 0.2 : r; });
      }, 2000);
    }
  },

  join(opts) {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) return resolve({ ok: false, msg: 'Sin conexión' });
      this.socket.timeout(10000).emit('join', opts, (err, res) => {
        if (err) res = { ok: false, msg: 'El servidor no respondió. Reintenta.' };
        if (res && res.ok && this.session) this.session.room = res.room, this.session.mode = res.mode, this.mode = res.mode;
        resolve(res || { ok: false, msg: 'Sin respuesta' });
      });
    });
  },
  leave() {
    return new Promise((resolve) => {
      if (this.session) this.session.room = null;
      this.roster.clear(); this.resetState();
      if (!this.socket || !this.socket.connected) return resolve({ ok: true });
      this.socket.timeout(5000).emit('leave', null, () => resolve({ ok: true }));   // con o sin ack: nunca cuelga el menú
    });
  },
  listRooms(mode) {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) return resolve([]);
      this.socket.timeout(6000).emit('rooms', mode, (err, list) => resolve(!err && Array.isArray(list) ? list : []));
    });
  },

  // Reconstrucción de un snapshot delta a estado completo
  applyList(base, up, rm) {
    const map = base ? new Map(base) : new Map();
    if (rm) for (const id of rm) map.delete(id);
    if (up) for (const t of up) map.set(t[0], t);
    return map;
  },

  onSnap(snap) {
    let base = null;
    if (snap.bs >= 0) {
      base = this.hist.get(snap.bs);
      if (!base) {   // base perdida: pedir estado completo (como máximo 4 veces/s, sin inundar al servidor)
        const t = performance.now();
        if (this.socket && t - (this.fullAt || 0) > 250) { this.fullAt = t; this.socket.emit('full'); }
        return;
      }
    }
    const pm = this.applyList(base && base.p, snap.p, snap.pr);
    const em = snap.e || snap.er ? this.applyList(base && base.e, snap.e, snap.er) : null;
    this.hist.set(snap.sq, { p: pm, e: em });
    if (this.hist.size > 64) this.hist.delete(this.hist.keys().next().value);
    if (snap.sq > this.ack) this.ack = snap.sq;
    snap.p = [...pm.values()];
    if (em) snap.e = [...em.values()];
    const now = performance.now();
    // Búfer de fluctuación adaptativo
    if (this.lastArr) {
      const d = now - this.lastArr;
      this.arrMean += (d - this.arrMean) * 0.05;
      this.arrJit += (Math.abs(d - this.arrMean) - this.arrJit) * 0.05;
      const target = Math.max(45, Math.min(240, this.arrMean * 1.6 + this.arrJit * 3));
      this.INTERP_DELAY += (target - this.INTERP_DELAY) * 0.02;
    }
    this.lastArr = now;
    const off = snap.t - now;
    if (this.offset === null || Math.abs(off - this.offset) > 500) this.offset = off;
    else this.offset += (off - this.offset) * 0.06;
    snap.rt = now;
    this.snaps.push(snap);
    if (this.snaps.length > 30) this.snaps.shift();
    this.lastSnap = snap;
    this.fire('snap', snap);
  },

  serverNow() { return performance.now() + (this.offset || 0); },
  renderTime() { return this.serverNow() - this.INTERP_DELAY; },

  // Devuelve [s0, s1, alpha] para interpolar en el tiempo de render
  interpPair() {
    const rt = this.renderTime();
    const s = this.snaps;
    if (!s.length) return null;
    for (let i = s.length - 1; i > 0; i--) {
      if (s[i - 1].t <= rt) {
        const a = s[i - 1], b = s[i];
        const al = b.t === a.t ? 1 : Math.max(0, Math.min(1.15, (rt - a.t) / (b.t - a.t)));
        return [a, b, al];
      }
    }
    return [s[0], s[0], 0];
  },

  queueInput(b, aim) {
    const seq = ++this.seq;
    this.outbox.push([seq, b, Math.round(aim * 1000)]);
    if (this.outbox.length > 50) this.outbox.splice(0, this.outbox.length - 50);
    return seq;
  },

  flushInputs() {
    if (this.outbox.length && this.socket && this.socket.connected && this.session && this.session.room) {
      this.socket.emit('i', this.outbox, this.ack, Math.round(this.rtt || 0));
      this.outbox = [];
    }
  },

  act(a) {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) return resolve({ ok: false, msg: 'Sin conexión' });
      // Tiempo límite: si el servidor no responde (red caída a mitad), la UI nunca queda colgada esperando
      let done = false;
      const to = setTimeout(() => { if (!done) { done = true; resolve({ ok: false, msg: 'Sin respuesta del servidor' }); } }, 5000);
      this.socket.emit('a', a, (res) => {
        if (done) return;
        done = true; clearTimeout(to);
        if (res && res.profile) { this.profile = res.profile; this.fire('profile', res.profile); }
        resolve(res || { ok: false, msg: 'Sin respuesta' });
      });
    });
  }
};
