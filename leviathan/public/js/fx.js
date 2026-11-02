/* LEVIATHAN - Sistema de efectos con pools (cero asignaciones en caliente):
   partículas de chispas/sangre cibernética/escombros, destellos, estelas fantasma (dash),
   anillos de impacto, cortes, números de daño, screen shake dinámico y zoom punch. */

// Pool genérico de imágenes con tiempo de vida (sin tweens -> sin basura)
G.SpritePool = class {
  constructor(scene, key, size, depth, blend) {
    this.items = [];
    for (let i = 0; i < size; i++) {
      const img = scene.add.image(-9999, -9999, key).setVisible(false).setActive(false).setDepth(depth);
      if (blend) img.setBlendMode(blend);
      img.fx = { life: 0, max: 1, s0: 1, s1: 1, a0: 1, a1: 0, vx: 0, vy: 0, g: 0, spin: 0 };
      this.items.push(img);
    }
    this.cursor = 0;
  }
  spawn(x, y, o) {
    let img = null;
    for (let i = 0; i < this.items.length; i++) {
      const c = this.items[(this.cursor + i) % this.items.length];
      if (!c.active) { img = c; this.cursor = (this.cursor + i + 1) % this.items.length; break; }
    }
    if (!img) { img = this.items[this.cursor]; this.cursor = (this.cursor + 1) % this.items.length; }
    const f = img.fx;
    f.life = f.max = o.life || 0.3; f.s0 = o.s0 === undefined ? 1 : o.s0; f.s1 = o.s1 === undefined ? f.s0 : o.s1;
    f.a0 = o.a0 === undefined ? 1 : o.a0; f.a1 = o.a1 === undefined ? 0 : o.a1;
    f.vx = o.vx || 0; f.vy = o.vy || 0; f.g = o.g || 0; f.spin = o.spin || 0;
    img.setActive(true).setVisible(true).setPosition(x, y).setScale(f.s0).setAlpha(f.a0)
      .setRotation(o.rot || 0).setFlipX(!!o.flipX).setTint(o.tint === undefined ? 0xffffff : o.tint);
    if (o.texture) img.setTexture(o.texture);
    if (o.originX !== undefined) img.setOrigin(o.originX, 0.5); else img.setOrigin(0.5, 0.5);
    return img;
  }
  update(dt) {
    for (const img of this.items) {
      if (!img.active) continue;
      const f = img.fx;
      f.life -= dt;
      if (f.life <= 0) { img.setActive(false).setVisible(false); continue; }
      const k = 1 - f.life / f.max;
      f.vy += f.g * dt;
      img.x += f.vx * dt; img.y += f.vy * dt;
      if (f.spin) img.rotation += f.spin * dt;
      img.setScale(f.s0 + (f.s1 - f.s0) * k);
      img.setAlpha(f.a0 + (f.a1 - f.a0) * k);
    }
  }
};

G.FX = class {
  constructor(scene) {
    this.s = scene;
    // Tope de partículas vivas por emisor: en combates de 10 jugadores + jefe las explosiones
    // encadenadas podían crear miles de partículas en un frame (pico de CPU/GPU = tirón).
    const P = (key, cfg, depth) => scene.add.particles(0, 0, key, Object.assign({ emitting: false, maxAliveParticles: 260 }, cfg)).setDepth(depth || 55);
    this.sparks = P('px', { lifespan: { min: 120, max: 340 }, speed: { min: 120, max: 460 }, angle: { min: 0, max: 360 }, scale: { start: 1, end: 0 }, gravityY: 700, blendMode: 'ADD', tint: [0xffe07a, 0xffffff, 0xffb020] });
    this.blood = P('px', { lifespan: { min: 300, max: 750 }, speed: { min: 60, max: 320 }, angle: { min: 0, max: 360 }, scale: { start: 1.4, end: 0.2 }, gravityY: 1000, blendMode: 'ADD', tint: [0x39ffcf, 0x00b3ff, 0x9bffef] });
    this.redBlood = P('px', { lifespan: { min: 300, max: 700 }, speed: { min: 60, max: 280 }, angle: { min: 0, max: 360 }, scale: { start: 1.3, end: 0.2 }, gravityY: 1000, tint: [0xff3b3b, 0xb01020, 0xff7b54] });
    this.debris = P('shard', { lifespan: { min: 600, max: 1100 }, speed: { min: 120, max: 420 }, angle: { min: 200, max: 340 }, scale: { start: 1.4, end: 0.6 }, rotate: { min: 0, max: 360 }, gravityY: 1300, tint: [0x4e5967, 0x3c4552, 0xc99a10, 0x2b3138] });
    this.smoke = P('smoke', { lifespan: { min: 600, max: 1300 }, speed: { min: 10, max: 70 }, angle: { min: 0, max: 360 }, scale: { start: 0.7, end: 2.6 }, alpha: { start: 0.55, end: 0 }, gravityY: -40 }, 50);
    this.fire = P('glow', { lifespan: { min: 200, max: 520 }, speed: { min: 40, max: 320 }, angle: { min: 0, max: 360 }, scale: { start: 0.9, end: 0 }, blendMode: 'ADD', tint: [0xffd34a, 0xff6a00, 0xff3b3b] }, 58);
    this.purple = P('px', { lifespan: { min: 200, max: 420 }, speed: { min: 80, max: 300 }, angle: { min: 0, max: 360 }, scale: { start: 1.2, end: 0 }, blendMode: 'ADD', tint: [0xb05cff, 0xd18bff, 0xffffff] });
    this.cyan = P('px', { lifespan: { min: 250, max: 600 }, speed: { min: 40, max: 260 }, angle: { min: 0, max: 360 }, scale: { start: 1.2, end: 0 }, blendMode: 'ADD', tint: [0x39d7ff, 0xffffff, 0x0080ff] });
    this.green = P('px', { lifespan: { min: 300, max: 700 }, speed: { min: 40, max: 200 }, angle: { min: 240, max: 300 }, scale: { start: 1.3, end: 0 }, blendMode: 'ADD', tint: [0x7dff4f, 0xffffff, 0x5dff7a] });
    this.gold = P('px', { lifespan: { min: 400, max: 900 }, speed: { min: 80, max: 300 }, angle: { min: 220, max: 320 }, gravityY: 500, scale: { start: 1.4, end: 0 }, blendMode: 'ADD', tint: [0xffd34a, 0xfff6c9] });
    this.dust = P('smoke', { lifespan: { min: 250, max: 450 }, speed: { min: 30, max: 120 }, angle: { min: 180, max: 360 }, scale: { start: 0.3, end: 0.9 }, alpha: { start: 0.35, end: 0 } }, 40);

    this.flashes = new G.SpritePool(scene, 'glow', 40, 59, Phaser.BlendModes.ADD);
    this.rings = new G.SpritePool(scene, 'ring', 24, 59, Phaser.BlendModes.ADD);
    this.slashes = new G.SpritePool(scene, 'slash', 20, 57, Phaser.BlendModes.ADD);
    this.ghosts = new G.SpritePool(scene, 'pl_recluta', 70, 19, Phaser.BlendModes.ADD);
    // Iluminación dinámica: luces aditivas de corta vida (disparos, explosiones, impactos)
    this.lights = new G.SpritePool(scene, 'glow', 48, 9, Phaser.BlendModes.ADD);
    this.embers = P('glow', { lifespan: { min: 900, max: 1800 }, speed: { min: 30, max: 160 }, angle: { min: 200, max: 340 }, gravityY: -60, scale: { start: 0.25, end: 0 }, blendMode: 'ADD', tint: [0xffd34a, 0xff6a00] }, 57);

    // Números de daño: BitmapText sobre una fuente generada una sola vez.
    // Un Text normal re-rasteriza y re-sube su textura a la GPU en cada setText:
    // con fuego automático eso eran decenas de subidas por segundo (micro-tirones).
    G.FX.ensureNumFont(scene);
    this.bnums = [];
    for (let i = 0; i < 48; i++) {
      const t = scene.add.bitmapText(-999, -999, 'lvnum', '').setOrigin(0.5).setDepth(80).setVisible(false).setActive(false);
      t.fx = { life: 0, vy: 0 };
      this.bnums.push(t);
    }
    this.bnumCursor = 0;
    // Pool reducido de Text sólo para mensajes con letras (¡DERRIBO!, RECARGA…), poco frecuentes
    this.nums = [];
    for (let i = 0; i < 10; i++) {
      const t = scene.add.text(-999, -999, '', { fontFamily: G.FONT, fontSize: '16px', fontStyle: 'bold', color: '#fff', stroke: '#000', strokeThickness: 4 })
        .setOrigin(0.5).setDepth(80).setVisible(false).setActive(false);
      t.fx = { life: 0, vy: 0 };
      this.nums.push(t);
    }
    this.numCursor = 0;
    this.shakeLevel = 0;
    this.zoomKick = 0;
  }

  update(dt) {
    this.lights.update(dt);
    this.flashes.update(dt); this.rings.update(dt); this.slashes.update(dt); this.ghosts.update(dt);
    for (const t of this.bnums) {
      if (!t.active) continue;
      t.fx.life -= dt;
      if (t.fx.life <= 0) { t.setActive(false).setVisible(false); continue; }
      t.fx.vy += 500 * dt; t.y += t.fx.vy * dt;
      t.setAlpha(Math.min(1, t.fx.life * 3));
    }
    for (const t of this.nums) {
      if (!t.active) continue;
      t.fx.life -= dt;
      if (t.fx.life <= 0) { t.setActive(false).setVisible(false); continue; }
      t.fx.vy += 500 * dt; t.y += t.fx.vy * dt;
      t.setAlpha(Math.min(1, t.fx.life * 3));
    }
    this.shakeLevel = Math.max(0, this.shakeLevel - dt * 2.5);
    this.zoomKick *= Math.pow(0.0005, dt);
  }

  // Screen shake dinámico: amount 0..1 (se acumula y decae)
  shake(amount) {
    const cam = this.s.cameras.main;
    if (amount < this.shakeLevel * 0.6 && cam.shakeEffect.isRunning) return;
    this.shakeLevel = Math.min(1, Math.max(this.shakeLevel, amount));
    cam.shake(70 + 260 * amount, 0.0018 + 0.012 * amount, true);
  }
  kick(z) { this.zoomKick = Math.min(0.08, this.zoomKick + z); }

  num(x, y, value, color, big) {
    const str = String(value);
    if (/^[0-9+\-!]{1,8}$/.test(str)) {
      const t = this.bnums[this.bnumCursor]; this.bnumCursor = (this.bnumCursor + 1) % this.bnums.length;
      t.setText(str).setPosition(x + (Math.random() - 0.5) * 16, y).setTint(G.FX.toInt(color))
        .setScale(big ? 1.5 : 1).setActive(true).setVisible(true).setAlpha(1);
      t.fx.life = 0.75; t.fx.vy = -260;
      return;
    }
    const t = this.nums[this.numCursor]; this.numCursor = (this.numCursor + 1) % this.nums.length;
    t.setText(String(value)).setPosition(x + (Math.random() - 0.5) * 16, y).setColor(color || '#ffffff')
      .setFontSize(big ? 24 : 16).setActive(true).setVisible(true).setAlpha(1);
    t.fx.life = 0.75; t.fx.vy = -260;
  }

  light(x, y, color, scale, life) {
    if (!G.Gfx.lights) return;
    this.lights.spawn(x, y, { life: life || 0.12, s0: scale, s1: scale * 1.2, a0: 0.55, a1: 0, tint: color });
  }
  muzzle(x, y, ang, color, big) {
    this.light(x, y, color || 0xffd34a, big ? 5 : 3, 0.08);
    this.flashes.spawn(x, y, { life: 0.07, s0: big ? 1.1 : 0.6, s1: big ? 1.6 : 0.9, tint: color || 0xffd34a, a0: 1 });
    this.sparks.explode(big ? 8 : 3, x + Math.cos(ang) * 6, y + Math.sin(ang) * 6);
  }
  impact(x, y, code) {
    if (code === 2) { this.blood.explode(8, x, y); this.flashes.spawn(x, y, { life: 0.08, s0: 0.5, s1: 0.2, tint: 0x9bffef }); }
    else if (code === 3) { this.debris.explode(4, x, y); this.sparks.explode(5, x, y); }
    else if (code === 4) { this.purple.explode(10, x, y); this.rings.spawn(x, y, { life: 0.2, s0: 0.2, s1: 0.6, tint: 0xb05cff }); }
    else if (code === 1) { this.sparks.explode(6, x, y); this.flashes.spawn(x, y, { life: 0.06, s0: 0.4, s1: 0.1, tint: 0xffe07a }); }
  }
  explosion(x, y, r) {
    const k = r / 100;
    this.light(x, y, 0xff8a00, 6 + 6 * k, 0.45);
    if (r >= 150 && G.Gfx.level !== 'baja') {
      // Explosión cinemática: destello de cámara, doble onda de choque y brasas persistentes
      this.s.cameras.main.flash(120, 255, 200, 140, false);
      this.rings.spawn(x, y, { life: 0.6, s0: 0.5, s1: 5 * k, tint: 0xfff3a0, a0: 0.7 });
      this.embers.explode(Math.round(12 * k), x, y);
      this.kick(0.03);
    }
    this.flashes.spawn(x, y, { life: 0.18, s0: 1.5 * k, s1: 3.2 * k, tint: 0xfff3a0 });
    this.rings.spawn(x, y, { life: 0.35, s0: 0.3, s1: 2.6 * k, tint: 0xff8a00, a0: 0.9 });
    this.fire.explode(Math.round(14 * k + 6), x, y);
    this.sparks.explode(Math.round(16 * k), x, y);
    this.smoke.explode(Math.round(6 * k + 3), x, y);
    this.debris.explode(Math.round(5 * k), x, y);
  }
  slash(x, y, ang, scale, color, flip) {
    this.slashes.spawn(x, y, { life: 0.16, s0: scale, s1: scale * 1.25, rot: ang, tint: color, a0: 1, flipX: flip, originX: 0.22 });
  }
  ghost(texture, x, y, flipX, color, originY) {
    const g = this.ghosts.spawn(x, y, { texture, life: 0.28, s0: 1, s1: 1, a0: 0.55, a1: 0, tint: color, flipX });
    g.setOrigin(0.5, originY === undefined ? 1 : originY);
    return g;
  }
  warp(x, y) {
    this.rings.spawn(x, y, { life: 0.4, s0: 1.4, s1: 0.1, tint: 0xff3b3b, a0: 0.9 });
    this.flashes.spawn(x, y, { life: 0.3, s0: 0.2, s1: 1.2, tint: 0xff5050 });
  }
};

// Fuente bitmap para números de daño: se rasteriza una única vez por partida.
G.FX.ensureNumFont = function (scene) {
  if (scene.cache.bitmapFont.exists('lvnum')) return;
  const chars = '0123456789+-!', cw = 14, ch = 20;
  const tex = scene.textures.exists('lvnum_img') ? scene.textures.get('lvnum_img') : scene.textures.createCanvas('lvnum_img', cw * chars.length, ch);
  const c = tex.getContext();
  c.clearRect(0, 0, cw * chars.length, ch);
  c.font = 'bold 16px "Segoe UI", Arial, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineJoin = 'round'; c.lineWidth = 4; c.strokeStyle = '#000';
  c.fillStyle = '#fff';
  for (let i = 0; i < chars.length; i++) {
    const x = i * cw + cw / 2, y = ch / 2 + 1;
    c.strokeText(chars[i], x, y); c.fillText(chars[i], x, y);
  }
  tex.refresh();
  const data = Phaser.GameObjects.RetroFont.Parse(scene, { image: 'lvnum_img', width: cw, height: ch, chars, charsPerRow: chars.length, spacing: { x: 0, y: 0 }, offset: { x: 0, y: 0 } });
  scene.cache.bitmapFont.add('lvnum', data);
};
// '#rrggbb' | 'rgba(r,g,b,a)' | número → entero RGB para tint
G.FX.toInt = function (col) {
  if (typeof col === 'number') return col;
  if (!col) return 0xffffff;
  try { const c = Phaser.Display.Color.ValueToColor(col); return c ? c.color : 0xffffff; } catch (_) { return 0xffffff; }
};
