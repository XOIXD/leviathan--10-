/* LEVIATHAN - Duelo de escuadrones 5 contra 5 (todos contra todos por equipos, estilo CoD).
   Reutiliza el PvP de la Batalla de Escuadrones (rejilla, daño, equipos) sobre los 15 mapas de TDMGen.
   Sin enemigos de la colmena: reaparición a los 4 s, gana el primer equipo en 30 bajas o el que más
   tenga al acabar los 6 minutos. */
const BRRoom = require('./br');
const Room = require('./room');
const TDMGen = require('../shared/tdmgen');
const Phys = require('../shared/physics');
const RNG = require('../shared/rng');
const Campaign = require('../shared/campaign');
const Profiles = require('./profiles');

const SCORE = 30, TIME = 360, RESPAWN = 4;

class TDMRoom extends BRRoom {
  constructor(code, io, onEmpty, opts) {
    super(code, io, onEmpty, Object.assign({}, opts, { teamSize: 5 }));
    this.tdm = true;
    this.max = 10;
    this.mapIdx = Number.isInteger(opts && opts.map) && opts.map >= 0 && opts.map < TDMGen.MAPS.length ? opts.map : Math.floor(Math.random() * TDMGen.MAPS.length);
  }
  selInfo() { const M = TDMGen.MAPS[this.mapIdx]; return { variant: 'br', idx: 0, id: 'TDM', name: `5 contra 5 · ${M.name}`, layer: 4, boss: null, tdm: true, map: this.mapIdx }; }
  summary() { return Object.assign(super.summary(), { mode: 'tdm', label: TDMGen.MAPS[this.mapIdx].name }); }
  onPlayerAdded(p) {
    const c = this.teamCounts();
    p.team = c[0] <= c[1] ? 0 : 1;              // equilibrio automático 5 / 5
    p.pvpKills = 0;
  }
  onAction(socket, a, cb) {
    if (a && a.type === 'team') a.team = Math.max(0, Math.min(1, a.team | 0));
    return super.onAction(socket, a, cb);
  }
  runInfo() { const info = super.runInfo(); info.tdm = true; info.map = this.mapIdx; return info; }

  startRun() {
    const players = [...this.players.values()].filter(p => !p.ghost);
    const L = TDMGen.generate(this.mapIdx);
    for (const cv of L.covers) { cv.alive = true; cv.hp = cv.maxHp; }
    Phys.buildCoverGrid(L);
    const seed = this.mapIdx, rng = new RNG(seed ^ 0x51ed27);
    const D = { idx: 0, id: 'TDM', layer: 4, k: 0, of: 1, name: '5 contra 5 · ' + L.map.name, boss: null, final: false, gen: {} };
    const season = Campaign.season();
    const teamSpawn = new Map([[0, L.spawns[0]], [1, L.spawns[1]]]);
    this.run = {
      L, seed, n: players.length, variant: 'br', D, layer: Campaign.layers[3], cycle: 0, season, t: 0,
      desc: { name: D.name, hpMul: 1, dmgMul: 1, reward: 1.2 },
      enemies: new Map(), bullets: [], pool: [], nextEid: 1, nextBid: 1, activated: new Set(L.rooms.map(r => r.id)), roomCounts: new Map(), secondWave: new Set(),
      gates: [], dets: [], pylons: [], vents: 0, bossId: 0, pickups: [], nextPk: 1, cachesTaken: new Set(),
      dds: { alive: players.length, hpMul: 1, dmgMul: 1, aggro: 1, spawnMul: 1 },
      wipeT: -1, ended: null, endT: 0, victoryT: -1, rng,
      allies: [], strikes: [], uavT: 0, shieldT: 0, event: null, eventT: Infinity,
      extract: null, orbitalT: -1, boxesTaken: new Set(), boxesActive: false, targetId: 0, targetRoom: -1, targetDone: false, matMul: 1,
      mapTeams: 2, teamIds: [0, 1], teamSpawn, matchT: 0, floodY: 0, floodStart: Infinity, floodMax: 0, floodRate: 0,
      bossSpawned: true, bossDead: false, eliminated: new Set(), placements: [], rowMsg: new Set(), score: [0, 0]
    };
    this.phase = 'run';
    this.events.length = 0;
    for (const p of players) { this.setupRunPlayer(p, false); this.respawn(p); p.pvpKills = 0; p.profile.stats.runs++; }
    this.computeDDS(true);
    Profiles.save();
    this.io.to(this.code).emit('run', this.runInfo());
    for (const p of players) this.sendProfile(p);
    this.broadcastRoster();
    this.msg(`5 CONTRA 5 · ${L.map.name.toUpperCase()} · ${L.map.desc}`, 0xffb020);
    this.msg(`Primer equipo en ${SCORE} bajas o el que más tenga en ${TIME / 60} minutos`, 0x39d7ff);
  }
  respawn(p) {
    const sp = this.run.teamSpawn.get(p.team) || this.run.L.spawns[0];
    p.b.x = sp.x + ((p.id % 5) - 2) * 14; p.b.y = sp.y; p.b.vx = p.b.vy = 0; p.b.ride = -1;
    p.lastSafe = { x: p.b.x, y: p.b.y };
    p.state = 'alive'; p.hp = p.maxHp; p.downT = 0; p.respT = 0; p.rescueT = this.run.t + 1.5;   // 1,5 s de protección al reaparecer
    if (p.ws) { p.ws.ammo = p.weapon.mag || 0; p.ws.reloadT = 0; }
  }
  activateRoom() {}
  computeDDS() { const R = this.run; R.dds = { alive: this.players.size, hpMul: 1, dmgMul: 1, aggro: 1, spawnMul: 0 }; }
  pvpDamage(q, attacker, dmg, sx, sy) {
    const was = q.state;
    super.pvpDamage(q, attacker, dmg, sx, sy);
    if (was === 'alive' && q.state === 'downed' && this.run && !this.run.ended) {
      this.run.score[attacker.team] = (this.run.score[attacker.team] || 0) + 1;
      q.state = 'dead'; q.respT = RESPAWN;                    // sin derribo: baja confirmada
      q.profile.stats.deaths = (q.profile.stats.deaths || 0) + 1;
      this.emit(['dead', q.id]);
    }
  }
  updateRun(dt) {
    Room.prototype.updateRun.call(this, dt);                  // simulación base (jugadores, balas, PvP) sin inundación ni jefe
    const R = this.run;
    if (!R || R.ended || this.phase !== 'run') return;   // el cierre (endT → refugio) lo gestiona la base PvP
    R.matchT += dt;
    for (const p of this.players.values()) {
      if (p.state === 'downed') { p.state = 'dead'; p.respT = RESPAWN; }
      if (p.state === 'dead' && !p.ghost) { p.respT = (p.respT || RESPAWN) - dt; if (p.respT <= 0) { this.respawn(p); this.emit(['rev', p.id]); } }
    }
    const [a, b] = R.score;
    if (a >= SCORE || b >= SCORE || R.matchT >= TIME) this.endBR(a === b ? -1 : a > b ? 0 : 1);
  }
  brInfo() {
    const R = this.run;
    return { tdm: 1, sc: R.score, tl: Math.max(0, Math.ceil(TIME - R.matchT)), goal: SCORE, ta: 2, tt: 2, fy: 0, bt: 0, bd: 0, fs: 0 };
  }
}

module.exports = TDMRoom;
