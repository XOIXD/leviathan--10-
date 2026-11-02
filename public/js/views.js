/* LEVIATHAN - Representaciones visuales de entidades (jugadores, enemigos, NPCs).
   La lógica vive en el servidor; aquí sólo se anima: squash & stretch, bob de carrera,
   flash de impacto, telegrafía, estelas de neón y fantasmas de dash. */

// Perfil físico de cada arma: rigidez/amortiguación del muelle de retroceso, cuánto retrocede,
// cuánto sube la boca, inercia de apuntado y cuánto se inclina el cuerpo al disparar
// Peso de las armas del catálogo extendido derivado de su forma y retroceso
function weightOf(arch) {
  const d = LV.Catalog.arms[arch] || {}, t = d.shape ? d.shape.t : 'rifle', k = d.kick || 0.5;
  if (['sword', 'dagger', 'whip', 'boot'].includes(t)) return { kick: 3, k: 500, c: 26, back: 3, climb: 0.08, follow: t === 'dagger' ? 50 : 30, lean: 0.02 };
  if (['hammer', 'lance', 'glaive'].includes(t)) return { kick: 6, k: 260, c: 18, back: 4, climb: 0.14, follow: 12, lean: 0.07 };
  return { kick: 4 + k * 14, k: 520 - k * 320, c: 28 - k * 14, back: 3 + k * 7, climb: 0.15 + k * 0.4, follow: 34 - k * 24, lean: 0.02 + k * 0.1 };
}
const WEIGHT = {
  pistol: { kick: 9, k: 520, c: 26, back: 5, climb: 0.35, follow: 30, lean: 0.03 },
  rifle: { kick: 6, k: 380, c: 22, back: 6, climb: 0.22, follow: 22, lean: 0.05 },
  cannon: { kick: 14, k: 210, c: 15, back: 9, climb: 0.45, follow: 12, lean: 0.14 },
  katana: { kick: 4, k: 400, c: 24, back: 3, climb: 0.1, follow: 40, lean: 0.02 },
  axe: { kick: 5, k: 300, c: 20, back: 4, climb: 0.12, follow: 14, lean: 0.06 },
  smg: { kick: 4, k: 600, c: 30, back: 3, climb: 0.15, follow: 34, lean: 0.02 },
  shotgun: { kick: 16, k: 240, c: 16, back: 8, climb: 0.5, follow: 18, lean: 0.12 },
  sniper: { kick: 18, k: 180, c: 13, back: 10, climb: 0.55, follow: 9, lean: 0.1 },
  lmg: { kick: 5, k: 260, c: 24, back: 5, climb: 0.16, follow: 8, lean: 0.06 },
  dagas: { kick: 2, k: 600, c: 30, back: 2, climb: 0.05, follow: 50, lean: 0.01 },
  clavos: { kick: 7, k: 420, c: 18, back: 4, climb: 0.3, follow: 26, lean: 0.03 },
  cetro: { kick: 6, k: 280, c: 18, back: 4, climb: 0.15, follow: 16, lean: 0.05 }
};

G.PlayerView = class {
  constructor(scene, id, isMe) {
    this.s = scene; this.id = id; this.isMe = isMe;
    this.body = scene.add.image(0, 0, 'pl_recluta').setOrigin(0.5, 1).setDepth(isMe ? 31 : 30);
    this.weapon = scene.add.image(0, 0, 'w_rifle').setScale(G.WeaponArt.SCALE).setOrigin(0.15, 0.5).setDepth(isMe ? 32 : 31).setVisible(false);
    this.label = scene.add.text(0, 0, '', { fontFamily: G.FONT, fontSize: '12px', fontStyle: 'bold', color: isMe ? '#39d7ff' : '#e8f4ff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(70);
    this.trailEm = null;
    this.light = scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(9).setAlpha(0).setScale(3);
    this.recoil = 0; this.lastRecoil = 0; this.kx = 0; this.kv = 0; this.aimS = 0; this.rlT = 0; this.rlOut = 0; this.morphT = 0; this.prevForm = null;
    this.wskins = {}; this.fxId = 'ninguno';
    this.makeTrail([0x8fb3cc]);
    this.x = 0; this.y = 0; this.px = 0; this.py = 0; this.vx = 0; this.vy = 0;
    this.aim = 0; this.flags = 0; this.prevFlags = 0; this.hp = 100; this.maxHp = 100;
    this.downT = 0; this.revive = 0; this.stim = 0;
    this.t = Math.random() * 10; this.squash = 0; this.ghostT = 0; this.swingT = 0; this.swingKind = 0;
    this.trailColors = [0x8fb3cc]; this.trailId = 'ninguna'; this.skin = 'recluta'; this.arch = null;
    this.applyRoster();
  }
  applyRoster() {
    const info = G.Net.roster.get(this.id);
    if (!info) return;
    this.label.setText(info.name);
    if (G.Net.mode === 'br' && info.team !== undefined) {
      const mine = G.Net.roster.get(G.Net.id);
      const ally = mine && mine.team === info.team;
      this.label.setText(`[E${info.team + 1}] ${info.name}`).setColor(this.isMe ? '#39d7ff' : ally ? '#7dff4f' : '#ff6b6b');
    }
    this.skin = info.skin || 'recluta';
    this.wskins = info.wskins || {}; this.fxId = info.fx || 'ninguno';
    const newTrail = info.trail || 'ninguna';
    if (newTrail !== this.trailId) {
      this.trailId = newTrail;
      const tr = LV.Catalog.trails.find(t => t.id === this.trailId) || LV.Catalog.trails[0];
      this.trailColors = tr.colors;
      this.makeTrail(tr.colors);
    }
    this.arch = info.weapon ? info.weapon.arch : null;
    this.weaponColor = info.weapon ? info.weapon.color : 0xffffff;
  }
  makeTrail(colors) {
    if (this.trailEm) this.trailEm.destroy();
    this.trailEm = this.s.add.particles(0, 0, 'px', {
      lifespan: 420, speed: { min: 0, max: 25 }, scale: { start: 1.3, end: 0 }, alpha: { start: 0.8, end: 0 },
      blendMode: 'ADD', frequency: 28, emitting: false, tint: colors
    }).setDepth(28);
  }
  setState(x, y, aim, flags, hp, maxHp, downT, revive, stim) {
    this.x = x; this.y = y; this.aim = aim; this.prevFlags = this.flags; this.flags = flags;
    this.hp = hp; this.maxHp = maxHp; this.downT = downT; this.revive = revive; this.stim = stim;
  }
  swing(kind) { this.swingT = kind === 2 ? 0.22 : 0.14; this.swingKind = kind; this.swingMax = this.swingT; }
  update(dt, fx, showWeapon) {
    this.t += dt;
    const f = this.flags;
    const dead = f & 16, downed = f & 8, crouch = f & 2, dashing = f & 4, onGround = f & 512;
    this.vx = this.vx * 0.7 + ((this.x - this.px) / Math.max(dt, 0.001)) * 0.3;
    this.vy = this.vy * 0.7 + ((this.y - this.py) / Math.max(dt, 0.001)) * 0.3;
    if ((f & 512) && !(this.prevFlags & 512)) this.squash = 0.22;
    this.prevFlags = f;
    this.px = this.x; this.py = this.y;
    const vis = !dead;
    this.body.setVisible(vis); this.label.setVisible(vis);
    if (dead) { this.light.setVisible(false); this.weapon.setVisible(false); this.trailEm.emitting = false; return; }
    const aimRight = Math.cos(this.aim) >= 0;
    const faceRight = showWeapon && this.arch ? aimRight : !!(f & 1);
    const tex = (crouch ? 'plc_' : 'pl_') + this.skin;
    if (this.body.texture.key !== tex) this.body.setTexture(tex);
    this.body.setFlipX(!faceRight);
    let bob = 0, rot = 0, sx = 1, sy = 1;
    if (downed) {
      rot = faceRight ? -1.45 : 1.45;
      this.body.setTint(Math.sin(this.t * 10) > 0 ? 0xff6060 : 0xffffff);
    } else {
      this.body.clearTint();
      if (onGround && Math.abs(this.vx) > 30 && !crouch) { bob = -Math.abs(Math.sin(this.t * 17)) * 2.5; rot = Phaser.Math.Clamp(this.vx / 270, -1, 1) * 0.08; }
      if (!onGround) { const st = Phaser.Math.Clamp(-this.vy / 900, -0.15, 0.15); sy = 1 + st; sx = 1 - st * 0.6; }
      if (this.squash > 0) { sy = 1 - this.squash; sx = 1 + this.squash * 0.8; this.squash = Math.max(0, this.squash - dt * 1.6); }
      if (dashing) { sx = 1.25; sy = 0.85; rot = faceRight ? 0.18 : -0.18; }
    }
    this.body.setPosition(this.x, this.y + bob + (downed ? -6 : 0)).setRotation(rot).setScale(sx, sy);
    this.label.setPosition(this.x, this.y - (crouch ? 34 : 50));
    // Arma
    if (showWeapon && this.arch && !downed) {
      const form = this.arch === 'axe' && (f & 64) ? 'cannon' : this.arch;
      const fin = this.wskins[this.arch];
      // Caché por (forma, acabado): la textura se genera una sola vez, nunca por fotograma
      const ck = form + '|' + (fin || '');
      if (this._wtKey !== ck) { this._wtKey = ck; this._wt = G.WeaponArt.key(this.s, form, fin); }
      const wt = this._wt;
      if (this.weapon.texture.key !== wt) this.weapon.setTexture(wt);
      let a = this.aim;
      if (this.swingT > 0) {
        this.swingT -= dt;
        const k = 1 - this.swingT / this.swingMax;
        const arc = this.swingKind === 2 ? 2.6 : 2.0;
        a = this.aim + (aimRight ? 1 : -1) * (-arc / 2 + arc * k);
      }
      const hy = this.y - (crouch ? 16 : 24);
      const side = aimRight ? 1 : -1;
      const W = WEIGHT[form] || (WEIGHT[form] = weightOf(form));
      // --- Retroceso con muelle amortiguado: patada, sobre-oscilación y asentamiento (peso real)
      if (this.recoil > this.lastRecoil + 0.05) this.kv += (this.recoil - this.lastRecoil) * W.kick;   // impulso por disparo
      this.recoil = Math.max(0, this.recoil - dt * 9);
      this.lastRecoil = this.recoil;
      const ka = -W.k * this.kx - W.c * this.kv;
      this.kv += ka * dt; this.kx += this.kv * dt;
      if (!isFinite(this.kx) || Math.abs(this.kx) > 3) { this.kx = 0; this.kv = 0; }
      const kick = Math.max(-0.4, this.kx);                     // >0 = retrocede hacia el hombro
      // --- Inercia de apuntado: el arma pesa y llega un pelo tarde a la mira
      if (!this._aimInit) { this._aimInit = true; this.aimS = a; }
      let da = a - this.aimS; da = Math.atan2(Math.sin(da), Math.cos(da));
      this.aimS += da * Math.min(1, dt * W.follow);
      if (this.swingT > 0) this.aimS = a;                       // los tajos son exactos
      // --- Balanceo al caminar y respiración en reposo
      const moving = onGround && Math.abs(this.vx) > 30;
      const sway = moving ? Math.sin(this.t * 17) * 1.2 : Math.sin(this.t * 2.2) * 0.5;
      // --- Recarga táctica: baja el arma, golpe de cargador y vuelta a la mira
      const reloading = !!(f & 128);
      if (reloading) this.rlT += dt; else this.rlT = 0;
      let rlRot = 0, rlDrop = 0;
      if (reloading && form !== 'katana') {
        const t = this.rlT;
        const tilt = Math.min(1, t / 0.14);                      // entrar
        rlRot = 0.75 * tilt; rlDrop = 5 * tilt;
        if (t > 0.45 && t < 0.62) { const k = (t - 0.45) / 0.17; rlRot -= Math.sin(k * Math.PI) * 0.35; rlDrop -= Math.sin(k * Math.PI) * 3; } // golpe de cargador
      } else if (this.rlOut > 0) { rlRot = 0.75 * this.rlOut; rlDrop = 5 * this.rlOut; }
      this.rlOut = reloading ? 1 : Math.max(0, this.rlOut - dt * 7);   // salida suave a la mira
      // --- Transformación hacha ↔ cañón: giro completo con estallido
      if (this.prevForm && this.prevForm !== form) { this.morphT = 0.3; if (fx) { fx.sparks.explode(12, this.x + side * 14, hy); fx.light(this.x + side * 14, hy, 0xff6a00, 3, 0.15); } }
      this.prevForm = form;
      let morphRot = 0, morphScale = 1;
      if (this.morphT > 0) { this.morphT -= dt; const k = 1 - this.morphT / 0.3; morphRot = side * Math.PI * 2 * (1 - Math.pow(1 - k, 3)); morphScale = 1 + Math.sin(k * Math.PI) * 0.35; }
      const ang = this.aimS;
      const px = this.x + side * 4 - Math.cos(ang) * kick * W.back + (moving ? 0 : 0);
      const py = hy - Math.sin(ang) * kick * W.back + sway * 0.6 + rlDrop;
      this.weapon.setVisible(true).setPosition(px, py)
        .setRotation(ang - side * (kick * W.climb - rlRot) + morphRot).setFlipY(!aimRight)
        .setScale(G.WeaponArt.SCALE * morphScale);
      this.weapon.setTint(0xffffff);
      // El cuerpo absorbe parte del retroceso (pesado en cañón, mínimo en pistola)
      if (kick > 0.05 && !dashing) this.body.setRotation(rot - side * kick * W.lean);
    } else this.weapon.setVisible(false);
    // Luz dinámica del operador: se intensifica con la velocidad y toma el color de su estela
    if (G.Gfx.lights) {
      const spd = Math.min(1, Math.hypot(this.vx, this.vy) / 900);
      this.light.setVisible(true).setPosition(this.x, this.y - 20).setTint(this.trailId === 'ninguna' ? 0x39d7ff : this.trailColors[0])
        .setAlpha((this.isMe ? 0.2 : 0.12) + spd * 0.35 + (dashing ? 0.25 : 0)).setScale(2.6 + spd * 2);
    } else this.light.setVisible(false);
    // Estela de neón (cosmético) + fantasmas de dash
    const moving = Math.abs(this.vx) > 120 || Math.abs(this.vy) > 300;
    this.trailEm.setPosition(this.x, this.y - (crouch ? 12 : 20));
    this.trailEm.emitting = moving && this.trailId !== 'ninguna' && !downed;
    if (dashing) {
      this.ghostT -= dt;
      if (this.ghostT <= 0) {
        this.ghostT = 0.025;
        const c = this.trailColors[Math.floor(Math.random() * this.trailColors.length)];
        fx.ghost(tex, this.x, this.y, !faceRight, this.trailId === 'ninguna' ? 0x39d7ff : c);
      }
    }
  }
  drawBars(g) {
    const f = this.flags;
    if (f & 16) return;
    if (f & 8) {
      const x = this.x, y = this.y - 40;
      g.lineStyle(3, 0x330000, 0.8); g.strokeCircle(x, y, 13);
      if (this.revive > 0) { g.lineStyle(3, 0x7dff4f, 1); g.beginPath(); g.arc(x, y, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.revive / 100); g.strokePath(); }
      if (this.stim > 0) { g.lineStyle(3, 0x39d7ff, 1); g.beginPath(); g.arc(x, y, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.stim / 100); g.strokePath(); }
      g.fillStyle(0xff3b3b, 0.5 + 0.5 * Math.sin(this.t * 8)); g.fillCircle(x, y, 5);
      return;
    }
    if (this.isMe || this.maxHp <= 0) return;
    const w = 34, x = this.x - w / 2, y = this.y - ((f & 2) ? 32 : 48);
    g.fillStyle(0x000000, 0.6); g.fillRect(x - 1, y - 1, w + 2, 5);
    const k = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    g.fillStyle(k > 0.5 ? 0x5dff7a : k > 0.25 ? 0xffb020 : 0xff3b3b, 1); g.fillRect(x, y, w * k, 3);
  }
  destroy() { this.light.destroy(); this.body.destroy(); this.weapon.destroy(); this.label.destroy(); this.trailEm.destroy(); }
};

const ENEMY_TEX = ['e_soldier', 'e_berserker', 'e_drone', 'e_elite', 'e_warden', 'e_turret', 'e_alpha', 'e_heart'];
const isBossTi = (ti) => ti === 4 || ti === 7;

G.EnemyView = class {
  constructor(scene, ti) {
    this.s = scene; this.ti = ti;
    this.sprite = scene.add.image(0, 0, ENEMY_TEX[ti]).setOrigin(0.5, 1).setDepth(isBossTi(ti) ? 25 : 26);
    this.gun = ti === 5 ? scene.add.image(0, 0, 'e_turret_gun').setOrigin(0.1, 0.5).setDepth(27) : null;
    this.tag = scene.add.text(0, 0, '', { fontFamily: G.FONT, fontSize: '11px', fontStyle: 'bold', color: '#ff7b54', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(70).setVisible(false);
    this.baseTint = 0xffffff;
    this.glow = scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(24).setVisible(false);
    this.reset();
  }
  reset() {
    this.id = 0; this.x = 0; this.y = 0; this.hp = 1000; this.flags = 0; this.aux = 0; this.extra = 0;
    this.flashT = 0; this.t = Math.random() * 10; this.seenHp = 1000; this.hpShowT = 0; this.alive = true;
  }
  activate(id) { this.reset(); this.id = id; this.sprite.setVisible(true); }
  release() { this.sprite.setVisible(false); this.glow.setVisible(false); this.tag.setVisible(false); if (this.gun) this.gun.setVisible(false); this.id = 0; this.baseTint = 0xffffff; if (this.kind) { this.kind = null; this.sprite.setTexture(ENEMY_TEX[this.ti]); } }
  // Cada jefe tiene su propio modelo (ya no es el mismo cuerpo teñido)
  setKind(kind) { if (this.kind === kind) return; this.kind = kind; const k = 'e_boss_' + kind; if (this.s.textures.exists(k)) this.sprite.setTexture(k); this.baseTint = 0xffffff; }
  setState(x, y, hp, flags, aux, extra) {
    if (hp < this.hp) this.hpShowT = 2.5;
    this.x = x; this.y = y; this.hp = hp; this.flags = flags; this.aux = aux; this.extra = extra;
  }
  flash() { this.flashT = 0.07; this.hpShowT = 2.5; }
  update(dt) {
    this.t += dt;
    const f = this.flags, sp = this.sprite;
    if (this.ti === 0) { const tex = (f & 2) ? 'e_soldier_c' : 'e_soldier'; if (sp.texture.key !== tex) sp.setTexture(tex); }
    sp.setFlipX(!(f & 1));
    let sx = 1, sy = 1, rot = 0, oy = 0;
    if (this.ti === 2) { oy = Math.sin(this.t * 9) * 2; rot = Math.sin(this.t * 5) * 0.12; }
    if (this.ti === 7) { const p = Math.sin(this.t * (f & 16 ? 2 : 6)); sx = 1 + p * 0.035; sy = 1 - p * 0.03; }
    if (this.ti === 5) sp.setFlipX(false);
    if (f & 4) { const p = Math.sin(this.t * 40) * 0.06; sx = 1 + p; sy = 1 - p; }
    if (f & 8) { sx = 1.15; sy = 0.92; rot = (f & 1) ? 0.12 : -0.12; }
    if (f & 16) rot = Math.sin(this.t * 20) * 0.08;
    sp.setPosition(this.x, this.y + oy).setScale(sx, sy).setRotation(rot).setAlpha(f & 512 ? 0.15 : 1);   // 512 = bajo tierra
    if (this.gun) this.gun.setVisible(true).setPosition(this.x, this.y - 17).setRotation(this.aux / 100).setFlipY(Math.cos(this.aux / 100) < 0);
    const marked = (f & 256) !== 0;
    this.tag.setVisible(marked);
    if (marked) this.tag.setText(this.ti === 3 ? '☠ OBJETIVO' : '☠ CAZADOR').setPosition(this.x, this.y - sp.displayHeight - 12);
    this.hpShowT -= dt;
    if (this.flashT > 0) { this.flashT -= dt; sp.setTintFill(0xffffff); }
    else if (f & 4) sp.setTint(Math.sin(this.t * 30) > 0 ? 0xff5050 : 0xffffff);
    else if (f & 16) sp.setTint(0x8888ff);
    else if (marked) sp.setTint(Math.sin(this.t * 6) > 0 ? 0xff9070 : 0xffffff);
    else if (this.ti === 7) {           // Corazón: color y latido según la fase
      const ph = (G.UI && G.UI.bossPhase) || 1;
      sp.setTint(ph === 1 ? 0xffffff : ph === 2 ? (Math.sin(this.t * 6) > 0 ? 0xffb080 : 0xffffff) : (Math.sin(this.t * 14) > 0 ? 0xff5050 : 0xffd0d0));
    }
    else if (this.baseTint !== 0xffffff) sp.setTint(this.baseTint);
    else sp.clearTint();
    const glowing = (f & 4) || (f & 8) || (f & 128) || this.ti === 1;
    if (glowing) {
      const c = (f & 128) ? 0xff2020 : (this.ti === 1 && !(f & 12)) ? 0xff8a00 : 0xff3030;
      const s = isBossTi(this.ti) ? 3 : (this.ti === 1 && !(f & 12) ? 0.5 : 1.3);
      this.glow.setVisible(true).setPosition(this.x, this.y - sp.height * 0.5).setTint(c)
        .setScale(s * (0.9 + 0.2 * Math.sin(this.t * 20))).setAlpha(this.ti === 1 && !(f & 12) ? 0.5 : 0.8);
    } else this.glow.setVisible(false);
  }
  draw(g) {
    const f = this.flags, h = this.sprite.displayHeight;
    if (this.ti === 3 && (f & 32)) {
      const a = this.aux / 100, cx = this.x, cy = this.y - h / 2;
      const k = this.extra / 100;
      g.lineStyle(5, 0xb05cff, 0.35 + 0.5 * k); g.beginPath(); g.arc(cx, cy, 40, a - 1.25, a + 1.25); g.strokePath();
      g.lineStyle(2, 0xffffff, 0.5 * k); g.beginPath(); g.arc(cx, cy, 44, a - 1.2, a + 1.2); g.strokePath();
    }
    if (this.ti === 5 && (f & 4)) {
      const a = this.aux / 100;
      g.lineStyle(1, 0xff3030, 0.5 + 0.4 * Math.sin(this.t * 40)); g.lineBetween(this.x, this.y - 17, this.x + Math.cos(a) * 700, this.y - 17 + Math.sin(a) * 700);
    }
    if (isBossTi(this.ti)) {
      const a = this.aux / 100, ox = this.x, oy = this.ti === 7 ? this.y - h / 2 : this.y - h + 26;
      if (f & 64) {
        const len = this.extra || 1500;
        const ex = ox + Math.cos(a) * len, ey = oy + Math.sin(a) * len;
        g.lineStyle(26, 0xff2020, 0.25); g.lineBetween(ox, oy, ex, ey);
        g.lineStyle(12, 0xff5050, 0.6); g.lineBetween(ox, oy, ex, ey);
        g.lineStyle(4, 0xffffff, 0.95); g.lineBetween(ox, oy, ex, ey);
      } else if (f & 128) {
        g.lineStyle(2, 0xff3030, 0.4 + 0.4 * Math.sin(this.t * 40));
        g.lineBetween(ox, oy, ox + Math.cos(a) * 1200, oy + Math.sin(a) * 1200);
      }
      return;
    }
    if (this.hpShowT > 0 && this.hp < 1000) {
      const w = this.ti === 3 || this.ti === 6 ? 46 : 30, x = this.x - w / 2, y = this.y - h - 8;
      g.fillStyle(0x000000, 0.6); g.fillRect(x - 1, y - 1, w + 2, 5);
      g.fillStyle(this.ti === 3 ? 0xb05cff : 0xff3b3b, 1); g.fillRect(x, y, w * this.hp / 1000, 3);
    }
  }
};

G.NpcView = class {
  constructor(scene, npc) {
    this.npc = npc;
    this.sprite = scene.add.image(npc.x, npc.y, 'npc_' + npc.key).setOrigin(0.5, 1).setDepth(27);
    this.label = scene.add.text(npc.x, npc.y - 60, npc.name, { fontFamily: G.FONT, fontSize: '12px', fontStyle: 'bold', color: Phaser.Display.Color.IntegerToColor(npc.color).rgba, stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(70);
    this.sub = scene.add.text(npc.x, npc.y - 74, npc.title, { fontFamily: G.FONT, fontSize: '10px', color: '#8aa5b3', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(70);
    this.x = npc.x; this.y = npc.y + 52; this.t = Math.random() * 5; this.walking = false; this.facing = 1;
  }
  setState(x, y, facing, walking) { this.x = x; this.y = y; this.facing = facing; this.walking = walking; }
  update(dt) {
    this.t += dt;
    let bob = this.walking ? -Math.abs(Math.sin(this.t * 10)) * 2 : Math.sin(this.t * 2) * 0.6;
    if (this.npc.key === 'ranker') {
      // B-0T: levita y se inclina según su velocidad; posición suavizada para evitar tirones entre snapshots
      this.rx = this.rx === undefined ? this.x : this.rx + (this.x - this.rx) * Math.min(1, dt * 8);
      const vx = (this.rx - (this.prx === undefined ? this.rx : this.prx)) / Math.max(dt, 0.001); this.prx = this.rx;
      this.sprite.setPosition(this.rx, this.y - 6 + Math.sin(this.t * 3) * 3).setRotation(Phaser.Math.Clamp(vx / 400, -0.25, 0.25)).setFlipX(this.facing < 0);
    } else this.sprite.setPosition(this.x, this.y + bob).setFlipX(this.facing < 0).setScale(1, 1 + Math.sin(this.t * 2.2) * 0.012);
    this.label.setPosition(this.rx === undefined ? this.x : this.rx, this.y - 58);
    this.sub.setPosition(this.rx === undefined ? this.x : this.rx, this.y - 72);
  }
};
