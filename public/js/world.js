/* LEVIATHAN - Escena base del mundo (compartida por Refugio y Misión):
   - Input a paso fijo 60 Hz con predicción local usando la MISMA física del servidor.
   - Reconciliación con el estado autoritativo + suavizado visual del error.
   - Interpolación de otros jugadores (100 ms), cámara con look-ahead, tilemap, fondo parallax. */
G.WorldScene = class extends Phaser.Scene {
  initWorld(level, bgTint) {
    this.level = level;
    this.fx = new G.FX(this);
    this.players = new Map();
    this.overlay = this.add.graphics().setDepth(65);
    this.me = { body: null, pending: [], offX: 0, offY: 0, acc: 0, sendT: 0, aim: 0, flags: 0, snapMe: null };
    this.wl = { cd: 0, alt: 0, prev: 0, combo: 0, ammo: 0, reloading: false, mode: 0 };
    this.lookX = 0; this.lookY = 0;
    this.camX = level.spawn ? level.spawn.x : 0; this.camY = level.spawn ? level.spawn.y : 0;
    this.buildBackground(level, bgTint);
    this.buildTilemap(level);
    this.setupInput();
    const cam = this.cameras.main;
    cam.setBounds(0, 0, level.tw * LV.C.TILE, level.th * LV.C.TILE);
    cam.setBackgroundColor('#04070b');
    G.Gfx.apply(cam);
    this.snapQueue = null;
    this.onSnapFn = (s) => { this.snapQueue = s; };
    // Cada evento se procesa aislado: si uno falla, el resto del lote (p.ej. 'gate'
    // que abre una compuerta) se aplica igualmente y el cliente no queda desincronizado.
    this.onEventsFn = (evs) => { if (!Array.isArray(evs)) return; for (let i = 0; i < evs.length; i++) G.safe('ev:' + (evs[i] && evs[i][0]), this.handleEvents, this, [evs[i]]); };
    this.onRosterFn = () => { for (const v of this.players.values()) v.applyRoster(); };
    G.Net.on('snap', this.onSnapFn);
    G.Net.on('events', this.onEventsFn);
    G.Net.on('roster', this.onRosterFn);
    this.events.once('shutdown', () => {
      G.Net.off('snap', this.onSnapFn); G.Net.off('events', this.onEventsFn); G.Net.off('roster', this.onRosterFn);
      for (const v of this.players.values()) v.destroy();
      this.players.clear();
    });
  }

  // ------------------------------------------------------------ escenario
  buildBackground(level, tint) {
    const w = this.scale.width, h = this.scale.height;
    this.bgFar = this.add.tileSprite(0, 0, w, h, 'bg_far').setOrigin(0).setScrollFactor(0).setDepth(-30).setTint(tint || 0x8fb3cc);
    this.bgMid = this.add.tileSprite(0, 0, w, h, 'bg_mid').setOrigin(0).setScrollFactor(0).setDepth(-29).setAlpha(0.8);
    this.backdrop = this.add.graphics().setDepth(-20);
    this.embers = this.add.particles(0, 0, 'px', {
      lifespan: 6000, speedX: { min: -12, max: 12 }, speedY: { min: -30, max: -8 }, scale: { min: 0.3, max: 0.9 },
      alpha: { start: 0.7, end: 0 }, blendMode: 'ADD', frequency: 90, tint: [0xff8a00, 0xffd34a, 0x39d7ff],
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-760, -420, 1520, 840) }
    }).setDepth(-5);
  }

  tileIndex(x, y) {
    const L = this.level, P = LV.Phys;
    const v = L.tiles[y * L.tw + x];
    if (v === 2) return 2;
    if (v === 3) return 3;
    if (v !== 1) return -1;
    const up = P.tileAt(L, x, y - 1);
    // Variantes deterministas por celda: rompen la repetición sin coste en tiempo de ejecución
    const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    if (up === 0 || up === 2) return [4, 4, 9, 10][h & 3];
    if (P.tileAt(L, x - 1, y) === 0 || P.tileAt(L, x + 1, y) === 0 || P.tileAt(L, x, y + 1) === 0) return [5, 11, 12][h % 3];
    return [1, 1, 6, 7, 8][h % 5];
  }

  buildTilemap(level) {
    const map = this.make.tilemap({ tileWidth: 32, tileHeight: 32, width: level.tw, height: level.th });
    const ts = map.addTilesetImage('tiles', 'tiles', 32, 32, 0, 0);
    this.map = map;
    this.layer = map.createBlankLayer('main', ts, 0, 0).setDepth(10);
    for (let y = 0; y < level.th; y++) for (let x = 0; x < level.tw; x++) {
      const idx = this.tileIndex(x, y);
      if (idx >= 0) this.layer.putTileAt(idx, x, y);
    }
  }

  setTile(i, v) {
    const L = this.level;
    L.tiles[i] = v;
    const x = i % L.tw, y = Math.floor(i / L.tw);
    if (v === 0) this.layer.removeTileAt(x, y);
    else this.layer.putTileAt(this.tileIndex(x, y), x, y);
  }

  // ------------------------------------------------------------ input
  setupInput() {
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE,SHIFT,Q,E,R,G,F,V,T,UP,DOWN,LEFT,RIGHT');
    this.input.mouse.disableContextMenu();
    this.input.keyboard.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
    // Pulsaciones "enganchadas": ningún toque se pierde aunque dure menos que un frame
    const B = LV.C.B;
    this.latch = 0;
    this.input.keyboard.on('keyup', (ev) => {
      // Baliza de emergencia: mantener X durante 1 s (soltar antes = cancelar)
      if (ev.code === 'KeyX' && this.evacHold) { const held = performance.now() - this.evacHold; this.evacHold = 0; if (held >= 1000) G.Net.act({ type: 'evac' }).then(r => { if (G.UI && !r.ok) G.UI.addFeed(r.msg, 0xff6b6b); }); else if (G.UI) G.UI.addFeed('Mantén X 1 s para activar la baliza de emergencia', 0xffb020); }
    });
    this.input.keyboard.on('keydown', (ev) => {
      switch (ev.code) {
        case 'Space': case 'KeyW': case 'ArrowUp': this.latch |= B.JUMP; break;
        case 'ShiftLeft': case 'ShiftRight': this.latch |= B.DASH; break;
        case 'KeyQ': this.latch |= B.ALT; break;
        case 'KeyE': this.latch |= B.INT; this.eTap = true; break;
        case 'KeyR': this.latch |= B.RELOAD; break;
        case 'KeyC': if (G.Net.phase === 'run' && !ev.repeat) G.Net.act({ type: 'rescue' }).then(r => G.UI && G.UI.addFeed(r.msg, r.ok ? 0x7dff4f : 0xff6b6b)); break;
        case 'KeyA': case 'KeyD': if (this.me.flags & 16) this.specIdx = (this.specIdx || 0) + (ev.code === 'KeyD' ? 1 : -1); break;
        case 'KeyX': if (G.Net.phase === 'run' && !ev.repeat) { this.evacHold = performance.now(); } break;
        case 'KeyF': this.latch |= B.STREAK; break;
        case 'KeyG': this.latch |= B.GREN; break;
        case 'KeyV': this.latch |= B.MELEE; break;
        case 'KeyT': this.latch |= B.GTYPE; break;
      }
    });
    this.input.on('pointerdown', (p) => {
      // Caído: clic = marcar posición desde la cámara de seguridad · Vivo: clic central = marcar
      if (G.Net.phase === 'run' && ((this.me.flags & 16) || p.middleButtonDown())) { G.Net.act({ type: 'ping', x: p.worldX, y: p.worldY }); return; }
      if (p.rightButtonDown()) this.latch |= B.ALT; else if (this.allowFire()) this.latch |= B.FIRE;
    });
  }

  sampleButtons() {
    if (G.UI && G.UI.blocksInput()) { this.latch = 0; return 0; }
    const k = this.keys, B = LV.C.B, p = this.input.activePointer;
    let b = 0;
    if (k.A.isDown || k.LEFT.isDown) b |= B.L;
    if (k.D.isDown || k.RIGHT.isDown) b |= B.R;
    if (k.S.isDown || k.DOWN.isDown) b |= B.D;
    if (k.SPACE.isDown || k.W.isDown || k.UP.isDown) b |= B.JUMP;
    if (k.SHIFT.isDown) b |= B.DASH;
    if (p.leftButtonDown() && this.allowFire()) b |= B.FIRE;
    if (p.rightButtonDown() || k.Q.isDown) b |= B.ALT;
    if (k.E.isDown) b |= B.INT;
    if (k.R.isDown) b |= B.RELOAD;
    if (k.G.isDown) b |= B.GREN;
    if (k.F.isDown) b |= B.STREAK;
    if (k.V.isDown) b |= B.MELEE;
    b |= this.latch;
    this.latch = 0;
    return b;
  }
  allowFire() { return true; }

  aimAngle() {
    const body = this.me.body;
    if (!body) return 0;
    const p = this.input.activePointer;
    const wp = p.positionToCamera(this.cameras.main);
    return Math.atan2(wp.y - (body.y + 12 + this.me.offY), wp.x - (body.x + body.w / 2 + this.me.offX));
  }

  // ------------------------------------------------------------ predicción / reconciliación
  reconcile(snap) {
    const me = snap.me;
    if (!me) return;
    const P = LV.Phys, M = this.me;
    if (!M.body) {
      M.body = P.makePlayerBody(me.b[0], me.b[1]);
    }
    const body = M.body;
    while (M.pending.length && M.pending[0][0] <= me.q) M.pending.shift();
    const ox = body.x, oy = body.y;
    const a = me.b;
    body.x = a[0]; body.y = a[1]; body.vx = a[2]; body.vy = a[3]; body.onGround = !!a[4]; body.coyote = a[5];
    body.jumpBuf = a[6]; body.airJumps = a[7]; body.dashT = a[8]; body.dashCd = a[9]; body.dashDir = a[10];
    body.prevB = a[11]; body.crouch = !!a[12]; body.h = a[13]; body.dropT = a[14]; body.facing = a[15];
    body.ctrl = !!a[16]; body.dashCdMul = a[17];
    body.ride = a[18] === undefined ? -1 : a[18]; body.ads = !!a[19]; body.speedMul = a[20] || 1; body.gravMul = a[21] || 1;
    for (const pr of M.pending) { this.level.time = pr[2]; P.stepPlayer(this.level, body, pr[1], LV.C.DT); }
    const dx = ox - body.x, dy = oy - body.y;
    if (Math.abs(dx) + Math.abs(dy) > 160) { M.offX = 0; M.offY = 0; }
    else { M.offX += dx; M.offY += dy; }
    M.snapMe = me;
    this.wl.ammo = me.am; this.wl.reloading = me.rl > 0; this.wl.mode = me.md;
    if (Math.abs(this.wl.alt - me.ac) > 0.3) this.wl.alt = me.ac;
  }

  stepLocal() {
    const M = this.me;
    const b = this.sampleButtons();
    M.aim = this.aimAngle();
    const seq = G.Net.queueInput(b, M.aim);
    if (!M.body) return;
    const myFlags = M.flags;
    if (myFlags & 16) return;
    // Tiempo de servidor estimado para este paso (plataformas móviles deterministas)
    const est = (G.Net.serverNow() + G.Net.rtt / 2) / 1000;
    if (!this.predT || Math.abs(this.predT - est) > 0.25) this.predT = est; else this.predT += LV.C.DT + (est - this.predT) * 0.05;
    this.level.time = this.predT;
    const ev = LV.Phys.stepPlayer(this.level, M.body, b, LV.C.DT);
    M.pending.push([seq, b, this.predT]);
    M.lastB = b;
    if (M.pending.length > 240) M.pending.shift();
    this.onLocalMove(ev);
    if (!(myFlags & 8)) this.localWeapon(b, M.aim, LV.C.DT);
  }

  onLocalMove(ev) {
    const body = this.me.body, x = body.x + body.w / 2, y = body.y + body.h;
    if (ev & 1) { G.Sfx.play('jump'); this.fx.dust.explode(5, x, y); }
    if (ev & 2) { G.Sfx.play('jump2'); this.fx.rings.spawn(x, y, { life: 0.25, s0: 0.2, s1: 0.8, tint: 0x39d7ff, a0: 0.8 }); }
    if (ev & 4) { G.Sfx.play('dash'); this.fx.shake(0.08); this.fx.dust.explode(6, x, y); }
    if (ev & 8) { G.Sfx.play('land', 0.6); this.fx.dust.explode(4, x, y); }
  }

  localWeapon() { /* sobreescrito en la escena de misión */ }

  myPos() {
    const b = this.me.body;
    if (!b) return null;
    return { x: b.x + b.w / 2 + this.me.offX, y: b.y + b.h + this.me.offY };
  }

  // ------------------------------------------------------------ bucle
  update() { G.safe('World', this.tickFrame, this); }
  tickFrame() {
    // Reloj real (no el delta suavizado de Phaser) para que el paso fijo de 60 Hz sea exacto
    const now = performance.now();
    const raw = this.lastNow ? (now - this.lastNow) / 1000 : LV.C.DT;
    this.lastNow = now;
    const dt = Math.min(raw, 0.1);
    if (this.snapQueue) { const s = this.snapQueue; this.snapQueue = null; this.reconcile(s); this.onSnapshot(s); }
    const M = this.me;
    M.acc += Math.min(raw, 0.25);
    let steps = 0;
    while (M.acc >= LV.C.DT && steps < 15) { M.acc -= LV.C.DT; steps++; this.stepLocal(); }
    if (steps >= 15) M.acc = 0;
    M.sendT += dt;
    if (M.sendT >= 1 / 30) { M.sendT = 0; G.Net.flushInputs(); }
    const decay = Math.exp(-dt * 14);
    M.offX *= decay; M.offY *= decay;

    const lowered = G.Gfx.watch(dt);
    if (lowered && G.UI) G.UI.addFeed(`Rendimiento: calidad gráfica ajustada a ${lowered.toUpperCase()} (tecla P para cambiar)`, 0xffb020);
    this.overlay.clear();
    this.renderPlayers(dt);
    this.updateWorld(dt);
    this.fx.update(dt);
    this.updateCamera(dt);
  }

  onSnapshot() {}
  updateWorld() {}
  handleEvents() {}
  showWeapons() { return false; }

  renderPlayers(dt) {
    const pair = G.Net.interpPair();
    const last = G.Net.lastSnap;
    if (!pair || !last) return;
    const [a, b, al] = pair;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    const prevMap = this._prev || (this._prev = new Map());
    prevMap.clear();
    for (const t of a.p) prevMap.set(t[0], t);
    for (const t of last.p) {
      const id = t[0];
      seen.add(id);
      let v = this.players.get(id);
      if (!v) { v = new G.PlayerView(this, id, id === G.Net.id); this.players.set(id, v); v.px = t[1]; v.py = t[2]; }
      if (id === G.Net.id) {
        this.me.flags = t[4];
        const pos = this.myPos();
        const body = this.me.body;
        if (pos && body) {
          let f = t[4] & ~(1 | 2 | 4 | 512);
          f |= (body.facing > 0 ? 1 : 0) | (body.crouch ? 2 : 0) | (body.dashT > 0 ? 4 : 0) | (body.onGround ? 512 : 0);
          v.setState(pos.x, pos.y, this.me.aim, f, t[5], t[6], t[7], t[8], t[9]);
        }
      } else {
        const tb = b.p.find(q => q[0] === id) || t;
        const ta = prevMap.get(id) || tb;
        const x = ta[1] + (tb[1] - ta[1]) * al, y = ta[2] + (tb[2] - ta[2]) * al;
        let aa = ta[3] / 100, ab = tb[3] / 100;
        let d = ab - aa; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        v.setState(x, y, aa + d * al, tb[4], tb[5], tb[6], tb[7], tb[8], tb[9]);
      }
      // Culling de otros operadores fuera de cámara
      if (id !== G.Net.id) {
        const vw = this.cameras.main.worldView;
        const inView = v.x > vw.x - 120 && v.x < vw.right + 120 && v.y > vw.y - 160 && v.y < vw.bottom + 160;
        if (!inView) { v.body.setVisible(false); v.weapon.setVisible(false); v.label.setVisible(false); v.light.setVisible(false); v.trailEm.emitting = false; v.px = v.x; v.py = v.y; continue; }
      }
      v.update(dt, this.fx, this.showWeapons());
      v.drawBars(this.overlay);
    }
    for (const [id, v] of this.players) if (!seen.has(id)) { v.destroy(); this.players.delete(id); }
  }

  cameraTarget() {
    const pos = this.myPos();
    if ((this.me.flags & 16) || !pos) {
      // Espectador táctico: la cámara salta entre los nodos de seguridad (uno por sala); A/D para cambiar
      const rooms = this.level && this.level.rooms;
      if (rooms && rooms.length && (this.me.flags & 16)) {
        const n = rooms.length, i = (((this.specIdx || 0) % n) + n) % n, r = rooms[i];
        if (G.UI) G.UI.setPrompt(`CÁMARA DE SEGURIDAD ${i + 1}/${n} · A/D cambiar · CLIC marcar contacto para tu escuadrón`);
        return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
      }
      for (const v of this.players.values()) if (!(v.flags & 24)) return { x: v.x, y: v.y };
    }
    return pos;
  }

  updateCamera(dt) {
    const cam = this.cameras.main;
    const t = this.cameraTarget();
    if (!t) return;
    const p = this.input.activePointer;
    const ads = this.me.body && this.me.body.ads && ((this.me.lastB || 0) & LV.C.B.ALT);
    // Francotirador: la mira [Q] llega el doble de lejos y abre el campo de visión
    const ri = ads && G.Net.roster.get(G.Net.id), lw = ri && ri.weapon;
    const sn = !!(lw && lw.arch === 'sniper'), m = sn ? 2 : 1;
    const lk = ads ? 0.5 * m : 0.22;
    const lx = Phaser.Math.Clamp((p.x - cam.width / 2) * lk, ads ? -340 * m : -160, ads ? 340 * m : 160);
    const ly = Phaser.Math.Clamp((p.y - cam.height / 2) * lk * 0.8, ads ? -200 * m : -90, ads ? 200 * m : 90);
    this.adsZoom = (this.adsZoom || 0) + ((ads ? (sn ? -0.3 : 0.1) : 0) - (this.adsZoom || 0)) * (1 - Math.exp(-dt * 8));
    this.lookX += (lx - this.lookX) * (1 - Math.exp(-dt * 5));
    this.lookY += (ly - this.lookY) * (1 - Math.exp(-dt * 5));
    this.camRecoil = (this.camRecoil || 0) * Math.exp(-dt * 10);
    const tx = t.x + this.lookX, ty = t.y - 80 + this.lookY + this.camRecoil;
    const k = 1 - Math.exp(-dt * 9);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    cam.setZoom(1.2 + this.fx.zoomKick + (this.adsZoom || 0));
    cam.centerOn(this.camX, this.camY);
    this.bgFar.tilePositionX = cam.scrollX * 0.12; this.bgFar.tilePositionY = cam.scrollY * 0.12;
    this.bgMid.tilePositionX = cam.scrollX * 0.35; this.bgMid.tilePositionY = cam.scrollY * 0.35;
    this.embers.setPosition(cam.midPoint.x, cam.midPoint.y);
  }

  distTo(x, y) {
    const p = this.myPos() || { x: this.camX, y: this.camY };
    return Math.hypot(p.x - x, p.y - y);
  }
  volAt(x, y) { return Math.max(0, 1 - this.distTo(x, y) / 1400); }
};
