/* LEVIATHAN - Refugio: zona segura viva. NPCs con cuerpo físico (simulados por el servidor con
   gravedad y colisiones reales), estaciones atmosféricas y diálogos inmersivos con la tecla E. */
G.HubScene = class extends G.WorldScene {
  constructor() { super({ key: 'Hub' }); }

  create() {
    const L = LV.Hub.build();
    LV.Phys.buildCoverGrid(L);
    this.hub = L;
    this.initWorld(L, 0x7f9fb8);
    this.decorate(L);
    this.npcViews = L.npcs.map(n => new G.NpcView(this, n));
    this.board = this.add.image(L.board.x + 38, L.board.y, 'board').setOrigin(0.5, 1).setDepth(12);
    this.boardGlow = this.add.image(L.board.x + 38, L.board.y - 55, 'glow').setScale(2.5).setTint(0x7dff4f).setAlpha(0.25).setBlendMode(Phaser.BlendModes.ADD).setDepth(11);
    this.add.text(L.board.x + 38, L.board.y - 96, 'TABLERO TÁCTICO', { fontFamily: G.FONT, fontSize: '12px', fontStyle: 'bold', color: '#7dff4f', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(70);
    this.camX = L.spawn.x; this.camY = L.spawn.y;
    this.keyE = this.keys.E;
    this.near = null;
    this.murmurT = 4;
    this.bubble = this.add.text(0, 0, '', { fontFamily: G.FONT, fontSize: '12px', fontStyle: 'italic', color: '#e8f4ff', backgroundColor: 'rgba(3,8,12,0.8)', padding: { x: 8, y: 4 }, wordWrap: { width: 260 } }).setOrigin(0.5, 1).setDepth(71).setVisible(false);
    this.bubbleT = 0;
    // Cápsula de despresurización: por aquí regresan los Núcleos tras morir
    const pod = this.add.graphics().setDepth(-7);
    pod.fillStyle(0x0b1218, 1).fillRect(37 * 32, 11 * 32, 6 * 32, 8 * 32);
    pod.lineStyle(3, 0x39d7ff, 0.7).strokeRect(37 * 32, 11 * 32, 6 * 32, 8 * 32);
    pod.fillStyle(0x39d7ff, 0.08).fillRect(37 * 32, 11 * 32, 6 * 32, 8 * 32);
    this.add.particles(40 * 32, 11 * 32, 'core', { lifespan: 2400, speedY: { min: 60, max: 120 }, speedX: { min: -10, max: 10 }, scale: { start: 0.6, end: 0 }, alpha: { start: 0.6, end: 0 }, blendMode: 'ADD', frequency: 700 }).setDepth(-6);
  }

  decorate(L) {
    const g = this.backdrop, TS = 32;
    const x0 = 2 * TS, x1 = (L.tw - 2) * TS, y0 = 2 * TS, y1 = 19 * TS;
    g.fillStyle(0x0a121b, 1).fillRect(x0, y0, x1 - x0, y1 - y0);
    for (let x = x0; x < x1; x += 96) { g.fillStyle(0x0d1822, 1).fillRect(x + 4, y0, 88, y1 - y0); g.fillStyle(0x15222e, 1).fillRect(x, y0, 4, y1 - y0); }
    // Ventanales al abismo
    for (const wx of [8, 30, 50]) {
      const wxp = wx * TS;
      g.fillStyle(0x02050a, 1).fillRect(wxp, 3 * TS, 10 * TS, 5 * TS);
      g.lineStyle(3, 0x1d3242, 1).strokeRect(wxp, 3 * TS, 10 * TS, 5 * TS);
      for (let i = 1; i < 4; i++) g.lineStyle(2, 0x1d3242, 1).lineBetween(wxp + i * 80, 3 * TS, wxp + i * 80, 8 * TS);
      g.fillStyle(0x0b3a4a, 0.35).fillEllipse(wxp + 160, 7 * TS + 10, 260, 60);
    }
    // Rótulos
    this.add.text(40 * TS, 9 * TS, 'CELDA DE DESPRESURIZACIÓN', { fontFamily: G.FONT, fontSize: '28px', fontStyle: 'bold', color: '#14324a' }).setOrigin(0.5).setDepth(-15);
    // Estación del sastre: maniquíes holográficos
    for (let i = 0; i < 3; i++) {
      const mx = (4 + i * 3) * TS + 8, my = 19 * TS;
      g.fillStyle(0x2a1030, 1).fillRect(mx - 12, my - 6, 24, 6);
      const skin = LV.Catalog.skins[1 + i];
      this.add.image(mx, my - 6, 'pl_' + skin.id).setOrigin(0.5, 1).setScale(1.3).setAlpha(0.45).setTint(0xff4fd8).setDepth(-8);
      this.add.image(mx, my - 30, 'glow').setScale(1.4).setTint(0xff4fd8).setAlpha(0.18).setBlendMode(Phaser.BlendModes.ADD).setDepth(-9);
    }
    // Taller de la mecánica
    g.fillStyle(0x2a2f36, 1).fillRect(15 * TS, 19 * TS - 34, 90, 34);
    g.fillStyle(0x3a4250, 1).fillRect(15 * TS - 4, 19 * TS - 38, 98, 6);
    g.fillStyle(0xffb020, 0.8).fillRect(15 * TS + 10, 19 * TS - 26, 20, 4);
    this.weldSparks = this.add.particles(15 * TS + 70, 19 * TS - 40, 'px', { lifespan: 500, speed: { min: 60, max: 200 }, angle: { min: 200, max: 340 }, gravityY: 600, scale: { start: 1, end: 0 }, blendMode: 'ADD', tint: [0xffd34a, 0xffffff], frequency: -1 }).setDepth(40);
    this.weldT = 0;
    // Armería del traficante en el entrepiso
    g.fillStyle(0x0f1a12, 1).fillRect(22 * TS, 14 * TS - 60, 13 * TS, 60);
    for (let i = 0; i < 5; i++) {
      const tex = ['w_rifle', 'w_katana', 'w_axe', 'w_cannon', 'w_rifle'][i];
      this.add.image(23 * TS + 20 + i * 70, 14 * TS - 34, tex).setScale(G.WeaponArt.SCALE).setRotation(-0.5).setDepth(-8).setAlpha(0.85);
    }
    this.add.image(28 * TS, 14 * TS - 40, 'glow').setScale(4, 1.5).setTint(0x5dff7a).setAlpha(0.15).setBlendMode(Phaser.BlendModes.ADD).setDepth(-9);
    // Puesto de mando y elevador
    g.fillStyle(0x10202c, 1).fillRect(64 * TS, 19 * TS - 70, 120, 70);
    for (let i = 0; i < 3; i++) { g.fillStyle(0x05121a, 1).fillRect(64 * TS + 8 + i * 38, 19 * TS - 62, 32, 22); g.fillStyle(0x39d7ff, 0.6).fillRect(64 * TS + 10 + i * 38, 19 * TS - 52, 20, 2); }
    const ex = L.elevator.x;
    g.fillStyle(0x0b0f14, 1).fillRect(ex - 10, 3 * TS, 76, 16 * TS);
    g.lineStyle(3, 0xffb020, 0.8).strokeRect(ex - 10, 3 * TS, 76, 16 * TS);
    for (let y = 4; y < 19; y += 2) g.fillStyle(0xffb020, 0.25).fillRect(ex - 6, y * TS, 68, 3);
    this.add.text(ex + 28, 6 * TS, 'DESCENSO\n▼', { fontFamily: G.FONT, fontSize: '14px', fontStyle: 'bold', color: '#ffb020', align: 'center' }).setOrigin(0.5).setDepth(-5);
    // Luces parpadeantes
    this.lights = [];
    for (const [lx, c] of [[10, 0xff4fd8], [18, 0xffb020], [28, 0x5dff7a], [40, 0x39d7ff], [52, 0x7dff4f], [66, 0x39d7ff]]) {
      const img = this.add.image(lx * TS, 3 * TS, 'glow').setScale(3).setTint(c).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(-6);
      this.lights.push({ img, base: 0.3, t: Math.random() * 10 });
    }
    this.steam = this.add.particles(56 * TS, 19 * TS - 4, 'smoke', { lifespan: 2200, speedY: { min: -60, max: -30 }, speedX: { min: -10, max: 10 }, scale: { start: 0.6, end: 2.4 }, alpha: { start: 0.25, end: 0 }, frequency: 220 }).setDepth(-4);
  }

  showWeapons() { return false; }

  updateWorld(dt) {
    // NPCs interpolados (física autoritativa del servidor)
    const pair = G.Net.interpPair();
    if (pair && pair[1].n) {
      const [a, b, al] = pair;
      for (const t of b.n) {
        const ta = (a.n && a.n.find(q => q[0] === t[0])) || t;
        const v = this.npcViews[t[0]];
        if (v) v.setState(ta[1] + (t[1] - ta[1]) * al, ta[2] + (t[2] - ta[2]) * al, t[3], t[4]);
      }
    }
    for (const v of this.npcViews) {
      v.update(dt);
      if (v.npc.role === 'commander') {
        const glitch = Math.random() < 0.04 + 0.03 * Math.min(4, (G.Net.profile && G.Net.profile.cycle && G.Net.profile.cycle.solo) || 0);
        v.sprite.setTint(0x7fe8ff).setAlpha(glitch ? 0.25 : 0.7 + Math.sin(this.time.now / 90) * 0.12);
        if (glitch) v.sprite.x += (Math.random() - 0.5) * 8;
      }
    }
    // Murmullos ambientales de los NPCs
    this.murmurT -= dt;
    if (this.murmurT <= 0 && !G.UI.dlg) {
      this.murmurT = 7 + Math.random() * 6;
      const v = this.npcViews[Math.floor(Math.random() * this.npcViews.length)];
      const cyc = G.Net.profile && G.Net.profile.cycle ? G.Net.profile.cycle.solo || 0 : 0;
      const npcD = G.Dialogue.NPC[v.npc.role];
      const lines = cyc > 0 && npcD.murmursLoop && Math.random() < 0.6 ? npcD.murmursLoop.slice(0, Math.min(4, cyc + 1)) : npcD.murmurs;
      if (lines) { this.bubble.setText(lines[Math.floor(Math.random() * lines.length)]).setVisible(true); this.bubbleT = 4; this.bubbleNpc = v; }
    }
    if (this.bubbleT > 0) {
      this.bubbleT -= dt;
      this.bubble.setPosition(this.bubbleNpc.x, this.bubbleNpc.y - 90).setAlpha(Math.min(1, this.bubbleT));
      if (this.bubbleT <= 0) this.bubble.setVisible(false);
    }
    for (const l of this.lights) { l.t += dt; l.img.setAlpha(l.base * (Math.random() < 0.02 ? 0.2 : 1) + Math.sin(l.t * 3) * 0.04); }
    this.weldT -= dt;
    if (this.weldT <= 0) { this.weldT = 0.8 + Math.random() * 2; this.weldSparks.explode(14); }
    this.boardGlow.setAlpha(0.2 + Math.sin(this.time.now / 300) * 0.06);

    // Interacción con NPCs y tablero
    const pos = this.myPos();
    let near = null, best = 120;
    if (pos) {
      for (const v of this.npcViews) {
        const d = Math.hypot(v.x - pos.x, (v.y - 26) - (pos.y - 20));
        if (d < best) { best = d; near = { role: v.npc.role, name: v.npc.name, verb: 'Hablar con' }; }
      }
      const bx = this.hub.board.x + 38, by = this.hub.board.y - 30;
      const db = Math.hypot(bx - pos.x, by - (pos.y - 20));
      if (db < best) near = { role: 'board', name: 'el TABLERO TÁCTICO', verb: 'Consultar' };
    }
    this.near = near;
    G.UI.setPrompt(near ? `[E] ${near.verb} ${near.name}` : null);
    const eDown = this.keyE.isDown;
    const ePressed = this.eTap || (eDown && !this.prevE);
    this.eTap = false;
    if (near && ePressed && !G.UI.dlg && performance.now() - G.UI.closedAt > 300) {
      G.UI.openDialog(near.role);
    }
    this.prevE = eDown;
  }

  handleEvents(evs) {
    for (const e of evs) {
      if (e[1] === G.Net.id) continue;
      const v = this.players.get(e[1]);
      if (!v) continue;
      if (e[0] === 'dash') G.Sfx.play('dash', this.volAt(v.x, v.y) * 0.6);
      else if (e[0] === 'jump2') this.fx.rings.spawn(v.x, v.y, { life: 0.25, s0: 0.2, s1: 0.8, tint: 0x39d7ff, a0: 0.8 });
    }
  }
};
