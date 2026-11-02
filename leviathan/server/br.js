/* LEVIATHAN - Batalla de Escuadrones (PvPvE competitivo). Subclase aislada de Room: reutiliza física,
   armas, enemigos y red, y sólo sobreescribe lo propio del modo. Si algo falla aquí, el cooperativo
   y el Modo Historia no se ven afectados.
   - Hasta 100 jugadores en equipos de 2, 5 o 10 (máx. 10 equipos), lobby interactivo en la Celda.
   - Mapa de alcantarillas convergentes (shared/brgen.js), inundación de Flujo que desciende.
   - Sin bucles narrativos: el lore se presenta directo en cada nivel del descenso.
   - Gana el escuadrón que liquide al Corazón del Leviathan y al resto de rivales. */
const C = require('../shared/constants');
const Phys = require('../shared/physics');
const BRGen = require('../shared/brgen');
const Campaign = require('../shared/campaign');
const RNG = require('../shared/rng');
const Profiles = require('./profiles');
const Room = require('./room');

const BOSS_TIME = 210;
const ROW_LORE = [
  'La corporación selló estos pozos con sus propios soldados dentro.',
  'Los colectores transportan Flujo crudo hacia las Cunas.',
  'Aquí empezó la plaga: el Tecno-Parásito subió por las cañerías.',
  'Las arterias del coloso laten bajo el hormigón.',
  'Los restos del Leviathan: quien los controle, controla el Flujo.'
];

class BRRoom extends Room {
  constructor(code, io, onEmpty, opts) {
    super(code, io, onEmpty);
    opts = opts || {};
    this.mode = 'br';
    this.pvp = true;
    this.isPublic = opts.public !== false;
    this.teamSize = [2, 5, 10].includes(opts.teamSize) ? opts.teamSize : 5;
    this.max = Math.min(100, this.teamSize * 10);
    this._pg = new Map();
    this._pgTick = -1;
  }
  variant() { return 'br'; }
  selInfo() { return { variant: 'br', idx: 0, id: 'BR', name: `Batalla de Escuadrones · equipos de ${this.teamSize}`, layer: 4, boss: 'heart' }; }
  roster() {
    const byId = new Map([...this.players.values()].map(p => [p.id, p]));
    return super.roster().map(r => Object.assign(r, { team: byId.get(r.id) ? byId.get(r.id).team : 0 }));
  }
  teamCounts() {
    const c = new Array(10).fill(0);
    for (const p of this.players.values()) if (p.team >= 0) c[p.team]++;
    return c;
  }
  onPlayerAdded(p) {
    const c = this.teamCounts();
    let t = c.findIndex(n => n > 0 && n < this.teamSize);
    if (t < 0) t = c.findIndex(n => n === 0);
    p.team = t < 0 ? 0 : t;
    p.pvpKills = 0;
  }
  sameTeam(a, b) { return a.team === b.team; }
  visiblePlayer(viewer, q, fx, fy, IR) {
    return q.team === viewer.team || (Math.abs(q.b.x - fx) < IR && Math.abs(q.b.y - fy) < IR * 0.75);
  }
  lobbyInfo() { return { ts: this.teamSize, c: this.teamCounts() }; }

  onAction(socket, a, cb) {
    const p = this.players.get(socket.id);
    const reply = (ok, msg) => { if (typeof cb === 'function') cb({ ok, msg, profile: p ? Profiles.publicView(p.profile) : null }); };
    if (!p || !a) return reply(false, 'Acción inválida');
    if (['campaign', 'cycle', 'side'].includes(a.type)) return reply(false, 'No disponible en la Batalla de Escuadrones.');
    if (a.type === 'team') {
      if (this.phase !== 'hub') return reply(false, 'Los equipos se eligen en el lobby.');
      if (!this.nearRole(p, 'commander')) return reply(false, 'Estás demasiado lejos.');
      const t = a.id | 0;
      if (t < 0 || t > 9) return reply(false, 'Equipo inválido.');
      if (t === p.team) return reply(false, 'Ya estás en ese equipo.');
      if (this.teamCounts()[t] >= this.teamSize) return reply(false, 'Ese equipo está completo.');
      p.team = t; p.ready = false;
      this.msg(`${p.name} se unió al ESCUADRÓN ${t + 1}`, 0x39d7ff);
      this.broadcastRoster();
      return reply(true, `Ahora perteneces al ESCUADRÓN ${t + 1}.`);
    }
    return super.onAction(socket, a, cb);
  }

  runInfo() {
    const info = super.runInfo();
    info.mode = 'br';
    info.teams = this.run.mapTeams;
    return info;
  }

  startRun() {
    const players = [...this.players.values()].filter(p => !p.ghost);
    const teamIds = [...new Set(players.map(p => p.team))].sort((a, b) => a - b);
    if (teamIds.length < 2) {
      this.msg('Se necesitan al menos 2 escuadrones para iniciar la batalla (elige equipo con Vex)', 0xffb020);
      for (const p of players) p.ready = false;
      this.broadcastRoster();
      return;
    }
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const mapTeams = Math.max(2, teamIds.length);
    const L = BRGen.generate(seed, mapTeams);
    for (const cv of L.covers) { cv.alive = true; cv.hp = cv.maxHp; }
    Phys.buildCoverGrid(L);
    const rng = new RNG(seed ^ 0x51ed27);
    const D = { idx: 6, id: 'BR', layer: 4, k: 0, of: 1, name: 'Batalla de Escuadrones', boss: 'heart', final: false, gen: {} };
    const season = Campaign.season();
    const teamSpawn = new Map();
    teamIds.forEach((t, i) => teamSpawn.set(t, L.spawns[Math.floor(i * L.GC / teamIds.length)]));
    this.run = {
      L, seed, n: players.length, variant: 'br', D, layer: Campaign.layers[3], cycle: 0, season, t: 0,
      desc: { name: D.name, hpMul: 1, dmgMul: 1, reward: 1.5 },
      enemies: new Map(), bullets: [], pool: [], nextEid: 1, nextBid: 1, activated: new Set(), roomCounts: new Map(), secondWave: new Set(),
      gates: [], dets: [], pylons: L.arena.pylons.map(pp => ({ id: pp.id, x: pp.x, y: pp.y, charge: 1 })),
      vents: 0, bossId: 0, pickups: [], nextPk: 1, cachesTaken: new Set(),
      dds: { alive: players.length, hpMul: 1, dmgMul: 1, aggro: 1, spawnMul: 1 },
      wipeT: -1, ended: null, endT: 0, victoryT: -1, rng,
      allies: [], strikes: [], uavT: 0, shieldT: 0, event: null, eventT: 70 + rng.next() * 30,
      extract: null, orbitalT: -1, boxesTaken: new Set(), boxesActive: false, targetId: 0, targetRoom: -1, targetDone: false,
      matMul: season.fx === 'mat' ? 1.3 : 1,
      // propio de la batalla
      mapTeams, teamIds, teamSpawn, matchT: 0, floodY: 0, floodStart: 60, floodMax: L.arena.y - 24,
      floodRate: (L.arena.y - 24) / 330, bossSpawned: false, bossDead: false, eliminated: new Set(), placements: [], rowMsg: new Set()
    };
    this.phase = 'run';
    this.events.length = 0;
    for (const p of players) {
      this.setupRunPlayer(p, false);
      const sp = teamSpawn.get(p.team);
      p.b.x = sp.x + ((p.id % 5) - 2) * 18; p.b.y = sp.y; p.lastSafe = { x: p.b.x, y: p.b.y };
      p.pvpKills = 0; p.profile.stats.runs++;
    }
    this.computeDDS(true);
    Profiles.save();
    this.io.to(this.code).emit('run', this.runInfo());
    for (const p of players) this.sendProfile(p);
    this.broadcastRoster();
    this.msg(`BATALLA DE ESCUADRONES · ${teamIds.length} EQUIPOS · ${players.length} NÚCLEOS`, 0xff3b3b);
    this.msg('Desciende por las alcantarillas: la INUNDACIÓN de Flujo baja desde arriba en 60 s', 0xffb020);
  }

  computeDDS(force) {
    const R = this.run;
    const a = Math.max(1, [...this.players.values()].filter(p => p.state === 'alive').length);
    if (!force && a === R.dds.alive) return;
    const hpMul = 1 + 0.03 * (a - 1);
    R.dds = { alive: a, hpMul, dmgMul: 1, aggro: 1 + 0.02 * Math.min(a, 20), spawnMul: 1 };
    for (const e of R.enemies.values()) {
      const ratio = e.hp / e.maxHp;
      e.maxHp = e.baseHp * hpMul * (e.marked ? 1.8 : 1) * (e.bounty ? 1.5 : 1);
      e.hp = Math.max(1, ratio * e.maxHp);
    }
  }

  activateRoom(room) {
    const R = this.run;
    R.activated.add(room.id);
    if (room.type === 'start') return;
    if (room.type === 'arena') { this.spawnBoss(); return; }
    this.spawnWave(room, R.rng.int(1, 3));
    if (!R.rowMsg.has(room.gy)) {
      R.rowMsg.add(room.gy);
      this.msg(`${R.L.rowNames[room.gy].toUpperCase()} · ${ROW_LORE[Math.min(room.gy, ROW_LORE.length - 1)]}`, 0x9ff8ff);
    }
  }

  spawnBoss() {
    const R = this.run;
    if (R.bossSpawned) return;
    R.bossSpawned = true;
    const a = R.L.arena;
    const e = this.spawnEnemy('heart', a.bossSpawn.x, a.floorTop - 70, a.id, 'heart');
    if (e) {
      e.maxHp *= 1 + 0.12 * R.teamIds.length; e.hp = e.maxHp;
      R.bossId = e.id;
      this.emit(['boss', e.id, 1]);
    }
    this.msg(`${ROW_LORE[4]} · ¡EL CORAZÓN DEL LEVIATHAN DESPIERTA EN LA CÁMARA CENTRAL!`, 0xff3b3b);
  }

  killEnemy(e, killer, credit) {
    if (e.type !== 'heart' || e.dead) return super.killEnemy(e, killer, credit);
    const R = this.run;
    super.killEnemy(e, killer, credit);
    R.orbitalT = -1; R.bossDead = true;
    this.events = this.events.filter(ev => ev.d[0] !== 'orbital' && !(ev.d[0] === 'msg' && String(ev.d[1]).startsWith('CORAZÓN DESTRUIDO')));
    this.msg(`EL CORAZÓN HA CAÍDO${killer ? ' ante el ESCUADRÓN ' + (killer.team + 1) : ''} · ¡QUE CAIGAN LOS ÚLTIMOS RIVALES!`, 0xffd34a);
  }

  updateRun(dt) {
    super.updateRun(dt);
    const R = this.run;
    if (!R || R.ended || this.phase !== 'run') return;
    R.matchT += dt;
    // Inundación de Flujo: presión progresiva hacia la cámara central (equivalente al "círculo")
    if (R.matchT > R.floodStart) R.floodY = Math.min(R.floodMax, R.floodY + R.floodRate * dt);
    if (R.floodY > 0) {
      for (const p of this.players.values()) {
        if (p.state !== 'alive') continue;
        if (p.b.y + p.b.h / 2 < R.floodY) this.hurtPlayer(p, 9 * dt * (1 + R.matchT / 240), p.b.x, p.b.y, true);
      }
    }
    if (!R.bossSpawned && R.matchT > BOSS_TIME) this.spawnBoss();
    // Eliminaciones y victoria
    const now = Date.now();
    const alive = new Set();
    for (const p of this.players.values()) {
      if (p.state === 'dead') continue;
      if (p.ghost && now > p.ghostUntil) continue;
      alive.add(p.team);
    }
    for (const t of R.teamIds) {
      if (alive.has(t) || R.eliminated.has(t)) continue;
      R.eliminated.add(t);
      R.placements.unshift(t);
      const place = alive.size + 1;
      this.emit(['elim', t, place]);
      this.msg(`ESCUADRÓN ${t + 1} ELIMINADO · PUESTO #${place}`, 0xff7b54);
    }
    if (alive.size === 0) this.endBR(-1);
    else if (alive.size === 1 && R.bossDead) this.endBR([...alive][0]);
    else if (alive.size === 1 && !R.lastTeamMsg) {
      R.lastTeamMsg = true;
      this.msg('ÚLTIMO ESCUADRÓN EN PIE · derrota al Corazón del Leviathan para coronarte', 0xffd34a);
      this.spawnBoss();
    }
  }

  placeOf(team, winTeam) {
    if (team === winTeam) return 1;
    const i = this.run.placements.indexOf(team);
    return i < 0 ? 2 : 2 + i;
  }

  endBR(winTeam) {
    const R = this.run;
    if (R.ended) return;
    R.ended = winTeam >= 0 ? 'win' : 'fail';
    R.endT = 8;
    const rewards = {};
    for (const p of this.players.values()) {
      const prof = p.profile;
      const place = this.placeOf(p.team, winTeam);
      const win = p.team === winTeam;
      const credits = (win ? 900 : Math.max(60, 420 - place * 40)) + p.pvpKills * 40 + p.kills * 5;
      prof.credits += credits; prof.stats.bio = (prof.stats.bio || 0) + credits;
      const bag = {};
      for (const [k, v] of Object.entries(p.bag || {})) { const n = Math.floor(v * (win ? 1 : 0.6)); if (n > 0) bag[k] = n; }
      Profiles.addMaterials(prof, bag);
      prof.stats.kills += p.kills;
      if (win) { prof.stats.wins++; this.mission(p, 'descent_win', 1); }
      const spts = place === 1 ? 3 : 1;
      Profiles.addSeasonPoints(p.profile, spts);
      rewards[p.id] = { credits, kills: p.kills + p.pvpKills, mats: bag, side: null, place, spts };
    }
    Profiles.save();
    this.emit(['end', winTeam >= 0 ? 1 : 0, rewards, null, winTeam]);
    this.msg(winTeam >= 0 ? `EL ESCUADRÓN ${winTeam + 1} CONTROLA LOS RESTOS DEL LEVIATHAN` : 'NINGÚN ESCUADRÓN SOBREVIVIÓ A LAS ALCANTARILLAS', 0xffd34a);
  }

  brInfo() {
    const R = this.run;
    return { ta: R.teamIds.length - R.eliminated.size, tt: R.teamIds.length, fy: Math.round(R.floodY), bt: R.bossSpawned ? 0 : Math.max(0, Math.ceil(BOSS_TIME - R.matchT)), bd: R.bossDead ? 1 : 0, fs: Math.max(0, Math.ceil(R.floodStart - R.matchT)) };
  }

  // ------------------------------------------------------------ PvP (con rejilla espacial de jugadores)
  playerGrid() {
    if (this._pgTick === this.tick) return this._pg;
    this._pgTick = this.tick;
    for (const arr of this._pg.values()) arr.length = 0;
    for (const p of this.players.values()) {
      if (p.state !== 'alive') continue;
      const k = Math.floor((p.b.x + p.b.w / 2) / 128) * 4096 + Math.floor((p.b.y + p.b.h / 2) / 128);
      let arr = this._pg.get(k);
      if (!arr) { arr = []; this._pg.set(k, arr); }
      arr.push(p);
    }
    return this._pg;
  }
  pvpTargets(x, y, w, h, out) {
    out.length = 0;
    const g = this.playerGrid();
    for (let gx = Math.floor(x / 128) - 1; gx <= Math.floor((x + w) / 128) + 1; gx++) {
      for (let gy = Math.floor(y / 128) - 1; gy <= Math.floor((y + h) / 128) + 1; gy++) {
        const arr = g.get(gx * 4096 + gy);
        if (arr) for (const p of arr) out.push(p);
      }
    }
    return out;
  }
  pvpDamage(q, attacker, dmg, sx, sy) {
    if (q.state !== 'alive') return;
    this.hurtPlayer(q, dmg, sx, sy);
    if (q.state === 'downed') {
      attacker.pvpKills = (attacker.pvpKills || 0) + 1;
      attacker.streak = (attacker.streak || 0) + 1;
      this.msg(`${attacker.name} [E${attacker.team + 1}] derribó a ${q.name} [E${q.team + 1}]`, 0xff9d6b);
    }
  }
  pvpHit(bl, sx, sy) {
    const owner = this.playerById(bl.owner);
    if (!owner) return false;
    for (const q of this.pvpTargets(bl.x, bl.y, 1, 1, this._ph || (this._ph = []))) {
      if (q.team === owner.team || q.b.dashT > 0) continue;
      const b = q.b;
      if (bl.x > b.x - 2 && bl.x < b.x + b.w + 2 && bl.y > b.y - 2 && bl.y < b.y + b.h + 2) {
        this.pvpDamage(q, owner, bl.dmg * 0.5, bl.x - sx * 3, bl.y);
        return true;
      }
    }
    return false;
  }
  pvpExplode(x, y, r, dmg, owner) {
    for (const q of this.pvpTargets(x - r, y - r, r * 2, r * 2, this._pe || (this._pe = [])).slice()) {
      if (q.team === owner.team) continue;
      const d = Math.hypot(q.b.x + q.b.w / 2 - x, q.b.y + q.b.h / 2 - y);
      if (d < r) { q.hurtT = 0; this.pvpDamage(q, owner, dmg * 0.5 * (1 - 0.5 * d / r), x, y); }
    }
  }
  pvpMelee(p, x, y, w, h, dmg) {
    for (const q of this.pvpTargets(x, y, w, h, this._pm || (this._pm = [])).slice()) {
      if (q.team === p.team) continue;
      const b = q.b;
      if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y) this.pvpDamage(q, p, dmg * 0.6, p.b.x, p.b.y);
    }
  }
}

module.exports = BRRoom;
