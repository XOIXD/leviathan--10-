/* LEVIATHAN - IA de enemigos (servidor autoritativo).
   soldier   : asalto a distancia, busca coberturas, se agacha y asoma para disparar.
   berserker : carga cuerpo a cuerpo con telegrafía y explosión al impacto.
   drone     : kamikaze volador de persecución rápida.
   elite     : sub-jefe con escudo de energía direccional (exige flanqueo cruzado).
   warden    : jefes de capa (Capataz, Quimera, Matriarca) con 3 fases.
   turret    : torreta asimilada. alpha: bestia con frente blindado. heart: Corazón del Leviathan (final). */
const C = require('../shared/constants');
const Phys = require('../shared/physics');
const Campaign = require('../shared/campaign');

const BASE = {
  soldier: { w: 22, h: 40, hp: 55, credits: 6 },
  berserker: { w: 28, h: 44, hp: 120, credits: 9 },
  drone: { w: 22, h: 18, hp: 26, credits: 4 },
  elite: { w: 34, h: 54, hp: 520, credits: 45 },
  warden: { w: 120, h: 110, hp: 4200, credits: 400 },
  turret: { w: 30, h: 30, hp: 140, credits: 8 },
  alpha: { w: 56, h: 40, hp: 300, credits: 20 },
  heart: { w: 200, h: 220, hp: 8200, credits: 600 }
};

// Banderas de estado para snapshots
const F = { RIGHT: 1, CROUCH: 2, TELE: 4, CHARGE: 8, STUN: 16, SHIELD: 32, LASER: 64, LCHARGE: 128 };

function create(id, type, x, y, roomId, hpMul, kind) {
  const b = Object.assign({}, BASE[type]);
  const cfg = kind ? Campaign.bosses[kind] : null;
  if (cfg) b.hp = cfg.hp;
  const e = {
    id, type, ti: C.ENEMY_TYPES.indexOf(type), x: x - b.w / 2, y: y - b.h, w: b.w, h: b.h,
    vx: 0, vy: 0, onGround: false, hitWall: false, baseHp: b.hp, maxHp: b.hp * hpMul, hp: b.hp * hpMul,
    roomId, facing: -1, state: 'idle', timer: 0, think: Math.random() * 0.3, target: 0, crouch: false,
    coverId: -1, phaseT: 1, coverPhase: 'hide', burst: 0, shotT: 0, shootT: 0.8 + Math.random(),
    patrolT: 0, patrolDir: 0, cd: 0, atkT: 1.5, credits: b.credits, dead: false, flags: 0, aux: 0,
    lastHitBy: 0, contactCd: 0, spawnX: x, spawnY: y, bob: Math.random() * 6
  };
  if (type === 'elite') { e.shieldMax = 260 * Math.sqrt(hpMul); e.shieldHp = e.shieldMax; e.shieldAng = Math.PI; e.lastShieldHit = -10; }
  if (type === 'warden') {
    e.phase = 1; e.stunT = 0; e.laserT = 0; e.laserCharge = 0; e.laserAng = 0; e.laserDir = 1;
    e.summonCd = 8; e.airborne = false; e.chargeDir = 1; e.atkT = 2.5;
    e.pending = []; e.pools = []; e.burrowT = 0; e.invuln = false;
  }
  if (cfg) { e.kind = kind; e.cfg = cfg; }
  if (type === 'heart') {
    e.phase = 1; e.stunT = 0; e.laserT = 0; e.laserCharge = 0; e.laserAng = 0; e.laserDir = 1; e.summonCd = 10;
    e.atkT = 3; e.ringT = 2; e.ringRot = 0; e.homeY = e.y; e.pending = []; e.pools = []; e.floorY = y + 70;
    e.spin = 0; e.spinT = 0; e.cyc = 0; e.cycT = 4.5; e.burstT = 0; e.transT = 0; e.invuln = false;
  }
  if (type === 'turret') { e.aimA = Math.PI; e.atkT = 1.5; }
  if (type === 'alpha') { e.airT = 0; e.airborne = false; e.chargeDir = 1; }
  e.poiseMax = { elite: 220, alpha: 170, warden: 650, heart: 1100 }[type] || 0;
  e.poise = e.poiseMax;
  e.stunT = e.stunT || 0;
  return e;
}

const cx = e => e.x + e.w / 2;
const cy = e => e.y + e.h / 2;
const sgn = v => (v < 0 ? -1 : 1);
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

function setCrouch(L, e, c) {
  if (c && !e.crouch) { e.y += 16; e.h = 24; e.crouch = true; }
  else if (!c && e.crouch) {
    if (!Phys.rectHitsSolid(L, e.x, e.y - 16, e.w, 40)) { e.y -= 16; e.h = 40; e.crouch = false; }
  }
}

function shoot(e, ctx, T, speed, dmg, spread) {
  const ox = cx(e) + e.facing * 12, oy = e.y + 7;
  const tx = cx(T.b), ty = T.b.y + T.b.h * 0.45;
  const a = Math.atan2(ty - oy, tx - ox) + (Math.random() - 0.5) * spread;
  ctx.enemyBullet(ox, oy, a, speed, dmg, 0, e);
}

function soldier(e, dt, ctx) {
  const L = ctx.L, ag = ctx.dds.aggro;
  e.think -= dt;
  if (e.think <= 0) {
    e.think = 0.3 / ag;
    const T = ctx.findTarget(e, 780, true);
    e.target = T ? T.id : 0;
    if (T) {
      const tcx = cx(T.b);
      let best = -1, bd = 1e9;
      for (const cv of L.covers) {
        if (!cv.alive || cv.kind === 'wall' || cv.kind === 'lid' || Math.abs(cv.y + cv.h - (e.y + e.h)) > 50) continue;
        const ccx = cv.x + cv.w / 2;
        const d = Math.abs(ccx - cx(e));
        if (d > 380 || Math.abs(ccx - tcx) < 120) continue;
        if (sgn(ccx - tcx) !== sgn(cx(e) - tcx)) continue;
        if (d < bd) { bd = d; best = cv.id; }
      }
      e.coverId = best;
    }
  }
  const T = e.target ? ctx.player(e.target) : null;
  let want = 0, crouch = false;
  if (!T) {
    e.patrolT -= dt;
    if (e.patrolT <= 0) { e.patrolT = 1 + Math.random() * 1.5; e.patrolDir = [-1, 0, 1][Math.floor(Math.random() * 3)]; }
    want = e.patrolDir * 60;
    if (want) e.facing = sgn(want);
  } else {
    const dx = cx(T.b) - cx(e);
    e.facing = sgn(dx);
    const cv = e.coverId >= 0 ? L.coverById.get(e.coverId) : null;
    if (cv && cv.alive) {
      const desired = cx(T.b) > cv.x + cv.w / 2 ? cv.x - e.w - 3 : cv.x + cv.w + 3;
      if (Math.abs(desired - e.x) > 6) {
        want = sgn(desired - e.x) * 140 * ag;
        e.coverPhase = 'hide'; e.phaseT = 0.4;
      } else {
        e.phaseT -= dt;
        if (e.coverPhase === 'hide') {
          crouch = true;
          if (e.phaseT <= 0) { e.coverPhase = 'peek'; e.phaseT = 0.9; e.burst = 3; e.shotT = 0.22 / ag; }
        } else {
          if (e.phaseT <= 0) { e.coverPhase = 'hide'; e.phaseT = (0.8 + Math.random() * 0.8) / ag; }
        }
      }
    } else {
      const dist = Math.abs(dx);
      if (dist > 430) want = sgn(dx) * 130 * ag;
      else if (dist < 220) want = -sgn(dx) * 110;
      e.shootT -= dt;
      if (e.shootT <= 0 && e.burst <= 0) {
        e.shootT = 1.5 / ag;
        if (Phys.lineOfSight(L, cx(e), e.y + 7, cx(T.b), cy(T.b), false)) { e.burst = 3; e.shotT = 0; }
      }
    }
    if (e.burst > 0 && !e.crouch) {
      e.shotT -= dt;
      if (e.shotT <= 0) { e.shotT = 0.13; e.burst--; shoot(e, ctx, T, 820, 7 * ctx.dds.dmgMul, 0.08 / ag); }
    }
  }
  setCrouch(L, e, crouch);
  e.vx = e.crouch ? 0 : approach(e.vx, want, 1000 * dt);
  if (e.onGround && e.hitWall && want !== 0) e.vy = -640;
  Phys.stepGroundBody(L, e, dt);
  e.flags = (e.facing > 0 ? F.RIGHT : 0) | (e.crouch ? F.CROUCH : 0);
}

function overlapPlayer(e, ctx) {
  for (const p of ctx.alivePlayers) {
    const b = p.b;
    if (e.x < b.x + b.w && e.x + e.w > b.x && e.y < b.y + b.h && e.y + e.h > b.y) return p;
  }
  return null;
}

function berserker(e, dt, ctx) {
  const L = ctx.L, ag = ctx.dds.aggro;
  e.think -= dt; e.cd -= dt;
  if (e.think <= 0) { e.think = 0.35 / ag; const T = ctx.findTarget(e, 800, false); e.target = T ? T.id : 0; }
  const T = e.target ? ctx.player(e.target) : null;
  let tele = false, charging = false, stun = false;
  if (e.state === 'idle' || e.state === 'chase') {
    if (!T) { e.vx = approach(e.vx, 0, 600 * dt); e.state = 'idle'; }
    else {
      e.state = 'chase';
      const dx = cx(T.b) - cx(e), dy = cy(T.b) - cy(e);
      e.facing = sgn(dx);
      e.vx = approach(e.vx, sgn(dx) * 150 * ag, 900 * dt);
      if (e.onGround && e.hitWall) e.vy = -700;
      if (Math.abs(dx) < 290 && Math.abs(dy) < 70 && e.cd <= 0) { e.state = 'windup'; e.timer = 0.55 / ag; e.chargeDir = sgn(dx); }
    }
  } else if (e.state === 'windup') {
    tele = true; e.vx = approach(e.vx, 0, 2000 * dt); e.timer -= dt;
    if (e.timer <= 0) { e.state = 'charge'; e.timer = 0.85; e.facing = e.chargeDir; ctx.emit(['charge', e.id]); }
  } else if (e.state === 'charge') {
    charging = true;
    e.vx = e.chargeDir * 540 * Math.min(ag, 1.6);
    e.timer -= dt;
    const hit = overlapPlayer(e, ctx);
    if (hit || e.hitWall || e.timer <= 0) {
      if (hit || e.hitWall) ctx.explode(cx(e), cy(e), 95, 26 * ctx.dds.dmgMul, 'enemy', null);
      e.state = 'stun'; e.timer = 1.2; e.cd = 1.0;
    }
  } else if (e.state === 'stun') {
    stun = true; e.vx = approach(e.vx, 0, 1500 * dt); e.timer -= dt;
    if (e.timer <= 0) e.state = 'chase';
  }
  Phys.stepGroundBody(L, e, dt);
  e.flags = (e.facing > 0 ? F.RIGHT : 0) | (tele ? F.TELE : 0) | (charging ? F.CHARGE : 0) | (stun ? F.STUN : 0);
}

function drone(e, dt, ctx) {
  const L = ctx.L, ag = ctx.dds.aggro;
  e.think -= dt; e.bob += dt * 4;
  if (e.think <= 0) { e.think = 0.4; const T = ctx.findTarget(e, 950, false); e.target = T ? T.id : 0; }
  const T = e.target ? ctx.player(e.target) : null;
  if (T) {
    const dx = cx(T.b) - cx(e), dy = cy(T.b) - cy(e);
    const d = Math.hypot(dx, dy) || 1;
    const spd = 250 * ag;
    e.vx = approach(e.vx, dx / d * spd, 750 * dt);
    e.vy = approach(e.vy, dy / d * spd + Math.sin(e.bob) * 40, 750 * dt);
    e.facing = sgn(dx);
    if (d < 30) {
      ctx.explode(cx(e), cy(e), 70, 18 * ctx.dds.dmgMul, 'enemy', null);
      ctx.killEnemy(e, null, false);
      return;
    }
  } else {
    e.vx *= 0.95; e.vy = Math.sin(e.bob) * 30;
  }
  Phys.stepFlyBody(L, e, dt);
  e.flags = (e.facing > 0 ? F.RIGHT : 0);
}

function elite(e, dt, ctx) {
  const L = ctx.L, ag = ctx.dds.aggro;
  e.think -= dt; e.atkT -= dt;
  if (e.think <= 0) { e.think = 0.3 / ag; const T = ctx.findTarget(e, 820, false); e.target = T ? T.id : 0; }
  const T = e.target ? ctx.player(e.target) : null;
  if (ctx.t - e.lastShieldHit > 3) e.shieldHp = Math.min(e.shieldMax, e.shieldHp + 90 * dt);
  let tele = false;
  if (T) {
    const dx = cx(T.b) - cx(e), dy = cy(T.b) - cy(e);
    const ta = Math.atan2(dy, dx);
    const d = angDiff(e.shieldAng, ta);
    const rs = 2.0 * ag * dt;
    e.shieldAng += Math.max(-rs, Math.min(rs, d));
    e.facing = sgn(dx);
    const dist = Math.abs(dx);
    if (e.state === 'slam') {
      tele = true; e.vx = 0; e.timer -= dt;
      if (e.timer <= 0) {
        ctx.explode(cx(e), e.y + e.h - 10, 150, 24 * ctx.dds.dmgMul, 'enemy', null);
        e.state = 'idle'; e.atkT = 3.2 / ag;
      }
    } else {
      let want = 0;
      if (dist > 260) want = sgn(dx) * 85 * ag; else if (dist < 140) want = -sgn(dx) * 60;
      e.vx = approach(e.vx, want, 600 * dt);
      if (e.onGround && e.hitWall && want) e.vy = -620;
      if (e.burst > 0) {
        e.shotT -= dt;
        if (e.shotT <= 0) { e.shotT = 0.1; e.burst--; shoot(e, ctx, T, 760, 9 * ctx.dds.dmgMul, 0.22); }
      } else if (e.atkT <= 0) {
        if (dist < 150 && Math.abs(dy) < 70) { e.state = 'slam'; e.timer = 0.6 / ag; ctx.emit(['tele', e.id]); }
        else if (Phys.lineOfSight(L, cx(e), e.y + 8, cx(T.b), cy(T.b), false)) { e.burst = 5; e.shotT = 0; e.atkT = 2.2 / ag; }
        else e.atkT = 0.5;
      }
    }
  } else e.vx = approach(e.vx, 0, 600 * dt);
  Phys.stepGroundBody(L, e, dt);
  e.aux = Math.round(e.shieldAng * 100);
  e.flags = (e.facing > 0 ? F.RIGHT : 0) | (tele ? F.TELE : 0) | (e.shieldHp > 0 ? F.SHIELD : 0);
}

// Intersección segmento-AABB (método de slabs)
function segHitsBox(x0, y0, x1, y1, b) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - b.x, b.x + b.w - x0, y0 - b.y, b.y + b.h - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}

// ------------------------------------------------------------ peligros de jefe (explosiones avisadas, charcos, eclosiones)
function tickHazards(e, dt, ctx) {
  const dm = ctx.dds.dmgMul;
  for (let i = e.pending.length - 1; i >= 0; i--) {
    const pd = e.pending[i];
    pd.t -= dt;
    if (pd.t > 0) continue;
    e.pending.splice(i, 1);
    if (pd.k === 'hatch') { ctx.spawnEnemy('berserker', pd.x, pd.y, e.roomId); ctx.emit(['sp', 0]); }
    else if (pd.k === 'sting') ctx.enemyBullet(pd.x, pd.y, Math.PI / 2, 720, 12 * dm, 0, e);
    else if (pd.k === 'shock') { for (const d of [-1, 1]) ctx.enemyBullet(pd.x + d * 40, pd.y - 22, d > 0 ? 0 : Math.PI, 520, 16 * dm, 1, e); }
    else if (pd.k === 'acid') { e.pools.push({ x: pd.x, y: pd.y, t: 4.5 }); ctx.emit(['pool', Math.round(pd.x), Math.round(pd.y), 45]); }
    else if (pd.k === 'rivet' && pd.a !== undefined) { for (let k = 0; k < 7; k++) ctx.enemyBullet(pd.x, pd.y, pd.a + (k - 3) * 0.09, 640, 9 * dm, 0, e); }
    else ctx.explode(pd.x, pd.y - 20, pd.r || 90, (pd.dmg || 24) * dm, 'enemy', null);
  }
  for (let i = e.pools.length - 1; i >= 0; i--) {
    const pl = e.pools[i];
    pl.t -= dt;
    if (pl.t <= 0) { e.pools.splice(i, 1); continue; }
    for (const p of ctx.alivePlayers) if (Math.abs(cx(p.b) - pl.x) < 62 && Math.abs(p.b.y + p.b.h - pl.y) < 30) ctx.hurtPlayer(p, 22 * dm * dt, pl.x, pl.y, true);
  }
}
const warnAt = (e, ctx, x, y, t, extra) => { e.pending.push(Object.assign({ x, y, t }, extra || {})); ctx.emit(['warn', Math.round(x), Math.round(y), (extra && extra.r) || 90]); };

// Ataques exclusivos de cada jefe (devuelven true si se ejecutaron)
const BOSS_ATK = {
  // Capataz: martillos hidráulicos que avanzan hacia el objetivo
  prensa(e, T, ctx, ph) { const dir = sgn(cx(T.b) - cx(e)), fy = e.y + e.h; for (let i = 0; i < 3 + ph; i++) warnAt(e, ctx, cx(e) + dir * (110 + i * 105), fy, 0.55 + i * 0.28, { r: 80, dmg: 26 }); ctx.emit(['msg', 'PRENSAS HIDRÁULICAS EN LÍNEA', 0xffb020]); },
  martillo(e, T, ctx, ph) { const fy = e.y + e.h; for (const d of [-1, 1]) for (let i = 0; i < 6; i++) warnAt(e, ctx, cx(e) + d * (100 + i * 95), fy, 0.45 + i * 0.2, { r: 75, dmg: 24 }); BOSS_ATK.onda(e, T, ctx, ph); },
  onda(e, T, ctx) { const fy = e.y + e.h; for (let i = 0; i < 3; i++) e.pending.push({ x: cx(e), y: fy, t: 0.3 + i * 0.45, k: 'shock' }); ctx.emit(['tele', e.id]); },
  remaches(e, T, ctx) { const a = Math.atan2(cy(T.b) - (e.y + 34), cx(T.b) - cx(e)); for (let k = 0; k < 9; k++) ctx.enemyBullet(cx(e), e.y + 34, a + (k - 4) * 0.07, 640, 9 * ctx.dds.dmgMul, 0, e); e.pending.push({ x: cx(e), y: e.y + 34, t: 0.4, k: 'rivet', a }); },
  // Quimera: ácido persistente, saltos depredadores y tres cabezas
  acido(e, T, ctx, ph) { const fy = T.b.y + T.b.h; for (let i = 0; i < 2 + ph; i++) warnAt(e, ctx, cx(T.b) + (i - (1 + ph) / 2) * 95, fy, 0.8 + i * 0.12, { k: 'acid', r: 60 }); ctx.emit(['msg', 'LA QUIMERA ESCUPE ÁCIDO', 0x60ffd8]); },
  salto(e, T, ctx) { e.state = 'slam'; e.airborne = false; e.leapPool = true; },
  cabezas(e, T, ctx, ph) { for (const [dy, sp] of [[8, 520], [40, 600], [72, 480]]) { const a = Math.atan2(cy(T.b) - (e.y + dy), cx(T.b) - cx(e)); for (let k = 0; k < 3 + ph; k++) ctx.enemyBullet(cx(e), e.y + dy, a + (k - (2 + ph) / 2) * 0.12, sp, 10 * ctx.dds.dmgMul, 0, e); } ctx.emit(['tele', e.id]); },
  // Matriarca: aguijones desde el techo, excavación y nidos
  aguijones(e, T, ctx, ph) { for (const p of ctx.alivePlayers) { const top = p.b.y - Phys.rayLength(ctx.L, cx(p.b), p.b.y, -Math.PI / 2, 700) + 12; for (let i = 0; i < 3 + ph; i++) warnAt(e, ctx, cx(p.b) + (i - (2 + ph) / 2) * 70, top, 0.6 + i * 0.15, { k: 'sting', r: 30 }); } ctx.emit(['msg', 'LLUVIA DE AGUIJONES', 0xff80e0]); },
  excavar(e) { e.state = 'burrow'; e.burrowT = 2.2; e.invuln = true; },
  huevos(e, T, ctx, ph) { const fy = e.y + e.h; for (let i = 0; i < 1 + ph; i++) warnAt(e, ctx, cx(e) + (Math.random() - 0.5) * 700, fy, 3, { k: 'hatch', r: 40 }); ctx.emit(['msg', 'LA MATRIARCA DEPOSITA NIDOS · DESTRÚYELOS O ECLOSIONARÁN', 0xff80e0]); }
};

function warden(e, dt, ctx) {
  const L = ctx.L, ag = ctx.dds.aggro;
  const ratio = e.hp / e.maxHp;
  const ph = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
  if (ph !== e.phase) {
    e.phase = ph;
    ctx.emit(['boss', e.id, ph]);
    const nm = e.cfg ? e.cfg.name : 'EL JEFE';
    ctx.emit(['msg', ph === 2 ? `${nm} ENFURECE · FASE 2` : `${nm} AL LÍMITE · FASE 3`, ph === 2 ? 0xffb020 : 0xff3b3b]);
    ctx.partBreak(e, ph);
  }
  e.think -= dt; e.summonCd -= dt; e.contactCd -= dt;
  if (e.think <= 0) { e.think = 0.4; const T = ctx.findTarget(e, 2000, false); e.target = T ? T.id : 0; }
  const T = e.target ? ctx.player(e.target) : null;
  let tele = false, charging = false;
  tickHazards(e, dt, ctx);
  // Matriarca bajo tierra: invulnerable, avanza hacia su presa y emerge con una erupción
  if (e.state === 'burrow') {
    e.burrowT -= dt;
    if (T) e.vx = approach(e.vx, sgn(cx(T.b) - cx(e)) * 520, 2400 * dt);
    Phys.stepGroundBody(L, e, dt);
    if (e.burrowT <= 0) {
      e.state = 'idle'; e.invuln = false;
      ctx.explode(cx(e), e.y + e.h - 10, 150, 30 * ctx.dds.dmgMul, 'enemy', null);
      for (let k = 0; k < 7; k++) ctx.enemyBullet(cx(e), e.y + e.h - 20, -Math.PI / 2 + (k - 3) * 0.28, 560, 12 * ctx.dds.dmgMul, 0, e);
      ctx.emit(['shake', 0.6]);
    }
    e.flags = (e.facing > 0 ? F.RIGHT : 0) | 512;
    return;
  }

  if (e.stunT > 0) {
    e.stunT -= dt; e.vx = approach(e.vx, 0, 1500 * dt); e.laserT = 0; e.laserCharge = 0;
    Phys.stepGroundBody(L, e, dt);
    e.flags = (e.facing > 0 ? F.RIGHT : 0) | F.STUN;
    return;
  }
  // Rayo abisal (fase 3)
  if (e.laserCharge > 0) {
    e.laserCharge -= dt; e.vx = 0;
    if (e.laserCharge <= 0) e.laserT = 2.6;
  } else if (e.laserT > 0) {
    e.laserT -= dt; e.vx = 0;
    e.laserAng += e.laserDir * 0.75 * ag * dt;
    const ox = cx(e), oy = e.y + 26;
    const len = Phys.rayLength(L, ox, oy, e.laserAng, 1500);
    const ex = ox + Math.cos(e.laserAng) * len, ey = oy + Math.sin(e.laserAng) * len;
    e.laserLen = len;
    for (const p of ctx.alivePlayers) if (segHitsBox(ox, oy, ex, ey, p.b)) ctx.hurtPlayer(p, 42 * ctx.dds.dmgMul * dt, ox, oy, true);
  } else if (e.state === 'slam') {
    if (e.airborne && e.onGround) {
      e.airborne = false; e.state = 'idle';
      ctx.explode(cx(e), e.y + e.h - 10, 190, 28 * ctx.dds.dmgMul, 'enemy', null);
      if (e.leapPool) { e.leapPool = false; e.pools.push({ x: cx(e), y: e.y + e.h, t: 4.5 }); ctx.emit(['pool', Math.round(cx(e)), Math.round(e.y + e.h), 45]); }
      for (const d of [-1, 1]) ctx.enemyBullet(cx(e) + d * 70, e.y + e.h - 22, d > 0 ? 0 : Math.PI, 480, 20 * ctx.dds.dmgMul, 1, e);
    } else if (e.onGround && !e.airborne) {
      e.airborne = true; e.vy = -980;
      if (T) e.vx = Math.max(-420, Math.min(420, (cx(T.b) - cx(e)) * 1.2));
    }
  } else if (e.state === 'windup') {
    tele = true; e.vx = approach(e.vx, 0, 2000 * dt); e.timer -= dt;
    if (e.timer <= 0) { e.state = 'charge'; e.timer = 1.1; }
  } else if (e.state === 'charge') {
    charging = true; e.vx = e.chargeDir * 640; e.timer -= dt;
    if (e.hitWall) { e.state = 'idle'; e.stunT = 1.4; ctx.emit(['shake', 0.6]); ctx.emit(['msg', '¡JEFE ATURDIDO! ¡FUEGO A DISCRECIÓN!', 0x5dff7a]); }
    else if (e.timer <= 0) e.state = 'idle';
  } else {
    e.atkT -= dt;
    if (T) {
      const dx = cx(T.b) - cx(e);
      e.facing = sgn(dx);
      const dist = Math.abs(dx);
      e.vx = approach(e.vx, dist > 260 ? sgn(dx) * 90 * ag : 0, 500 * dt);
      if (e.atkT <= 0) {
        e.atkT = [0, 2.4, 1.9, 1.5][ph] / ag;
        let opts = (e.cfg ? e.cfg.attacks[ph] : ['volley', 'slam']).slice();
        if (e.summonCd > 0) opts = opts.filter(o => o !== 'summon');
        if (!opts.length) opts = ['volley'];
        const a = opts[Math.floor(Math.random() * opts.length)];
        if (BOSS_ATK[a]) BOSS_ATK[a](e, T, ctx, ph);
        else if (a === 'volley') {
          const count = ph === 3 ? 11 : 7;
          const base = Math.atan2(cy(T.b) - (e.y + 30), cx(T.b) - cx(e));
          for (let i = 0; i < count; i++) ctx.enemyBullet(cx(e), e.y + 30, base + (i - (count - 1) / 2) * 0.13, 560, 11 * ctx.dds.dmgMul, 0, e);
          ctx.emit(['tele', e.id]);
        } else if (a === 'slam') { e.state = 'slam'; e.airborne = false; }
        else if (a === 'charge') { e.state = 'windup'; e.timer = 0.65; e.chargeDir = sgn(dx); ctx.emit(['tele', e.id]); }
        else if (a === 'summon') {
          e.summonCd = 14;
          const st = e.cfg ? e.cfg.summon : 'drone';
          const count = st === 'alpha' ? 1 + Math.floor(ctx.alivePlayers.length / 4) : 2 + Math.floor(ctx.alivePlayers.length / 2);
          for (let i = 0; i < count; i++) ctx.spawnEnemy(st, cx(e) + (i - count / 2) * 60, st === 'drone' ? e.y - 10 : e.y + e.h, e.roomId);
          ctx.emit(['msg', 'REFUERZOS DE LA COLMENA DESPLEGADOS', 0xffb020]);
        } else if (a === 'laser') {
          e.laserDir = Math.random() < 0.5 ? -1 : 1;
          e.laserAng = Math.atan2(cy(T.b) - (e.y + 26), cx(T.b) - cx(e)) - 0.9 * e.laserDir;
          e.laserCharge = 0.9;
          ctx.emit(['msg', '¡RAYO ABISAL CARGANDO!', 0xff3b3b]);
        }
      }
    } else e.vx = approach(e.vx, 0, 500 * dt);
  }
  // Daño por contacto
  if (e.contactCd <= 0) {
    const p = overlapPlayer(e, ctx);
    if (p) { ctx.hurtPlayer(p, (charging ? 34 : 18) * ctx.dds.dmgMul, cx(e), cy(e)); e.contactCd = 0.5; }
  }
  Phys.stepGroundBody(L, e, dt);
  e.aux = Math.round(e.laserAng * 100);
  e.flags = (e.facing > 0 ? F.RIGHT : 0) | (tele ? F.TELE : 0) | (charging ? F.CHARGE : 0) |
    (e.laserT > 0 ? F.LASER : 0) | (e.laserCharge > 0 ? F.LCHARGE : 0);
}

function turret(e, dt, ctx) {
  const ag = ctx.dds.aggro;
  e.think -= dt; e.atkT -= dt;
  if (e.think <= 0) { e.think = 0.4; const T = ctx.findTarget(e, 720, true); e.target = T ? T.id : 0; }
  const T = e.target ? ctx.player(e.target) : null;
  let tele = false;
  if (T) {
    const ta = Math.atan2(cy(T.b) - (e.y + 8), cx(T.b) - cx(e));
    const d = angDiff(e.aimA, ta), rs = 2.4 * dt * ag;
    e.aimA += Math.max(-rs, Math.min(rs, d));
    e.facing = Math.cos(e.aimA) >= 0 ? 1 : -1;
    if (e.burst > 0) {
      e.shotT -= dt;
      if (e.shotT <= 0) {
        e.shotT = 0.09; e.burst--;
        ctx.enemyBullet(cx(e) + Math.cos(e.aimA) * 18, e.y + 8 + Math.sin(e.aimA) * 18, e.aimA + (Math.random() - 0.5) * 0.06, 900, 6 * ctx.dds.dmgMul, 0, e);
      }
    } else if (e.atkT <= 0.45) { tele = true; if (e.atkT <= 0) { e.burst = 4; e.atkT = 2.4 / ag; } }
  }
  e.vx = 0;
  Phys.stepGroundBody(ctx.L, e, dt);
  e.aux = Math.round(e.aimA * 100);
  e.flags = (e.facing > 0 ? F.RIGHT : 0) | (tele ? F.TELE : 0);
}

function alpha(e, dt, ctx) {
  const L = ctx.L, ag = ctx.dds.aggro;
  e.think -= dt; e.cd -= dt; e.contactCd -= dt;
  if (e.think <= 0) { e.think = 0.35 / ag; const T = ctx.findTarget(e, 850, false); e.target = T ? T.id : 0; }
  const T = e.target ? ctx.player(e.target) : null;
  let tele = false, charging = false;
  if (e.state === 'windup') {
    tele = true; e.vx = approach(e.vx, 0, 2000 * dt); e.timer -= dt;
    if (e.timer <= 0) { e.state = 'leap'; e.vy = -650; e.vx = e.chargeDir * 470 * Math.min(ag, 1.5); e.airT = 0; ctx.emit(['charge', e.id]); }
  } else if (e.state === 'leap') {
    charging = true; e.airT += dt;
    if (e.contactCd <= 0) { const p = overlapPlayer(e, ctx); if (p) { ctx.hurtPlayer(p, 20 * ctx.dds.dmgMul, cx(e), cy(e)); e.contactCd = 0.6; } }
    if (e.onGround && e.airT > 0.12) {
      ctx.explode(cx(e), e.y + e.h - 6, 105, 22 * ctx.dds.dmgMul, 'enemy', null);
      e.state = 'recover'; e.timer = 0.9; e.cd = 2.6 / ag;
    }
  } else if (e.state === 'recover') {
    e.vx = approach(e.vx, 0, 1800 * dt); e.timer -= dt;
    if (e.timer <= 0) e.state = 'chase';
  } else {
    if (!T) { e.vx = approach(e.vx, 0, 600 * dt); e.state = 'idle'; }
    else {
      e.state = 'chase';
      const dx = cx(T.b) - cx(e), dy = cy(T.b) - cy(e);
      e.facing = sgn(dx);
      e.vx = approach(e.vx, sgn(dx) * 170 * ag, 900 * dt);
      if (e.onGround && e.hitWall) e.vy = -720;
      if (Math.abs(dx) < 340 && Math.abs(dy) < 130 && e.cd <= 0 && e.onGround) { e.state = 'windup'; e.timer = 0.5 / ag; e.chargeDir = sgn(dx); ctx.emit(['tele', e.id]); }
    }
  }
  Phys.stepGroundBody(L, e, dt);
  e.flags = (e.facing > 0 ? F.RIGHT : 0) | (tele ? F.TELE : 0) | (charging ? F.CHARGE : 0);
}

// Jefe final: el Corazón del Leviathan (flotante, estacionario, anillos de Flujo, tentáculos y rayo)
function heart(e, dt, ctx) {
  const ag = ctx.dds.aggro;
  const ratio = e.hp / e.maxHp;
  const ph = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
  if (ph !== e.phase) {
    e.phase = ph;
    ctx.emit(['boss', e.id, ph]);
    ctx.emit(['msg', ph === 2 ? 'FASE 2 · BOMBEO ARTERIAL: espirales y arterias de Flujo' : 'FASE 3 · ARRITMIA: patrones alternos; castígalo cuando quede expuesto', ph === 2 ? 0xffb020 : 0xff3b3b]);
    ctx.partBreak(e, ph);
    if (ph > 1) { e.transT = 2; e.invuln = true; e.laserT = 0; e.laserCharge = 0; e.cycT = 4.5; e.cyc = 0; for (let i = 0; i < 12; i++) ctx.enemyBullet(cx(e), cy(e), i * Math.PI / 6, 200, 8 * ctx.dds.dmgMul, 0, e); }
  }
  e.bob += dt; e.contactCd -= dt; e.summonCd -= dt;
  e.y = e.homeY + Math.sin(e.bob * 1.3) * 14;
  tickHazards(e, dt, ctx);
  if (e.stunT > 0) { e.stunT -= dt; e.laserT = 0; e.laserCharge = 0; e.flags = F.STUN; return; }
  e.think -= dt;
  if (e.think <= 0) { e.think = 0.4; const T = ctx.findTarget(e, 3000, false); e.target = T ? T.id : 0; }
  const T = e.target ? ctx.player(e.target) : null;
  const ox = cx(e), oy = cy(e);
  if (e.laserCharge > 0) {
    e.laserCharge -= dt;
    if (e.laserCharge <= 0) e.laserT = 2.8;
  } else if (e.laserT > 0) {
    e.laserT -= dt;
    e.laserAng += e.laserDir * 0.7 * ag * dt;
    const len = Phys.rayLength(ctx.L, ox, oy, e.laserAng, 1600);
    e.laserLen = len;
    const ex = ox + Math.cos(e.laserAng) * len, ey = oy + Math.sin(e.laserAng) * len;
    for (const p of ctx.alivePlayers) if (segHitsBox(ox, oy, ex, ey, p.b)) ctx.hurtPlayer(p, 40 * ctx.dds.dmgMul * dt, ox, oy, true);
  } else if (e.transT > 0) {
    // Transición de fase: invulnerable 2 s, onda de choque legible (pocas balas y lentas)
    e.transT -= dt;
    if (e.transT <= 0) e.invuln = false;
  } else if (ph === 1) {
    // FASE 1 · LATIDO: anillos lentos con un hueco que gira (siempre hay salida) + golpes avisados
    e.ringT -= dt; e.atkT -= dt;
    if (e.ringT <= 0) {
      e.ringT = 2.6 / ag; e.ringRot += 0.5;
      const n = 18;
      for (let i = 0; i < n; i++) { if (i % n < 3) continue; ctx.enemyBullet(ox, oy, e.ringRot + i * Math.PI * 2 / n, 260, 10 * ctx.dds.dmgMul, 0, e); }
    }
    if (T && e.atkT <= 0) { e.atkT = 3.2 / ag; for (const p of ctx.alivePlayers) warnAt(e, ctx, cx(p.b), p.b.y + p.b.h, 0.95, { r: 90, dmg: 26 }); }
  } else if (ph === 2) {
    // FASE 2 · BOMBEO ARTERIAL: espiral doble continua + barridos de arteria + crías
    e.spinT -= dt; e.atkT -= dt;
    if (e.spinT <= 0) { e.spinT = 0.13 / ag; e.spin += 0.24; for (const o of [0, Math.PI]) ctx.enemyBullet(ox, oy, e.spin + o, 250, 10 * ctx.dds.dmgMul, 0, e); }
    if (T && e.atkT <= 0) {
      e.atkT = 4 / ag;
      if (e.summonCd <= 0 && Math.random() < 0.45) {
        e.summonCd = 12;
        const k = 2 + Math.floor(ctx.alivePlayers.length / 2);
        for (let i = 0; i < k; i++) ctx.spawnEnemy(i % 3 === 2 ? 'berserker' : 'drone', ox + (i - k / 2) * 70, i % 3 === 2 ? e.floorY : oy, e.roomId);
        ctx.emit(['msg', 'EL CORAZÓN EXPULSA CRÍAS DE LA COLMENA', 0xffb020]);
      } else {
        e.laserDir = Math.random() < 0.5 ? -1 : 1;
        e.laserAng = Math.atan2(cy(T.b) - oy, cx(T.b) - ox) - 0.9 * e.laserDir;
        e.laserCharge = 1.1;
        ctx.emit(['msg', '¡ARTERIA DE FLUJO CARGANDO!', 0xff3b3b]);
      }
    }
  } else {
    // FASE 3 · ARRITMIA: ciclos de patrones distintos; tras cada ciclo el Corazón queda EXPUESTO (ventana de castigo)
    e.cycT -= dt; e.burstT -= dt;
    const A = ctx.L.arena;
    if (e.cyc === 0 && e.burstT <= 0) {            // ráfagas dirigidas a cada operador
      e.burstT = 0.55 / ag;
      for (const p of ctx.alivePlayers) { const a = Math.atan2(cy(p.b) - oy, cx(p.b) - ox); for (let k = -1; k <= 1; k++) ctx.enemyBullet(ox, oy, a + k * 0.1, 430, 10 * ctx.dds.dmgMul, 0, e); }
    } else if (e.cyc === 1 && e.burstT <= 0) {     // tablero de impactos con carriles seguros alternos
      e.burstT = 1.5;
      e.par = !e.par;
      for (let x = A.x + 80 + (e.par ? 0 : 120); x < A.x + A.w - 60; x += 240) warnAt(e, ctx, x, A.floorTop, 1.1, { r: 95, dmg: 26 });
    } else if (e.cyc === 2) {                      // espiral inversa + barrido
      e.spinT -= dt;
      if (e.spinT <= 0) { e.spinT = 0.16 / ag; e.spin -= 0.3; for (const o of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) ctx.enemyBullet(ox, oy, e.spin + o, 230, 10 * ctx.dds.dmgMul, 0, e); }
      if (T && e.laserT <= 0 && e.laserCharge <= 0 && e.cycT > 3.2) { e.laserDir = e.par ? 1 : -1; e.laserAng = Math.atan2(cy(T.b) - oy, cx(T.b) - ox) - 0.8 * e.laserDir; e.laserCharge = 0.9; }
    }
    if (e.cycT <= 0) {
      e.cyc = (e.cyc + 1) % 3; e.cycT = 4.5;
      if (e.cyc === 0) { e.stunT = 1.8; ctx.emit(['msg', '¡EL CORAZÓN QUEDA EXPUESTO! ¡AHORA!', 0x7dff4f]); }
    }
  }
  if (e.contactCd <= 0) { const p = overlapPlayer(e, ctx); if (p) { ctx.hurtPlayer(p, 22 * ctx.dds.dmgMul, ox, oy); e.contactCd = 0.5; } }
  e.aux = Math.round(e.laserAng * 100);
  e.flags = (e.laserT > 0 ? F.LASER : 0) | (e.laserCharge > 0 ? F.LCHARGE : 0);
}

const AI = { soldier, berserker, drone, elite, warden, turret, alpha, heart };

function update(e, dt, ctx) {
  // Aturdimiento genérico por ruptura de equilibrio (élites, alfas, torretas, soldados)
  if (e.stunT > 0 && e.type !== 'warden' && e.type !== 'heart') {
    e.stunT -= dt; e.vx *= 0.85;
    if (e.type === 'drone') Phys.stepFlyBody(ctx.L, e, dt); else Phys.stepGroundBody(ctx.L, e, dt);
    e.flags = (e.facing > 0 ? F.RIGHT : 0) | F.STUN | (e.type === 'elite' && e.shieldHp > 0 ? F.SHIELD : 0);
    return;
  }
  AI[e.type](e, dt, ctx);
}

// Devuelve true si el escudo del élite bloquea un impacto proveniente de (hx,hy)
function shieldBlocks(e, hx, hy) {
  if (e.type !== 'elite' || e.shieldHp <= 0) return false;
  const a = Math.atan2(hy - cy(e), hx - cx(e));
  return Math.abs(angDiff(e.shieldAng, a)) < 1.25;
}

module.exports = { create, update, BASE, F, shieldBlocks, segHitsBox, cx, cy };
