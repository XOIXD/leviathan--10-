/* =====================================================================================
   LEVIATHAN - Servidor autoritativo (Node.js + Express + Socket.io)
   - Modo Historia (1 jugador), Partida de Descenso cooperativa (hasta 10) y Batalla de Escuadrones (hasta 100).
   - Simulación fija a 60 Hz guiada por un reloj de alta precisión en un hilo aparte (server/clock.js).
   - Snapshots delta confirmados por el cliente a 20 Hz + eventos fiables agrupados.
   - Blindaje: cada manejador y cada sala aíslan sus errores, límites de acciones, sesión única por
     cuenta con recuperación de ranura y telemetría de latencia del bucle de eventos.
   Uso:  node server.js   (puerto por defecto 3000, configurable con PORT=xxxx)
   ===================================================================================== */
const path = require('path');
const http = require('http');
const os = require('os');
const { Worker } = require('worker_threads');
const { monitorEventLoopDelay } = require('perf_hooks');
const express = require('express');
const { Server } = require('socket.io');
const C = require('./shared/constants');
const Profiles = require('./server/profiles');
const Room = require('./server/room');
const BRRoom = require('./server/br');
const TDMRoom = require('./server/tdm');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const app = express();
app.get('/manifest.webmanifest', (req, res) => res.type('application/manifest+json').sendFile(path.join(__dirname, 'public', 'manifest.webmanifest')));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));
app.use('/lib', express.static(path.join(__dirname, 'node_modules', 'phaser', 'dist')));

const server = http.createServer(app);
const io = new Server(server, {
  // Sin compresión por mensaje: zlib por socket consume ~300 KB de RAM por conexión y
  // CPU en el hilo principal; los snapshots delta ya son pequeños. Más estable bajo carga.
  perMessageDeflate: false,
  httpCompression: false,
  pingInterval: 4000,
  pingTimeout: 9000,
  maxHttpBufferSize: 1e5
});

const rooms = new Map();          // código -> Room / BRRoom
const sessions = new Map();       // cuenta (minúsculas) -> socket activo

function cleanRoom(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); }
function genCode(prefix) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) { let c = prefix; for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)]; if (!rooms.has(c)) return c; }
}
const MAX_ROOMS = +process.env.LEVIATHAN_MAX_ROOMS || 200;
function createRoom(code, mode, opts) {
  if (rooms.size >= MAX_ROOMS) return null;   // tope de salas: un abuso no puede agotar CPU/RAM
  const onEmpty = (rr) => { rooms.delete(rr.code); console.log(`[sala] ${rr.code} cerrada (vacía)`); };
  const r = mode === 'tdm' ? new TDMRoom(code, io, onEmpty, opts) : mode === 'br' ? new BRRoom(code, io, onEmpty, opts) : new Room(code, io, onEmpty);
  if (mode === 'solo') { r.mode = 'solo'; r.max = 1; r.isPublic = false; }
  else if (mode === 'coop') r.isPublic = !!opts.public;
  if (mode !== 'br') r.snapEvery = 2;   // ≤10 jugadores: snapshots a 30 Hz (menos interpolación, más precisión)
  rooms.set(code, r);
  console.log(`[sala] ${code} creada (${mode}${r.isPublic ? ', pública' : ''})`);
  return r;
}
function roomList(mode) {
  const out = [];
  for (const r of rooms.values()) if (r.isPublic && (!mode || (r.tdm ? 'tdm' : r.mode) === mode)) out.push(r.summary());
  return out.sort((a, b) => b.players - a.players).slice(0, 60);
}

// Envuelve un manejador: un paquete malformado jamás tumba el proceso
function guard(name, fn) {
  return (...args) => {
    try {
      const r = fn(...args);
      if (r && typeof r.catch === 'function') r.catch((e) => fail(name, e, args));
    } catch (e) { fail(name, e, args); }
  };
}
function fail(name, e, args) {
  console.error(`[socket:${name}]`, e && e.stack || e);
  const cb = args[args.length - 1];
  if (typeof cb === 'function') { try { cb({ ok: false, msg: 'Error interno del servidor.' }); } catch (_) { /* ignorar */ } }
}

io.on('connection', (socket) => {
  let room = null;
  // La sala pudo cerrarse por un error interno: nunca quedar atado a una sala muerta
  const liveRoom = () => { if (room && rooms.get(room.code) !== room) room = null; return room; };
  let profile = null;
  let authBusy = false;
  let attempts = 0;
  let actions = 0, actionsT = Date.now();

  socket.on('auth', guard('auth', async (data, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (profile) return reply({ ok: false, msg: 'Ya iniciaste sesión.' });
    if (authBusy) return reply({ ok: false, msg: 'Procesando…' });
    if (++attempts > 8) return reply({ ok: false, msg: 'Demasiados intentos. Espera un minuto y recarga.' });
    authBusy = true;
    try {
      const d = data || {};
      let res;
      if (d.mode === 'register') res = await Profiles.register(d.user, d.pass);
      else if (d.mode === 'token') res = Profiles.loginToken(d.token);
      else res = await Profiles.login(d.user, d.pass);
      if (!res.ok || !socket.connected) return reply(res);
      const k = res.profile.name.toLowerCase();
      // Sesión única: la conexión nueva desplaza a la anterior (su ranura en la sala queda reservada)
      const old = sessions.get(k);
      if (old && old !== socket) { old.emit('kicked', { msg: 'Tu cuenta inició sesión en otro lugar.' }); old.disconnect(true); }
      profile = res.profile;
      sessions.set(k, socket);
      attempts = 0;
      console.log(`[cuentas] ${profile.name} inició sesión (${d.mode || 'login'})`);
      reply({ ok: true, name: profile.name, token: res.token || null, profile: Profiles.publicView(profile) });
    } finally { authBusy = false; }
  }));

  socket.on('rooms', guard('rooms', (mode, cb) => { if (typeof cb === 'function') cb(roomList(mode)); }));

  socket.on('join', guard('join', (data, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (!profile) return reply({ ok: false, msg: 'Primero inicia sesión.' });
    if (liveRoom()) {
      if (room.players.get(socket.id)) return reply({ ok: false, msg: 'Ya estás en una sala.' });
      room = null;   // referencia huérfana (p.ej. tras un fallo al entrar): se libera
    }
    const d = data || {};
    const mode = ['solo', 'coop', 'br', 'tdm'].includes(d.mode) ? d.mode : 'coop';
    let r = null;
    // Reconexión: si el jugador tiene una ranura reservada en alguna sala, vuelve a ella
    for (const rr of rooms.values()) if (rr.findGhost(profile.name)) { r = rr; break; }
    if (!r) {
      if (d.create || mode === 'solo') r = createRoom(genCode(mode === 'solo' ? 'S' : mode === 'br' ? 'B' : mode === 'tdm' ? 'T' : 'C'), mode, { public: !!d.public, teamSize: d.teamSize | 0, map: Number.isInteger(d.map) ? d.map : -1 });
      else {
        const code = cleanRoom(d.room);
        if (!code) return reply({ ok: false, msg: 'Código de sala inválido.' });
        r = rooms.get(code) || createRoom(code, mode, { public: !!d.public, teamSize: d.teamSize | 0 });
      }
    }
    if (!r) return reply({ ok: false, msg: 'Servidor lleno: demasiadas salas abiertas. Únete a una existente.' });
    const ok = r.canJoin(profile);
    if (!ok.ok) { if (r.players.size === 0) rooms.delete(r.code); return reply(ok); }
    room = r;
    reply({ ok: true, room: r.code, mode: r.mode });
    try { room.addPlayer(socket, profile); }
    catch (e) {
      console.error('[join] addPlayer falló', e && e.stack || e);
      try { room.removePlayer(socket, true); } catch (_) { /* ya limpio */ }
      room = null;
      socket.emit('roomclosed', { msg: 'No se pudo entrar a la sala. Inténtalo de nuevo.' });
    }
  }));

  socket.on('leave', guard('leave', (_, cb) => {
    try { if (liveRoom()) room.removePlayer(socket, true); }
    finally { room = null; if (typeof cb === 'function') cb({ ok: true }); }
  }));
  socket.on('i', guard('input', (frames, ack, rtt) => { if (liveRoom()) room.onInput(socket, frames, ack, rtt); }));
  socket.on('vc', guard('voice', (buf) => { if (liveRoom()) room.onVoice(socket, buf); }));
  socket.on('full', guard('full', () => { if (liveRoom()) room.requestFull(socket); }));
  socket.on('a', guard('action', (a, cb) => {
    const now = Date.now();
    if (now - actionsT > 1000) { actionsT = now; actions = 0; }
    if (++actions > 25) { if (typeof cb === 'function') cb({ ok: false, msg: 'Demasiadas acciones por segundo.' }); return; }
    if (liveRoom()) room.onAction(socket, a, cb);
    else if (typeof cb === 'function') cb({ ok: false, msg: 'No estás en una sala.' });
  }));
  socket.on('png', (t, cb) => { if (typeof cb === 'function') cb(t); });

  socket.on('disconnect', guard('disconnect', () => {
    if (profile && sessions.get(profile.name.toLowerCase()) === socket) sessions.delete(profile.name.toLowerCase());
    try { if (liveRoom()) room.removePlayer(socket, false); }
    finally { room = null; }
  }));
});

// ------------------------------------------------------------------ bucle fijo 60 Hz
let seenTicks = 0, totalTicks = 0;
const STEP_NS = BigInt(Math.round(1e9 / C.TICK_RATE));
let last = process.hrtime.bigint();
let acc = 0n;
let statTicks = 0, statTime = 0, statMax = 0;

function runTicks() {
  totalTicks++;
  const now = process.hrtime.bigint();
  acc += now - last;
  last = now;
  if (acc > STEP_NS * 8n) acc = STEP_NS * 8n; // tras una pausa larga no se intenta "recuperar" todo
  while (acc >= STEP_NS) {
    acc -= STEP_NS;
    const t0 = process.hrtime.bigint();
    for (const r of rooms.values()) {
      try { r.update(C.DT); r.errors = 0; }
      catch (e) {
        console.error(`[sala ${r.code}] error en tick:`, e && e.stack || e);
        // Redundancia: si una sala falla de forma persistente, se rescata devolviendo a todos a la Celda
        if (++r.errors > 30) {
          try { r.errors = 0; if (r.run) { r.run.ended = 'fail'; r.backToHub(); } }
          catch (e2) { console.error(`[sala ${r.code}] irrecuperable, se cierra`, e2); io.to(r.code).emit('roomclosed', { msg: 'La sala se cerró por un error interno. Tu progreso está guardado.' }); rooms.delete(r.code); }
        }
      }
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    statTicks++; statTime += ms; if (ms > statMax) statMax = ms;
  }
}

let fallback = false;
function startFallback() {
  if (fallback) return; fallback = true;
  const loop = () => { runTicks(); setTimeout(loop, Math.max(0, Number(STEP_NS - acc) / 1e6 - 1)); };
  loop();
}
try {
  const clock = new Worker(path.join(__dirname, 'server', 'clock.js'), { workerData: { periodMs: 1000 / C.TICK_RATE } });
  clock.on('message', runTicks);
  clock.on('error', (e) => { console.error('[reloj] error, se usa el temporizador de respaldo:', e.message); startFallback(); });
  clock.unref();
} catch (e) { console.error('[reloj] no disponible:', e.message); startFallback(); }
// Latido de seguridad: si el hilo del reloj muriera en silencio, el respaldo toma el control
setInterval(() => { if (!fallback && totalTicks === seenTicks && rooms.size) { console.error('[reloj] sin ticks, activando respaldo'); startFallback(); } seenTicks = totalTicks; }, 3000).unref();

// ------------------------------------------------------------------ telemetría
const loopDelay = monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();
setInterval(() => {
  if (rooms.size && statTicks) {
    const players = [...rooms.values()].reduce((s, r) => s + r.players.size, 0);
    const mem = process.memoryUsage();
    console.log(`[rendimiento] salas=${rooms.size} jugadores=${players} tick medio=${(statTime / statTicks).toFixed(2)}ms máx=${statMax.toFixed(2)}ms · ` +
      `latencia bucle p99=${(loopDelay.percentile(99) / 1e6).toFixed(1)}ms · heap=${(mem.heapUsed / 1048576).toFixed(0)}MB`);
  }
  statTicks = 0; statTime = 0; statMax = 0;
  loopDelay.reset();
}, 30000).unref();

process.on('uncaughtException', (e) => console.error('[proceso] excepción no capturada (el servidor sigue en línea):', e && e.stack || e));
process.on('unhandledRejection', (e) => console.error('[proceso] promesa rechazada:', e && e.stack || e));

server.listen(PORT, '0.0.0.0', () => {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
  console.log('==========================================================');
  console.log('  LEVIATHAN · servidor autoritativo en línea');
  console.log(`  Local:  http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  LAN:    http://${ip}:${PORT}`);
  console.log(`  Cuentas guardadas en: ${Profiles.DIR}`);
  console.log('==========================================================');
});

function shutdown() { Profiles.saveNow(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
