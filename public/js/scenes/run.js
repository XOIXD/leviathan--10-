/* LEVIATHAN - Escena de misión. Reconstruye el nivel procedural con la misma semilla que el servidor,
   renderiza enemigos interpolados, balas con pool, coberturas destructibles, objetivos cooperativos
   y la arena del jefe. Toda destrucción/muerte llega del servidor (paridad absoluta). */
G.RunScene = class extends G.WorldScene {
  constructor() { super({ key: 'Run' }); }

  create() {
    const info = G.Net.runInfo;
    const br = info.mode === 'br';
    this.br = br;
    const tdm = !!info.tdm, TM = tdm ? LV.TDMGen.MAPS[info.map | 0] : null;
    const D = tdm ? { id: 'TDM', idx: 0, layer: 4, boss: null, gen: {}, name: '5 contra 5 · ' + TM.name }
      : br ? { id: 'BR', idx: 6, layer: 4, boss: 'heart', gen: {}, name: 'Batalla de Escuadrones' } : LV.Campaign.descents(info.variant || 'solo')[info.idx || 0];
    this.D = D;
    // 5 contra 5: tileset y paleta propios del mapa (ninguno se repite)
    this.tileKey = tdm ? G.TDMArt.tileset(this, info.map | 0) : 'tiles';
    this.biome = tdm ? { tint: TM.pal[1], tile: 0xffffff, back: TM.back, accent: TM.pal[2] }
      : br ? { tint: 0x7fb09a, tile: 0xc8e8d0, back: 0x07140f, accent: 0x7dff4f } : LV.Campaign.layers[D.layer - 1];
    const L = tdm ? LV.TDMGen.generate(info.map | 0) : br ? LV.BRGen.generate(info.seed, info.teams) : LV.LevelGen.generate(info.seed, info.n, D.gen);
    this.zoneViews = G.ZoneArt.build(this, L);   // decoración y luz propias de la zona (antes que las coberturas)
    const destroyed = new Set(info.destroyed || []);
    for (const cv of L.covers) cv.alive = !destroyed.has(cv.id);
    for (const gid of info.openGates || []) for (const idx of L.gates[gid].tiles) L.tiles[idx] = 0;
    LV.Phys.buildCoverGrid(L);
    const tint = this.biome.tint;
    this.initWorld(L, tint);
    this.visited = new Set();
    this.dead = new Set();
    this.enemyViews = new Map();
    // Un pool por cada tipo de enemigo definido en el servidor (antes eran 5 de 8: torreta,
    // alfa y el Corazón final reventaban el fotograma → congelamiento en jefes).
    this.enemyPool = LV.C.ENEMY_TYPES.map(() => []);
    this.bullets = new Map();
    this.bulletPool = [];
    this.pickupViews = new Map();
    this.camX = L.spawn.x; this.camY = L.spawn.y;
    this.keyE = this.keys.E;
    this.drawBackdrop(L);
    this.buildObjects(L, info);
    if (this.biome.tile !== 0xffffff) this.layer.forEachTile(t => { if (t.index >= 0) t.tint = this.biome.tile; });
    this.buildPart2(L, info);
    const loop = info.variant === 'solo' && D.idx === 0 && info.cycle >= 1 && info.cycle <= 3 ? 'loop' + info.cycle : null;
    if (br) { /* la batalla presenta el lore de forma directa, sin cinemáticas */ }
    else if (loop && G.Net.profile && !G.Net.profile.seen[loop]) {
      G.UI.playCine(loop, () => G.Net.act({ type: 'seen', id: loop }));
    } else if (G.Net.profile && !G.Net.profile.seen['layer' + D.layer]) {
      G.UI.playCine('layer' + D.layer, () => G.Net.act({ type: 'seen', id: 'layer' + D.layer }));
    } else if (L.zone && G.Net.profile && !G.Net.profile.seen['z_' + L.zone]) {
      G.UI.playCine('z_' + L.zone, () => G.Net.act({ type: 'seen', id: 'z_' + L.zone }));
    }
    this.laserSfxT = 0;
    this.lastBossFlags = 0;
    this.sfxBudget = 0;
  }

  showWeapons() { return true; }

  drawBackdrop(L) {
    const g = this.backdrop;
    for (const r of L.rooms) {
      const col = r.type === 'arena' ? 0x170a0d : r.type === 'secret' ? 0x15120a : r.type === 'gate' ? 0x14110a : 0x0a121b;
      g.fillStyle(col, 1).fillRect(r.x + 16, r.y + 16, r.w - 32, r.h - 32);
      for (let x = r.x + 32; x < r.x + r.w - 32; x += 128) {
        g.fillStyle(0x0e1822, 1).fillRect(x, r.y + 32, 112, r.h - 64);
        g.fillStyle(0x121e2a, 1).fillRect(x + 50, r.y + 32, 6, r.h - 64);
      }
      g.fillStyle(0x1a2a36, 1).fillRect(r.x + 32, r.y + 70, r.w - 64, 8);
      g.fillStyle(0xff3b3b, 0.35);
      for (let x = r.x + 80; x < r.x + r.w - 64; x += 260) g.fillRect(x, r.y + 72, 6, 4);
    }
    const a = L.arena;
    this.add.image(a.x + a.w / 2, a.floorTop - 260, 'glow').setScale(12, 6).setTint(0xff2020).setAlpha(0.12).setBlendMode(Phaser.BlendModes.ADD).setDepth(-15);
    this.add.text(a.x + a.w / 2, a.floorTop - 380, this.D.id === 'TDM' ? this.level.map.name.toUpperCase() : this.D.boss ? 'ARENA · ' + LV.Campaign.bosses[this.D.boss].name : 'ANDÉN DE EXTRACCIÓN', { fontFamily: G.FONT, fontSize: '40px', fontStyle: 'bold', color: '#3a1216' }).setOrigin(0.5).setDepth(-14);
  }

  buildObjects(L, info) {
    // Coberturas
    this.coverViews = new Map();
    for (const cv of L.covers) {
      if (!cv.alive) continue;
      const img = this.add.image(cv.x, cv.y, cv.kind).setOrigin(0).setDepth(22);
      this.coverViews.set(cv.id, img);
    }
    // Trampas
    this.trapG = this.add.graphics().setDepth(21);
    // Compuertas / terminales
    this.terminalViews = [];
    for (const g of L.gates) {
      for (const t of g.terminals) {
        const img = this.add.image(t.x, t.y, 'terminal').setOrigin(0.5, 1).setDepth(15);
        const glow = this.add.image(t.x, t.y - 22, 'glow').setScale(1.6).setTint(0xffb020).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(14);
        this.terminalViews.push({ gate: g.id, t, img, glow });
      }
      const doorX = (g.tiles[0] % L.tw) * 32 + 32, doorY = Math.floor(g.tiles[0] / L.tw) * 32;
      g.light = this.add.image(doorX, doorY - 20, 'glow').setScale(1.2).setTint(0xff2020).setBlendMode(Phaser.BlendModes.ADD).setDepth(14);
      if ((info.openGates || []).includes(g.id)) g.light.setTint(0x7dff4f);
    }
    // Detonadores
    this.bombViews = [];
    for (const d of L.detonators) for (const b of d.bombs) {
      const img = this.add.image(b.x, b.y, 'bomb').setOrigin(0.5, 1).setDepth(15);
      const glow = this.add.image(b.x, b.y - 12, 'glow').setScale(1.2).setTint(0xff2020).setAlpha(0.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(14);
      this.bombViews.push({ det: d.id, k: b.id, b, img, glow, gone: false });
    }
    // Alijos
    this.cacheViews = new Map();
    for (const c of L.caches) {
      if ((info.caches || []).includes(c.id)) continue;
      const img = this.add.image(c.x, c.y, 'cache').setDepth(15);
      const glow = this.add.image(c.x, c.y, 'glow').setScale(1.5).setTint(0xffd34a).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(14);
      this.cacheViews.set(c.id, { img, glow, c });
    }
    // Arena: pilones y respiraderos
    const a = L.arena;
    this.pylonViews = a.pylons.map(p => ({
      p, img: this.add.image(p.x, p.y, 'pylon').setOrigin(0.5, 1).setDepth(15),
      orb: this.add.image(p.x, p.y - 72, 'glow').setScale(1.5).setTint(0x39d7ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(16)
    }));
    this.ventViews = a.vents.map(v => ({
      v, img: this.add.image(v.x, v.y, 'vent').setOrigin(0, 1).setDepth(15),
      col: this.add.rectangle(v.x + v.w / 2, v.y - v.h / 2, v.w, v.h, 0xffffff, 0.08).setDepth(13).setVisible(false),
      em: this.add.particles(v.x + v.w / 2, v.y - 8, 'smoke', {
        lifespan: 900, speedY: { min: -420, max: -260 }, speedX: { min: -25, max: 25 }, scale: { start: 0.8, end: 2.8 },
        alpha: { start: 0.6, end: 0 }, frequency: 25, emitting: false, tint: [0xffffff, 0xcfe9f5]
      }).setDepth(41)
    }));
  }

  // ------------------------------------------------------------ arma local (feedback inmediato)
  localWeapon(b, aim, dt) {
    const info = G.Net.roster.get(G.Net.id);
    const w = info && info.weapon;
    if (!w || !this.me.body) return;
    const B = LV.C.B, L = this.wl, body = this.me.body;
    L.cd -= dt; L.alt -= dt;
    const pressed = b & ~L.prev;
    L.prev = b;
    if (body.dashT > 0) return;
    const pos = this.myPos();
    const gx = pos.x + Math.cos(aim) * 30, gy = pos.y - (body.crouch ? 16 : 24) + Math.sin(aim) * 30;
    const v = this.players.get(G.Net.id);
    L.mcd = Math.max(0, (L.mcd || 0) - dt);
    if ((pressed & B.MELEE) && L.mcd <= 0) {
      L.mcd = 0.55;
      if (v) v.swing(0);
      this.fx.slash(pos.x, pos.y - 22, Math.cos(aim) >= 0 ? 0 : Math.PI, 0.7, 0xffffff, Math.cos(aim) < 0);
      G.Sfx.play('slash', 0.8); this.fx.shake(0.12);
    }
    if (w.arch === 'rifle') {
      if ((b & B.FIRE) && L.cd <= 0 && !L.reloading && L.ammo > 0) {
        L.cd = w.rate; L.ammo--;
        this.fx.muzzle(gx, gy, aim, 0xffd34a, false);
        this.localTracer(gx, gy, aim, w, 1);
        G.Sfx.play('rifle');
        this.fx.shake(w.shake * 0.7);
        if (v) v.recoil = Math.min(1, v.recoil + 0.45);
        this.camRecoil = Math.max(-26, (this.camRecoil || 0) - 2.2 * (body.ads && (b & B.ALT) ? 0.4 : 1));
        if (L.ammo <= 0) L.reloading = true;
      }
    } else if (w.arch === 'pistol') {
      const shoot = () => { L.ammo--; this.fx.muzzle(gx, gy, aim, 0xfff3a0, false); this.localTracer(gx, gy, aim, w, 1); G.Sfx.play('rifle'); this.fx.shake(0.1); if (v) v.recoil = 1; this.camRecoil = (this.camRecoil || 0) - 5; if (L.ammo <= 0) L.reloading = true; };
      if ((pressed & B.FIRE) && L.cd <= 0 && !L.reloading && L.ammo > 0) { L.cd = w.rate; shoot(); }
      if ((pressed & B.ALT) && L.alt <= 0 && L.ammo > 0 && !L.reloading) { L.alt = w.altCd; shoot(); this.time.delayedCall(60, () => L.ammo > 0 && shoot()); this.time.delayedCall(120, () => L.ammo > 0 && shoot()); }
    } else if (w.arch === 'katana') {
      if ((b & B.FIRE) && L.cd <= 0) {
        L.combo = (L.combo + 1) % 3;
        const fin = L.combo === 2;
        L.cd = w.rate * (fin ? 1.5 : 1);
        if (v) v.swing(fin ? 1 : 0);
        this.fx.slash(pos.x, pos.y - 22, Math.cos(aim) >= 0 ? 0 : Math.PI, fin ? 1.3 : 1, w.color, Math.cos(aim) < 0);
        G.Sfx.play('slash');
        this.fx.shake(fin ? 0.18 : 0.06);
      }
      if ((pressed & B.ALT) && L.alt <= 0) { L.alt = w.altCd; G.Sfx.play('wave'); this.fx.shake(0.15); }
    } else if (w.gun) {
      const trig = w.auto ? (b & B.FIRE) : (pressed & B.FIRE);
      if (trig && L.cd <= 0 && !L.reloading && L.ammo > 0) {
        L.cd = w.rate; L.ammo--;
        this.fx.muzzle(gx, gy, aim, w.pellets > 1 ? 0xff9a3a : 0xffd34a, w.kick >= 0.9);
        this.localTracer(gx, gy, aim, w, w.pellets || 1, 0.3);
        G.Sfx.play(w.pellets > 1 ? 'cannon' : 'rifle');
        this.fx.shake(w.shake);
        if (v) v.recoil = Math.min(1, v.recoil + 0.3 + w.kick * 0.7);
        this.camRecoil = Math.max(-30, (this.camRecoil || 0) - (2 + w.kick * 9) * (body.ads && (b & B.ALT) ? 0.35 : 1));
        if (L.ammo <= 0) L.reloading = true;
      }
    } else if (w.blade) {
      if ((b & B.FIRE) && L.cd <= 0) {
        L.combo = (L.combo + 1) % (w.combo || 3);
        const fin = L.combo === (w.combo || 3) - 1;
        L.cd = w.rate * (fin ? 1.4 : 1);
        if (v) v.swing(fin ? 1 : 0);
        this.fx.slash(pos.x, pos.y - 22, Math.cos(aim) >= 0 ? 0 : Math.PI, fin ? 1.2 : 0.8, w.color, Math.cos(aim) < 0);
        G.Sfx.play('slash'); this.fx.shake(fin ? 0.16 : 0.05);
      }
      if ((pressed & B.ALT) && L.alt <= 0) { L.alt = w.altCd; G.Sfx.play('wave'); this.fx.shake(0.15); }
    } else {
      if ((pressed & B.ALT) && L.alt <= 0) { L.alt = w.altCd; L.mode = L.mode ? 0 : 1; G.Sfx.play('transform'); this.fx.cyan.explode(14, pos.x, pos.y - 22); L.cd = Math.max(L.cd, 0.35); return; }
      if ((b & B.FIRE) && L.cd <= 0) {
        if (!L.mode) {
          L.cd = w.rate;
          if (v) v.swing(2);
          this.fx.slash(pos.x, pos.y - 24, Math.cos(aim) >= 0 ? 0 : Math.PI, 1.6, 0xff8a00, Math.cos(aim) < 0);
          G.Sfx.play('heavy');
          this.fx.shake(w.shake); this.fx.kick(0.025);
        } else {
          L.cd = w.cannonRate;
          this.fx.muzzle(gx, gy, aim, 0xff8a00, true); this.localTracer(gx, gy, aim, { speed: 1250, life: 0.45 }, 6, 0.32);
          G.Sfx.play('cannon');
          this.fx.shake(0.32); this.fx.kick(0.015);
        }
      }
    }
  }

  // ------------------------------------------------------------ eventos autoritativos
  handleEvents(evs) {
    const me = G.Net.id;
    for (const e of evs) {
      switch (e[0]) {
        case 'pulse': { this.fx.shake(0.45); if (G.UI) G.UI.flash = Math.min(0.5, G.UI.flash + 0.3); G.Sfx.play('heavy', 0.6); for (const c of (this.zoneViews && this.zoneViews.carne) || []) c.setScale(c.scale * 1.4); break; }
        case 'tp': { const v = this.players.get(e[1]); if (v) this.fx.warp(v.x, v.y - 24); G.Sfx.play('spawn', 0.7); break; }
        case 'ping': { this.fx.rings.spawn(e[1], e[2], { life: 1.2, s0: 0.2, s1: 2.4, tint: 0xff3b4a }); this.fx.light(e[1], e[2], 0xff3b4a, 4, 1.2); G.Sfx.play('ui_ok'); break; }
        case 'rescue': { const v = this.players.get(e[1]); if (v) { this.fx.rings.spawn(v.x, v.y - 24, { life: 0.5, s0: 0.3, s1: 2, tint: 0x7dff4f }); this.fx.light(v.x, v.y - 24, 0x7dff4f, 5, 0.4); } break; }
        case 'b': this.spawnBullet(e); break;
        case 'bx': {
          const bl = this.bullets.get(e[1]);
          if (bl) this.killBullet(e[1], bl);
          this.fx.impact(e[2], e[3], e[4]);
          if (e[4] === 4) G.Sfx.play('shield', this.volAt(e[2], e[3]));
          break;
        }
        case 'h': {
          const v = this.enemyViews.get(e[1]);
          if (v) {
            v.flash();
            const col = e[3] === 1 ? '#ffd34a' : e[3] === 2 ? '#8a9aa8' : e[3] === 3 ? '#ff9d1c' : '#ffffff';
            this.fx.num(v.x, v.y - v.sprite.displayHeight - 6, e[3] === 3 ? e[2] + '!' : e[2], col, e[3] === 1 || e[3] === 3);
            this.fx.blood.explode(e[3] ? 10 : 4, v.x, v.y - v.sprite.displayHeight / 2);
            if (e[4] && (v.ti === 3 || v.ti === 4 || v.ti === 6 || v.ti === 7)) { this.hitstop = 0.07; this.fx.shake(0.3); this.fx.kick(0.02); }
          }
          G.Sfx.play(e[3] === 1 || e[3] === 3 ? 'crit' : e[3] === 2 ? 'shield' : 'hit', 0.7);
          break;
        }
        case 'sh': this.fx.impact(e[2], e[3], 4); G.Sfx.play('shield'); break;
        case 'k': {
          this.dead.add(e[1]);
          const v = this.enemyViews.get(e[1]);
          if (v) this.releaseEnemy(e[1], v);
          const big = e[4] >= 3;
          this.fx.blood.explode(big ? 40 : 16, e[2], e[3]);
          this.fx.sparks.explode(big ? 30 : 10, e[2], e[3]);
          this.fx.flashes.spawn(e[2], e[3], { life: 0.15, s0: big ? 2 : 0.8, s1: big ? 4 : 1.6, tint: 0x9bffef });
          if (big) this.fx.explosion(e[2], e[3], e[4] === 4 ? 260 : 120);
          G.Sfx.play(big ? 'explosion' : 'kill', this.volAt(e[2], e[3]));
          if (e[5] === me) { this.fx.kick(0.012); this.fx.shake(big ? 0.6 : 0.1); }
          this.killFx(e[5], e[2], e[3]);
          break;
        }
        case 'sp': this.pendingWarp = this.pendingWarp || new Set(); this.pendingWarp.add(e[1]); G.Sfx.play('spawn', 0.6); break;
        case 'x': {
          this.fx.explosion(e[1], e[2], e[3]);
          const vol = this.volAt(e[1], e[2]);
          G.Sfx.play('explosion', vol);
          const d = this.distTo(e[1], e[2]);
          if (d < 900) this.fx.shake(Math.min(1, (e[3] / 120) * (1 - d / 900)));
          break;
        }
        case 'cv': {
          const cv = this.level.coverById.get(e[1]);
          const img = this.coverViews.get(e[1]);
          if (!cv) break;
          if (e[2] === 0) {
            cv.alive = false;
            if (img) { img.destroy(); this.coverViews.delete(e[1]); }
            this.fx.debris.explode(22, cv.x + cv.w / 2, cv.y + cv.h / 2);
            this.fx.smoke.explode(5, cv.x + cv.w / 2, cv.y + cv.h / 2);
            this.fx.sparks.explode(10, cv.x + cv.w / 2, cv.y + cv.h / 2);
            G.Sfx.play('explosion', this.volAt(cv.x, cv.y) * 0.5);
          } else if (img) {
            const k = e[2] / 100;
            img.setTint(Phaser.Display.Color.GetColor(150 + 105 * k, 120 + 135 * k, 110 + 145 * k));
            img.x = cv.x + (Math.random() - 0.5) * 3;
          }
          break;
        }
        case 'ph': {
          const v = this.players.get(e[1]);
          if (e[1] === me) {
            if (!e[3]) { G.Sfx.play('hurt'); this.fx.shake(Math.min(0.8, 0.2 + e[2] / 60)); }
            const p = this.myPos();
            if (p) { this.fx.redBlood.explode(e[3] ? 2 : 8, p.x, p.y - 20); this.fx.num(p.x, p.y - 56, '-' + e[2], '#ff5050'); }
          } else if (v) this.fx.redBlood.explode(5, v.x, v.y - 20);
          break;
        }
        case 'down': { const v = this.players.get(e[1]); G.Sfx.play('down', v ? this.volAt(v.x, v.y) + 0.3 : 0.5); if (e[1] === me) this.fx.shake(0.7); break; }
        case 'rev': { const v = this.players.get(e[1]); G.Sfx.play('revive'); if (v) { this.fx.green.explode(30, v.x, v.y - 10); this.fx.rings.spawn(v.x, v.y - 20, { life: 0.5, s0: 0.2, s1: 2, tint: 0x7dff4f }); } break; }
        case 'dead': {
          const v = this.players.get(e[1]);
          if (v) {
            this.fx.explosion(v.x, v.y - 20, 60);
            const orb = this.add.image(v.x, v.y - 20, 'core').setDepth(63).setBlendMode(Phaser.BlendModes.ADD).setScale(1.4);
            this.tweens.add({ targets: orb, y: v.y - 1400, x: v.x + (Math.random() - 0.5) * 300, scale: 0.4, duration: 1600, ease: 'Cubic.easeIn', onComplete: () => orb.destroy() });
            if (e[1] === me) G.UI.banner('EXOTRAJE DESTRUIDO', 'Tu Núcleo huye por la ventilación hacia la Celda… observa a tu escuadrón', '#39d7ff', 4);
          }
          break;
        }
        case 'stg': {
          const v = this.enemyViews.get(e[1]);
          if (v) { this.fx.num(v.x, v.y - v.sprite.displayHeight - 22, '¡DERRIBO!', '#ffd34a', true); this.fx.rings.spawn(v.x, v.y - v.sprite.displayHeight / 2, { life: 0.4, s0: 0.3, s1: 2.2, tint: 0xffd34a }); }
          G.Sfx.play('zap', 0.5); this.fx.shake(0.35);
          break;
        }
        case 'mat': {
          const m = LV.Campaign.materials[e[1]];
          if (m) { this.fx.num(e[3], e[4] - 30, `+${e[2]} ${m.name}`, Phaser.Display.Color.IntegerToColor(m.color).rgba, false); this.fx.gold.explode(8, e[3], e[4]); }
          break;
        }
        case 'part': { const v = this.enemyViews.get(e[1]); if (v) { this.fx.debris.explode(30, v.x, v.y - 60); this.fx.flashes.spawn(v.x, v.y - 60, { life: 0.3, s0: 2, s1: 5, tint: 0xffd34a }); } G.Sfx.play('explosion'); break; }
        case 'stk': {
          const v = this.players.get(e[1]);
          G.Sfx.play(e[2] === 'botiquin' ? 'revive' : e[2] === 'escudo' ? 'transform' : 'alarm');
          if (v) this.fx.rings.spawn(v.x, v.y - 20, { life: 0.6, s0: 0.3, s1: 4, tint: e[2] === 'botiquin' ? 0x7dff4f : 0x39d7ff });
          if (e[2] === 'botiquin') for (const pv of this.players.values()) this.fx.green.explode(16, pv.x, pv.y - 10);
          break;
        }
        case 'orb': G.Sfx.play('alarm'); break;
        case 'warn': this.warns.push({ x: e[1], y: e[2], r: e[3], t: 0.9 }); break;
        case 'pool': { const pl = this.add.image(e[1], e[2] - 6, 'glow').setScale(2.4, 0.5).setTint(0x60ff9a).setBlendMode(Phaser.BlendModes.ADD).setDepth(15).setAlpha(0.85);
          this.tweens.add({ targets: pl, alpha: 0.35, scaleX: 2.7, duration: 500, yoyo: true, repeat: Math.max(1, Math.round(e[3] / 10)), onComplete: () => pl.destroy() }); break; }
        case 'supply': this.fx.green.explode(40, e[1], e[2]); this.fx.flashes.spawn(e[1], e[2], { life: 0.4, s0: 1, s1: 4, tint: 0x7dff4f }); G.Sfx.play('pickup'); break;
        case 'box': { const b = this.boxViews[e[1]]; if (b) { this.fx.gold.explode(20, b.x, b.y); b.setVisible(false); } G.Sfx.play('coins'); break; }
        case 'liftcall': G.Sfx.play('alarm'); break;
        case 'lift': G.Sfx.play('gate'); this.fx.shake(0.3); break;
        case 'evt': G.Sfx.play('alarm'); break;
        case 'mel': if (e[1] !== me) { const pv = this.players.get(e[1]); if (pv) { pv.swing(0); this.fx.slash(pv.x, pv.y - 22, Math.cos(e[2] / 100) >= 0 ? 0 : Math.PI, 0.7, 0xffffff, Math.cos(e[2] / 100) < 0); G.Sfx.play('slash', this.volAt(pv.x, pv.y) * 0.6); } } break;
        case 'exec': this.fx.num(e[2], e[3] - 20, '¡EJECUCIÓN!', '#ff3b3b', true); this.fx.redBlood.explode(24, e[2], e[3]); this.fx.light(e[2], e[3], 0xff3b3b, 5, 0.3); this.fx.rings.spawn(e[2], e[3], { life: 0.35, s0: 0.2, s1: 2.6, tint: 0xff3b3b }); this.fx.slash(e[2], e[3], 0, 1.8, 0xffffff, false); this.fx.kick(0.07); this.fx.shake(0.35); this.hitstop = 0.18; if (G.UI) G.UI.flash = Math.min(0.5, G.UI.flash + 0.25); G.Sfx.play('crit'); break;
        case 'perf': if (e[1] === me) { const mp = this.myPos(); if (mp) { this.fx.num(mp.x, mp.y - 70, 'RECARGA PERFECTA +10%', '#ffd34a', true); this.fx.gold.explode(14, mp.x, mp.y - 30); } G.Sfx.play('ui_ok'); } break;
        case 'xs': this.fx.rings.spawn(e[1], e[2], { life: 0.5, s0: 0.3, s1: 4.6, tint: 0x9ff8ff, a0: 1 }); this.fx.flashes.spawn(e[1], e[2], { life: 0.25, s0: 2, s1: 5, tint: 0xffffff }); this.fx.cyan.explode(30, e[1], e[2]); this.fx.light(e[1], e[2], 0x9ff8ff, 9, 0.4); G.Sfx.play('zap', this.volAt(e[1], e[2])); break;
        case 'sw': {
          if (e[1] === me) break;
          const v = this.players.get(e[1]);
          if (!v) break;
          const a = e[2] / 100;
          v.swing(e[3] === 2 ? 2 : e[3]);
          this.fx.slash(v.x, v.y - 22, Math.cos(a) >= 0 ? 0 : Math.PI, e[3] === 2 ? 1.6 : e[3] === 1 ? 1.3 : 1, e[3] === 2 ? 0xff8a00 : v.weaponColor || 0x39d7ff, Math.cos(a) < 0);
          G.Sfx.play(e[3] === 2 ? 'heavy' : 'slash', this.volAt(v.x, v.y) * 0.7);
          break;
        }
        case 'dash': if (e[1] !== me) { const v = this.players.get(e[1]); if (v) G.Sfx.play('dash', this.volAt(v.x, v.y) * 0.5); } break;
        case 'jump2': if (e[1] !== me) { const v = this.players.get(e[1]); if (v) this.fx.rings.spawn(v.x, v.y, { life: 0.25, s0: 0.2, s1: 0.8, tint: 0x39d7ff, a0: 0.8 }); } break;
        case 'tf': if (e[1] !== me) { const v = this.players.get(e[1]); if (v) { this.fx.cyan.explode(14, v.x, v.y - 22); G.Sfx.play('transform', this.volAt(v.x, v.y)); } } else this.wl.mode = e[2]; break;
        case 'rl': if (e[1] === me) { G.Sfx.play('reload'); this.wl.reloading = true; if (e[2]) this.fx.num(this.myPos().x, this.myPos().y - 60, 'RECARGA TÁCTICA', '#39d7ff'); } break;
        case 'gate': {
          const g = this.level.gates[e[1]];
          for (const idx of g.tiles) this.setTile(idx, 0);
          if (g.light) g.light.setTint(0x7dff4f);
          const x = (g.tiles[0] % this.level.tw) * 32 + 32, y = Math.floor(g.tiles[0] / this.level.tw) * 32 + 64;
          this.fx.sparks.explode(40, x, y); this.fx.smoke.explode(10, x, y);
          G.Sfx.play('gate'); this.fx.shake(0.4);
          break;
        }
        case 'defuse': {
          const bv = this.bombViews.find(b => b.det === e[1] && b.k === e[2]);
          if (bv) { bv.img.setTint(0x5dff7a); bv.glow.setTint(0x5dff7a); this.fx.green.explode(20, bv.b.x, bv.b.y - 10); G.Sfx.play('ui_ok'); }
          break;
        }
        case 'detx': for (const bv of this.bombViews) if (bv.det === e[1] && !bv.gone) { bv.gone = true; bv.img.setVisible(false); bv.glow.setVisible(false); } break;
        case 'zap': {
          const pv = this.pylonViews[e[1]];
          if (pv) this.zap(pv.p.x, pv.p.y - 72, e[2], e[3]);
          G.Sfx.play('zap'); this.fx.shake(0.5);
          break;
        }
        case 'cache': {
          const cv = this.cacheViews.get(e[1]);
          if (cv) { this.fx.gold.explode(40, cv.c.x, cv.c.y); cv.img.destroy(); cv.glow.destroy(); this.cacheViews.delete(e[1]); }
          G.Sfx.play('coins');
          break;
        }
        case 'pk': {
          const pv = this.pickupViews.get(e[1]);
          if (pv) { this.fx.green.explode(16, pv.x, pv.y); pv.destroy(); this.pickupViews.delete(e[1]); }
          if (e[2] === me) G.Sfx.play('pickup');
          break;
        }
        case 'tele': { const v = this.enemyViews.get(e[1]); if (v && v.ti >= 3) G.Sfx.play('charge', this.volAt(v.x, v.y) * 0.6); break; }
        case 'charge': { const v = this.enemyViews.get(e[1]); if (v) G.Sfx.play('dash', this.volAt(v.x, v.y)); break; }
        case 'arc': {
          const a = this.enemyViews.get(e[1]), b = this.enemyViews.get(e[2]);
          if (a && b) this.zap(a.x, a.y - 20, b.x, b.y - 20, 0.12);
          break;
        }
        case 'shake': this.fx.shake(e[1]); break;
      }
    }
  }

  // Rayos eléctricos con pool de 6 lienzos reutilizables (sin crear/destruir objetos en combate)
  zap(x0, y0, x1, y1, life) {
    if (!this.zapPool) { this.zapPool = []; for (let i = 0; i < 6; i++) this.zapPool.push({ g: this.add.graphics().setDepth(62).setBlendMode(Phaser.BlendModes.ADD), t: 0 }); this.zapI = 0; }
    const slot = this.zapPool[this.zapI = (this.zapI + 1) % this.zapPool.length];
    const g = slot.g;
    g.clear(); g.setVisible(true); slot.t = life || 0.25;
    const pts = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([x0 + (x1 - x0) * t + (i && i < n ? (Math.random() - 0.5) * 40 : 0), y0 + (y1 - y0) * t + (i && i < n ? (Math.random() - 0.5) * 40 : 0)]);
    }
    for (const [w, c, a] of [[10, 0x39d7ff, 0.3], [4, 0x9ff8ff, 0.8], [2, 0xffffff, 1]]) {
      g.lineStyle(w, c, a); g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) g.lineTo(p[0], p[1]);
      g.strokePath();
    }
    this.fx.cyan.explode(30, x1, y1);
  }

  // ------------------------------------------------------------ balas (pool)
  // Trazador local: tu disparo se ve en el mismo fotograma (el servidor sigue siendo la autoridad del daño)
  localTracer(x, y, aim, w, n, spread) {
    const sp = w.speed || 1700;
    for (let i = 0; i < (n || 1); i++) {
      const a = aim + (n > 1 ? (Math.random() - 0.5) * spread : 0), s = sp * (n > 1 ? 0.85 + Math.random() * 0.3 : 1);
      let img = this.bulletPool.pop();
      if (!img) img = this.add.image(0, 0, 'bul').setDepth(45);
      img.setTexture(n > 1 ? 'pellet' : 'bul').setVisible(true).setActive(true).setPosition(x, y).setRotation(a).setScale(1).setAlpha(1).setBlendMode(Phaser.BlendModes.ADD).setFlipX(false);
      this.localBid = (this.localBid || 0) - 1;
      this.bullets.set(this.localBid, { img, vx: Math.cos(a) * s, vy: Math.sin(a) * s, kind: n > 1 ? 4 : 0, life: w.life || 0.9 });
    }
  }

  spawnBullet(e) {
    const [, id, x, y, vx, vy, kind, team, owner, gl] = e;
    if (owner === G.Net.id && !team && (kind === 0 || kind === 4)) return;   // ya dibujado por el trazador local
    if (kind === 2) G.Sfx.play('dash', this.volAt(x, y) * 0.7);
    if (!team && owner && owner !== G.Net.id && (kind === 0 || kind === 4)) { const pv = this.players.get(owner); if (pv) pv.recoil = Math.min(1, pv.recoil + 0.5); }
    if (G.Gfx.lights && kind !== 2) this.fx.light(x, y, team ? 0xff3030 : 0xffd34a, kind === 3 ? 4 : 2, 0.06);
    let img = this.bulletPool.pop();
    if (!img) img = this.add.image(0, 0, 'bul').setDepth(45);
    const tex = kind === 1 ? 'shock' : kind === 2 ? 'gren' : kind === 3 ? 'wave' : kind === 4 ? 'pellet' : team ? 'ebul' : 'bul';
    img.setTexture(tex).setVisible(true).setActive(true).setPosition(x, y).setRotation(kind === 1 ? 0 : Math.atan2(vy, vx)).setScale(1).setAlpha(1);
    img.setBlendMode(kind === 2 ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
    img.setFlipX(kind === 1 && vx < 0);
    this.bullets.set(id, { img, vx, vy, kind, life: kind === 2 ? (gl ? gl / 100 + 0.2 : 2.4) : 2.6 });
    if (owner !== G.Net.id && this.distTo(x, y) < 1300) {
      if (team) G.Sfx.play('eshot', this.volAt(x, y));
      else if (kind === 4) G.Sfx.play('cannon', this.volAt(x, y) * 0.5);
      else if (kind === 0) G.Sfx.play('rifle', this.volAt(x, y) * 0.5);
      else if (kind === 3) G.Sfx.play('wave', this.volAt(x, y) * 0.6);
      if (!team && (kind === 0 || kind === 4)) this.fx.muzzle(x, y, Math.atan2(vy, vx), 0xffd34a, kind === 4);
    }
    if (kind === 1) this.fx.dust.explode(6, x, y + 10);
  }
  killBullet(id, bl) {
    bl.img.setVisible(false).setActive(false);
    this.bulletPool.push(bl.img);
    this.bullets.delete(id);
  }
  updateBullets(dt) {
    const L = this.level;
    for (const [id, bl] of this.bullets) {
      bl.life -= dt;
      if (bl.kind === 2) { bl.vy += 1400 * dt; bl.img.rotation += dt * 12; }
      const nx = bl.img.x + bl.vx * dt, ny = bl.img.y + bl.vy * dt;
      if (bl.life <= 0 || (bl.kind !== 2 && LV.Phys.pointSolid(L, nx, ny))) { this.killBullet(id, bl); continue; }
      if (bl.kind === 2 && LV.Phys.pointSolid(L, nx, ny)) { bl.vy *= -0.45; bl.vx *= 0.6; continue; }
      bl.img.x = nx; bl.img.y = ny;
      const vw = this.cameras.main.worldView;
      bl.img.visible = nx > vw.x - 40 && nx < vw.right + 40 && ny > vw.y - 40 && ny < vw.bottom + 40;
      if (bl.kind === 3) bl.img.setAlpha(Math.min(1, bl.life * 3));
    }
  }

  // ------------------------------------------------------------ enemigos (pool de vistas)
  acquireEnemy(ti, id) {
    if (!(ti >= 0 && ti < LV.C.ENEMY_TYPES.length)) ti = 0;   // tipo desconocido: nunca romper el frame
    const pool = this.enemyPool[ti] || (this.enemyPool[ti] = []);
    const v = pool.pop() || new G.EnemyView(this, ti);
    v.activate(id);
    this.enemyViews.set(id, v);
    return v;
  }
  releaseEnemy(id, v) { v.release(); this.enemyViews.delete(id); this.enemyPool[v.ti].push(v); }

  renderEnemies(dt) {
    const view = this.cameras.main.worldView;
    const pair = G.Net.interpPair();
    if (!pair || !pair[1].e) return;
    const [a, b, al] = pair;
    const mapA = this._mapA || (this._mapA = new Map());
    mapA.clear();
    if (a.e) for (const t of a.e) mapA.set(t[0], t);
    const seen = this._seenE || (this._seenE = new Set());
    seen.clear();
    for (const t of b.e) {
      const id = t[0];
      if (this.dead.has(id)) continue;
      seen.add(id);
      let v = this.enemyViews.get(id);
      const ta = mapA.get(id) || t;
      if (!v) {
        v = this.acquireEnemy(t[1], id);
        if (this.pendingWarp && this.pendingWarp.has(id)) { this.fx.warp(t[2], t[3] - 20); this.pendingWarp.delete(id); }
      }
      v.setState(ta[2] + (t[2] - ta[2]) * al, ta[3] + (t[3] - ta[3]) * al, t[4], t[5], t[6], t[7]);
      if (v.ti === 4 && b.o && b.o.bk) v.setKind(b.o.bk);
      // Culling: fuera de cámara no se anima ni se dibuja (los jefes siempre, por sus rayos)
      const boss = v.ti === 4 || v.ti === 7;
      const inView = boss || (v.x > view.x - 160 && v.x < view.right + 160 && v.y > view.y - 200 && v.y < view.bottom + 260);
      v.sprite.setVisible(inView);
      if (!inView) { v.glow.setVisible(false); v.tag.setVisible(false); if (v.gun) v.gun.setVisible(false); continue; }
      if (this.hitstop > 0 && (v.ti === 3 || v.ti >= 4)) continue;
      v.update(dt);
      v.draw(this.overlay);
    }
    for (const [id, v] of this.enemyViews) if (!seen.has(id)) this.releaseEnemy(id, v);
  }

  // ------------------------------------------------------------ mundo
  onSnapshot(s) {
    if (!s.o) return;
    const live = new Set();
    for (const [id, x, y] of s.o.pk) {
      live.add(id);
      if (!this.pickupViews.has(id)) this.pickupViews.set(id, this.add.image(x, y, 'orb').setDepth(44).setBlendMode(Phaser.BlendModes.ADD));
    }
    for (const [id, img] of this.pickupViews) if (!live.has(id)) { img.destroy(); this.pickupViews.delete(id); }
  }

  updateWorld(dt) {
    const L = this.level, snap = G.Net.lastSnap;
    this.renderEnemies(dt);
    this.updateBullets(dt);
    const now = G.Net.serverNow() / 1000;
    // Trampas de energía
    const tg = this.trapG; tg.clear();
    for (const tr of L.traps) {
      const on = ((now + tr.offset) % tr.period) < tr.on;
      const warn = !on && ((now + tr.offset) % tr.period) > tr.period - 0.5;
      tg.fillStyle(0x10161d, 1).fillRect(tr.x, tr.y, tr.w, tr.h);
      tg.fillStyle(on ? 0x39d7ff : warn ? 0xffb020 : 0x1d3a4a, on ? 1 : 0.8).fillRect(tr.x, tr.y, tr.w, 3);
      if (on) {
        tg.lineStyle(2, 0x9ff8ff, 0.9); tg.beginPath(); tg.moveTo(tr.x, tr.y);
        for (let x = tr.x; x <= tr.x + tr.w; x += 8) tg.lineTo(x, tr.y - 4 - Math.random() * 14);
        tg.strokePath();
        tg.fillStyle(0x39d7ff, 0.12).fillRect(tr.x, tr.y - 22, tr.w, 22);
      }
    }
    // Objetivos con datos del snapshot
    if (snap && snap.o) {
      const o = snap.o;
      for (const tv of this.terminalViews) {
        const gs = o.g[tv.gate];
        const open = gs && gs[2], active = gs && gs[1];
        const full = gs && gs[4] >= (gs[5] || L.gates[tv.gate].terminals.length);
        tv.glow.setTint(open ? 0x7dff4f : full ? 0x5dff7a : active ? 0xffb020 : 0x39d7ff).setAlpha(0.25 + (active && !open ? 0.2 * Math.sin(this.time.now / 120) : 0));
        if (active && !open) {
          this.overlay.lineStyle(3, 0x000000, 0.6).strokeCircle(tv.t.x, tv.t.y - 62, 14);
          this.overlay.lineStyle(3, full ? 0x5dff7a : 0xffb020, 1);
          this.overlay.beginPath(); this.overlay.arc(tv.t.x, tv.t.y - 62, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * gs[3] / 100); this.overlay.strokePath();
          // Indicador de borde: si la terminal está fuera de cámara, una flecha táctica apunta hacia ella
          const vw = this.cameras.main.worldView, mp = this.myPos();
          if (mp && !full && (tv.t.x < vw.x || tv.t.x > vw.right || tv.t.y < vw.y || tv.t.y > vw.bottom)) {
            const ang = Math.atan2(tv.t.y - 30 - mp.y, tv.t.x - mp.x);
            const cx = Phaser.Math.Clamp(mp.x + Math.cos(ang) * 2000, vw.x + 40, vw.right - 40);
            const cy = Phaser.Math.Clamp(mp.y + Math.sin(ang) * 2000, vw.y + 60, vw.bottom - 60);
            const pulse = 0.65 + 0.35 * Math.sin(this.time.now / 140);
            const o2 = this.overlay;
            o2.fillStyle(0x000000, 0.55).fillCircle(cx, cy, 17);
            o2.fillStyle(0xffb020, pulse);
            o2.fillTriangle(cx + Math.cos(ang) * 14, cy + Math.sin(ang) * 14, cx + Math.cos(ang + 2.4) * 10, cy + Math.sin(ang + 2.4) * 10, cx + Math.cos(ang - 2.4) * 10, cy + Math.sin(ang - 2.4) * 10);
            o2.lineStyle(2, 0xffb020, pulse).strokeCircle(cx, cy, 17);
          }
        }
      }
      for (const bv of this.bombViews) {
        if (bv.gone) continue;
        const ds = o.d[bv.det];
        if (!ds) continue;
        const defused = ds[5][bv.k];
        if (!defused) {
          bv.glow.setAlpha(ds[1] ? (Math.sin(this.time.now / (ds[3] < 15 ? 60 : 160)) > 0 ? 0.8 : 0.2) : 0.2);
          if (ds[1] && ds[4][bv.k] > 0) {
            this.overlay.lineStyle(3, 0x39d7ff, 1);
            this.overlay.beginPath(); this.overlay.arc(bv.b.x, bv.b.y - 40, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ds[4][bv.k] / 100); this.overlay.strokePath();
          }
        }
      }
      this.pylonViews.forEach((pv, i) => {
        const c = (o.py[i] || 0) / 100;
        pv.orb.setScale(0.6 + c * 1.2).setAlpha(c >= 1 ? 0.7 + 0.3 * Math.sin(this.time.now / 90) : 0.3 * c).setTint(c >= 1 ? 0x9ff8ff : 0x39d7ff);
      });
      this.ventViews.forEach((vv, i) => {
        const on = !!(o.v & (1 << i));
        vv.em.emitting = on;
        vv.col.setVisible(on).setAlpha(0.06 + Math.random() * 0.05);
      });
      // Sonido del rayo del jefe
      const be = o.boss ? snap.e.find(e => e[0] === o.boss) : null;
      if (be) {
        if (be[5] & 64) { G.Sfx.play('laser', this.volAt(be[2], be[3]) + 0.3); this.fx.shake(0.12); }
        if ((be[5] & 128) && !(this.lastBossFlags & 128)) G.Sfx.play('charge');
        this.lastBossFlags = be[5];
      }
    }
    for (const [, cv] of this.cacheViews) cv.img.y = cv.c.y + Math.sin(this.time.now / 300) * 3;
    for (const [, img] of this.pickupViews) img.setScale(0.9 + 0.15 * Math.sin(this.time.now / 150));
    // Salas visitadas (minimapa)
    if (snap) for (const t of snap.p) { const r = LV.LevelGen.roomIdAt(L, t[1], t[2] - 20); if (r >= 0) this.visited.add(r); }
    this.updatePart2(dt, snap);
    if (this.zapPool) for (const z of this.zapPool) if (z.t > 0) { z.t -= dt; if (z.t <= 0) z.g.clear(); }
    if (this.br) this.drawFlood(snap);
    this.updatePrompt(snap);
  }

  updatePrompt(snap) {
    const pos = this.myPos();
    if (!pos || !snap) { G.UI.setPrompt(null); return; }
    const flags = this.me.flags;
    if (flags & 24) { G.UI.setPrompt(null); return; }
    let text = null;
    // Conducto del subdescenso secreto
    const pv = this.zoneViews && this.zoneViews.pad;
    if (pv) { pv.setVisible(!!(snap.o && snap.o.pr)); if (pv.visible && Math.abs(pos.x - pv.x) < 60 && Math.abs(pos.y - pv.y) < 50) text = 'CONDUCTO DE SERVICIO · quédate encima para bajar a la antesala del jefe'; }
    // Sigilo: enemigo común de espaldas a menos de 60 px → ejecución con [V]
    for (const ev of this.enemyViews.values()) {
      if (ev.ti === 4 || ev.ti === 7 || ev.ti === 6) continue;
      const dx = ev.x - pos.x;
      if (Math.abs(dx) < 60 && Math.abs(ev.y - pos.y) < 40 && Math.sign(dx) === ((ev.flags & 1) ? 1 : -1)) { text = '[V] EJECUCIÓN SIGILOSA'; break; }
    }
    if (snap.o && snap.o.ex) {
      const ex = snap.o.ex, lift = this.level.arena.lift;
      if (Math.abs(pos.x - (lift.x + lift.w / 2)) < 400 && Math.abs(pos.y - lift.y) < 200)
        text = ex[0] === 1 ? `Defended la posición · elevador en ${ex[1]} s` : `ELEVADOR: ${ex[2]}/${ex[3]} Núcleos a bordo`;
    }
    for (const v of this.players.values()) {
      if (v.id !== G.Net.id && (v.flags & 8) && Math.abs(v.x - pos.x) < 60 && Math.abs(v.y - pos.y) < 50) {
        const r = G.Net.roster.get(v.id);
        text = `[MANTÉN E] Reanimar a ${r ? r.name : 'aliado'}`;
      }
    }
    if (!text && snap.o) {
      const o = snap.o;
      for (const bv of this.bombViews) {
        const ds = o.d[bv.det];
        if (ds && ds[1] && !ds[2] && !ds[5][bv.k] && Math.abs(bv.b.x - pos.x) < 46 && Math.abs(bv.b.y - pos.y) < 40) text = '[MANTÉN E] Desactivar detonador';
      }
      this.pylonViews.forEach((pv, i) => {
        if (Math.abs(pv.p.x - pos.x) < 50 && Math.abs(pv.p.y - pos.y) < 40) text = o.py[i] >= 100 ? '[E] Sobrecargar pilón contra el jefe' : `Pilón recargando ${o.py[i]}%`;
      });
      for (const tv of this.terminalViews) {
        const gs = o.g[tv.gate];
        if (gs && gs[1] && !gs[2] && Math.abs(tv.t.x - pos.x) < 40 && Math.abs(tv.t.y - pos.y) < 20) text = 'Terminal ocupada · mantente en posición';
      }
    }
    if (!(this.me.flags & 16)) G.UI.setPrompt(text);   // caído: el prompt lo usa la cámara de seguridad
  }

  // ------------------------------------------------------------ parte 2: plataformas, extracción, apoyo, cajas
  buildPart2(L, info) {
    this.warns = [];
    this.hitstop = 0;
    this.moverViews = L.movers.map(m => this.add.image(m.x, m.y, 'mover').setOrigin(0, 0).setDisplaySize(m.w, 14).setDepth(12).setTint(this.biome.accent));
    this.boxViews = L.boxes.map(b => this.add.image(b.x, b.y, 'blackbox').setDepth(15).setVisible(!!info.boxesActive && !(info.boxes || []).includes(b.id)));
    const a = L.arena;
    if (a.kind === 'extract') {
      for (const pv of this.pylonViews) { pv.img.setVisible(false); pv.orb.setVisible(false); }
      for (const vv of this.ventViews) { vv.img.setVisible(false); vv.col.setVisible(false); }
      this.liftImg = this.add.image(a.lift.x, a.lift.y, 'lift').setOrigin(0, 1).setDisplaySize(a.lift.w, 20).setDepth(14);
      this.liftBeam = this.add.rectangle(a.lift.x + a.lift.w / 2, a.lift.y - 200, a.lift.w, 400, 0x7dff4f, 0.06).setDepth(13);
      this.add.text(a.lift.x + a.lift.w / 2, a.lift.y - 420, 'ELEVADOR DE DESCENSO', { fontFamily: G.FONT, fontSize: '18px', fontStyle: 'bold', color: '#3a5a2a' }).setOrigin(0.5).setDepth(-14);
    }
    this.allyViews = [];
    this.gPreview = this.add.graphics().setDepth(64);
  }

  updatePart2(dt, snap) {
    const L = this.level;
    this.hitstop = Math.max(0, this.hitstop - dt);
    const mt = this.predT || G.Net.serverNow() / 1000;
    L.movers.forEach((m, i) => { const p = LV.Phys.moverPos(m, mt); this.moverViews[i].setPosition(p.x, p.y); });
    const g = this.overlay;
    for (let i = this.warns.length - 1; i >= 0; i--) {
      const w = this.warns[i];
      w.t -= dt;
      if (w.t <= 0) { this.warns.splice(i, 1); continue; }
      const k = 1 - w.t / 0.9;
      g.lineStyle(3, 0xff3030, 0.5 + 0.5 * Math.sin(k * 30)); g.strokeCircle(w.x, w.y - 4, w.r * (0.4 + 0.6 * k));
      g.fillStyle(0xff2020, 0.15 * k).fillRect(w.x - 14, w.y - 240, 28, 240);
    }
    if (!snap || !snap.o) return;
    const o = snap.o;
    // Bombardeos orbitales marcados
    for (const st of o.st || []) {
      const k = Math.max(0, st[2]) / 1.6;
      g.lineStyle(2, 0xff3030, 0.9); g.strokeCircle(st[0], st[1] - 4, 30 + 180 * k);
      g.fillStyle(0xff3030, 0.25).fillRect(st[0] - 6, st[1] - 900, 12, 900);
    }
    // Drones centinela aliados
    while (this.allyViews.length < o.al.length) this.allyViews.push(this.add.image(0, 0, 'e_drone').setTint(0x39d7ff).setDepth(33));
    this.allyViews.forEach((img, i) => {
      const a = o.al[i];
      img.setVisible(!!a);
      if (a) { const tex = a[2] ? 'e_turret' : 'e_drone'; if (img.texture.key !== tex) img.setTexture(tex).setOrigin(0.5, a[2] ? 1 : 0.5); }
      if (a) { img.x += (a[0] - img.x) * 0.3; img.y += (a[1] - img.y) * 0.3; if (Math.abs(img.x - a[0]) > 300) img.setPosition(a[0], a[1]); }
    });
    // Elevador de extracción
    if (this.liftBeam) {
      const ex = o.ex;
      this.liftBeam.setFillStyle(ex && ex[0] === 2 ? 0x7dff4f : 0xffb020, ex ? 0.08 + 0.05 * Math.sin(this.time.now / 150) : 0.03);
    }
    // Vista previa de la trayectoria de granada (mantener G)
    const gp = this.gPreview; gp.clear();
    const me = snap.me, body = this.me.body;
    if (me && body && me.ck > 0 && me.gr > 0 && !(this.me.flags & 24)) {
      const a = this.me.aim;
      let x = body.x + body.w / 2 + this.me.offX + Math.cos(a) * 14, y = body.y + 12 + this.me.offY;
      let vx = Math.cos(a) * LV.C.GREN_SPEED + body.vx * 0.3, vy = Math.sin(a) * LV.C.GREN_SPEED - 160;
      const fuse = Math.max(0.15, LV.C.GREN_FUSE - me.ck);
      let bounced = 0;
      for (let t = 0; t < fuse; t += 1 / 60) {
        vy += 1400 / 60;
        const nx = x + vx / 60, ny = y + vy / 60;
        if (LV.Phys.pointSolid(L, nx, ny)) { if (bounced) break; bounced = 1; vy *= -0.45; vx *= 0.6; continue; }
        x = nx; y = ny;
        if (Math.round(t * 60) % 4 === 0) gp.fillStyle(0xffd34a, 0.9).fillCircle(x, y, 2.2);
      }
      gp.lineStyle(2, me.ck > 1.6 ? 0xff3030 : 0xffd34a, 0.9).strokeCircle(x, y, 26 + Math.sin(this.time.now / 60) * 3);
    }
    if (o.bx) for (const id of o.bx) if (this.boxViews[id]) this.boxViews[id].setVisible(false);
  }

  // Efecto de eliminación personalizado del jugador que dio la baja (visible para todo el escuadrón)
  killFx(killerId, x, y) {
    const r = killerId ? G.Net.roster.get(killerId) : null;
    const id = r && r.fx;
    if (!id || id === 'ninguno') return;
    const fx = this.fx;
    if (id === 'fractal') { for (let i = 0; i < 3; i++) fx.rings.spawn(x, y, { life: 0.25 + i * 0.12, s0: 0.2, s1: 1 + i * 0.7, tint: 0x39d7ff, a0: 0.9 }); fx.cyan.explode(14, x, y); }
    else if (id === 'vacio') { fx.rings.spawn(x, y, { life: 0.35, s0: 2.2, s1: 0.05, tint: 0xb05cff, a0: 1 }); fx.purple.explode(18, x, y); }
    else if (id === 'llamarada') { fx.fire.explode(22, x, y); fx.embers.explode(10, x, y); fx.light(x, y, 0xff3b3b, 6, 0.4); }
    else if (id === 'eco') { fx.flashes.spawn(x, y, { life: 0.9, s0: 0.6, s1: 0.2, vy: -260, tint: 0xffffff, a0: 1 }); fx.rings.spawn(x, y, { life: 0.4, s0: 0.2, s1: 1.4, tint: 0xffffff }); }
  }

  // Inundación de Flujo (Batalla de Escuadrones): sólo se dibuja la franja visible
  drawFlood(snap) {
    const fy = snap && snap.o && snap.o.br ? snap.o.br.fy : 0;
    if (!this.floodG) this.floodG = this.add.graphics().setDepth(60);
    const g = this.floodG, v = this.cameras.main.worldView;
    g.clear();
    if (fy <= v.y) return;
    const bottom = Math.min(fy, v.bottom);
    g.fillStyle(0x5a0a14, 0.42).fillRect(v.x, v.y, v.width, bottom - v.y);
    if (fy < v.bottom) {
      const t = this.time.now / 300;
      g.lineStyle(4, 0xff3b3b, 0.9).beginPath();
      for (let x = v.x; x <= v.right + 16; x += 16) { const y = fy + Math.sin(x / 40 + t) * 5; if (x === v.x) g.moveTo(x, y); else g.lineTo(x, y); }
      g.strokePath();
      g.fillStyle(0xff3b3b, 0.12).fillRect(v.x, fy - 30, v.width, 30);
    }
  }
};
