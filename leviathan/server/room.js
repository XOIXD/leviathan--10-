/* LEVIATHAN - Sala autoritativa (Refugio + Misión). El servidor es la única fuente de verdad:
   simula jugadores (con los inputs recibidos), enemigos, balas, coberturas, objetivos cooperativos,
   escalado dinámico de dificultad (DDS) y derrota compartida. Envía snapshots por lotes a 20 Hz. */
const C = require('../shared/constants');
const Phys = require('../shared/physics');
const LevelGen = require('../shared/levelgen');
const Hub = require('../shared/hub');
const Catalog = require('../shared/catalog');
const RNG = require('../shared/rng');
const Profiles = require('./profiles');
const Weapons = require('./weapons');
const Enemies = require('./enemies');
const Campaign = require('../shared/campaign');

const B = C.B;
const TS = C.TILE;
const DT = C.DT;
const HUB = Hub.build();
Phys.buildCoverGrid(HUB);
const MAX_ENEMIES = 140;
const CELL = 128;
const STRESS = process.env.LEVIATHAN_STRESS === '1';
const CRITICAL = new Set(['k', 'end', 'cv', 'gate', 'boss', 'dead', 'down', 'rev', 'msg', 'orbital', 'defuse', 'detx', 'box', 'cache', 'pk', 'mat', 'part', 'lift', 'liftcall', 'elim', 'stk', 'evt']);

const r1 = v => Math.round(v * 10) / 10;

// Acabado de arma por id: catálogo fijo o pieza de temporada ("S2026-11")
function findWSkin(id) { return Catalog.weaponSkins.find(x => x.id === id) || Campaign.seasonCamo(id); }

class Room {
  constructor(code, io, onEmpty) {
    this.code = code;
    this.io = io;
    this.onEmpty = onEmpty;
    this.players = new Map();     // socket.id -> jugador
    this.nextPid = 1;
    this.phase = 'hub';
    this.t = 0;
    this.tick = 0;
    this.events = [];
    this.sel = { solo: -1, coop: -1 };
    this.countdown = -1;
    this.run = null;
    this.npcs = HUB.npcs.map(n => ({
      id: n.id, role: n.role, x: n.x - 14, y: n.y, w: 28, h: 52, vx: 0, vy: 0, onGround: false,
      facing: 1, state: 'idle', timer: 1 + Math.random() * 2, dir: 1, patrol: n.patrol, homeX: n.x - 14, homeY: n.y
    }));
    this.grid = new Map();
    this.mode = 'coop';
    this.max = C.MAX_PLAYERS;
    this.isPublic = false;
    this.pvp = false;
    this.errors = 0;
  }

  // ---------------------------------------------------------------- reglas de acceso y reconexión
  findGhost(name) {
    const k = String(name).toLowerCase();
    for (const p of this.players.values()) if (p.ghost && p.name.toLowerCase() === k) return p;
    return null;
  }
  canJoin(profile) {
    if (this.findGhost(profile.name)) return { ok: true };
    if (this.players.size >= this.max) return { ok: false, msg: `Sala llena (${this.max}/${this.max}).` };
    if (this.phase === 'run') return { ok: false, msg: 'Descenso en curso: no se admiten Núcleos nuevos hasta que el escuadrón vuelva a la Celda.' };
    return { ok: true };
  }
  summary() {
    const host = [...this.players.values()].find(p => !p.ghost);
    const sel = this.selInfo();
    return { code: this.code, mode: this.mode, host: host ? host.name : '—', players: this.players.size, max: this.max, phase: this.phase, label: sel.name, teamSize: this.teamSize || 0, joinable: this.phase === 'hub' && this.players.size < this.max };
  }
  // Ganchos que la Batalla de Escuadrones sobreescribe
  sameTeam() { return true; }
  visiblePlayer() { return true; }
  pvpHit() { return false; }
  pvpExplode() {}
  pvpMelee() {}
  lobbyInfo() { return 0; }
  onPlayerAdded() {}
  requestFull(socket) { const p = this.players.get(socket.id); if (p) { p.ackSeq = -1; p.hist.clear(); } }

  // ---------------------------------------------------------------- utilidades
  emit(d, x, y) { this.events.push({ d, x, y }); }
  msg(text, color) { this.emit(['msg', text, color || 0x39d7ff]); }
  get level() { return this.phase === 'run' && this.run ? this.run.L : HUB; }
  playerById(id) { for (const p of this.players.values()) if (p.id === id) return p; return null; }
  roster() {
    return [...this.players.values()].map(p => ({
      id: p.id, name: p.name, skin: p.profile.skin, trail: p.profile.trail, ready: p.ready,
      wskins: p.profile.wskins || {}, fx: p.profile.fx || 'ninguno', gear: p.profile.gear ? p.profile.gear.equip : {}, cycle: p.profile.cycle ? p.profile.cycle.solo : 0,
      weapon: p.weapon ? Weapons.publicWeapon(p.weapon) : null
    }));
  }
  broadcastRoster() { this.io.to(this.code).emit('roster', { list: this.roster(), sel: this.selInfo() }); }
  sendProfile(p) { p.socket.emit('profile', Profiles.publicView(p.profile)); }
  notifyMissions(p, done) {
    for (const m of done) p.socket.emit('notify', { text: `MISIÓN DIARIA COMPLETADA: ${m.text}. Reclama ${m.reward} créditos en el tablero.`, color: 0x7dff4f });
    if (done.length) this.sendProfile(p);
  }
  mission(p, kind, amount) { if (p && p.profile) this.notifyMissions(p, Profiles.progress(p.profile, kind, amount)); }

  // ---------------------------------------------------------------- jugadores
  addPlayer(socket, profile) {
    // Reconexión limpia: el Núcleo recupera su misma ranura (cuerpo, vida, arma y estado intactos)
    const ghost = this.findGhost(profile.name);
    if (ghost) {
      for (const [k, v] of this.players) if (v === ghost) this.players.delete(k);
      ghost.socket = socket; ghost.ghost = false; ghost.inputs.length = 0; ghost.held = 0; ghost.lastSeq = 0;
      ghost.ackSeq = -1; ghost.hist.clear(); ghost.snapSeq = 0;
      this.players.set(socket.id, ghost);
      socket.join(this.code);
      socket.emit('welcome', this.welcomePayload(ghost));
      this.sendProfile(ghost);
      this.broadcastRoster();
      this.msg(`${ghost.name} ha restablecido la conexión`, 0x7dff4f);
      return ghost;
    }
    const id = this.nextPid++;
    const p = {
      id, socket, name: profile.name, profile, inputs: [], lastSeq: 0, aim: 0, held: 0, prevHeld: 0,
      ready: false, inDialog: false, b: null, hp: 100, maxHp: 100, state: 'alive', downT: 0,
      reviveProg: 0, stimProg: 0, hurtT: 0, weapon: null, ws: null, stims: 0, runCredits: 0, kills: 0,
      aliveStreak: 0, streakTick: 0, critSectors: new Set(), maxSector: 1, visited2: false, curRoom: -1,
      pendingDmg: 0, lastSafe: null, ghost: false, ghostUntil: 0, snapSeq: 0, ackSeq: -1, hist: new Map()
    };
    this.players.set(socket.id, p);
    socket.join(this.code);
    this.onPlayerAdded(p);
    if (this.phase === 'run' && this.run) this.setupRunPlayer(p, true);
    else this.setupHubPlayer(p, this.players.size);
    socket.emit('welcome', this.welcomePayload(p));
    this.sendProfile(p);
    this.broadcastRoster();
    this.msg(`${p.name} se ha unido (${this.players.size}/${this.max})`, 0x7dff4f);
    return p;
  }

  removePlayer(socket, voluntary) {
    const p = this.players.get(socket.id);
    if (!p) return;
    socket.leave(this.code);
    // Desconexión abrupta en plena misión: el cuerpo queda en el mundo 25 s (sin inmunidad: no se puede
    // escapar del peligro desconectándose). Si vuelve a tiempo, recupera su ranura.
    if (!voluntary && this.phase === 'run' && this.run && !this.run.ended && p.state !== 'dead') {
      p.ghost = true; p.ghostUntil = Date.now() + 25000; p.inputs.length = 0; p.held = 0; p.inDialog = false;
      this.msg(`${p.name} perdió la conexión · su exotraje espera 25 s`, 0xffb020);
      this.broadcastRoster();
      return;
    }
    this.players.delete(socket.id);
    Profiles.save();
    this.msg(`${p.name} ha abandonado ${this.mode === 'br' ? 'la batalla' : 'el escuadrón'}`, 0xff7b54);
    this.broadcastRoster();
    if (this.phase === 'run' && this.run) this.computeDDS(false);
    if (this.players.size === 0) this.onEmpty(this);
  }

  expireGhosts() {
    const now = Date.now();
    let changed = false;
    for (const [k, p] of this.players) {
      if (!p.ghost || (now < p.ghostUntil && this.phase === 'run')) continue;
      this.players.delete(k);
      changed = true;
      this.msg(`${p.name} no regresó a tiempo`, 0xff7b54);
    }
    if (changed) { this.broadcastRoster(); if (this.players.size === 0) this.onEmpty(this); }
  }

  welcomePayload(p) {
    const w = { id: p.id, room: this.code, phase: this.phase, sel: this.selInfo(), t: this.t };
    if (this.phase === 'run' && this.run) w.run = this.runInfo();
    return w;
  }

  // ---------------------------------------------------------------- campaña
  variant() { return this.players.size > 1 ? 'coop' : 'solo'; }
  descList(v) { return Campaign.descents(v || this.variant()); }
  fixSel() {
    for (const v of ['solo', 'coop']) {
      const list = Campaign.descents(v);
      if (this.sel[v] < 0 || this.sel[v] >= list.length) {
        const first = [...this.players.values()][0];
        this.sel[v] = first ? Math.min(list.length - 1, first.profile.story[v] || 0) : 0;
      }
    }
  }
  selInfo() {
    this.fixSel();
    const v = this.variant(), d = this.descList(v)[this.sel[v]];
    return { variant: v, idx: this.sel[v], id: d.id, name: d.name, layer: d.layer, boss: d.boss };
  }

  runInfo() {
    const R = this.run;
    return {
      seed: R.seed, n: R.n, variant: R.variant, idx: R.D.idx, cycle: R.cycle,
      destroyed: R.L.covers.filter(c => !c.alive).map(c => c.id),
      openGates: R.gates.filter(g => g.open).map(g => g.id),
      caches: [...R.cachesTaken], boxes: [...R.boxesTaken], boxesActive: R.boxesActive
    };
  }

  setupHubPlayer(p, idx) {
    const b = Phys.makePlayerBody(HUB.spawn.x + ((idx % 5) - 2) * 36, HUB.spawn.y);
    p.b = b; p.state = 'alive'; p.hp = p.maxHp = 100 + 15 * p.profile.upgrades.vida;
    p.inputs.length = 0; p.ready = false; p.inDialog = false; p.ackSeq = -1; if (p.hist) p.hist.clear();
  }

  setupRunPlayer(p, late) {
    const R = this.run;
    const prof = p.profile, mods = prof.mods || {};
    let sx = R.L.spawn.x + ((p.id % 6) - 3) * 26, sy = R.L.spawn.y;
    if (late) {
      const mate = [...this.players.values()].find(q => q !== p && q.state === 'alive' && q.b);
      if (mate) { sx = mate.b.x; sy = mate.b.y - 4; }
    }
    p.b = Phys.makePlayerBody(sx, sy);
    p.b.dashCdMul = (1 - 0.08 * prof.upgrades.dash) * (mods.reactor_quimera ? 0.85 : 1);
    p.maxHp = 100 + 15 * prof.upgrades.vida;
    p.hp = p.maxHp; p.state = 'alive'; p.downT = 0; p.reviveProg = 0; p.stimProg = 0; p.hurtT = 0;
    p.inputs.length = 0; p.ready = false; p.inDialog = false; p.ackSeq = -1; if (p.hist) p.hist.clear();
    p.dmgMul = 1 + 0.08 * prof.upgrades.dano;
    const rng = new RNG((R.seed ^ Math.imul(p.id + 13, 2654435761)) >>> 0);
    prof.forceNail = this.mode !== 'br' && !prof.contract && prof.credits < 300 && !prof.admin;
    p.weapon = Weapons.generateWeapon(rng, prof);
    if (prof.forceNail) this.msg(`${p.name} bajó sin arma comprada: recibe una PISTOLA DE CLAVOS (mitad de daño, sin habilidades)`, 0xff6b6b);
    prof.forceNail = false;
    p.b.ads = p.weapon.arch === 'rifle' || !!p.weapon.ads;
    prof.contract = null; prof.rarityBoost = false;
    p.ws = { cd: 0, altCd: 0, ammo: p.weapon.mag || 0, reloadT: 0, combo: 0, mode: 'axe', transformT: 0, prev: 0, cookT: 0, bloom: 0, lastShot: -9, tac: false };
    p.stims = 1 + prof.upgrades.kit + (prof.extraStims || 0) + (mods.bolsa_tactica ? 1 : 0);
    prof.extraStims = 0;
    p.grenades = 2 + (mods.reactor_quimera ? 1 : 0) + (mods.bolsa_tactica ? 1 : 0);
    p.armor = mods.placas_capataz ? 0.88 : 1;
    p.regen = !!mods.sistema_matriarca;
    p.lastHurt = -10; p.streak = 0; p.streakBank = []; p.ads = false;
    p.bag = {}; p.gKills = 0; p.coversBroken = 0; p.wasDowned = false;
    p.runCredits = 0; p.kills = 0; p.aliveStreak = 0; p.critSectors = new Set(); p.maxSector = 1;
    p.visited2 = false; p.curRoom = -1; p.lastSafe = { x: sx, y: sy };
    // Equipo de jefe (Monster Hunter): estadísticas por pieza + bonificaciones de conjunto
    const gear = (prof.gear && prof.gear.equip) || {};
    const cnt = {};
    let ghp = 0, garm = 0, gdmg = 0, gspd = 0;
    for (const slot of Object.keys(Campaign.SLOTS)) {
      const setId = gear[slot];
      if (!setId || !Campaign.gearSets[setId] || !(prof.gear.owned || []).includes(Campaign.gearId(setId, slot))) continue;
      const st = Campaign.gearSets[setId].stats[slot];
      ghp += st.hp || 0; garm += st.armor || 0; gdmg += st.dmg || 0; gspd += st.speed || 0;
      cnt[setId] = (cnt[setId] || 0) + 1;
    }
    p.setB = cnt;
    if ((cnt.quimera || 0) >= 2) gspd += 0.08;
    if ((cnt.ferroso || 0) >= 2) garm += 0.1;
    p.maxHp += ghp; p.hp = p.maxHp;
    p.armor *= Math.max(0.5, 1 - garm);
    p.dmgMul *= 1 + gdmg;
    // Exotraje táctico: perfil pasivo + peso del arma (la M42 frena, las dagas aligeran)
    const suit = Catalog.skins.find(x => x.id === prof.skin);
    const ps = (suit && suit.pass) || {};
    p.maxHp = Math.max(40, p.maxHp + (ps.hp || 0)); p.hp = p.maxHp;
    p.armor *= 1 - (ps.armor || 0);
    p.dmgMul *= 1 + (ps.dmg || 0);
    p.grenades += ps.gren || 0; p.stims += ps.stims || 0;
    if (ps.regen) p.regen = true;
    p.b.dashCdMul = (p.b.dashCdMul || 1) * (1 - (ps.dash || 0));
    p.b.speedMul = (1 + gspd + (ps.speed || 0)) * (p.weapon.move || 1);
    if ((cnt.corazon || 0) >= 2) p.stims++;
    if ((cnt.escolta || 0) >= 2) p.grenades++;
    p.heartUsed = false; p.gType = 0;
    p.ws.perfT = 0; p.ws.meleeCd = 0; p.ws.reloadTotal = 1; p.ws.fumbled = false;
  }

  onInput(socket, frames, ack) {
    const p = this.players.get(socket.id);
    if (!p || !Array.isArray(frames) || frames.length > 60) return;
    if (Number.isInteger(ack) && ack > p.ackSeq && ack <= p.snapSeq) p.ackSeq = ack;
    for (const f of frames) {
      if (!Array.isArray(f) || f.length < 3) continue;
      const seq = f[0] | 0, b = (f[1] | 0) & 0x3fff, aim = +f[2];
      if (seq <= p.lastSeq || !isFinite(aim) || Math.abs(aim) > 7000) continue;
      p.inputs.push(seq, b, aim / 1000);
    }
    if (p.inputs.length > 40 * 3) p.inputs.splice(0, p.inputs.length - 40 * 3);
  }

  // ---------------------------------------------------------------- acciones del refugio
  nearRole(p, role) {
    const px = p.b.x + p.b.w / 2, py = p.b.y + p.b.h / 2;
    if (role === 'board') return Math.abs(px - (HUB.board.x + HUB.board.w / 2)) < 150 && Math.abs(py - (HUB.board.y - 40)) < 150;
    const n = this.npcs.find(nn => nn.role === role);
    return n && Math.abs(px - (n.x + n.w / 2)) < 150 && Math.abs(py - (n.y + n.h / 2)) < 150;
  }

  onAction(socket, a, cb) {
    const p = this.players.get(socket.id);
    const reply = (ok, msg) => { if (typeof cb === 'function') cb({ ok, msg, profile: p ? Profiles.publicView(p.profile) : null }); };
    if (!p || !a || typeof a.type !== 'string') return reply(false, 'Acción inválida');
    const prof = p.profile;
    // Chat táctico de sala: texto saneado, 120 caracteres, 1 mensaje cada 0,8 s
    if (a.type === 'chat') {
      const now = Date.now();
      const txt = String(a.text || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 120);
      if (!txt || (p.chatAt || 0) > now) return reply(false, '');
      if (prof.admin && txt.toLowerCase() === '/inmortal') { prof.god = !prof.god; Profiles.save(); this.msg(`ADMIN · inmortalidad ${prof.god ? 'ACTIVADA' : 'DESACTIVADA'}`, 0xffd34a); return reply(true, ''); }
      p.chatAt = now + 800;
      this.io.to(this.code).emit('chat', [p.id, p.name, txt]);
      return reply(true, '');
    }
    // Clasificación global (terminal del robot junto a Vex)
    if (a.type === 'ranking') {
      if (!this.nearRole(p, 'ranker')) return reply(false, 'Estás demasiado lejos.');
      if (typeof cb === 'function') cb({ ok: true, board: Profiles.leaderboard(prof.name, a.cat) });
      return;
    }
    // Espectador táctico: marcar posición (vivos o caídos) · 1 marca cada 1,5 s
    if (a.type === 'ping') {
      const R = this.run;
      if (!R || R.ended || !isFinite(a.x) || !isFinite(a.y) || (p.pingT || 0) > this.t) return reply(false, '');
      p.pingT = this.t + 1.5;
      const rid = LevelGen.roomIdAt(R.L, a.x, a.y);
      this.emit(['ping', Math.round(a.x), Math.round(a.y), p.id]);
      this.msg(`${p.name} ${p.state === 'alive' ? 'marca' : '(cámara)'} contacto en sector ${rid >= 0 ? rid + 1 : '?'}`, 0xff6b6b);
      return reply(true, '');
    }
    // Micro-drone de rescate: 150 de biomasa de la misión → 2,5 s de blindaje, +35% vida y dron de apoyo
    if (a.type === 'rescue') {
      const R = this.run;
      if (!R || R.ended || p.state !== 'alive') return reply(false, 'No disponible.');
      if (p.runCredits < 150) return reply(false, 'Necesitas 150 de biomasa de la misión.');
      if ((p.rescueCd || 0) > R.t) return reply(false, `Dron de rescate recargando (${Math.ceil(p.rescueCd - R.t)} s).`);
      p.runCredits -= 150; p.rescueCd = R.t + 45; p.rescueT = R.t + 2.5;
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.35);
      p.streakBank.push('dron'); this.useStreak(p);
      this.emit(['rescue', p.id]);
      return reply(true, 'Dron de rescate desplegado.');
    }
    if (a.type === 'dialog') { p.inDialog = !!a.open; p.dialogRole = a.role || null; return reply(true, ''); }
    if (a.type === 'truth') {
      if ((prof.cycle.solo || 0) < Campaign.TRUE_CYCLES || !['romper', 'fusion'].includes(a.id)) return reply(false, 'Decisión no disponible.');
      prof.truthChoice = a.id; Profiles.save(); return reply(true, '');
    }
    if (a.type === 'seen') { prof.seen[String(a.id).slice(0, 24)] = true; Profiles.save(); return reply(true, ''); }
    // Herramienta de depuración (sólo con LEVIATHAN_DEV=1; jamás activa en producción)
    if (a.type === 'dev' && (process.env.LEVIATHAN_DEV === '1' || prof.admin)) {
      const R = this.run;
      if (a.cmd === 'weapon' && ['katana', 'rifle', 'axe', 'pistol', 'smg', 'shotgun', 'sniper', 'lmg', 'dagas', 'cetro'].includes(a.id)) prof.contract = a.id;
      else if (a.cmd === 'descent' && this.phase === 'hub') { prof.story[this.variant()] = 99; this.sel[this.variant()] = a.idx | 0; this.fixSel(); }
      else if (a.cmd === 'arena' && R) { const A = R.L.arena; p.b.x = A.x + 200; p.b.y = A.floorTop - p.b.h - 2; p.b.vx = p.b.vy = 0; }
      else if (a.cmd === 'gate' && R && R.gates[0]) { const t = R.gates[0].terminals[0]; p.b.x = t.x - 300; p.b.y = t.y - p.b.h - 2; p.b.vx = p.b.vy = 0; }
      else if (a.cmd === 'apagon' && R) R.event = { id: 'apagon', t: 25 };
      else if (a.cmd === 'heal' && R) { p.hp = p.maxHp; if (p.state !== 'alive') { p.state = 'alive'; p.downT = 0; } p.grenades = 5; }
      return reply(true, 'dev ' + a.cmd);
    }
    if (a.type === 'evac') return reply(...this.startEvac(p));
    if (this.phase !== 'hub') return reply(false, 'No disponible durante una misión.');
    const recipe = a.type === 'craft' ? Campaign.recipes.find(r => r.id === a.id) : null;
    const need = a.type === 'craft' ? (recipe ? recipe.npc : null) : {
      seasonClaim: 'tailor', buySkin: 'tailor', equipSkin: 'tailor', buyTrail: 'tailor', equipTrail: 'tailor', buyWSkin: 'tailor', equipWSkin: 'tailor', buyFx: 'tailor', equipFx: 'tailor',
      upgrade: 'mechanic', craftGear: 'mechanic', equipGear: 'mechanic', contract: 'trafficker', rarity: 'trafficker', stim: 'trafficker',
      campaign: 'commander', ready: 'commander', streakSet: 'commander', side: 'commander', cycle: 'commander', claim: 'board'
    }[a.type];
    if (!need) return reply(false, 'Acción desconocida');
    if (!this.nearRole(p, need)) return reply(false, 'Estás demasiado lejos.');
    let res = { ok: false, msg: '' };
    const pay = (cost) => { if (prof.credits < cost) return false; prof.credits -= cost; return true; };
    switch (a.type) {
      case 'buySkin': {
        const s = Catalog.skins.find(x => x.id === a.id);
        const err2 = s && s.cost && !prof.skins.includes(s.id) ? Profiles.payCost(prof, s.cost) : null;
        if (!s || (s.price < 0 && !s.cost)) res.msg = 'Este exotraje no está a la venta.';
        else if (prof.skins.includes(s.id)) res.msg = 'Ya lo posees.';
        else if (s.cost ? err2 : !pay(s.price)) res.msg = s.cost ? err2 : 'Biomasa insuficiente.';
        else { prof.skins.push(s.id); prof.skin = s.id; res = { ok: true, msg: `${s.name} adquirido y equipado.` }; }
        break;
      }
      case 'equipSkin':
        if (!prof.skins.includes(a.id)) res.msg = 'No posees ese exotraje.';
        else { prof.skin = a.id; res = { ok: true, msg: 'Exotraje equipado.' }; }
        break;
      case 'buyTrail': {
        const t = Catalog.trails.find(x => x.id === a.id);
        if (!t || t.price < 0) res.msg = 'Esta estela no está a la venta.';
        else if (prof.trails.includes(t.id)) res.msg = 'Ya la posees.';
        else if (!pay(t.price)) res.msg = 'Biomasa insuficiente.';
        else { prof.trails.push(t.id); prof.trail = t.id; res = { ok: true, msg: `Estela ${t.name} instalada.` }; }
        break;
      }
      case 'buyWSkin': {
        const ws = findWSkin(a.id);
        if (!ws) { res.msg = 'Acabado desconocido.'; break; }
        if (prof.wskinOwned.includes(ws.id)) { res.msg = 'Ya posees ese acabado.'; break; }
        if (ws.legacy) { res.msg = 'Pieza retirada: ya no puede obtenerse.'; break; }
        if (ws.season) { res.msg = ws.season === Campaign.seasonId() ? 'Se obtiene en el Pase de Temporada de NOVA.' : 'Esa temporada terminó: la pieza ya no puede obtenerse.'; break; }
        if (ws.price < 0 && !ws.cost) { res.msg = 'Acabado exclusivo: no está a la venta.'; break; }
        const err = ws.cost ? Profiles.payCost(prof, ws.cost) : (pay(ws.price) ? null : 'Biomasa insuficiente.');
        if (err) { res.msg = err; break; }
        prof.wskinOwned.push(ws.id);
        if (ws.arch) prof.wskins[ws.arch] = ws.id;   // se equipa al instante en su arma
        res = { ok: true, msg: ws.arch ? `Acabado ${ws.name} desbloqueado.` : `Acabado ${ws.name} desbloqueado para todas tus armas.` };
        break;
      }
      case 'equipWSkin':
        if (!prof.wskinOwned.includes(a.id)) res.msg = 'No posees ese acabado.';
        else if (!['katana', 'rifle', 'axe', 'pistol', 'smg', 'shotgun', 'sniper', 'lmg', 'dagas', 'cetro'].includes(a.arch)) res.msg = 'Arma inválida.';
        else if (findWSkin(a.id) && findWSkin(a.id).arch && findWSkin(a.id).arch !== a.arch) res.msg = 'Ese camuflaje está diseñado para otra arma.';
        else { prof.wskins[a.arch] = a.id; res = { ok: true, msg: 'Acabado aplicado.' }; }
        break;
      case 'buyFx': {
        const fx = Catalog.killFx.find(x => x.id === a.id);
        if (!fx || fx.price < 0) res.msg = 'Efecto exclusivo: no está a la venta.';
        else if (prof.fxOwned.includes(fx.id)) res.msg = 'Ya posees ese efecto.';
        else if (!pay(fx.price)) res.msg = 'Biomasa insuficiente.';
        else { prof.fxOwned.push(fx.id); prof.fx = fx.id; res = { ok: true, msg: `Efecto ${fx.name} equipado.` }; }
        break;
      }
      case 'equipFx':
        if (!prof.fxOwned.includes(a.id)) res.msg = 'No posees ese efecto.';
        else { prof.fx = a.id; res = { ok: true, msg: 'Efecto equipado.' }; }
        break;
      case 'craftGear': {
        const set = Campaign.gearSets[a.set];
        if (!set || !Campaign.SLOTS[a.slot]) { res.msg = 'Pieza inválida.'; break; }
        const gid = Campaign.gearId(a.set, a.slot);
        if (prof.gear.owned.includes(gid)) { res.msg = 'Ya forjaste esa pieza.'; break; }
        const err = Profiles.payCost(prof, Campaign.gearCost(a.set, a.slot));
        if (err) { res.msg = err; break; }
        prof.gear.owned.push(gid); prof.gear.equip[a.slot] = a.set;
        this.mission(p, 'craft', 1);
        res = { ok: true, msg: `${set.name} · ${Campaign.SLOTS[a.slot]} forjado y equipado.` };
        break;
      }
      case 'equipGear':
        if (!Campaign.SLOTS[a.slot]) res.msg = 'Ranura inválida.';
        else if (!a.set) { delete prof.gear.equip[a.slot]; res = { ok: true, msg: 'Pieza retirada.' }; }
        else if (!prof.gear.owned.includes(Campaign.gearId(a.set, a.slot))) res.msg = 'No posees esa pieza.';
        else { prof.gear.equip[a.slot] = a.set; res = { ok: true, msg: 'Pieza equipada.' }; }
        break;
      case 'equipTrail':
        if (!prof.trails.includes(a.id)) res.msg = 'No posees esa estela.';
        else { prof.trail = a.id; res = { ok: true, msg: 'Estela equipada.' }; }
        break;
      case 'upgrade': {
        const u = Catalog.upgrades.find(x => x.id === a.id);
        if (!u) { res.msg = 'Mejora desconocida.'; break; }
        const lvl = prof.upgrades[u.id] || 0;
        const cost = Catalog.upgradeCost(u, lvl);
        if (lvl >= u.max) res.msg = 'Nivel máximo alcanzado.';
        else if (!pay(cost)) res.msg = 'Biomasa insuficiente.';
        else { prof.upgrades[u.id] = lvl + 1; res = { ok: true, msg: `${u.name} → nivel ${lvl + 1}.` }; }
        if (res.ok && u.id === 'vida') p.hp = p.maxHp = 100 + 15 * prof.upgrades.vida;
        break;
      }
      case 'contract':
        if (!Catalog.archetypes[a.id] || (a.id === 'cetro' && !(prof.arms || []).includes('cetro'))) res.msg = 'Contrato inválido.';
        else if (prof.contract === a.id) res.msg = 'Ese contrato ya está activo.';
        else if (!pay(Catalog.arms[a.id] ? 600 : 300)) res.msg = 'Biomasa insuficiente.';
        else { prof.contract = a.id; res = { ok: true, msg: `Contrato firmado: ${Catalog.archetypes[a.id]} en tu próximo descenso.` }; }
        break;
      case 'rarity':
        if (prof.rarityBoost) res.msg = 'Ya tienes un núcleo de rareza instalado.';
        else if (!pay(250)) res.msg = 'Biomasa insuficiente.';
        else { prof.rarityBoost = true; res = { ok: true, msg: 'Núcleo de rareza instalado para el próximo descenso.' }; }
        break;
      case 'stim':
        if ((prof.extraStims || 0) >= 2) res.msg = 'Llevas el máximo de estimulantes extra (2).';
        else if (!pay(90)) res.msg = 'Biomasa insuficiente.';
        else { prof.extraStims = (prof.extraStims || 0) + 1; res = { ok: true, msg: 'Estimulante de reanimación añadido.' }; }
        break;
      case 'craft':
        res = Profiles.craft(prof, a.id);
        if (res.ok) this.mission(p, 'craft', 1);
        break;
      case 'campaign': {
        const v = this.variant(), list = this.descList(v), i = a.id | 0;
        if (i < 0 || i >= list.length) res.msg = 'Descenso inválido.';
        else if (i > (prof.story[v] || 0)) res.msg = 'Aún no has llegado tan hondo en esta campaña.';
        else {
          this.sel[v] = i;
          res = { ok: true, msg: `Objetivo fijado: ${list[i].name}` };
          this.msg(`${p.name} fijó el objetivo: ${list[i].name}`, 0x39d7ff);
        }
        break;
      }
      case 'streakSet':
        if (!Campaign.streakSets[a.id]) res.msg = 'Paquete inválido.';
        else { prof.streakSet = a.id; res = { ok: true, msg: `${Campaign.streakSets[a.id].name} equipado.` }; }
        break;
      case 'side':
        if (!a.id) { prof.side = null; res = { ok: true, msg: 'Contrato de campo cancelado.' }; }
        else if (!prof.sideOffer.ids.includes(a.id)) res.msg = 'Ese contrato no está disponible hoy.';
        else { prof.side = a.id; res = { ok: true, msg: 'Contrato de campo aceptado para el próximo descenso.' }; }
        break;
      case 'cycle': {
        const v = this.variant(), list = this.descList(v);
        if ((prof.story[v] || 0) < list.length) res.msg = 'Completa primero la campaña para iniciar un nuevo ciclo.';
        else {
          prof.cycle[v] = (prof.cycle[v] || 0) + 1; prof.story[v] = 0; this.sel[v] = 0;
          res = { ok: true, msg: `CICLO ${prof.cycle[v]} iniciado: la colmena es más fuerte y el botín mayor.` };
        }
        break;
      }
      case 'ready':
        p.ready = !p.ready;
        res = { ok: true, msg: p.ready ? 'Listo para el descenso.' : 'Has cancelado tu preparación.' };
        if (p.ready && this.mode !== 'br' && !prof.contract && prof.credits < 300 && !prof.admin) res.msg = '⚠ NO ESTÁS LISTO: sin arma comprada en la armería y sin biomasa, bajarás con una Pistola de clavos estropeada.';
        this.msg(`${p.name} ${p.ready ? 'está LISTO' : 'ya no está listo'}`, p.ready ? 0x7dff4f : 0xffb020);
        break;
      case 'claim':
        res = Profiles.claim(prof, a.id);
        break;
      case 'seasonClaim':
        res = Profiles.claimSeason(prof, a.tier);
        break;
    }
    if (res.ok) { Profiles.save(); this.sendProfile(p); this.broadcastRoster(); }
    reply(res.ok, res.msg);
  }

  update(dt) {
    this.t += dt;
    this.tick++;
    if (this.tick % 30 === 0) this.expireGhosts();
    if (this.phase === 'hub') this.updateHub(dt);
    else this.updateRun(dt);
    if (this.tick % C.SNAP_EVERY === 0) this.flush();
  }

  consumeInputs(p, L, fn) {
    const q = p.inputs;
    const frames = q.length > 18 ? 3 : (q.length > 0 ? 1 : 0);
    for (let i = 0; i < frames && q.length; i++) {
      const seq = q.shift(), b = q.shift(), aim = q.shift();
      p.lastSeq = seq; p.aim = aim;
      p.prevHeld = p.held;
      const eff = p.inDialog ? 0 : b;
      p.held = eff;
      L.time = this.t - (frames - 1 - i) * DT;
      fn(eff);
    }
  }

  updateHub(dt) {
    for (const p of this.players.values()) {
      this.consumeInputs(p, HUB, (b) => {
        p.b.ctrl = true;
        const ev = Phys.stepPlayer(HUB, p.b, b, DT);
        if (ev & 4) this.emit(['dash', p.id]);
        if (ev & 2) this.emit(['jump2', p.id]);
      });
      if (p.b.y > HUB.th * TS) { p.b.x = HUB.spawn.x; p.b.y = HUB.spawn.y; p.b.vy = 0; }
    }
    // NPCs con física real (gravedad + colisiones), patrulla y atención al jugador
    for (const n of this.npcs) {
      const talker = [...this.players.values()].find(p => p.inDialog && p.dialogRole === n.role);
      n.timer -= dt;
      if (talker) {
        n.state = 'idle'; n.vx = 0;
        n.facing = (talker.b.x + talker.b.w / 2) > (n.x + n.w / 2) ? 1 : -1;
      } else {
        if (n.timer <= 0) {
          if (n.state === 'idle') { n.state = 'walk'; n.dir = Math.random() < 0.5 ? -1 : 1; n.timer = 1.5 + Math.random() * 2; }
          else { n.state = 'idle'; n.timer = 2 + Math.random() * 3; }
        }
        if (n.state === 'walk') {
          if (n.x < n.patrol[0]) n.dir = 1;
          if (n.x + n.w > n.patrol[1]) n.dir = -1;
          n.vx = n.dir * 45; n.facing = n.dir;
        } else n.vx = 0;
      }
      Phys.stepGroundBody(HUB, n, dt);
      if (n.hitWall) n.dir *= -1;
      if (n.y > HUB.th * TS || !isFinite(n.y)) { n.x = n.homeX; n.y = n.homeY; n.vy = 0; }
    }
    // Cuenta regresiva de descenso
    const all = [...this.players.values()];
    if (all.length && all.every(p => p.ready)) {
      if (this.countdown < 0) { this.countdown = 4; this.msg('TODOS LISTOS · DESCENSO EN 4 SEGUNDOS', 0x7dff4f); }
      this.countdown -= dt;
      if (this.countdown <= 0) { this.countdown = -1; this.startRun(); }
    } else if (this.countdown >= 0) { this.countdown = -1; this.msg('Descenso abortado: no todos están listos', 0xffb020); }
    // Quórum: un jugador ausente (AFK) no puede bloquear la sala para siempre.
    // Con ≥60 % listos, a los 45 s se desciende igualmente (los no listos van con el escuadrón).
    const rc = all.filter(p => p.ready).length;
    if (all.length >= 3 && rc < all.length && rc >= Math.ceil(all.length * 0.6)) {
      if (this.quorumT < 0 || this.quorumT === undefined) { this.quorumT = 45; this.msg(`QUÓRUM ${rc}/${all.length} · DESCENSO AUTOMÁTICO EN 45 s (marca LISTO con Vex)`, 0xffb020); }
      const before = this.quorumT;
      this.quorumT -= dt;
      if (before > 10 && this.quorumT <= 10) this.msg('DESCENSO AUTOMÁTICO EN 10 s', 0xffb020);
      if (this.quorumT <= 0) {
        this.quorumT = -1;
        for (const p of all) { p.ready = true; p.inDialog = false; }
        this.countdown = -1;
        this.startRun();
      }
    } else this.quorumT = -1;
  }

  // ---------------------------------------------------------------- misión (run)
  startRun() {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const n = this.players.size;
    const variant = this.variant();
    this.fixSel();
    const D = this.descList(variant)[this.sel[variant]];
    const cycle = Math.max(0, ...[...this.players.values()].map(p => p.profile.cycle[variant] || 0));
    const L = LevelGen.generate(seed, n, D.gen);
    for (const cv of L.covers) { cv.alive = true; cv.hp = cv.maxHp; }
    Phys.buildCoverGrid(L);
    const layer = Campaign.layers[D.layer - 1];
    const season = Campaign.season();
    const desc = {
      name: D.name,
      hpMul: D.hpMul * (1 + 0.35 * cycle),
      dmgMul: D.dmgMul * (1 + 0.15 * cycle),
      reward: D.reward * (1 + 0.3 * cycle) * (season.fx === 'cred' ? 1.25 : season.fx === 'swarm' ? 1.2 : 1)
    };
    const rng = new RNG(seed ^ 0x9e3779b9);
    this.run = {
      L, seed, n, variant, D, layer, desc, cycle, season, t: 0, enemies: new Map(), bullets: [], pool: [],
      nextEid: 1, nextBid: 1, activated: new Set(), roomCounts: new Map(), secondWave: new Set(),
      gates: L.gates.map(g => ({ id: g.id, roomId: g.roomId, tiles: g.tiles, terminals: g.terminals, active: false, open: false, progress: 0, waveT: 3, occ: 0 })),
      dets: L.detonators.map(d => ({ id: d.id, roomId: d.roomId, bombs: d.bombs, active: false, done: 0, timer: 50, prog: d.bombs.map(() => 0), defused: d.bombs.map(() => false) })),
      pylons: L.arena.pylons.map(pp => ({ id: pp.id, x: pp.x, y: pp.y, charge: 1 })),
      vents: 0, bossId: 0, pickups: [], nextPk: 1, cachesTaken: new Set(),
      dds: { alive: n, hpMul: desc.hpMul, dmgMul: desc.dmgMul, aggro: 1, spawnMul: 1 },
      wipeT: -1, ended: null, endT: 0, victoryT: -1, rng,
      allies: [], strikes: [], uavT: 0, shieldT: 0, event: null, eventT: 55 + rng.next() * 30,
      extract: null, orbitalT: -1, boxesTaken: new Set(), boxesActive: false, targetId: 0, targetRoom: -1, targetDone: false,
      matMul: season.fx === 'mat' ? 1.3 : 1
    };
    const R = this.run;
    const sides = new Set([...this.players.values()].map(p => p.profile.side).filter(Boolean));
    R.boxesActive = sides.has('cajas');
    if (sides.has('objetivo')) {
      const cands = L.rooms.filter(r => r.type === 'combat' && r.pathIdx > 1);
      if (cands.length) R.targetRoom = rng.pick(cands).id;
    }
    this.phase = 'run';
    this.events.length = 0;
    for (const p of this.players.values()) { this.setupRunPlayer(p, false); p.profile.stats.runs++; }
    this.computeDDS(true);
    Profiles.save();
    this.io.to(this.code).emit('run', this.runInfo());
    for (const p of this.players.values()) this.sendProfile(p);
    this.broadcastRoster();
    const mode = variant === 'coop' ? `HISTORIA COOPERATIVA · ${n} NÚCLEOS` : 'MODO HISTORIA';
    this.msg(`${D.name.toUpperCase()} · ${mode}${cycle ? ' · CICLO ' + cycle : ''} · AMENAZA x${R.dds.hpMul.toFixed(2)}`, 0x39d7ff);
    this.msg(`Temporada: ${season.name} (${season.desc})`, 0xb05cff);
  }

  computeDDS(force) {
    const R = this.run;
    const a = Math.max(1, [...this.players.values()].filter(p => p.state === 'alive').length);
    if (!force && a === R.dds.alive) return;
    const coop = R.variant === 'coop';
    const d = R.desc;
    const hpMul = d.hpMul * Math.pow(coop ? 1.3 : 1.25, a - 1);
    const marea = R.event && R.event.id === 'marea' ? 1.25 : 1;
    R.dds = {
      alive: a, hpMul,
      dmgMul: d.dmgMul * (1 + (coop ? 0.12 : 0.1) * (a - 1)) * marea,
      aggro: 1 + (coop ? 0.08 : 0.07) * (a - 1),
      spawnMul: 1 + (coop ? 0.45 : 0.35) * (a - 1)
    };
    for (const e of R.enemies.values()) {
      const ratio = e.hp / e.maxHp;
      e.maxHp = e.baseHp * hpMul * (e.marked ? 1.8 : 1) * (e.bounty ? 1.5 : 1);
      e.hp = Math.max(1, ratio * e.maxHp);
    }
  }

  rebuildGrid() {
    for (const arr of this.grid.values()) arr.length = 0;
    for (const e of this.run.enemies.values()) {
      const x0 = Math.floor(e.x / CELL), x1 = Math.floor((e.x + e.w) / CELL);
      const y0 = Math.floor(e.y / CELL), y1 = Math.floor((e.y + e.h) / CELL);
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
        const k = gx * 4096 + gy;
        let arr = this.grid.get(k);
        if (!arr) { arr = []; this.grid.set(k, arr); }
        arr.push(e);
      }
    }
  }

  queryEnemies(x, y, w, h, out) {
    out.length = 0;
    const x0 = Math.floor(x / CELL), x1 = Math.floor((x + w) / CELL);
    const y0 = Math.floor(y / CELL), y1 = Math.floor((y + h) / CELL);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const arr = this.grid.get(gx * 4096 + gy);
      if (!arr) continue;
      for (const e of arr) {
        if (e.dead || out.includes(e)) continue;
        if (x < e.x + e.w && x + w > e.x && y < e.y + e.h && y + h > e.y) out.push(e);
      }
    }
    return out;
  }

  // Contexto que la IA de enemigos usa para interactuar con el mundo
  ctx() {
    const self = this;
    if (!this._ctx) {
      this._ctx = {
        get L() { return self.run.L; },
        get dds() { return self.run.dds; },
        get t() { return self.run.t; },
        alivePlayers: [],
        player: id => { const p = self.playerById(id); return p && p.state === 'alive' ? p : null; },
        findTarget: (e, range, los) => self.findTarget(e, range, los),
        enemyBullet: (x, y, a, spd, dmg, kind) => self.spawnBullet(x, y, Math.cos(a) * spd, Math.sin(a) * spd, 1, 0, dmg, kind, 2.5),
        explode: (x, y, r, dmg, team, owner) => self.explode(x, y, r, dmg, team, owner),
        spawnEnemy: (type, x, y, roomId) => self.spawnEnemy(type, x, y, roomId),
        emit: d => self.emit(d),
        hurtPlayer: (p, dmg, sx, sy, cont) => self.hurtPlayer(p, dmg, sx, sy, cont),
        killEnemy: (e, k, credit) => self.killEnemy(e, k, credit),
        partBreak: (e, ph) => self.partBreak(e, ph)
      };
    }
    this._ctx.alivePlayers = [...this.players.values()].filter(p => p.state === 'alive');
    return this._ctx;
  }

  findTarget(e, range, los) {
    let best = null, bd = range * range;
    const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
    for (const p of this.players.values()) {
      if (p.state !== 'alive') continue;
      const dx = p.b.x + p.b.w / 2 - ex, dy = p.b.y + p.b.h / 2 - ey;
      const d = dx * dx + dy * dy;
      if (d >= bd) continue;
      if (los && !Phys.lineOfSight(this.run.L, ex, e.y + 6, p.b.x + p.b.w / 2, p.b.y + p.b.h / 2, false)) continue;
      bd = d; best = p;
    }
    return best;
  }

  spawnEnemy(type, x, y, roomId, kind) {
    const R = this.run;
    if (R.enemies.size >= MAX_ENEMIES && !kind) return null;
    const e = Enemies.create(R.nextEid++, type, x, y, roomId, R.dds.hpMul, kind);
    R.enemies.set(e.id, e);
    const rc = R.roomCounts.get(roomId) || { spawned: 0, alive: 0 };
    rc.spawned++; rc.alive++;
    R.roomCounts.set(roomId, rc);
    this.emit(['sp', e.id], e.x, e.y);
    return e;
  }

  pickSpawn(room, flying) {
    const R = this.run, L = R.L;
    for (let tries = 0; tries < 10; tries++) {
      let x, y;
      if (flying) {
        x = room.x + 80 + R.rng.next() * (room.w - 160);
        y = room.y + 70 + R.rng.next() * (room.h * 0.45);
        if (Phys.rectHitsSolid(L, x - 12, y - 20, 24, 20)) continue;
      } else {
        const s = R.rng.pick(room.surfaces);
        x = s.x + 16 + R.rng.next() * Math.max(1, s.w - 32);
        y = s.y;
        if (Phys.rectHitsSolid(L, x - 15, y - 46, 30, 44)) continue;
      }
      let near = false;
      for (const p of this.players.values()) {
        if (p.state === 'dead') continue;
        if (Math.abs(p.b.x - x) < 200 && Math.abs(p.b.y - y) < 160) near = true;
      }
      if (near && tries < 8) continue;
      return { x, y };
    }
    return null;
  }

  rollType() {
    const R = this.run, mix = R.layer.mix;
    const r = R.rng.next();
    let acc = 0;
    for (const t of Object.keys(mix)) { acc += mix[t]; if (r < acc) return t; }
    return 'soldier';
  }

  spawnWave(room, count, opts) {
    for (let i = 0; i < count; i++) {
      const type = (opts && opts.only) || this.rollType();
      const pos = this.pickSpawn(room, type === 'drone');
      if (pos) this.spawnEnemy(type, pos.x, pos.y, room.id);
    }
  }

  activateRoom(room) {
    const R = this.run, L = R.L;
    R.activated.add(room.id);
    const sm = R.dds.spawnMul;
    const base = () => Math.max(2, Math.min(18, Math.round((2 + R.rng.int(0, 2) + (R.D.layer - 1) * 0.7) * sm)));
    switch (room.type) {
      case 'start': break;
      case 'combat': {
        // Mutación de sala (30%): gravedad reducida, niebla táctica o enemigos blindados
        let mut = null;
        if (!this.pvp && R.rng.next() < 0.3) {
          mut = R.rng.pick(['grav', 'niebla', 'blindaje']);
          (R.muts || (R.muts = new Map())).set(room.id, mut);
          this.msg({ grav: 'MUTACIÓN · GRAVEDAD REDUCIDA en esta sala', niebla: 'MUTACIÓN · NIEBLA TÁCTICA: visión reducida', blindaje: 'MUTACIÓN · ENEMIGOS BLINDADOS (+60% vida, +50% biomasa)' }[mut], 0xb05cff);
        }
        this.spawnWave(room, base());
        if (mut === 'blindaje') for (const e of R.enemies.values()) if (e.roomId === room.id) { e.maxHp *= 1.6; e.hp = e.maxHp; e.bonus = 1.5; }
        break;
      }
      case 'secret': {
        this.spawnWave(room, R.rng.int(0, 2));
        if (!R.royal && R.D.layer >= 2 && !this.pvp) {
          R.royal = true;
          const pos = this.pickSpawn(room, false);
          const g = pos && this.spawnEnemy('alpha', pos.x, pos.y, room.id, 'royal');
          if (g) { g.maxHp *= 3; g.hp = g.maxHp; g.royal = true; this.msg('GUARIDA OCULTA · EL GUARDIÁN DEL REY DESPIERTA', 0xffd34a); }
        }
        break;
      }
      case 'elite': {
        this.spawnWave(room, Math.max(1, Math.round(base() * 0.6)));
        const ne = 1 + (R.n >= 6 ? 1 : 0) + (R.season.fx === 'elite' ? 1 : 0);
        for (let i = 0; i < ne; i++) {
          const type = R.D.layer >= 3 && i === 0 ? 'alpha' : 'elite';
          const pos = this.pickSpawn(room, false);
          if (pos) this.spawnEnemy(type, pos.x, pos.y, room.id);
        }
        this.msg('ÉLITES DETECTADOS · FLANQUEEN: ESCUDOS AL FRENTE, PUNTOS DÉBILES DETRÁS', 0xb05cff);
        break;
      }
      case 'gate': {
        this.spawnWave(room, Math.max(2, Math.round(base() * 0.6)));
        const g = R.gates.find(gg => gg.roomId === room.id);
        if (g && !g.open) {
          g.active = true;
          const able = [...this.players.values()].filter(p => p.state === 'alive' && !p.ghost).length;
          const n = Math.max(1, Math.min(g.terminals.length, able));
          g.need = n;
          this.msg(`COMPUERTA DE SEGURIDAD · OCUPEN ${n} TERMINAL${n > 1 ? 'ES' : ''} A LA VEZ PARA HACKEAR`, 0xffb020);
        }
        break;
      }
      case 'detonator': {
        this.spawnWave(room, Math.max(2, Math.round(base() * 0.7)));
        const d = R.dets.find(dd => dd.roomId === room.id);
        if (d && !d.done) { d.active = true; this.msg('¡DETONADORES ARMADOS! DESACTÍVENLOS [MANTENER E] · 50 s', 0xff3b3b); }
        break;
      }
      case 'arena': {
        const a = L.arena;
        if (a.kind === 'extract') {
          R.extract = { phase: 'call', t: R.variant === 'coop' ? 30 : 22, waveT: 1.5, board: 0, inZone: 0, need: 1 };
          this.msg('ELEVADOR DE DESCENSO SOLICITADO · DEFENDED LA POSICIÓN', 0xffb020);
          this.emit(['liftcall']);
        } else {
          const kind = R.D.boss;
          const e = kind === 'heart'
            ? this.spawnEnemy('heart', a.bossSpawn.x, a.floorTop - 70, room.id, 'heart')
            : this.spawnEnemy('warden', a.bossSpawn.x, a.floorTop, room.id, kind);
          if (e) R.bossId = e.id;
          this.msg(`⚠ ${Campaign.bosses[kind].name} · USEN PILONES [E] Y RESPIRADEROS ⚠`, 0xff3b3b);
          this.emit(['boss', e ? e.id : 0, 1]);
        }
        break;
      }
    }
    if (room.id === R.targetRoom && !R.targetId) {
      const pos = this.pickSpawn(room, false);
      if (pos) {
        const e = this.spawnEnemy('elite', pos.x, pos.y, room.id);
        if (e) { e.marked = true; e.maxHp *= 1.8; e.hp = e.maxHp; e.credits *= 3; R.targetId = e.id; this.msg('EJECUTOR MARCADO EN LA ZONA · CONTRATO DE CAMPO', 0xff7b54); }
      }
    }
  }

  updateRun(dt) {
    const R = this.run;
    R.t += dt;
    const L = R.L;
    if (this.tick % 60 === 0) this.computeDDS(false);

    // --- Jugadores ---
    for (const p of this.players.values()) {
      p.hurtT = Math.max(0, p.hurtT - dt);
      if (p.state === 'dead') { this.consumeInputs(p, L, () => {}); continue; }
      this.consumeInputs(p, L, (b) => {
        p.b.ctrl = p.state === 'alive';
        const ev = Phys.stepPlayer(L, p.b, b, DT);
        if (ev & 4) this.emit(['dash', p.id], p.b.x, p.b.y);
        if (ev & 2) this.emit(['jump2', p.id], p.b.x, p.b.y);
        if (p.state === 'alive') {
          this.weaponFrame(p, b, DT);
          if ((b & B.STREAK) && !(p.prevHeld & B.STREAK)) this.useStreak(p);
        }
      });
      L.time = this.t;
      // Anti-atasco: si el cuerpo queda incrustado en sólido (compuerta/plataforma/cobertura que
      // se cierra encima, desync de borde) durante 0.4 s, se recoloca en la última posición segura.
      const embedded = Phys.rectHitsSolid(L, p.b.x + 3, p.b.y + 3, p.b.w - 6, p.b.h - 6);
      if (embedded) { p.embedT = (p.embedT || 0) + dt; if (p.embedT > 0.4 && p.lastSafe) { p.b.x = p.lastSafe.x; p.b.y = p.lastSafe.y - 4; p.b.vx = p.b.vy = 0; p.b.ride = -1; p.embedT = 0; } }
      else p.embedT = 0;
      if (!embedded && p.b.onGround && p.state === 'alive' && p.b.ride < 0) { if (p.lastSafe) { p.lastSafe.x = p.b.x; p.lastSafe.y = p.b.y; } else p.lastSafe = { x: p.b.x, y: p.b.y }; }
      if (p.b.y > L.th * TS) { p.b.x = p.lastSafe.x; p.b.y = p.lastSafe.y - 4; p.b.vy = 0; p.b.ride = -1; }
      if (p.state === 'alive' && p.regen && R.t - p.lastHurt > 3) p.hp = Math.min(p.maxHp, p.hp + 2 * dt);
    }

    const ctx = this.ctx();
    // --- Activación de salas, sectores y supervivencia ---
    for (const p of ctx.alivePlayers) {
      const rid = LevelGen.roomIdAt(L, p.b.x + p.b.w / 2, p.b.y + p.b.h / 2);
      p.b.gravMul = R.muts && R.muts.get(rid) === 'grav' ? 0.55 : 1;   // mutación de sala: gravedad reducida
      if (rid >= 0) {
        const room = L.rooms[rid];
        p.curRoom = rid;
        if (!R.activated.has(rid)) this.activateRoom(room);
        if (room.sector === 2) p.visited2 = true;
        if (room.sector > p.maxSector) {
          if (p.maxSector <= 2 && room.sector > 2 && p.visited2 && !p.critSectors.has(2)) this.mission(p, 'sector2_nocrit', 1);
          p.maxSector = room.sector;
        }
      }
      p.aliveStreak += dt;
      if (++p.streakTick >= 60) { p.streakTick = 0; this.mission(p, 'survive_onelife', Math.floor(p.aliveStreak)); }
    }

    // --- Derribados, reanimación y estimulantes ---
    for (const p of this.players.values()) {
      if (p.state !== 'downed') continue;
      p.downT -= dt;
      if ((p.held & B.INT) && p.stims > 0) {
        p.stimProg += dt;
        if (p.stimProg >= C.STIM_TIME) { p.stims--; this.revive(p, null, 0.4); continue; }
      } else p.stimProg = Math.max(0, p.stimProg - dt);
      let reviver = null;
      for (const q of ctx.alivePlayers) {
        if ((q.held & B.INT) && this.sameTeam(q, p) && Math.abs(q.b.x - p.b.x) < 56 && Math.abs(q.b.y + q.b.h - p.b.y - p.b.h) < 50) { reviver = q; break; }
      }
      if (reviver) {
        p.reviveProg += dt / C.REVIVE_TIME;
        if (p.reviveProg >= 1) { this.revive(p, reviver, 0.35); continue; }
      } else p.reviveProg = Math.max(0, p.reviveProg - dt * 0.5);
      if (p.downT <= 0) {
        p.state = 'dead';
        p.profile.stats.deaths = (p.profile.stats.deaths || 0) + 1;
        this.emit(['dead', p.id]);
        this.msg(`EXOTRAJE DE ${p.name} DESTRUIDO · SU NÚCLEO HUYE POR LA VENTILACIÓN`, 0xff3b3b);
        this.computeDDS(false);
      }
    }
    ctx.alivePlayers = [...this.players.values()].filter(p => p.state === 'alive');

    // --- Enemigos ---
    this.rebuildGrid();
    for (const e of R.enemies.values()) {
      if (e.dead) continue;
      let near = false;
      for (const p of this.players.values()) {
        if (p.state === 'dead') continue;
        if (Math.abs(p.b.x - e.x) < 2200 && Math.abs(p.b.y - e.y) < 1400) { near = true; break; }
      }
      if (!near) continue;
      Enemies.update(e, dt, ctx);
      if (e.y > L.th * TS + 200) this.killEnemy(e, null, false);
    }

    if (STRESS && this.tick % 360 === 0 && R.enemies.size < 110) {
      const seen = new Set();
      for (const p of ctx.alivePlayers) if (p.curRoom >= 0 && !seen.has(p.curRoom)) { seen.add(p.curRoom); this.spawnWave(L.rooms[p.curRoom], 8); }
    }

    // --- Segunda horda (4+ operadores) ---
    if (this.tick % 30 === 0 && R.dds.alive >= 4) {
      for (const [rid, rc] of R.roomCounts) {
        const room = L.rooms[rid];
        if (R.secondWave.has(rid) || room.type !== 'combat' || rc.spawned < 3) continue;
        if (rc.alive <= rc.spawned * 0.3) {
          R.secondWave.add(rid);
          this.spawnWave(room, Math.round(rc.spawned * 0.5));
          this.msg('¡SEGUNDA HORDA ENTRANTE!', 0xff7b54);
        }
      }
    }

    this.updateBullets(dt);
    this.updateObjectives(dt, ctx);
    if (!this.pvp) { this.updateAnomaly(dt, ctx); this.updateEvac(dt); }
    this.updateSupport(dt, ctx);
    this.updateDynamic(dt, ctx);
    this.updateExtract(dt, ctx);

    // --- Pickups ---
    for (let i = R.pickups.length - 1; i >= 0; i--) {
      const pk = R.pickups[i];
      pk.life -= dt;
      let taken = null;
      for (const p of ctx.alivePlayers) {
        if (Math.abs(p.b.x + p.b.w / 2 - pk.x) < 26 && Math.abs(p.b.y + p.b.h / 2 - pk.y) < 34 && p.hp < p.maxHp) { taken = p; break; }
      }
      if (taken) { taken.hp = Math.min(taken.maxHp, taken.hp + taken.maxHp * 0.25); this.emit(['pk', pk.id, taken.id], pk.x, pk.y); }
      if (taken || pk.life <= 0) R.pickups.splice(i, 1);
    }

    // --- Derrota compartida / victoria / protocolo orbital ---
    if (this.pvp) {
      if (R.ended) { R.endT -= dt; if (R.endT <= 0) this.backToHub(); }
    } else if (!R.ended) {
      const alive = ctx.alivePlayers.length;
      const downed = [...this.players.values()].filter(p => p.state === 'downed').length;
      if (alive === 0 && this.players.size > 0) {
        if (downed === 0) this.endRun(false);
        else {
          if (R.wipeT < 0) { R.wipeT = C.WIPE_WINDOW; this.msg('TODO EL ESCUADRÓN DERRIBADO · VENTANA TÁCTICA: USEN ESTIMULANTES [MANTENER E]', 0xff3b3b); }
          R.wipeT -= dt;
          if (R.wipeT <= 0) this.endRun(false);
        }
      } else R.wipeT = -1;
      if (R.victoryT > 0) { R.victoryT -= dt; if (R.victoryT <= 0) this.endRun(true); }
      if (R.orbitalT > 0) {
        const before = Math.ceil(R.orbitalT);
        R.orbitalT -= dt;
        if (Math.ceil(R.orbitalT) !== before) this.emit(['shake', 0.25 + 0.05 * (14 - before)]);
        if (R.orbitalT <= 0) this.endRun(true);
      }
    } else {
      R.endT -= dt;
      if (R.endT <= 0) this.backToHub();
    }
  }

  // ---------------------------------------------------------------- rachas, aliados y eventos dinámicos
  useStreak(p) {
    const R = this.run;
    const id = p.streakBank.pop();
    if (!id) return;
    this.msg(`${p.name} desplegó: ${Campaign.streakInfo[id].name}`, 0x39d7ff);
    this.mission(p, 'use_streak', 1);
    this.emit(['stk', p.id, id]);
    if (id === 'uav') R.uavT = 20;
    else if (id === 'dron') R.allies.push({ owner: p.id, x: p.b.x, y: p.b.y - 60, t: 25, cd: 0.5 });
    else if (id === 'escudo') R.shieldT = 12;
    else if (id === 'centinela') R.allies.push({ owner: p.id, x: p.b.x + p.b.w / 2, y: p.b.y + p.b.h - 16, t: 30, cd: 0.5, fixed: true });
    else if (id === 'enjambre') { for (let i = 0; i < 3; i++) R.allies.push({ owner: p.id, x: p.b.x, y: p.b.y - 60 - i * 20, t: 15, cd: 0.3 + i * 0.1, off: i + 1 }); }
    else if (id === 'artilleria') {
      const dir = Math.cos(p.aim) >= 0 ? 1 : -1, ox = p.b.x + p.b.w / 2, oy = p.b.y;
      for (let i = 0; i < 5; i++) {
        const tx = ox + dir * (170 + i * 130), ty0 = oy - 60;
        if (Phys.pointSolid(R.L, tx, ty0)) break;
        const ty = ty0 + Phys.rayLength(R.L, tx, ty0, Math.PI / 2, 900);
        R.strikes.push({ x: tx, y: ty, t: 1.3 + i * 0.28, owner: p.id, r: 130, dmg: 170 * (1 + R.D.idx * 0.1) });
        this.emit(['orb', Math.round(tx), Math.round(ty), 1.3 + i * 0.28]);
      }
    }
    else if (id === 'botiquin') { for (const q of this.players.values()) if (q.state === 'alive') q.hp = Math.min(q.maxHp, q.hp + q.maxHp * 0.4); }
    else if (id === 'orbital') {
      const ox = p.b.x + p.b.w / 2, oy = p.b.y + 12;
      const len = Phys.rayLength(R.L, ox, oy, p.aim, 900);
      const tx = ox + Math.cos(p.aim) * Math.max(0, len - 10), ty0 = oy + Math.sin(p.aim) * Math.max(0, len - 10);
      const ty = ty0 + Phys.rayLength(R.L, tx, ty0, Math.PI / 2, 800);
      R.strikes.push({ x: tx, y: ty, t: 1.6, owner: p.id });
      this.emit(['orb', Math.round(tx), Math.round(ty), 1.6]);
    }
  }

  updateSupport(dt, ctx) {
    const R = this.run;
    R.uavT = Math.max(0, R.uavT - dt);
    R.shieldT = Math.max(0, R.shieldT - dt);
    for (let i = R.allies.length - 1; i >= 0; i--) {
      const a = R.allies[i];
      a.t -= dt;
      const o = this.playerById(a.owner);
      if (a.t <= 0 || !o) { R.allies.splice(i, 1); this.emit(['x', Math.round(a.x), Math.round(a.y), 40]); continue; }
      if (!a.fixed) {
        const tx = o.b.x + o.b.w / 2 - o.b.facing * (34 + (a.off || 0) * 22), ty = o.b.y - 46 - (a.off || 0) * 16;
        const k = Math.min(1, dt * 4);
        a.x += (tx - a.x) * k; a.y += (ty - a.y) * k;
      }
      a.cd -= dt;
      if (a.cd <= 0) {
        let best = null, bd = (a.fixed ? 640 : 520) ** 2;
        for (const e of R.enemies.values()) {
          const d = (e.x + e.w / 2 - a.x) ** 2 + (e.y + e.h / 2 - a.y) ** 2;
          if (d < bd && Phys.lineOfSight(R.L, a.x, a.y, e.x + e.w / 2, e.y + e.h / 2, true)) { bd = d; best = e; }
        }
        a.cd = best ? 0.28 : 0.15;
        if (best) {
          const ang = Math.atan2(best.y + best.h / 2 - a.y, best.x + best.w / 2 - a.x);
          this.spawnBullet(a.x, a.y, Math.cos(ang) * 1500, Math.sin(ang) * 1500, 0, o.id, 9 * (o.dmgMul || 1), 0, 0.6, 0, 1);
        }
      }
    }
    for (let i = R.strikes.length - 1; i >= 0; i--) {
      const s = R.strikes[i];
      s.t -= dt;
      if (s.t <= 0) {
        R.strikes.splice(i, 1);
        this.explode(s.x, s.y - 20, s.r || 210, s.dmg || 280 * (1 + R.D.idx * 0.1), 'player', this.playerById(s.owner), 'orb');
        this.emit(['shake', 0.9]);
      }
    }
  }

  updateDynamic(dt, ctx) {
    const R = this.run;
    if (R.ended) return;
    if (R.event) {
      R.event.t -= dt;
      if (R.event.t <= 0) {
        const was = R.event.id;
        R.event = null;
        R.eventT = 75 + R.rng.next() * 45;
        if (was === 'marea') this.computeDDS(true);
      }
      return;
    }
    if (R.bossId || R.extract || R.orbitalT > 0 || !ctx.alivePlayers.length) return;
    R.eventT -= dt * (R.season.fx === 'event' ? 2 : 1);
    if (R.eventT > 0) return;
    const pool = ['marea', 'apagon', 'suministro', 'cazador', 'enjambre'];
    if (R.season.fx === 'hunt') pool.push('cazador', 'cazador');
    if (R.season.fx === 'swarm') pool.push('enjambre', 'enjambre');
    const id = R.rng.pick(pool);
    const info = Campaign.events[id];
    R.event = { id, t: info.dur };
    this.emit(['evt', id]);
    this.msg(`EVENTO · ${info.name}: ${info.desc}`, info.color);
    const anchor = R.rng.pick(ctx.alivePlayers);
    const room = anchor.curRoom >= 0 ? R.L.rooms[anchor.curRoom] : null;
    if (id === 'marea') this.computeDDS(true);
    else if (id === 'suministro') {
      for (const p of ctx.alivePlayers) { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3); p.grenades = Math.min(5, p.grenades + 1); }
      this.emit(['supply', Math.round(anchor.b.x), Math.round(anchor.b.y)]);
    } else if (id === 'cazador' && room) {
      const pos = this.pickSpawn(room, false);
      if (pos) {
        const e = this.spawnEnemy(R.D.layer >= 3 || R.season.fx === 'hunt' ? 'alpha' : 'elite', pos.x, pos.y, room.id);
        if (e) { e.bounty = true; e.maxHp *= 1.5; e.hp = e.maxHp; }
      }
    } else if (id === 'enjambre' && room) this.spawnWave(room, 3 + ctx.alivePlayers.length, { only: 'drone' });
  }

  // Extracción por elevador (descensos sin jefe) y cajas negras
  updateExtract(dt, ctx) {
    const R = this.run, L = R.L;
    const alive = ctx.alivePlayers;
    if (R.boxesActive) {
      for (const bx of L.boxes) {
        if (R.boxesTaken.has(bx.id)) continue;
        for (const p of alive) {
          if (Math.abs(p.b.x + p.b.w / 2 - bx.x) < 30 && Math.abs(p.b.y + p.b.h / 2 - bx.y) < 40) {
            R.boxesTaken.add(bx.id);
            this.emit(['box', bx.id, p.id]);
            this.msg(`${p.name} recuperó una caja negra (${R.boxesTaken.size}/${L.boxes.length})`, 0xffd34a);
            break;
          }
        }
      }
    }
    const X = R.extract;
    if (!X || R.ended) return;
    const lift = L.arena.lift;
    let inZone = 0;
    for (const p of alive) {
      if (p.ghost) continue;
      const px = p.b.x + p.b.w / 2;
      if (px > lift.x && px < lift.x + lift.w && Math.abs(p.b.y + p.b.h - lift.y) < 70) inZone++;
    }
    // Los fantasmas (desconectados esperando reconexión) no bloquean la extracción
    let able = 0;
    for (const p of alive) if (!p.ghost) able++;
    X.inZone = inZone; X.need = Math.max(1, able);
    if (X.phase === 'call') {
      X.t -= dt; X.waveT -= dt;
      if (X.waveT <= 0) {
        X.waveT = 5 / R.dds.aggro;
        const rc = R.roomCounts.get(L.arena.id);
        if (!rc || rc.alive < 24) this.spawnWave(L.arena, Math.round(2 + 1.4 * R.dds.spawnMul));
      }
      if (X.t <= 0) { X.phase = 'board'; this.msg('¡ELEVADOR EN POSICIÓN! TODO EL ESCUADRÓN VIVO A BORDO', 0x7dff4f); this.emit(['lift']); }
    } else if (X.phase === 'board') {
      if (alive.length && inZone >= X.need) {
        X.board += dt;
        if (X.board >= 2) { X.phase = 'gone'; for (const p of alive) this.mission(p, 'extract', 1); this.endRun(true); }
      } else X.board = Math.max(0, X.board - dt);
    }
  }

  revive(p, by, frac) {
    p.state = 'alive'; p.hp = p.maxHp * frac; p.reviveProg = 0; p.stimProg = 0; p.hurtT = 1; p.b.ctrl = true;
    this.emit(['rev', p.id, by ? by.id : 0]);
    this.msg(by ? `${by.name} reanimó a ${p.name}` : `${p.name} usó un estimulante`, 0x7dff4f);
    if (by) this.mission(by, 'revive', 1);
    this.computeDDS(false);
  }

  down(p) {
    if (p.setB && (p.setB.corazon || 0) >= 3 && !p.heartUsed) {
      p.heartUsed = true; p.hp = p.maxHp * 0.4; p.hurtT = 1.2;
      this.emit(['rev', p.id, 0]);
      this.msg(`${p.name}: ¡SEGUNDO LATIDO!`, 0xff3b3b);
      return;
    }
    p.state = 'downed'; p.hp = 0; p.downT = C.BLEED_TIME; p.reviveProg = 0; p.stimProg = 0;
    p.aliveStreak = 0; p.b.ctrl = false; p.streak = 0; p.wasDowned = true; p.ws && (p.ws.cookT = 0);
    this.emit(['down', p.id]);
    this.msg(`${p.name} DERRIBADO · ¡REANÍMENLO! [MANTENER E]`, 0xff7b54);
    this.computeDDS(false);
  }

  hurtPlayer(p, dmg, sx, sy, continuous) {
    const R = this.run;
    if (p.state !== 'alive' || R.ended) return;
    if (p.b.dashT > 0 || (p.rescueT || 0) > R.t || (p.profile.admin && p.profile.god)) return;   // admin inmortal
    if (!continuous && p.hurtT > 0) return;
    dmg *= (p.armor || 1) * (R.shieldT > 0 ? 0.5 : 1);
    const wall = p.setB && (p.setB.ferroso || 0) >= 3 && p.b.crouch;
    if (wall) dmg *= 0.65;
    p.hp -= dmg;
    p.lastHurt = R.t;
    if (continuous) p.pendingDmg += dmg;
    else {
      p.hurtT = 0.2;
      const dir = (p.b.x + p.b.w / 2) >= sx ? 1 : -1;
      if (!wall) { p.b.vx = dir * 220; if (p.b.onGround) p.b.vy = -180; }
      this.emit(['ph', p.id, Math.round(dmg)]);
    }
    if (p.hp < p.maxHp * 0.25) {
      const room = p.curRoom >= 0 ? R.L.rooms[p.curRoom] : null;
      if (room) p.critSectors.add(room.sector);
    }
    if (p.hp <= 0) this.down(p);
  }

  weaponFrame(p, b, dt) {
    const w = p.weapon, s = p.ws, body = p.b, R = this.run;
    s.cd -= dt; s.altCd -= dt;
    s.bloom = Math.max(0, s.bloom - dt * 0.12);
    const pressed = b & ~s.prev;
    const released = s.prev & ~b;
    s.prev = b;
    if (pressed & B.GTYPE) p.gType = p.gType ? 0 : 1;
    s.perfT = Math.max(0, (s.perfT || 0) - dt);
    s.meleeCd = Math.max(0, (s.meleeCd || 0) - dt);
    // Recarga perfecta: pulsar R en la ventana dorada (50-72%) termina al instante y da +10% de daño 4 s
    if (s.reloadT > 0) {
      if ((pressed & B.RELOAD) && !s.fumbled) {
        const prog = 1 - s.reloadT / s.reloadTotal;
        if (prog >= 0.5 && prog <= 0.72) { s.reloadT = 0; s.ammo = w.mag + (s.tac ? 1 : 0); s.perfT = 4; this.emit(['perf', p.id], body.x, body.y); }
        else if (prog > 0.08) { s.fumbled = true; s.reloadT += 0.4; s.reloadTotal += 0.4; }
      }
      if (s.reloadT > 0) { s.reloadT -= dt; if (s.reloadT <= 0) s.ammo = w.mag + (s.tac ? 1 : 0); }
    }
    const dmgMul = (p.dmgMul || 1) * (s.perfT > 0 ? 1.1 : 1);
    // Granada universal [G] con cocinado: mantener para reducir la mecha, soltar para lanzar
    if ((b & B.GREN) && p.grenades > 0) {
      s.cookT += dt;
      if (s.cookT >= C.GREN_FUSE) {
        p.grenades--; s.cookT = 0;
        this.explode(body.x + body.w / 2, body.y + body.h / 2, 110, 75 * dmgMul, 'player', p, 'gren');
        p.hurtT = 0; this.hurtPlayer(p, 35, body.x, body.y);
        this.msg(`${p.name} cocinó demasiado su granada`, 0xff7b54);
      }
    } else if ((released & B.GREN) && s.cookT > 0 && p.grenades > 0) {
      p.grenades--;
      const fuse = Math.max(0.15, C.GREN_FUSE - s.cookT);
      const a = p.aim;
      const gb = this.spawnBullet(body.x + body.w / 2 + Math.cos(a) * 14, body.y + 12, Math.cos(a) * C.GREN_SPEED + body.vx * 0.3, Math.sin(a) * C.GREN_SPEED - 160, 0, p.id, 75 * dmgMul, 2, fuse, 0, 1);
      gb.gstun = p.gType === 1;
      s.cookT = 0;
    } else if (!(b & B.GREN)) s.cookT = 0;
    // Cuerpo a cuerpo rápido [V]: golpe con culata/puño; ejecución por la espalda o con el enemigo debilitado
    if ((pressed & B.MELEE) && s.meleeCd <= 0 && body.dashT <= 0) {
      s.meleeCd = 0.55;
      const dir = Math.cos(p.aim) >= 0 ? 1 : -1;
      const mx = body.x + body.w / 2, my = body.y + body.h / 2;
      const hits = this.queryEnemies(dir > 0 ? mx : mx - 60, my - 26, 60, 52, this._mOut || (this._mOut = []));
      for (const e of hits.slice()) {
        const boss = e.type === 'warden' || e.type === 'heart';
        const behind = !boss && Math.sign(mx - (e.x + e.w / 2)) !== (e.facing || 1);
        const exec = !boss && (e.hp < e.maxHp * 0.2 || (behind && ['soldier', 'drone', 'turret', 'berserker', 'elite'].includes(e.type)));
        this.damageEnemy(e, exec ? e.hp + 1 : 40 * dmgMul * (behind ? 2 : 1), p, mx, my, { knock: 260, dir, heavy: true, noShield: exec });
        if (exec) this.emit(['exec', e.id, Math.round(e.x + e.w / 2), Math.round(e.y)]);
      }
      if (this.pvp) this.pvpMelee(p, dir > 0 ? mx : mx - 60, my - 26, 60, 52, 40 * dmgMul);
      this.emit(['mel', p.id, Math.round(p.aim * 100)], body.x, body.y);
    }
    if (s.transformT > 0) { s.transformT -= dt; return; }
    if (body.dashT > 0) return;
    const aim = p.aim;
    const ox = body.x + body.w / 2 + Math.cos(aim) * 14;
    const oy = body.y + (body.crouch ? 6 : 12) + Math.sin(aim) * 6;
    if (w.arch === 'rifle') {
      p.ads = (b & B.ALT) !== 0;
      if ((pressed & B.RELOAD) && s.ammo < w.mag && s.reloadT <= 0) this.startReload(p);
      if ((b & B.FIRE) && s.cd <= 0 && s.reloadT <= 0) {
        if (s.ammo > 0) {
          const first = R.t - s.lastShot > 0.28;
          const spread = (first ? w.spread * 0.25 : w.spread + s.bloom) * (body.crouch ? 0.5 : 1) * (p.ads ? 0.35 : 1);
          const a = aim + (Math.random() - 0.5) * spread;
          this.spawnBullet(ox, oy, Math.cos(a) * w.speed, Math.sin(a) * w.speed, 0, p.id, w.dmg * dmgMul * (p.ads ? 1.1 : 1), 0, 0.9, w.pierce, w.coverMul);
          s.ammo--; s.cd = w.rate; s.lastShot = R.t;
          s.bloom = Math.min(0.09, s.bloom + 0.007 * w.recoil);
          if (s.ammo <= 0) this.startReload(p);
        } else if (pressed & B.FIRE) this.startReload(p);
      }
    } else if (w.arch === 'pistol') {
      // Pistola semiautomática: un disparo por clic; [Q]/clic der. = ráfaga triple
      const firePistol = () => {
        const first = R.t - s.lastShot > 0.22;
        const a = aim + (Math.random() - 0.5) * (first ? w.spread * 0.3 : w.spread + s.bloom) * (body.crouch ? 0.5 : 1);
        this.spawnBullet(ox, oy, Math.cos(a) * w.speed, Math.sin(a) * w.speed, 0, p.id, w.dmg * dmgMul, 0, 0.8, w.pierce, w.coverMul);
        s.ammo--; s.lastShot = R.t; s.bloom = Math.min(0.06, s.bloom + 0.012);
        if (s.ammo <= 0) this.startReload(p);
      };
      if ((pressed & B.RELOAD) && s.ammo < w.mag && s.reloadT <= 0) this.startReload(p);
      if (s.burst > 0) {
        s.burstT -= dt;
        if (s.burstT <= 0) { if (s.ammo > 0 && s.reloadT <= 0) firePistol(); s.burst--; s.burstT = 0.06; s.cd = w.rate; }
      } else if ((pressed & B.FIRE) && s.cd <= 0 && s.reloadT <= 0) {
        if (s.ammo > 0) { firePistol(); s.cd = w.rate; } else this.startReload(p);
      }
      if ((pressed & B.ALT) && s.altCd <= 0 && s.ammo > 0 && s.reloadT <= 0) { s.altCd = w.altCd; s.burst = 3; s.burstT = 0; }
    } else if (w.arch === 'katana') {
      if ((b & B.FIRE) && s.cd <= 0) {
        s.combo = (s.combo + 1) % 3;
        const fin = s.combo === 2;
        this.melee(p, w.range * (fin ? 1.25 : 1), w.height, w.dmg * (fin ? 1.7 : 1) * dmgMul, w.knock * (fin ? 1.8 : 1), w.coverMul, fin);
        s.cd = w.rate * (fin ? 1.5 : 1);
        this.emit(['sw', p.id, Math.round(aim * 100), fin ? 1 : 0], body.x, body.y);
      }
      if ((pressed & B.ALT) && s.altCd <= 0) {
        s.altCd = w.altCd;
        const dir = Math.cos(aim) >= 0 ? 1 : -1;
        const wb = this.spawnBullet(body.x + body.w / 2 + dir * 20, body.y + body.h / 2, dir * 900, 0, 0, p.id, w.waveDmg * dmgMul, 3, 0.6, 99, 1.5);
        wb.passCover = !!w.waveCover;
      }
    } else if (w.gun) {
      // Arma de fuego parametrizada (subfusil, escopeta, francotirador, M42)
      p.ads = !!w.ads && (b & B.ALT) !== 0;
      if ((pressed & B.RELOAD) && s.ammo < w.mag && s.reloadT <= 0) this.startReload(p);
      const trig = w.auto ? (b & B.FIRE) : (pressed & B.FIRE);
      if (trig && s.cd <= 0 && s.reloadT <= 0) {
        if (s.ammo > 0) {
          const multi = w.pellets > 1;
          const spread = (w.spread + s.bloom) * (body.crouch ? 0.6 : 1) * (p.ads ? 0.15 : 1) * (multi ? 2 : 1);
          for (let i = 0; i < w.pellets; i++) {
            const a = aim + (Math.random() - 0.5) * spread, sp = w.speed * (multi ? 0.85 + Math.random() * 0.3 : 1);
            this.spawnBullet(ox, oy, Math.cos(a) * sp, Math.sin(a) * sp, 0, p.id, w.dmg * dmgMul * (p.ads ? 1.2 : 1), multi ? 4 : 0, w.life || 0.9, w.pierce, w.coverMul);
          }
          s.ammo--; s.cd = w.rate; s.lastShot = R.t;
          s.bloom = Math.min(w.bloomMax, s.bloom + w.bloomAdd);
          if (w.selfKnock) body.vx -= Math.cos(aim) * w.selfKnock;
          if (s.ammo <= 0) this.startReload(p);
        } else if (pressed & B.FIRE) this.startReload(p);
      }
    } else if (w.blade) {
      // Cuerpo a cuerpo parametrizado (dagas gemelas, Cetro del Rey)
      if ((b & B.FIRE) && s.cd <= 0) {
        s.combo = (s.combo + 1) % w.combo;
        const fin = s.combo === w.combo - 1;
        this.melee(p, w.range * (fin ? 1.2 : 1), w.height, w.dmg * (fin ? w.finMul : 1) * dmgMul, w.knock * (fin ? 1.6 : 1), w.coverMul, fin);
        s.cd = w.rate * (fin ? 1.4 : 1);
        this.emit(['sw', p.id, Math.round(aim * 100), fin ? 1 : 0], body.x, body.y);
      }
      if ((pressed & B.ALT) && s.altCd <= 0) {
        s.altCd = w.altCd;
        for (let i = 0; i < w.altShots; i++) {
          const a = aim + (i - (w.altShots - 1) / 2) * 0.16;
          this.spawnBullet(body.x + body.w / 2, body.y + body.h / 2 - 4, Math.cos(a) * 950, Math.sin(a) * 950, 0, p.id, w.altDmg * dmgMul, 3, 0.5, 2, 1.5);
        }
      }
    } else {
      if ((pressed & B.ALT) && s.altCd <= 0) {
        s.mode = s.mode === 'axe' ? 'cannon' : 'axe';
        s.transformT = w.instantTransform ? 0.05 : 0.35; s.altCd = w.altCd;
        this.emit(['tf', p.id, s.mode === 'axe' ? 0 : 1], body.x, body.y);
        return;
      }
      if ((b & B.FIRE) && s.cd <= 0) {
        if (s.mode === 'axe') {
          this.melee(p, w.range, w.height, w.dmg * dmgMul, w.knock, w.coverMul, true);
          s.cd = w.rate;
          this.emit(['sw', p.id, Math.round(aim * 100), 2], body.x, body.y);
        } else {
          for (let i = 0; i < w.pellets; i++) {
            const a = aim + (Math.random() - 0.5) * w.spread * 2;
            const sp = w.speed * (0.85 + Math.random() * 0.3);
            this.spawnBullet(ox, oy, Math.cos(a) * sp, Math.sin(a) * sp, 0, p.id, w.pelletDmg * dmgMul, 4, 0.45, 0, 1.4);
          }
          s.cd = w.cannonRate;
          body.vx -= Math.cos(aim) * 120;
        }
      }
    }
  }

  // Recarga táctica (con bala en recámara: más rápida y +1) o en vacío (completa)
  startReload(p) {
    const s = p.ws, w = p.weapon;
    s.tac = s.ammo > 0;
    s.reloadT = w.reload * (s.tac ? 0.72 : 1);
    s.reloadTotal = s.reloadT; s.fumbled = false;
    this.emit(['rl', p.id, s.tac ? 1 : 0], p.b.x, p.b.y);
  }

  melee(p, range, height, dmg, knock, coverMul, heavy) {
    const b = p.b;
    const dir = Math.cos(p.aim) >= 0 ? 1 : -1;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const hx = dir > 0 ? cx : cx - range;
    const hy = cy - height / 2;
    const hits = this.queryEnemies(hx, hy, range, height, this._meleeOut || (this._meleeOut = []));
    for (const e of hits.slice()) this.damageEnemy(e, dmg, p, cx, cy, { knock, dir, heavy });
    if (this.pvp) this.pvpMelee(p, hx, hy, range, height, dmg);
    const L = this.run.L;
    for (const cv of L.covers) {
      if (!cv.alive) continue;
      if (hx < cv.x + cv.w && hx + range > cv.x && hy < cv.y + cv.h && hy + height > cv.y) this.damageCover(cv, dmg * (coverMul || 1), p);
    }
  }

  damageEnemy(e, dmg, p, hx, hy, o) {
    if (e.dead) return 'dead';
    const R = this.run;
    o = o || {};
    if (!o.noShield && Enemies.shieldBlocks(e, hx, hy)) {
      e.shieldHp -= dmg * (o.heavy ? 1.5 : 1); e.lastShieldHit = R.t;
      this.emit(['sh', e.id, Math.round(hx), Math.round(hy)], e.x, e.y);
      if (e.shieldHp <= 0) this.emit(['msg', 'ESCUDO DE ÉLITE ROTO', 0xb05cff], e.x, e.y);
      return 'shield';
    }
    let crit = 0;
    const w = p && p.weapon;
    // Bestia Alfa: frente blindado, espalda vulnerable (flanqueo cruzado)
    if (e.type === 'alpha' && !o.noShield) {
      const front = Math.sign(hx - (e.x + e.w / 2)) === e.facing;
      if (front) { dmg *= 0.45; crit = 2; } else { dmg *= 1.6; crit = 3; }
    }
    if (w && w.perks.includes('sobrecarga') && Math.random() < 0.15) { dmg *= 2; crit = 1; }
    if (w && w.perks.includes('ejecutor') && e.hp < e.maxHp * 0.3) dmg *= 1.5;
    if ((e.type === 'warden' || e.type === 'heart') && e.stunT > 0) dmg *= 1.5;
    if (p && p.setB) {
      const sb = p.setB;
      if ((sb.matriarca || 0) >= 2 && (e.type === 'warden' || e.type === 'heart')) dmg *= 1.15;
      if ((sb.cazador || 0) >= 2 && e.type !== 'heart' && Math.sign(hx - (e.x + e.w / 2)) !== (e.facing || 1)) dmg *= 1.25;
      if ((sb.cazador || 0) >= 3 && (e.type === 'alpha' || e.type === 'elite')) dmg *= 1.25;
    }
    e.hp -= dmg;
    e.lastSrc = o.src || null;
    if (p) e.lastHitBy = p.id;
    // Equilibrio (Monster Hunter): los golpes pesados rompen la postura y derriban
    if (e.poiseMax) {
      e.poise -= dmg * (o.heavy ? 1.6 : 0.5) * (o.heavy && p && p.setB && (p.setB.matriarca || 0) >= 3 ? 1.6 : 1);
      if (e.poise <= 0) {
        e.poiseMax *= 1.25; e.poise = e.poiseMax;
        e.stunT = Math.max(e.stunT || 0, e.type === 'heart' ? 2 : 1.4);
        if (e.type === 'warden') { e.laserT = 0; e.laserCharge = 0; e.state = 'idle'; }
        this.emit(['stg', e.id]);
      }
    }
    if (o.knock && e.type !== 'warden' && e.type !== 'heart' && e.type !== 'turret') {
      const k = e.type === 'elite' || e.type === 'alpha' ? 0.25 : 1;
      e.vx += (o.dir || 1) * o.knock * k;
      if (e.type !== 'drone' && e.onGround) e.vy = -140 * k;
    }
    this.emit(['h', e.id, Math.round(dmg), crit, o.heavy ? 1 : 0], e.x, e.y);
    if (w && w.perks.includes('vampirico')) p.hp = Math.min(p.maxHp, p.hp + dmg * 0.04);
    if (w && w.perks.includes('arco') && !o.chain) {
      let best = null, bd = 160 * 160;
      for (const o2 of R.enemies.values()) {
        if (o2 === e || o2.dead) continue;
        const d = (o2.x - e.x) ** 2 + (o2.y - e.y) ** 2;
        if (d < bd) { bd = d; best = o2; }
      }
      if (best) {
        this.emit(['arc', e.id, best.id], e.x, e.y);
        this.damageEnemy(best, dmg * 0.4, p, best.x, best.y, { chain: true, noShield: true });
      }
    }
    if (e.hp <= 0) this.killEnemy(e, p, true);
    return 'hit';
  }

  // Granada aturdidora: sin daño apreciable, paraliza enemigos (los jefes, brevemente)
  stunBlast(x, y, owner) {
    const R = this.run;
    this.emit(['xs', Math.round(x), Math.round(y)]);
    for (const e of this.queryEnemies(x - 150, y - 150, 300, 300, [])) {
      if (Math.hypot(e.x + e.w / 2 - x, e.y + e.h / 2 - y) > 150 + e.w / 2) continue;
      const boss = e.type === 'warden' || e.type === 'heart';
      e.stunT = Math.max(e.stunT || 0, boss ? 1 : 2.6);
      if (e.laserT) { e.laserT = 0; e.laserCharge = 0; }
      this.damageEnemy(e, 8, owner, x, y, { noShield: true, src: 'gren' });
    }
  }

  giveMat(id, n, e) {
    const R = this.run;
    const k = Math.max(1, Math.round(n * R.matMul));
    for (const p of this.players.values()) p.bag[id] = (p.bag[id] || 0) + k;
    this.emit(['mat', id, k, Math.round(e.x + e.w / 2), Math.round(e.y)]);
  }

  partBreak(e, ph) {
    if (!e.cfg) return;
    this.giveMat(e.cfg.material, 1, e);
    this.emit(['part', e.id, ph]);
    this.msg('¡RUPTURA DE PARTE! +1 material de jefe para el escuadrón', 0xffd34a);
  }

  killEnemy(e, killer, credit) {
    if (e.dead) return;
    const R = this.run;
    e.dead = true;
    if (e.royal) for (const q of this.players.values()) {
      const pr = q.profile; pr.arms = pr.arms || [];
      if (!pr.arms.includes('cetro')) { pr.arms.push('cetro'); this.msg(`${q.name} reclama el CETRO DEL REY (disponible en el botín y con Kai)`, 0xffd34a); }
    }
    R.enemies.delete(e.id);
    const rc = R.roomCounts.get(e.roomId);
    if (rc) rc.alive--;
    // Paridad absoluta: el evento de muerte se envía a TODOS sin filtro de distancia
    this.emit(['k', e.id, Math.round(e.x + e.w / 2), Math.round(e.y + e.h / 2), e.ti, killer ? killer.id : 0]);
    if (credit) {
      const evMul = R.event && R.event.id === 'marea' ? 2 : 1;
      const c = Math.round(e.credits * R.desc.reward * evMul * (e.bounty ? 3 : 1) * (e.bonus || 1));
      for (const p of this.players.values()) p.runCredits += c;
      const dr = Campaign.drops[e.type];
      if (dr && R.rng.next() < dr[1]) this.giveMat(dr[0], e.type === 'elite' || e.type === 'alpha' ? 2 : 1, e);
      if (e.bounty) this.giveMat(R.D.layer >= 3 ? 'cuero_alfa' : 'fragmento_escudo', 2, e);
      if (killer) {
        killer.kills++;
        this.mission(killer, 'kill_' + e.type, 1);
        this.mission(killer, 'kill_any', 1);
        if (e.lastSrc === 'gren') killer.gKills++;
        killer.streak++;
        if (killer.setB && (killer.setB.quimera || 0) >= 3) killer.hp = Math.min(killer.maxHp, killer.hp + 4);
        const set = Campaign.streakSets[killer.profile.streakSet] || Campaign.streakSets.asalto;
        const red = (R.season.fx === 'streak' ? 1 : 0) + (killer.setB && (killer.setB.escolta || 0) >= 3 ? 1 : 0);
        for (const st of set.list) {
          if (killer.streak === st.kills - red && killer.streakBank.length < 3) {
            killer.streakBank.push(st.id);
            killer.socket.emit('notify', { text: `RACHA LISTA: ${Campaign.streakInfo[st.id].name} · pulsa [F]`, color: 0x39d7ff });
          }
        }
      }
      if (e.marked) { R.targetDone = true; this.msg('EJECUTOR ELIMINADO · CONTRATO DE CAMPO CUMPLIDO', 0x7dff4f); }
      if (e.type !== 'warden' && e.type !== 'heart' && R.rng.next() < (e.type === 'elite' || e.type === 'alpha' ? 1 : 0.09)) {
        R.pickups.push({ id: R.nextPk++, x: e.x + e.w / 2, y: e.y + e.h / 2 - 6, life: 20 });
      }
    }
    if (e.type === 'warden' || e.type === 'heart') {
      R.bossId = 0;
      this.giveMat(e.cfg.material, 2, e);
      for (const p of this.players.values()) if (p.state !== 'dead') this.mission(p, 'kill_boss', 1);
      this.emit(['shake', 1]);
      if (e.type === 'heart') {
        R.orbitalT = 14;
        this.msg('CORAZÓN DESTRUIDO · PROTOCOLO ORBITAL DETECTADO · EL SECTOR SERÁ INCINERADO', 0xff3b3b);
        this.emit(['orbital', 14]);
      } else {
        this.msg(`¡${e.cfg.name} ABATIDO! EXTRACCIÓN EN CURSO`, 0xffd34a);
        R.victoryT = 3;
      }
    }
  }

  damageCover(cv, dmg, p) {
    if (!cv.alive) return;
    cv.hp -= dmg;
    if (cv.hp <= 0) {
      cv.alive = false;
      this.emit(['cv', cv.id, 0]);
      if (p) { this.mission(p, 'destroy_cover', 1); p.coversBroken++; }
      if (cv.kind === 'wall' || cv.kind === 'lid') this.msg('¡PASAJE SECRETO DESCUBIERTO!', 0xffd34a);
    } else this.emit(['cv', cv.id, Math.round(cv.hp / cv.maxHp * 100)], cv.x, cv.y);
  }

  explode(x, y, r, dmg, team, owner, src) {
    const R = this.run;
    this.emit(['x', Math.round(x), Math.round(y), r]);
    if (team === 'enemy') {
      for (const p of this.players.values()) {
        if (p.state !== 'alive') continue;
        const d = Math.hypot(p.b.x + p.b.w / 2 - x, p.b.y + p.b.h / 2 - y);
        if (d < r) this.hurtPlayer(p, dmg * (1 - 0.5 * d / r), x, y);
      }
    } else {
      const hits = this.queryEnemies(x - r, y - r, r * 2, r * 2, []);
      for (const e of hits) {
        const d = Math.hypot(e.x + e.w / 2 - x, e.y + e.h / 2 - y);
        if (d < r + e.w / 2) this.damageEnemy(e, dmg * (1 - 0.4 * Math.min(1, d / r)), owner, x, y, { noShield: true, knock: 260, dir: (e.x + e.w / 2) >= x ? 1 : -1, heavy: true, src });
      }
      if (this.pvp && owner) this.pvpExplode(x, y, r, dmg, owner);
    }
    for (const cv of R.L.covers) {
      if (!cv.alive) continue;
      const d = Math.hypot(cv.x + cv.w / 2 - x, cv.y + cv.h / 2 - y);
      if (d < r + 20) this.damageCover(cv, dmg * 1.5, owner);
    }
  }

  spawnBullet(x, y, vx, vy, team, owner, dmg, kind, life, pierce, coverMul) {
    const R = this.run;
    const bl = R.pool.pop() || { hits: [] };
    bl.id = R.nextBid++; bl.x = x; bl.y = y; bl.vx = vx; bl.vy = vy; bl.team = team; bl.owner = owner;
    bl.dmg = dmg; bl.kind = kind; bl.life = life; bl.pierce = pierce || 0; bl.coverMul = coverMul || 1;
    bl.bounce = 0; bl.hits.length = 0; bl.dead = false; bl.passCover = false; bl.gstun = false;
    R.bullets.push(bl);
    this.emit(['b', bl.id, Math.round(x), Math.round(y), Math.round(vx), Math.round(vy), kind, team, owner, kind === 2 ? Math.round(life * 100) : 0], x, y);
    return bl;
  }

  endBullet(bl, code) {
    bl.dead = true;
    if (bl.kind === 2) {
      const p = this.playerById(bl.owner);
      if (bl.gstun) this.stunBlast(bl.x, bl.y, p);
      else this.explode(bl.x, bl.y, 120, bl.dmg, 'player', p, 'gren');
    }
    this.emit(['bx', bl.id, Math.round(bl.x), Math.round(bl.y), code], bl.x, bl.y);
  }

  updateBullets(dt) {
    const R = this.run, L = R.L;
    const out = this._bOut || (this._bOut = []);
    for (let i = R.bullets.length - 1; i >= 0; i--) {
      const bl = R.bullets[i];
      bl.life -= dt;
      if (bl.life <= 0) { this.endBullet(bl, 0); }
      else {
        if (bl.kind === 2) bl.vy += 1400 * dt;
        const dist = Math.hypot(bl.vx, bl.vy) * dt;
        const steps = Math.max(1, Math.ceil(dist / 12));
        const sx = bl.vx * dt / steps, sy = bl.vy * dt / steps;
        for (let s = 0; s < steps && !bl.dead; s++) {
          bl.x += sx; bl.y += sy;
          if (Phys.pointSolid(L, bl.x, bl.y)) {
            if (bl.kind === 2 && bl.bounce < 1) { bl.bounce++; bl.x -= sx; bl.y -= sy; bl.vy *= -0.45; bl.vx *= 0.6; continue; }
            if (bl.kind === 1) { bl.x -= sx; }
            this.endBullet(bl, 1); break;
          }
          if (bl.kind !== 1 && !bl.passCover) {
            const cv = Phys.coverHit(L, bl.x - 2, bl.y - 2, 4, 4);
            if (cv) {
              const owner = bl.team === 0 ? this.playerById(bl.owner) : null;
              if (bl.kind !== 2) this.damageCover(cv, bl.dmg * bl.coverMul, owner);
              this.endBullet(bl, 3); break;
            }
          }
          if (bl.team === 0) {
            const hits = this.queryEnemies(bl.x - 3, bl.y - 3, 6, 6, out);
            for (const e of hits) {
              if (bl.hits.includes(e.id)) continue;
              if (bl.kind === 2) { this.endBullet(bl, 2); break; }
              const owner = this.playerById(bl.owner);
              const r = this.damageEnemy(e, bl.dmg, owner, bl.x - sx * 2, bl.y - sy * 2, { knock: bl.kind === 4 ? 70 : 40, dir: Math.sign(bl.vx) || 1 });
              bl.hits.push(e.id);
              if (r === 'shield') { this.endBullet(bl, 4); break; }
              if (bl.pierce > 0) bl.pierce--; else { this.endBullet(bl, 2); break; }
            }
            if (this.pvp && !bl.dead && bl.kind !== 2 && this.pvpHit(bl, sx, sy)) { this.endBullet(bl, 2); break; }
          } else {
            for (const p of this.players.values()) {
              if (p.state !== 'alive' || p.b.dashT > 0) continue;
              const b = p.b;
              const pad = bl.kind === 1 ? 10 : 2;
              if (bl.x > b.x - pad && bl.x < b.x + b.w + pad && bl.y > b.y - pad && bl.y < b.y + b.h + pad) {
                this.hurtPlayer(p, bl.dmg, bl.x - sx * 3, bl.y);
                if (bl.kind !== 1) { this.endBullet(bl, 2); break; }
              }
            }
          }
        }
      }
      if (bl.dead) {
        R.bullets[i] = R.bullets[R.bullets.length - 1];
        R.bullets.pop();
        R.pool.push(bl);
      }
    }
  }

  // ---------------------------------------------------------------- extracción de emergencia
  startEvac(p) {
    const R = this.run;
    if (this.phase !== 'run' || !R || R.ended || this.pvp) return [false, 'Sólo durante un descenso.'];
    if (p.state !== 'alive') return [false, 'Debes estar en pie para activar la baliza.'];
    if (R.evac) return [false, 'La baliza ya está activa.'];
    if (R.t < 20) return [false, 'La baliza aún se está calibrando.'];
    R.evac = { t: 12 };
    this.msg(`${p.name} ACTIVÓ LA BALIZA DE EMERGENCIA · evacuación en 12 s (se conservan los materiales, se pierde el 80% de la biomasa)`, 0xff3b4a);
    this.emit(['evac', p.id]);
    return [true, 'Baliza activada.'];
  }
  updateEvac(dt) {
    const R = this.run;
    if (!R.evac || R.ended) return;
    R.evac.t -= dt;
    if (R.evac.t <= 0) { R.evac = null; R.evacuated = true; this.msg('EVACUACIÓN COMPLETADA · materiales asegurados', 0xffb020); this.endRun(false); }
  }
  // ---------------------------------------------------------------- micro-eventos de anomalía (baratos: un temporizador)
  updateAnomaly(dt, ctx) {
    const R = this.run;
    if (R.anom) { R.anom.t -= dt; if (R.anom.t <= 0) R.anom = null; return; }
    if (R.anomT === undefined) R.anomT = 35 + R.rng.next() * 30;
    if (R.bossId || R.ended || !ctx.alivePlayers.length) return;
    R.anomT -= dt;
    if (R.anomT > 0) return;
    R.anomT = 40 + R.rng.next() * 35;
    const id = R.rng.pick(['radar', 'emp', 'capsula', 'grieta']);
    R.anom = { id, t: id === 'radar' ? 12 : 3 };
    const A = ctx.alivePlayers;
    if (id === 'radar') this.msg('ANOMALÍA · INTERFERENCIA DE RADAR: minimapa y marcadores caídos 12 s', 0x8888ff);
    else if (id === 'emp') {
      for (const e of R.enemies.values()) if (e.type !== 'warden' && e.type !== 'heart' && A.some(p => Math.abs(p.b.x - e.x) < 900 && Math.abs(p.b.y - e.y) < 600)) e.stunT = Math.max(e.stunT || 0, 2.5);
      this.msg('ANOMALÍA · PULSO EMP: enemigos cercanos aturdidos', 0x39d7ff);
    } else if (id === 'capsula') {
      for (const p of A) { p.hp = Math.min(p.maxHp, p.hp + 25); p.grenades = Math.min(5, p.grenades + 1); }
      const a = A[0]; this.emit(['supply', Math.round(a.b.x), Math.round(a.b.y)]);
      this.msg('ANOMALÍA · CÁPSULA DE SUMINISTRO SORPRESA: +25 vida, +1 granada', 0x7dff4f);
    } else {
      for (const p of A) p.runCredits += 40;
      this.msg('ANOMALÍA · GRIETA DE BIOMASA: +40 biomasa para el escuadrón', 0xffd34a);
    }
  }

  // ---------------------------------------------------------------- objetivos cooperativos y entorno
  updateObjectives(dt, ctx) {
    const R = this.run, L = R.L;
    const alive = ctx.alivePlayers;
    // Compuertas: hackeo simultáneo de terminales bajo fuego
    for (const g of R.gates) {
      if (!g.active || g.open) continue;
      const used = new Set();
      let occ = 0;
      for (const t of g.terminals) {
        for (const p of alive) {
          if (used.has(p.id)) continue;
          if (Math.abs(p.b.x + p.b.w / 2 - t.x) < 40 && Math.abs(p.b.y + p.b.h - t.y) < 20) { used.add(p.id); occ++; break; }
        }
      }
      g.occ = occ;
      // Requisito dinámico: nunca más terminales que operadores conectados y en pie.
      // Evita el bloqueo permanente si alguien abandona o cae a mitad del descenso.
      let able = 0;
      for (const p of alive) if (!p.ghost) able++;
      g.need = Math.max(1, Math.min(g.terminals.length, able));
      if (occ >= g.need) g.progress += dt / 20;
      g.waveT -= dt;
      const rc = R.roomCounts.get(g.roomId);
      if (g.waveT <= 0) {
        g.waveT = 7 / R.dds.aggro;
        if (!rc || rc.alive < 20) this.spawnWave(L.rooms[g.roomId], Math.round(1 + 1.2 * R.dds.spawnMul));
      }
      if (g.progress >= 1) {
        g.open = true;
        for (const idx of g.tiles) L.tiles[idx] = 0;
        this.emit(['gate', g.id]);
        this.msg('COMPUERTA HACKEADA · ACCESO CONCEDIDO (+50 créditos)', 0x7dff4f);
        for (const p of this.players.values()) { p.runCredits += 50; if (p.state === 'alive') this.mission(p, 'hack', 1); }
      }
    }
    // Detonadores
    for (const d of R.dets) {
      if (!d.active || d.done) continue;
      d.timer -= dt;
      d.bombs.forEach((bm, k) => {
        if (d.defused[k]) return;
        let holder = null;
        for (const p of alive) if ((p.held & B.INT) && Math.abs(p.b.x + p.b.w / 2 - bm.x) < 46 && Math.abs(p.b.y + p.b.h - bm.y) < 40) { holder = p; break; }
        if (holder) d.prog[k] += dt / 2.5; else d.prog[k] = Math.max(0, d.prog[k] - dt * 0.5);
        if (d.prog[k] >= 1) {
          d.defused[k] = true;
          this.emit(['defuse', d.id, k]);
          this.mission(holder, 'defuse', 1);
        }
      });
      if (d.defused.every(Boolean)) {
        d.done = 1;
        this.msg('DETONADORES NEUTRALIZADOS · +80 créditos', 0x7dff4f);
        for (const p of this.players.values()) p.runCredits += 80;
      } else if (d.timer <= 0) {
        d.done = 2;
        this.emit(['detx', d.id]);
        this.msg('¡DETONACIÓN! EL ESCUADRÓN RECIBE DAÑO MASIVO', 0xff3b3b);
        for (const bm of d.bombs) this.emit(['x', bm.x, bm.y - 20, 160]);
        for (const p of alive) { p.hurtT = 0; this.hurtPlayer(p, 45 * R.dds.dmgMul, p.b.x, p.b.y - 50); }
      }
    }
    // Trampas de energía (dañan a jugadores y enemigos)
    for (const tr of L.traps) {
      if (((this.t + tr.offset) % tr.period) >= tr.on) continue;
      for (const p of alive) {
        const b = p.b;
        if (b.x < tr.x + tr.w && b.x + b.w > tr.x && b.y + b.h > tr.y - 2 && b.y < tr.y + tr.h) this.hurtPlayer(p, 30 * dt, b.x, b.y, true);
      }
      const hits = this.queryEnemies(tr.x, tr.y - 4, tr.w, tr.h + 4, this._trOut || (this._trOut = []));
      for (const e of hits.slice()) if (e.type !== 'drone') this.damageEnemy(e, 45 * dt, null, e.x, e.y, { noShield: true });
    }
    // Arena: respiraderos de vapor y pilones de energía
    if (L.arena.kind === 'boss' && (R.bossId || R.activated.has(L.arena.id))) {
      const boss = R.enemies.get(R.bossId);
      const phase = boss ? boss.phase : 1;
      const period = phase >= 2 ? 3.6 : 5;
      let mask = 0;
      L.arena.vents.forEach((v, i) => {
        const on = ((R.t + i * 1.3) % period) < 1.6;
        if (!on) return;
        mask |= 1 << i;
        const top = v.y - v.h;
        for (const p of alive) {
          const b = p.b;
          if (b.x < v.x + v.w && b.x + b.w > v.x && b.y + b.h > top && b.y < v.y) this.hurtPlayer(p, 35 * dt, b.x, b.y, true);
        }
        const hits = this.queryEnemies(v.x, top, v.w, v.h, this._vOut || (this._vOut = []));
        for (const e of hits.slice()) {
          const dmg = (e.type === 'warden' || e.type === 'heart') ? e.maxHp * 0.012 * dt : 60 * dt;
          this.damageEnemy(e, dmg, null, e.x, e.y, { noShield: true });
        }
      });
      R.vents = mask;
      for (const py of R.pylons) {
        py.charge = Math.min(1, py.charge + dt / 18);
        if (py.charge < 1) continue;
        for (const p of alive) {
          const pressed = (p.held & B.INT) && !(p.prevHeld & B.INT);
          if (!pressed && !(p.held & B.INT)) continue;
          if (Math.abs(p.b.x + p.b.w / 2 - py.x) > 50 || Math.abs(p.b.y + p.b.h - py.y) > 40) continue;
          py.charge = 0;
          if (boss && Math.abs(boss.x + boss.w / 2 - py.x) < (boss.type === 'heart' ? 1100 : 560)) {
            boss.stunT = 3; boss.laserT = 0; boss.laserCharge = 0;
            this.emit(['zap', py.id, Math.round(boss.x + boss.w / 2), Math.round(boss.y + boss.h / 2)]);
            this.damageEnemy(boss, boss.maxHp * 0.05, p, boss.x, boss.y, { noShield: true });
            this.msg(`${p.name} SOBRECARGÓ UN PILÓN · JEFE ATURDIDO`, 0x39d7ff);
          } else {
            this.emit(['zap', py.id, py.x, py.y - 300]);
            this.msg('Descarga desperdiciada: el jefe está fuera de alcance del pilón', 0xffb020);
          }
          break;
        }
      }
    }
    // Alijos secretos
    for (const c of L.caches) {
      if (R.cachesTaken.has(c.id)) continue;
      for (const p of alive) {
        if (Math.abs(p.b.x + p.b.w / 2 - c.x) < 30 && Math.abs(p.b.y + p.b.h / 2 - c.y) < 40) {
          R.cachesTaken.add(c.id);
          p.runCredits += 80;
          for (const q of this.players.values()) q.runCredits += 30;
          this.emit(['cache', c.id, p.id]);
          this.msg(`${p.name} encontró un alijo secreto (+110 / +30 escuadrón)`, 0xffd34a);
          break;
        }
      }
    }
  }

  endRun(win) {
    const R = this.run;
    if (R.ended) return;
    R.ended = win ? 'win' : 'fail';
    const D = R.D;
    const loopIdx = Math.min(R.cycle, Campaign.TRUE_CYCLES - 1);
    const cine = win && D.final ? (R.variant === 'coop' ? 'ending_coop' : 'ending_solo_' + loopIdx) : null;
    R.endT = cine ? 6 : win ? 7 : 5;
    const rewards = {};
    for (const p of this.players.values()) {
      const prof = p.profile;
      const evac = R.evacuated;   // evacuación de emergencia: 100% materiales, sólo 20% biomasa
      const c = win ? p.runCredits + Math.round(300 * R.desc.reward) : Math.floor(p.runCredits * (evac ? 0.2 : 0.4));
      prof.credits += c; prof.stats.bio = (prof.stats.bio || 0) + c;
      const bag = {};
      for (const [k, v] of Object.entries(p.bag || {})) { const n = Math.floor(v * (win || evac ? 1 : 0.4)); if (n > 0) bag[k] = n; }
      Profiles.addMaterials(prof, bag);
      prof.stats.kills += p.kills;
      let side = null;
      if (win && prof.side) {
        const ok = {
          cajas: R.boxesTaken.size >= R.L.boxes.length, objetivo: R.targetDone, relampago: R.t < 420,
          intocable: !p.wasDowned, demolicion: p.coversBroken >= 15, artificiero: p.gKills >= 8
        }[prof.side];
        const sd = Campaign.side.find(x => x.id === prof.side);
        if (ok && sd) { Profiles.addMaterials(prof, sd.reward); side = sd.name; this.mission(p, 'side_done', 1); prof.side = null; }
      }
      if (win) {
        prof.stats.wins++;
        this.mission(p, 'descent_win', 1);
        const v = R.variant;
        if (D.idx + 1 > (prof.story[v] || 0)) prof.story[v] = Math.min(this.descList(v).length, D.idx + 1);
        if (cine) prof.endings[v] = (prof.endings[v] || 0) + 1;
        // Modo Historia: el láser orbital reinicia el mundo (nuevo bucle) y revela otra capa de la verdad
        if (cine && v === 'solo') {
          prof.cycle.solo = (prof.cycle.solo || 0) + 1;
          prof.story.solo = 0;
          if (!prof.fxOwned.includes('eco')) prof.fxOwned.push('eco');
          if (prof.cycle.solo >= Campaign.TRUE_CYCLES && !prof.wskinOwned.includes('verdad')) prof.wskinOwned.push('verdad');
        }
      }
      const spts = 1 + (win ? 2 : 0) + (side ? 1 : 0);
      Profiles.addSeasonPoints(prof, spts);
      rewards[p.id] = { credits: c, kills: p.kills, mats: bag, side, spts };
    }
    Profiles.save();
    if (win) this.sel[R.variant] = D.final && R.variant === 'solo' ? 0 : Math.min(this.descList(R.variant).length - 1, D.idx + 1);
    this.emit(['end', win ? 1 : 0, rewards, cine]);
    if (!win) this.msg('MISIÓN FALLIDA · VUESTROS NÚCLEOS REGRESAN A LA CELDA DE DESPRESURIZACIÓN', 0xff3b3b);
  }

  backToHub() {
    this.flush();
    this.phase = 'hub';
    this.run = null;
    this.countdown = -1;
    this.events.length = 0;
    let i = 0;
    for (const p of this.players.values()) { this.setupHubPlayer(p, i++); p.weapon = null; this.sendProfile(p); }
    this.io.to(this.code).emit('hub', { t: this.t, sel: this.selInfo() });
    this.broadcastRoster();
  }

  playerTuple(p) {
    const b = p.b;
    const flags = (b.facing > 0 ? 1 : 0) | (b.crouch ? 2 : 0) | (b.dashT > 0 ? 4 : 0) | (p.state === 'downed' ? 8 : 0) |
      (p.state === 'dead' ? 16 : 0) | ((p.held & B.FIRE) ? 32 : 0) | (p.ws && p.ws.mode === 'cannon' ? 64 : 0) |
      (p.ws && p.ws.reloadT > 0 ? 128 : 0) | ((p.held & B.INT) ? 256 : 0) | (b.onGround ? 512 : 0) | (p.inDialog ? 1024 : 0) |
      (p.ads && (p.held & B.ALT) ? 2048 : 0) | (p.ws && p.ws.cookT > 0 ? 4096 : 0);
    return [p.id, r1(b.x + b.w / 2), r1(b.y + b.h), Math.round(p.aim * 100), flags, Math.ceil(p.hp), Math.round(p.maxHp),
      Math.ceil(p.downT), Math.round(p.reviveProg * 100), Math.round(p.stimProg / C.STIM_TIME * 100)];
  }

  selfState(p) {
    const b = p.b, s = p.ws;
    return {
      q: p.lastSeq,
      b: [b.x, b.y, b.vx, b.vy, b.onGround ? 1 : 0, b.coyote, b.jumpBuf, b.airJumps, b.dashT, b.dashCd, b.dashDir,
        b.prevB, b.crouch ? 1 : 0, b.h, b.dropT, b.facing, b.ctrl ? 1 : 0, b.dashCdMul || 1, b.ride, b.ads ? 1 : 0, b.speedMul || 1, b.gravMul || 1],
      hp: Math.ceil(p.hp), mx: Math.round(p.maxHp), st: p.stims, cr: p.runCredits,
      am: s ? s.ammo : 0, rl: s ? r1(Math.max(0, s.reloadT)) : 0, ac: s ? r1(Math.max(0, s.altCd)) : 0,
      md: s && s.mode === 'cannon' ? 1 : 0, tac: s && s.tac && s.reloadT > 0 ? 1 : 0,
      gr: p.grenades || 0, gt: p.gType || 0, pf: s ? r1(s.perfT || 0) : 0, rt: s ? r1(s.reloadTotal || 1) : 1, mc: s ? r1(s.meleeCd || 0) : 0, ck: s ? r1(s.cookT) : 0, sk: p.streak || 0, sb: p.streakBank || [], bag: p.bag || {}
    };
  }

  // ---------------------------------------------------------------- red: snapshots delta por lotes
  // Cada cliente confirma (ack) la última instantánea recibida; el servidor sólo envía lo que cambió
  // respecto a esa base (modelo Quake 3). Las instantáneas son 'volatile': si se pierde una, la siguiente
  // sigue siendo válida porque se codifica contra la última CONFIRMADA, nunca contra la última enviada.
  static encode(tuples, keys, base, visible) {
    const map = new Map(), up = [], rm = [];
    for (let i = 0; i < tuples.length; i++) {
      if (visible && !visible[i]) continue;
      const id = tuples[i][0];
      map.set(id, keys[i]);
      if (!base || base.get(id) !== keys[i]) up.push(tuples[i]);
    }
    if (base) for (const id of base.keys()) if (!map.has(id)) rm.push(id);
    return { map, up, rm };
  }

  sendSnapshot(p, payload, ptuples, pkeys, pvis, etuples, ekeys) {
    const base = p.ackSeq >= 0 ? p.hist.get(p.ackSeq) : null;
    const sq = ++p.snapSeq;
    const P = Room.encode(ptuples, pkeys, base && base.p, pvis);
    payload.sq = sq; payload.bs = base ? p.ackSeq : -1;
    payload.p = P.up; payload.pr = P.rm;
    const entry = { p: P.map, e: null };
    if (etuples) {
      const E = Room.encode(etuples, ekeys, base && base.e, null);
      payload.e = E.up; payload.er = E.rm; entry.e = E.map;
    }
    p.hist.set(sq, entry);
    if (p.hist.size > 24) p.hist.delete(p.hist.keys().next().value);
    p.socket.volatile.emit('s', payload);
  }

  // Con la conexión del cliente congestionada sólo se envían eventos críticos (nunca se pierde una muerte)
  sendEvents(p, list) {
    if (!list.length) return;
    const conn = p.socket.conn;
    const congested = conn && conn.writeBuffer && conn.writeBuffer.length > 48;
    const out = congested ? list.filter(d => CRITICAL.has(d[0])) : list;
    if (out.length) p.socket.emit('e', out);
  }

  flush() {
    const evs = this.events;
    this.events = [];
    const players = [...this.players.values()];
    const ptuples = players.map(p => this.playerTuple(p));
    const pkeys = ptuples.map(t => t.join(','));
    if (this.phase === 'hub') {
      const npcs = this.npcs.map(n => [n.id, r1(n.x + n.w / 2), r1(n.y + n.h), n.facing, n.state === 'walk' ? 1 : 0]);
      const rc = players.filter(p => p.ready).length;
      const mine = evs.map(e => e.d);
      const lb = this.lobbyInfo();
      for (const p of players) {
        if (p.ghost) continue;
        this.sendSnapshot(p, { t: r1(this.t * 1000), n: npcs, rc, cd: r1(this.countdown), me: this.selfState(p), lb }, ptuples, pkeys, null, null, null);
        this.sendEvents(p, mine);
      }
      return;
    }
    const R = this.run;
    const IR = C.INTEREST_R * (R.uavT > 0 ? 2 : 1);
    const X = R.extract;
    const boss = R.bossId ? R.enemies.get(R.bossId) : null;
    const obj = {
      g: R.gates.map(g => [g.id, g.active ? 1 : 0, g.open ? 1 : 0, Math.round(g.progress * 100), g.occ, g.need || g.terminals.length]),
      d: R.dets.map(d => [d.id, d.active ? 1 : 0, d.done, Math.ceil(d.timer), d.prog.map(v => Math.round(v * 100)), d.defused.map(v => (v ? 1 : 0))]),
      py: R.pylons.map(pp => Math.round(pp.charge * 100)),
      v: R.vents, w: r1(R.wipeT),
      dds: [R.dds.alive, Math.round(R.dds.hpMul * 100), Math.round(R.dds.dmgMul * 100), Math.round(R.dds.aggro * 100)],
      pk: R.pickups.map(pk => [pk.id, Math.round(pk.x), Math.round(pk.y)]),
      boss: R.bossId, bk: boss ? boss.kind : 0,
      ex: X ? [X.phase === 'call' ? 1 : X.phase === 'board' ? 2 : 3, Math.ceil(Math.max(0, X.t)), X.inZone || 0, X.need || 0, Math.round(X.board * 50)] : 0,
      ev: R.event ? [R.event.id, Math.ceil(R.event.t)] : 0,
      mu: R.muts && R.muts.size ? [...R.muts] : 0,
      an: R.anom ? [R.anom.id, Math.ceil(R.anom.t)] : 0,
      ec: R.evac ? Math.ceil(R.evac.t) : 0,
      al: R.allies.map(a => [Math.round(a.x), Math.round(a.y), a.fixed ? 1 : 0]),
      uav: Math.ceil(R.uavT), sh: Math.ceil(R.shieldT), orb: r1(Math.max(0, R.orbitalT)),
      st: R.strikes.map(s => [Math.round(s.x), Math.round(s.y), r1(s.t)]),
      bx: R.boxesActive ? [...R.boxesTaken] : null, tg: R.targetId,
      br: this.brInfo ? this.brInfo() : 0
    };
    const enemies = [...R.enemies.values()];
    const etAll = enemies.map(e => [e.id, e.ti, r1(e.x + e.w / 2), r1(e.y + e.h), Math.max(0, Math.round(e.hp / e.maxHp * 1000)), e.flags | (e.marked || e.bounty ? 256 : 0), e.aux,
      e.type === 'elite' ? Math.round(e.shieldHp / e.shieldMax * 100) : ((e.type === 'warden' || e.type === 'heart') ? (e.laserLen | 0) : 0)]);
    const ekAll = etAll.map(t => t.join(','));
    const et = [], ek = [], pvis = new Array(players.length);
    for (const p of players) {
      if (p.ghost) continue;
      let fx = p.b.x, fy = p.b.y, all = false;
      if (p.state !== 'alive') {
        const mate = players.find(q => q.state === 'alive' && this.sameTeam(q, p)) || players.find(q => q.state === 'alive');
        if (mate) { fx = mate.b.x; fy = mate.b.y; } else all = true;
      }
      et.length = 0; ek.length = 0;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!all && e.type !== 'warden' && e.type !== 'heart' && (Math.abs(e.x - fx) > IR || Math.abs(e.y - fy) > IR * 0.75)) continue;
        et.push(etAll[i]); ek.push(ekAll[i]);
      }
      for (let i = 0; i < players.length; i++) {
        const q = players[i];
        pvis[i] = q === p || all || this.visiblePlayer(p, q, fx, fy, IR);
      }
      this.sendSnapshot(p, { t: r1(this.t * 1000), o: obj, me: this.selfState(p) }, ptuples, pkeys, pvis, et, ek);
      const mine = [];
      for (const ev of evs) {
        if (ev.x === undefined || all || (Math.abs(ev.x - fx) < IR && Math.abs(ev.y - fy) < IR)) mine.push(ev.d);
      }
      if (p.pendingDmg >= 1) mine.push(['ph', p.id, Math.round(p.pendingDmg), 1]);
      p.pendingDmg = 0;
      this.sendEvents(p, mine);
    }
  }
}


module.exports = Room;
