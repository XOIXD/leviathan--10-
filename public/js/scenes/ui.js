/* Forma "J" de la identidad visual: muesca superior izquierda + gancho biselado inferior. */
G.jPath = function (g, x, y, w, h, k) {
  k = k || Math.min(16, h * 0.45);
  g.beginPath();
  g.moveTo(x + k, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h); g.lineTo(x + k * 0.8, y + h);
  g.lineTo(x, y + h - k * 0.8); g.lineTo(x, y + h * 0.45); g.lineTo(x + k, y + h * 0.45); g.closePath();
};
/* LEVIATHAN - Escena de interfaz (HUD, feed táctico, banners, minimapa y diálogos inmersivos).
   Corre en paralelo sobre Refugio y Misión, sin verse afectada por la cámara del mundo. */
G.UIScene = class extends Phaser.Scene {
  constructor() { super({ key: 'UI' }); }

  create() {
    G.UI = this;
    this.mode = 'none';
    this.blockUntil = 0;
    this.closedAt = 0;
    this.bossPhase = 1;
    this.flash = 0;
    this.mmT = 0;
    const T = (x, y, size, color, o) => this.add.text(x, y, '', Object.assign({ fontFamily: G.FONT, fontSize: size + 'px', color: color || '#e8f4ff', stroke: '#000', strokeThickness: 3 }, o || {}));
    this.T = T;

    this.vignette = this.add.image(640, 360, 'vignette').setDisplaySize(1280, 720).setDepth(0).setAlpha(0.85);
    this.scan = this.add.tileSprite(0, 0, 1280, 720, 'scan').setOrigin(0).setDepth(1).setAlpha(0.35);
    this.redFlash = this.add.rectangle(640, 360, 1280, 720, 0xff1020, 0).setDepth(2);
    this.critVig = this.add.image(640, 360, 'vignette').setDisplaySize(1280, 720).setTint(0xff0010).setAlpha(0).setDepth(2.2);
    this.downedFx = this.add.image(640, 360, 'vignette').setDisplaySize(1280, 720).setTint(0xff0000).setDepth(2).setAlpha(0);
    this.g = this.add.graphics().setDepth(5);
    this.mm = this.add.graphics().setDepth(5);

    // HUD textos
    this.tTitle = T(26, 20, 13, '#7fa8ba', { fontStyle: 'bold' }).setDepth(6);
    this.tHp = T(26, 40, 13, '#ffffff', { fontStyle: 'bold' }).setDepth(6);
    this.tWeapon = T(26, 66, 15, '#ffffff', { fontStyle: 'bold' }).setDepth(6);
    this.tWeaponSub = T(26, 86, 11, '#8aa5b3').setDepth(6);
    this.tAmmo = T(26, 102, 14, '#ffd34a', { fontStyle: 'bold' }).setDepth(6);
    this.tCredits = T(26, 124, 13, '#ffd34a', { fontStyle: 'bold' }).setDepth(6);
    this.tDds = T(1254, 20, 12, '#ff9d6b', { fontStyle: 'bold' }).setOrigin(1, 0).setDepth(6);
    this.squad = [];
    for (let i = 0; i < 10; i++) this.squad.push(T(1254, 44 + i * 20, 12, '#e8f4ff').setOrigin(1, 0).setDepth(6));
    this.tObj = T(640, 152, 15, '#ffd34a', { fontStyle: 'bold', backgroundColor: 'rgba(3,8,12,0.55)', padding: { x: 10, y: 4 } }).setOrigin(0.5, 0).setDepth(6);
    this.tBoss = T(640, 652, 15, '#ff6b6b', { fontStyle: 'bold' }).setOrigin(0.5, 1).setDepth(6);
    this.tCenter = T(640, 300, 22, '#ff6b6b', { fontStyle: 'bold', align: 'center' }).setOrigin(0.5).setDepth(8);
    this.tBanner = T(640, 200, 54, '#39d7ff', { fontStyle: 'bold', strokeThickness: 6 }).setOrigin(0.5).setDepth(9).setAlpha(0);
    this.tBannerSub = T(640, 254, 18, '#e8f4ff', { align: 'center' }).setOrigin(0.5).setDepth(9).setAlpha(0);
    this.tPrompt = T(640, 600, 16, '#ffffff', { fontStyle: 'bold', backgroundColor: 'rgba(4,10,16,0.75)', padding: { x: 12, y: 6 } }).setOrigin(0.5).setDepth(7).setVisible(false);
    this.tHelp = T(640, 708, 11, '#5f8292').setOrigin(0.5, 1).setDepth(6);
    this.tPerf = T(640, 4, 10, '#4f7282', { strokeThickness: 2 }).setOrigin(0.5, 0).setDepth(6);
    this.bannerT = 0;
    this.feed = [];
    for (let i = 0; i < 7; i++) this.feed.push({ t: T(20, 0, 13, '#fff', { fontStyle: 'bold' }).setDepth(6).setAlpha(0), life: 0 });

    this.buildDialog();
    this.tGear = T(26, 146, 13, '#9ff8ff', { fontStyle: 'bold' }).setDepth(6);
    this.dark = this.add.rectangle(640, 360, 1280, 720, 0x000008, 0).setDepth(1.5);
    if (!this.textures.exists('flashmask')) {
      const t = this.textures.createCanvas('flashmask', 512, 512), c = t.getContext();
      c.fillStyle = 'rgba(0,0,6,0.94)'; c.fillRect(0, 0, 512, 512);
      c.globalCompositeOperation = 'destination-out';
      const g1 = c.createRadialGradient(256, 256, 0, 256, 256, 26); g1.addColorStop(0, 'rgba(0,0,0,1)'); g1.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g1; c.fillRect(200, 200, 112, 112);
      const g2 = c.createRadialGradient(256, 256, 10, 256, 256, 210); g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(0.75, 'rgba(0,0,0,.85)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g2; c.beginPath(); c.moveTo(256, 256); c.arc(256, 256, 210, -0.32, 0.32); c.closePath(); c.fill();
      t.refresh();
    }
    this.flashlight = this.add.image(640, 360, 'flashmask').setScale(7).setDepth(1.5).setVisible(false);
    this.orbFx = this.add.rectangle(640, 360, 1280, 720, 0xff2010, 0).setDepth(2.5);
    this.buildCine();
    this.buildSheet();
    this.buildReport();
    this.buildMedals();
    this.buildTutorial();
    this.input.keyboard.addCapture('TAB');

    // Red
    this.onEvents = (evs) => {
      for (const e of evs) {
        switch (e[0]) {
          case 'msg': this.addFeed(e[1], e[2]); break;
          case 'k': this.medalKill(e); break;
          case 'exec': this.medal('EJECUCIÓN SIGILOSA', 0xff3b4a); break;
          case 'gate': this.medal('HACKER DE ÉLITE', 0x39d7ff); break;
          case 'dead': if (e[1] === G.Net.id) this.med.streak = 0; break;
          case 'ph': if (e[1] === G.Net.id) { this.flash = Math.min(0.55, this.flash + (e[3] ? 0.04 : 0.28)); } break;
          case 'boss': {
            this.bossPhase = e[2];
            const bk = G.Net.lastSnap && G.Net.lastSnap.o && G.Net.lastSnap.o.bk;
            const nm = bk ? LV.Campaign.bosses[bk].name : 'JEFE DE CAPA';
            if (e[2] > 1) this.banner(`FASE ${e[2]}`, `${nm} · rompe su postura con golpes pesados`, '#ff6b6b');
            else this.banner(nm, 'Usen pilones [E], respiraderos de vapor y golpes pesados', '#ff6b6b');
            G.Sfx.play('alarm');
            break;
          }
          case 'orbital': this.banner('PROTOCOLO ORBITAL', 'El sector será incinerado · vuestros Núcleos escaparán', '#ff3b3b', 5); G.Sfx.play('alarm'); break;
          case 'gate': this.banner('COMPUERTA ABIERTA', 'Acceso concedido · avancen', '#7dff4f'); break;
          case 'end': {
            const r = e[2][G.Net.id];
            let sub = r ? `+${r.credits} biomasa · ${r.kills} bajas` : '';
            if (r && r.mats) { const m = Object.entries(r.mats).map(([k, v]) => `${v} ${LV.Campaign.materials[k].name}`).join(', '); if (m) sub += '\n' + m; }
            if (r && r.side) sub += `\nContrato de campo cumplido: ${r.side}`;
            if (G.Net.mode === 'br' && e[4] !== undefined) {
              const mine = G.Net.roster.get(G.Net.id);
              const won = mine && mine.team === e[4];
              const tdmEnd = G.Net.runInfo && G.Net.runInfo.tdm;
              this.showReport(won, won ? '¡VICTORIA DEL ESCUADRÓN!' : tdmEnd ? (e[4] === -1 ? 'EMPATE' : 'DERROTA') : `ELIMINADOS · PUESTO #${r && r.place ? r.place : '?'}`, r);
              G.Sfx.play(won ? 'victory' : 'fail');
              break;
            }
            if (e[1]) {
              this.showReport(true, 'MISIÓN CUMPLIDA', r); G.Sfx.play('victory');
              // Destello de extracción: lluvia de partículas doradas y anillos sobre el operador
              const rs = this.scene.get('Run'), mp = rs && rs.myPos && rs.myPos();
              if (mp && rs.fx) { rs.fx.gold.explode(70, mp.x, mp.y - 20); rs.fx.rings.spawn(mp.x, mp.y - 20, { life: 0.8, s0: 0.3, s1: 4, tint: 0xffd34a }); rs.fx.light(mp.x, mp.y - 20, 0xffd34a, 8, 0.8); }
            }
            else { this.showReport(false, 'MISIÓN FALLIDA', r, 'Se conserva el 40% de los materiales · los Núcleos regresan a la Celda'); G.Sfx.play('fail'); }
            if (e[3]) this.time.delayedCall(2500, () => this.playCine(e[3]));
            break;
          }
        }
      }
    };
    G.Net.on('events', this.onEvents);
    G.Net.on('notify', (n) => { this.addFeed(n.text, n.color); G.Sfx.play('coins'); });
    G.Net.on('profile', () => { if (this.dlg && !this.dlg.busy) this.refreshNode(); });
    G.Net.on('roster', () => { if (this.dlg && !this.dlg.busy) this.refreshNode(); });

    this.input.keyboard.on('keydown', (ev) => this.onKey(ev));
  }

  setMode(mode) {
    if (mode !== 'run') { G.Sfx.music('off'); if (this.critVig) this.critVig.setAlpha(0); }
    if (mode === 'none') {
      this.mode = 'none';
      this.closeDialog(true);
      this.tPrompt.setVisible(false); this.g.clear(); this.mm.clear();
      for (const t of [this.tTitle, this.tHp, this.tWeapon, this.tWeaponSub, this.tAmmo, this.tCredits, this.tDds, this.tObj, this.tBoss, this.tCenter, this.tHelp, this.tPerf, this.tGear].concat(this.squad)) t.setText('');
      this.dark.setAlpha(0); this.orbFx.setAlpha(0); this.downedFx.setAlpha(0); this.redFlash.setAlpha(0); this.bannerT = 0; this.flash = 0; if (this.report) this.report.setVisible(false);
      if (this.sheetOn) this.toggleSheet();
      return;
    }
    this.mode = mode;
    this.closeDialog(true);
    this.tPrompt.setVisible(false);
    this.bossPhase = 1;
    this.mm.clear();
    this.flash = 0;
    if (mode === 'run') {
      const ri = G.Net.runInfo || {};
      const d = LV.Campaign.descents(ri.variant || 'solo')[ri.idx || 0];
      const rti = G.Net.runInfo;
      if (rti && rti.tdm) this.banner('5 CONTRA 5', LV.TDMGen.MAPS[rti.map | 0].name + ' · primer equipo en 30 bajas', '#ffb020', 3.5);
      else this.banner(d.boss ? 'DESCENSO FINAL DE CAPA' : 'DESCENSO INICIADO', d.name + (d.boss ? ' · JEFE: ' + LV.Campaign.bosses[d.boss].name : ' · Llega al elevador'), '#39d7ff', 3.5);
    } else this.banner('CELDA DE DESPRESURIZACIÓN', 'Zona neutral · tu Núcleo fue impreso en un exotraje nuevo', '#39d7ff', 2.5);
    this.tGear.setText('');
  }

  blocksInput() { return !!this.dlg || !!this.cine || performance.now() < this.blockUntil; }

  // ------------------------------------------------------------ cinemáticas
  buildCine() {
    const c = this.add.container(0, 0).setDepth(40).setVisible(false);
    const bg = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.95).setInteractive();
    bg.on('pointerdown', () => this.cineNext());
    const bars = this.add.graphics();
    bars.fillStyle(0x000000, 1).fillRect(0, 0, 1280, 70).fillRect(0, 650, 1280, 70);
    bars.lineStyle(1, 0x39d7ff, 0.4).lineBetween(0, 70, 1280, 70).lineBetween(0, 650, 1280, 650);
    // Viñeta ilustrada a pantalla completa + franja inferior de subtítulos (estilo novela gráfica)
    this.cArt = this.add.image(640, 360, 'px').setDisplaySize(1280, 580);
    this.cShade = this.add.graphics();
    this.cShade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.92, 0.92).fillRect(0, 430, 1280, 220);
    this.cShade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.75, 0.75, 0, 0).fillRect(0, 70, 1280, 90);
    this.cTitle = this.T(640, 104, 30, '#39d7ff', { fontStyle: 'bold' }).setOrigin(0.5);
    this.cPortrait = this.add.image(110, 560, 'pt_commander').setDisplaySize(120, 120);
    this.cName = this.T(200, 494, 18, '#39d7ff', { fontStyle: 'bold' });
    this.cText = this.T(200, 524, 20, '#e8f4ff', { wordWrap: { width: 1000 }, lineSpacing: 6 });
    this.cHint = this.T(1240, 690, 12, '#5f8292').setOrigin(1, 1).setText('ESPACIO / E / clic continuar · ESC saltar');
    this.cProg = this.T(40, 690, 12, '#5f8292').setOrigin(0, 1);
    this.cChoiceG = this.add.graphics();
    this.cChoices = [0, 1].map(i => {
      const t = this.T(420, 500 + i * 70, 18, '#ffffff', { fontStyle: 'bold' });
      const d = this.T(420, 524 + i * 70, 12, '#8aa5b3');
      const z = this.add.zone(400, 492 + i * 70, 620, 56).setOrigin(0).setInteractive({ useHandCursor: true });
      z.on('pointerover', () => { if (this.cine && this.cine.choosing) { this.cine.pick = i; this.drawChoices(); } });
      z.on('pointerdown', () => { if (this.cine && this.cine.choosing) { this.cine.pick = i; this.confirmChoice(); } });
      return { t, d, z };
    });
    c.add([bg, this.cArt, this.cShade, bars, this.cTitle, this.cPortrait, this.cName, this.cText, this.cHint, this.cProg, this.cChoiceG]);
    for (const ch of this.cChoices) c.add([ch.t, ch.d, ch.z]);
    this.cineC = c;
  }
  playCine(id, done) {
    const script = G.Cine.scripts[id] || G.CineArt.scripts[id];
    this.cineId = id;
    if (!script) { if (done) done(); return; }
    this.closeDialog(true);
    this.cine = { script, i: 0, typed: 0, done };
    this.cineC.setVisible(true);
    this.cTitle.setText(script.title);
    this.showCineLine();
  }
  showCineLine() {
    const c = this.cine, ln = c.script.lines[c.i], sp = G.Cine.S[ln.who];
    c.typed = 0;
    this.cName.setText(sp.name).setColor(sp.color);
    this.cText.setText('');
    if (sp.portrait) this.cPortrait.setTexture(sp.portrait).setDisplaySize(120, 120).setVisible(true);
    else this.cPortrait.setTexture('core').setDisplaySize(80, 80).setVisible(true);
    // Viñeta del momento + paneo lento (Ken Burns); sólo cambia la textura si cambia la escena
    const art = G.CineArt.key(this, this.cineId, c.i);
    this.tweens.killTweensOf(this.cArt);
    if (this.cArt.texture.key !== art) { this.cArt.setTexture(art).setAlpha(0); this.tweens.add({ targets: this.cArt, alpha: 1, duration: 450 }); }
    else this.cArt.setAlpha(1);
    this.cArt.setDisplaySize(1280, 580).setPosition(640, 360);
    const sx = this.cArt.scaleX, sy = this.cArt.scaleY;
    this.tweens.add({ targets: this.cArt, scaleX: sx * 1.08, scaleY: sy * 1.08, x: 640 + (c.i % 2 ? -30 : 30), duration: 7000, ease: 'Sine.easeOut' });
    this.cProg.setText(`${c.i + 1}/${c.script.lines.length}`);
  }
  cineNext() {
    const c = this.cine; if (!c) return;
    const ln = c.script.lines[c.i];
    if (c.typed < ln.text.length) { c.typed = ln.text.length; this.cText.setText(ln.text); return; }
    c.i++;
    G.Sfx.play('ui_move');
    if (c.i >= c.script.lines.length) {
      if (c.script.choice) { c.i = c.script.lines.length - 1; c.choosing = true; c.pick = 0; c.choiceT = performance.now(); this.drawChoices(); return; }
      this.endCine();
    } else this.showCineLine();
  }
  drawChoices() {
    const c = this.cine, g = this.cChoiceG;
    g.clear();
    c.script.choice.forEach((ch, i) => {
      const sel = c.pick === i;
      G.jPath(g, 400, 492 + i * 70, 620, 56, 18);
      g.fillStyle(sel ? 0x39d7ff : 0x0a1a24, sel ? 0.28 : 0.85).fillPath();
      g.lineStyle(2, sel ? 0x39d7ff : 0x1e4a5c, 1).strokePath();
      this.cChoices[i].t.setText(`${i + 1} · ${ch.label}`).setColor(sel ? '#ffffff' : '#9fc4d4');
      this.cChoices[i].d.setText(ch.desc);
    });
    this.cHint.setText('1/2 o W/S elegir · E / ENTER / clic confirmar (decisión permanente)');
  }
  confirmChoice() {
    const c = this.cine; if (!c || !c.choosing || performance.now() - c.choiceT < 700) return;
    const ch = c.script.choice[c.pick];
    G.Net.act({ type: 'truth', id: ch.id });
    G.Sfx.play('ui_ok');
    this.endCine();
    this.playCine(ch.next);
  }
  endCine() {
    const c = this.cine; if (!c) return;
    this.cine = null;
    this.cineC.setVisible(false);
    this.cChoiceG.clear();
    for (const ch of this.cChoices) { ch.t.setText(''); ch.d.setText(''); }
    this.cHint.setText('ESPACIO / E / clic continuar · ESC saltar');
    this.blockUntil = performance.now() + 250;
    if (c.done) c.done();
  }

  addFeed(text, color) {
    const last = this.feed.pop();
    this.feed.unshift(last);
    last.life = 7;
    last.t.setText(text).setColor(Phaser.Display.Color.IntegerToColor(color || 0x39d7ff).rgba);
  }

  // ------------------------------------------------------------ tutorial interactivo (primer acceso)
  // Cada paso se completa HACIENDO la acción (no leyendo): el panel muestra la tecla, una flecha guía
  // hacia el NPC objetivo y una barra de progreso. F1 lo omite. Se guarda en el perfil al terminar.
  buildTutorial() {
    const c = this.add.container(640, 92).setDepth(17).setVisible(false);
    const g = this.add.graphics();
    g.fillStyle(0x0c0f13, 0.94).fillRect(-300, 0, 600, 74); g.lineStyle(2, 0xffb020, 1).strokeRect(-300, 0, 600, 74);
    g.fillStyle(0xffb020, 1).fillRect(-300, 0, 600, 3);
    const t1 = this.add.text(-284, 10, '', { fontFamily: G.FONT, fontSize: '12px', color: '#ffb020', fontStyle: 'bold' });
    const t2 = this.add.text(-284, 28, '', { fontFamily: G.FONT, fontSize: '19px', color: '#ffffff', fontStyle: 'bold', wordWrap: { width: 568 } });
    const t3 = this.add.text(284, 10, 'F1 omitir', { fontFamily: G.FONT, fontSize: '11px', color: '#5d6b77' }).setOrigin(1, 0);
    const bar = this.add.graphics();
    c.add([g, t1, t2, t3, bar]);
    this.tut = { c, t1, t2, bar, step: -1, done: false, x0: null, pulse: 0, arrow: this.add.graphics().setDepth(17) };
    this.input.keyboard.on('keydown-F1', () => { if (this.tut.step >= 0 && !this.tut.done) this.finishTutorial(true); });
    this.TUT = [
      { k: 'A / D', txt: 'Muévete por la Celda con A y D', ok: (h) => Math.abs(h.me.body.x - this.tut.x0) > 140 },
      { k: 'ESPACIO', txt: 'Salta con ESPACIO (vuelve a pulsarlo en el aire: doble salto)', ok: (h) => ((h.tapLog || 0) & LV.C.B.JUMP) !== 0 || (!h.me.body.onGround && h.me.body.vy < 0) || h.me.body.y < this.tut.y0 - 24 },
      { k: 'SHIFT', txt: 'Esquiva con un dash: SHIFT (eres invulnerable durante el impulso)', ok: (h) => ((h.tapLog || 0) & LV.C.B.DASH) !== 0 || h.me.body.dashT > 0 },
      { k: 'E', txt: 'Habla con NOVA, la sastre (la flecha te guía): pulsa E a su lado', role: 'tailor', ok: () => this.dlg && this.dlg.role === 'tailor' },
      { k: 'E', txt: 'Visita a KAI "SOMBRA": contratos de armas para tu próximo descenso', role: 'trafficker', ok: () => this.dlg && this.dlg.role === 'trafficker' },
      { k: 'TAB', txt: 'Abre tu hoja de operaciones con TAB (equipo, materiales, contratos)', ok: () => this.sheetOn },
      { k: 'E', txt: 'Ve con el COMANDANTE VEX y marca LISTO para tu primer descenso', role: 'commander', ok: () => { const r = G.Net.roster.get(G.Net.id); return r && r.ready; } }
    ];
  }
  finishTutorial(skipped) {
    const T = this.tut; T.done = true; T.c.setVisible(false); T.arrow.clear();
    G.Net.act({ type: 'seen', id: 'tutorial' });
    if (!skipped) this.medal('ENTRENAMIENTO COMPLETO', 0x7dff4f);
  }
  updateTutorial(dt) {
    const T = this.tut, prof = G.Net.profile;
    if (!T || T.done) return;
    if (this.mode !== 'hub' || !prof || prof.seen.tutorial || (prof.stats && prof.stats.runs > 0 && T.step < 0) || this.cine) { T.c.setVisible(false); T.arrow.clear(); return; }
    const h = this.scene.get('Hub');
    if (!h || !h.me || !h.me.body) return;
    if (T.step < 0) { T.step = 0; T.x0 = h.me.body.x; }
    const S = this.TUT[T.step];
    if (h.me.body.onGround) this.tut.y0 = h.me.body.y;   // referencia de suelo para detectar el salto
    const okNow = S.ok(h); h.tapLog = 0;
    if (okNow) {
      T.step++; G.Sfx.play('ui_ok'); this.flash = 0;
      if (T.step >= this.TUT.length) return this.finishTutorial(false);
      if (T.step === 1) T.x0 = h.me.body.x;
      return;
    }
    T.c.setVisible(!this.dlg || T.step >= 3);
    T.t1.setText(`TUTORIAL · PASO ${T.step + 1}/${this.TUT.length} · TECLA [${S.k}]`);
    T.t2.setText(S.txt);
    T.pulse += dt;
    T.bar.clear().fillStyle(0x232c35, 1).fillRect(-284, 64, 568, 4).fillStyle(0xffb020, 1).fillRect(-284, 64, 568 * T.step / this.TUT.length, 4);
    // Flecha guía hacia el NPC del paso (en el borde de la pantalla si está fuera de cámara)
    T.arrow.clear();
    if (S.role && !this.dlg) {
      const v = h.npcViews && h.npcViews.find(n => n.npc.role === S.role);
      if (v) {
        const cam = h.cameras.main, sx = (v.x - cam.worldView.x) * cam.zoom, sy = (v.y - 70 - cam.worldView.y) * cam.zoom;
        const ax = Phaser.Math.Clamp(sx, 40, 1240), ay = Phaser.Math.Clamp(sy, 190, 680), bob = Math.sin(T.pulse * 6) * 6;
        const ang = (sx === ax && sy === ay) ? Math.PI / 2 : Math.atan2(sy - ay, sx - ax);
        const px = ax - Math.cos(ang) * bob, py = ay - Math.sin(ang) * bob;
        T.arrow.fillStyle(0xffb020, 1).fillTriangle(px + Math.cos(ang) * 16, py + Math.sin(ang) * 16, px + Math.cos(ang + 2.5) * 12, py + Math.sin(ang + 2.5) * 12, px + Math.cos(ang - 2.5) * 12, py + Math.sin(ang - 2.5) * 12);
        T.arrow.lineStyle(2, 0x000000, 0.6).strokeCircle(px, py, 20);
      }
    }
  }

  // ------------------------------------------------------------ medallas en vivo (sólo cliente, cola de 1 en 1)
  buildMedals() {
    const c = this.add.container(640, 120).setDepth(18).setVisible(false);
    const g = this.add.graphics();
    const t = this.add.text(0, 30, '', { fontFamily: G.FONT, fontSize: '18px', fontStyle: 'bold', color: '#fff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 0);
    c.add([g, t]);
    this.med = { c, g, t, q: [], t0: 0, on: false, streak: 0, recent: [] };
  }
  medal(name, color, skull) { if (this.med.q.length < 4) this.med.q.push([name, color, skull]); }
  medalKill(e) {
    const M = this.med;
    if (e[4] === 4 || e[4] === 7) this.medal('MATAJEFES', 0xffd34a);
    if (e[5] !== G.Net.id) return;
    const now = performance.now();
    M.recent = M.recent.filter(t => now - t < 1600); M.recent.push(now);
    const n = M.recent.length;
    if (n === 2) this.medal('DOUBLE KILL', 0xffb020, 1); else if (n === 3) this.medal('MULTI KILL', 0xff7a00, 1); else if (n === 5) this.medal('MASACRE', 0xff3b4a, 1); else if (n === 7) this.medal('ANIQUILACIÓN', 0xb05cff, 1);
    M.streak++;
    if (M.streak === 10) this.medal('RACHA x10 · IMPARABLE', 0xb05cff); else if (M.streak === 25) this.medal('RACHA x25 · LEYENDA', 0xffd34a);
  }
  updateMedals(dt) {
    const M = this.med;
    if (!M.on && M.q.length) {
      const [name, col, skull] = M.q.shift();
      M.on = true; M.t0 = 0;
      const g = M.g; g.clear();
      g.fillStyle(0x000000, 0.6).fillCircle(0, 4, 30);
      g.fillStyle(0x0c0f13, 1); g.lineStyle(3, col, 1);
      g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 26, Math.sin(a) * 26); } g.closePath(); g.fillPath(); g.strokePath();
      if (skull) {
        // Calavera cibernética: cráneo, mandíbula con placas, cuencas brillantes y grieta
        g.fillStyle(0xd8dde2, 1).fillCircle(0, -4, 13).fillRect(-8, 4, 16, 8);
        g.fillStyle(0x0c0f13, 1).fillRect(-6, 7, 2, 5).fillRect(-1, 7, 2, 5).fillRect(4, 7, 2, 5);
        g.fillStyle(col, 1).fillCircle(-5, -4, 4).fillCircle(5, -4, 4);
        g.fillStyle(0xffffff, 1).fillCircle(-5, -5, 1.4).fillCircle(5, -5, 1.4);
        g.fillStyle(0x0c0f13, 1).fillTriangle(-2, 3, 2, 3, 0, 0);
        g.lineStyle(1.5, 0x39d7ff, 0.9).lineBetween(3, -16, 7, -10).lineBetween(7, -10, 5, -7);
      } else { g.fillStyle(col, 1).fillTriangle(-8, -4, 8, -4, 0, 10); g.fillCircle(0, -8, 5); }
      M.t.setText(name).setColor(Phaser.Display.Color.IntegerToColor(col).rgba);
      M.c.setVisible(true).setAlpha(0).setScale(1.6);
      this.tweens.add({ targets: M.c, alpha: 1, scale: 1, duration: 220, ease: 'Back.easeOut' });
      if (skull) { M.c.setAngle(-12); this.tweens.add({ targets: M.c, angle: 0, duration: 420, ease: 'Elastic.easeOut' }); }
      G.Sfx.play('medal');
    }
    if (!M.on) return;
    M.t0 += dt;
    if (M.t0 > 1.6) { M.c.setAlpha(Math.max(0, 1 - (M.t0 - 1.6) * 4)); if (M.t0 > 1.85) { M.on = false; M.c.setVisible(false); } }
  }

  // ------------------------------------------------------------ informe de misión (estilo "after action report")
  buildReport() {
    const c = this.add.container(640, 360).setDepth(19).setVisible(false);
    const g = this.add.graphics();
    const W = 560, H = 300;
    // Panel: bisel grueso, esquinas astilladas, filo táctico superior y grano de suciedad
    g.fillStyle(0x000000, 0.55).fillRect(-W / 2 + 10, -H / 2 + 14, W, H);
    g.fillStyle(0x0c0f13, 0.97);
    g.beginPath(); g.moveTo(-W / 2, -H / 2 + 10); g.lineTo(-W / 2 + 10, -H / 2); g.lineTo(W / 2 - 26, -H / 2); g.lineTo(W / 2, -H / 2 + 26);
    g.lineTo(W / 2, H / 2 - 10); g.lineTo(W / 2 - 10, H / 2); g.lineTo(-W / 2 + 18, H / 2); g.lineTo(-W / 2, H / 2 - 18); g.closePath(); g.fillPath();
    g.lineStyle(2, 0x232c35, 1).strokePath();
    for (let i = 0; i < 260; i++) { g.fillStyle(0xffffff, Math.random() * 0.03); g.fillRect(-W / 2 + Math.random() * W, -H / 2 + Math.random() * H, 1, 1); }
    this.repEdge = this.add.rectangle(-W / 2 + 10, -H / 2, W - 36, 3, 0xffb020).setOrigin(0, 0);
    // Columnas de hoja táctica
    for (let i = 0; i < 5; i++) { g.fillStyle(0x232c35, 1).fillRect(-W / 2 + 26, -H / 2 + 108 + i * 30, W - 52, 1); }
    g.fillStyle(0x232c35, 1).fillRect(-W / 2 + 54, -H / 2 + 92, 1, 152);
    const T = (x, y, size, color, o) => this.add.text(x, y, '', Object.assign({ fontFamily: G.FONT, fontSize: size + 'px', color, stroke: '#000', strokeThickness: 3 }, o || {}));
    this.repKick = T(-W / 2 + 28, -H / 2 + 18, 11, '#ffb020', { fontFamily: 'Consolas, monospace' }).setText('INFORME DE OPERACIÓN · REFUGIO NOVA');
    this.repTitle = T(-W / 2 + 28, -H / 2 + 34, 36, '#ffffff', { fontStyle: 'bold' });
    this.repRows = [];
    for (let i = 0; i < 5; i++) {
      const n = T(-W / 2 + 30, -H / 2 + 114 + i * 30, 11, '#5d6b77', { fontFamily: 'Consolas, monospace', strokeThickness: 0 }).setText(String(i + 1));
      const k = T(-W / 2 + 66, -H / 2 + 112 + i * 30, 15, '#9aa9b5');
      const v = T(W / 2 - 30, -H / 2 + 112 + i * 30, 17, '#ffffff', { fontStyle: 'bold' }).setOrigin(1, 0);
      this.repRows.push({ n, k, v });
    }
    this.repFoot = T(-W / 2 + 28, H / 2 - 40, 12, '#9aa9b5', { wordWrap: { width: W - 60 } });
    c.add([g, this.repEdge, this.repKick, this.repTitle, this.repFoot].concat(...this.repRows.map(r => [r.n, r.k, r.v])));
    this.report = c;
    this.repT = 0;
  }
  showReport(won, title, r, foot) {
    const mats = r && r.mats ? Object.entries(r.mats).map(([k, v]) => `${v} ${LV.Campaign.materials[k] ? LV.Campaign.materials[k].name : k}`).join(', ') : '';
    const rows = [
      ['BIOMASA', r ? r.credits : 0, true],
      ['BAJAS CONFIRMADAS', r ? r.kills : 0, true],
      ['MATERIALES', mats || '—'],
      ['CONTRATO DE CAMPO', r && r.side ? '✓ ' + r.side : '—'],
      ['PUNTOS DE TEMPORADA', r && r.spts ? r.spts : 0, true]
    ];
    this.repTitle.setText(title).setColor(won ? '#ffd34a' : '#ff3b4a');
    this.repEdge.setFillStyle(won ? 0xffb020 : 0xff3b4a);
    rows.forEach((row, i) => { this.repRows[i].k.setText(row[0]); this.repRows[i].v.setText(row[2] ? '0' : String(row[1])); });
    this.repData = rows;
    this.repFoot.setText(foot || (won ? 'Recompensas aplicadas a tu perfil. Reclama la temporada con NOVA en el refugio.' : ''));
    this.report.setVisible(true).setAlpha(0).setScale(0.96);
    this.tweens.add({ targets: this.report, alpha: 1, scale: 1, duration: 260, ease: 'Cubic.easeOut' });
    this.repT = 0; this.repShown = 7.5; this.repTick = 0; this.repDone = false;
  }
  updateReport(dt) {
    if (!this.report || !this.report.visible) return;
    this.repT += dt; this.repTick -= dt;
    // Conteo ascendente a 15 Hz (no re-rasteriza cada fotograma)
    if (this.repTick <= 0 && this.repT < 1.2) {
      this.repTick = 1 / 15;
      const k = Math.min(1, this.repT / 1.2);
      this.repData.forEach((row, i) => { if (row[2]) this.repRows[i].v.setText(String(Math.round(row[1] * (1 - Math.pow(1 - k, 3))))); });
    }
    if (this.repT >= 1.2 && !this.repDone) { this.repDone = true; this.repData.forEach((row, i) => { if (row[2]) this.repRows[i].v.setText(String(row[1])); }); }
    if (this.repT > this.repShown) { this.report.setAlpha(Math.max(0, 1 - (this.repT - this.repShown) * 3)); if (this.report.alpha <= 0) this.report.setVisible(false); }
  }

  banner(title, sub, color, dur) {
    this.tBanner.setText(title).setColor(color || '#39d7ff');
    this.tBannerSub.setText(sub || '');
    this.bannerT = dur || 2.5;
  }

  setPrompt(text) {
    if (!text || this.dlg) { this.tPrompt.setVisible(false); return; }
    this.tPrompt.setText(text).setVisible(true);
  }

  // ------------------------------------------------------------ diálogos
  buildDialog() {
    const c = this.add.container(0, 0).setDepth(20).setVisible(false);
    this.dlgC = c;
    this.dlgBg = this.add.graphics();
    this.dlgPortrait = this.add.image(150, 545, 'pt_commander').setDisplaySize(180, 180);
    this.dlgScan = this.add.tileSprite(60, 455, 180, 180, 'scan').setOrigin(0).setAlpha(0.8);
    this.dlgName = this.T(262, 448, 22, '#39d7ff', { fontStyle: 'bold' });
    this.dlgTitle = this.T(262, 476, 12, '#8aa5b3');
    this.dlgLine = this.T(262, 500, 15, '#e8f4ff', { wordWrap: { width: 470 }, lineSpacing: 4 });
    this.dlgHint = this.T(1220, 706, 11, '#5f8292').setOrigin(1, 1).setText('W/S navegar · E / ENTER elegir · ESC volver');
    this.dlgSel = this.add.graphics();
    c.add([this.dlgBg, this.dlgPortrait, this.dlgScan, this.dlgName, this.dlgTitle, this.dlgLine, this.dlgSel, this.dlgHint]);
    this.rows = [];
    this.rowNums = [];
    this.colA = this.T(776, 432, 10, '#5f8292', { fontStyle: 'bold' }).setText('A · OPCIÓN');
    this.colB = this.T(1210, 432, 10, '#5f8292', { fontStyle: 'bold' }).setOrigin(1, 0).setText('B · VALOR');
    c.add([this.colA, this.colB]);
    for (let i = 0; i < 7; i++) { const n = this.T(752, 458 + i * 36, 10, '#3f6272').setOrigin(1, 0); this.rowNums.push(n); c.add(n); }
    for (let i = 0; i < 7; i++) {
      const y = 450 + i * 36;
      const zone = this.add.zone(760, y - 2, 460, 34).setOrigin(0).setInteractive({ useHandCursor: true });
      const label = this.T(772, y, 14, '#e8f4ff', { fontStyle: 'bold' });
      const sub = this.T(772, y + 17, 10, '#7fa8ba');
      const right = this.T(1210, y + 6, 13, '#ffd34a', { fontStyle: 'bold' }).setOrigin(1, 0);
      zone.on('pointerover', () => { if (this.dlg && this.dlg.scroll + i < this.dlg.node.options.length && this.dlg.sel !== this.dlg.scroll + i) { this.dlg.sel = this.dlg.scroll + i; G.Sfx.play('ui_move'); this.renderOptions(); } });
      zone.on('pointerdown', () => { if (this.dlg && performance.now() - this.dlg.openT > 200) { this.dlg.sel = this.dlg.scroll + i; this.choose(); } });
      c.add([zone, label, sub, right]);
      this.rows.push({ zone, label, sub, right });
    }
    // Probador holográfico (sastre)
    this.probe = this.add.container(1030, 225).setDepth(19).setVisible(false);
    this.probeBg = this.add.graphics();
    this.probeBg.fillStyle(0x05121a, 0.88); G.jPath(this.probeBg, -210, -195, 420, 390, 22); this.probeBg.fillPath();
    this.probeBg.lineStyle(2, 0xff4fd8, 0.9); this.probeBg.strokePath();
    for (let y = -190; y < 190; y += 6) { this.probeBg.lineStyle(1, 0xff4fd8, 0.07).lineBetween(-200, y, 205, y); }
    this.probeBg.lineStyle(1, 0xff4fd8, 0.35).lineBetween(0, -160, 0, 180).lineBetween(0, 40, 205, 40);
    this.probeBg.fillStyle(0xff4fd8, 0.12).fillEllipse(-100, 158, 170, 26);
    this.probeTitle = this.T(0, -112, 11, '#ff4fd8', { fontStyle: 'bold' }).setOrigin(0.5, 0).setText('PROBADOR HOLOGRÁFICO');
    this.probeTitle.setPosition(0, -188).setText('GUARDARROPA HOLOGRÁFICO DE NOVA');
    this.probeImg = this.add.image(-100, 158, 'pl_recluta').setOrigin(0.5, 1).setScale(6);
    this.probeName = this.T(-100, 164, 12, '#e8f4ff', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    this.probeWeapon = this.add.image(102, -60, 'w_rifle').setScale(3.4 * G.WeaponArt.SCALE);
    this.probeWName = this.T(102, 0, 12, '#e8f4ff', { fontStyle: 'bold', align: 'center' }).setOrigin(0.5, 0);
    this.probeFxName = this.T(102, 160, 12, '#e8f4ff', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    this.probeFxLbl = this.T(102, 48, 10, '#ff4fd8').setOrigin(0.5, 0).setText('EFECTO DE ELIMINACIÓN');
    this.probe.add([this.probeBg, this.probeTitle, this.probeImg, this.probeName, this.probeWeapon, this.probeWName, this.probeFxLbl, this.probeFxName]);
    this.probeFxT = 0;
    this.pfx = this.add.particles(0, 0, 'px', { lifespan: 600, speed: { min: 60, max: 220 }, scale: { start: 2, end: 0 }, blendMode: 'ADD', emitting: false }).setDepth(19.5);
    this.pring = this.add.image(0, 0, 'ring').setBlendMode(Phaser.BlendModes.ADD).setDepth(19.5).setVisible(false);
    this.probeEm = null;
    this.probeTrail = null;
  }

  openDialog(role) {
    if (this.dlg || !G.Net.profile) return;
    const npc = G.Dialogue.NPC[role];
    this.dlg = { role, npc, stack: [], node: null, name: '', sel: 0, scroll: 0, openT: performance.now(), busy: false, line: '', typed: 0 };
    G.Net.act({ type: 'dialog', open: true, role });
    G.Sfx.play('ui_open');
    this.dlgC.setVisible(true).setAlpha(0).setY(18);
    this.tweens.add({ targets: this.dlgC, alpha: 1, y: 0, duration: 220, ease: 'Cubic.easeOut' });
    this.dlgPortrait.setTexture(npc.portrait).setDisplaySize(180, 180);
    const col = Phaser.Display.Color.IntegerToColor(npc.color).rgba;
    this.dlgName.setText(npc.name).setColor(col);
    this.dlgTitle.setText(npc.title.toUpperCase());
    const g = this.dlgBg; g.clear();
    g.fillStyle(0x03080c, 0.94);
    g.beginPath(); g.moveTo(66, 430); g.lineTo(1214, 430); g.lineTo(1234, 450); g.lineTo(1234, 712); g.lineTo(46, 712); g.lineTo(46, 450); g.closePath(); g.fillPath();
    g.lineStyle(2, npc.color, 0.9); g.strokePath();
    g.fillStyle(npc.color, 1); g.fillRect(46, 450, 4, 60); g.fillRect(1230, 650, 4, 60);
    g.lineStyle(1, npc.color, 0.25); g.lineBetween(745, 446, 745, 696);
    this.tPrompt.setVisible(false);
    this.showNode(role + '_root');
  }

  closeDialog(silent) {
    if (!this.dlg) return;
    this.dlg = null;
    this.dlgC.setVisible(false);
    this.probe.setVisible(false);
    if (this.probeEm) { this.probeEm.destroy(); this.probeEm = null; this.probeTrail = null; }
    this.closedAt = performance.now();
    this.blockUntil = performance.now() + 250;
    if (!silent) G.Sfx.play('ui_move');
    G.Net.act({ type: 'dialog', open: false });
  }

  showNode(name, keepSel) {
    const d = this.dlg;
    const node = G.Dialogue.nodes[name](G.Net.profile);
    d.node = node; d.name = name;
    if (!keepSel) {
      d.sel = Math.max(0, node.options.findIndex(o => !o.disabled));
      d.scroll = 0;
      this.setLine(node.line);
    } else d.sel = Math.min(d.sel, node.options.length - 1);
    this.renderOptions();
  }

  refreshNode() { if (this.dlg && this.dlg.name) this.showNode(this.dlg.name, true); }

  setLine(text) { this.dlg.line = text; this.dlg.typed = 0; this.dlgLine.setText(''); }

  renderOptions() {
    const d = this.dlg, opts = d.node.options;
    if (d.sel < d.scroll) d.scroll = d.sel;
    if (d.sel >= d.scroll + 7) d.scroll = d.sel - 6;
    this.dlgSel.clear();
    for (let i = 0; i < 7; i++) {
      const row = this.rows[i], o = opts[d.scroll + i];
      if (!o) { row.label.setText(''); row.sub.setText(''); row.right.setText(''); row.zone.disableInteractive(); continue; }
      row.zone.setInteractive();
      const selected = d.scroll + i === d.sel;
      row.label.setText((selected ? '▸ ' : '  ') + o.label).setColor(o.disabled ? '#6b7f8a' : selected ? '#ffffff' : '#c6d8e2');
      row.sub.setText(o.sub ? '    ' + o.sub : '');
      row.right.setText(o.right || '').setColor(o.rightColor || '#ffd34a');
      this.rowNums[i].setText(String(d.scroll + i + 1));
      if (selected) {
        G.jPath(this.dlgSel, 760, 448 + i * 36, 460, 34, 12);
        this.dlgSel.fillStyle(d.npc.color, 0.18).fillPath();
        this.dlgSel.lineStyle(1, d.npc.color, 0.9).strokePath();
      }
    }
    // Cuadrícula tipo hoja de cálculo
    this.dlgSel.lineStyle(1, 0x1e3a48, 0.7);
    for (let i = 0; i <= 7; i++) this.dlgSel.lineBetween(760, 447 + i * 36, 1220, 447 + i * 36);
    this.dlgSel.lineBetween(1110, 447, 1110, 699);
    for (let i = opts.length - d.scroll; i < 7; i++) if (i >= 0) this.rowNums[i].setText('');
    if (opts.length > 7) {
      const h = 250 * 7 / opts.length, y = 448 + 250 * d.scroll / opts.length;
      this.dlgSel.fillStyle(0xffffff, 0.15).fillRect(1226, 448, 3, 250);
      this.dlgSel.fillStyle(d.npc.color, 0.8).fillRect(1226, y, 3, h);
    }
    this.updateProbe();
  }

  updateProbe() {
    const d = this.dlg;
    const o = d && d.node.options[d.sel];
    const prof = G.Net.profile;
    if (!d || d.role !== 'tailor' || !prof) { this.probe.setVisible(false); return; }
    const skin = (o && o.preview && o.preview.skin) || prof.skin;
    const trail = (o && o.preview && o.preview.trail) || prof.trail;
    this.probe.setVisible(true);
    this.probeImg.setTexture('pl_' + skin);
    const sk = LV.Catalog.skins.find(s => s.id === skin);
    this.probeName.setText(sk ? sk.name : '');
    const arch = (o && o.preview && o.preview.arch) || this.probeArch || prof.contract || 'rifle';
    this.probeArch = arch;
    const fin = (o && o.preview && o.preview.wskin) || prof.wskins[arch] || 'estandar';
    this.probeWeapon.setTexture(G.WeaponArt.key(this, arch, fin));
    const ws = G.WeaponArt.find(fin);
    this.probeWName.setText(`${LV.Catalog.archetypes[arch]}\n${ws ? ws.name : ''}`);
    this.probeFx = (o && o.preview && o.preview.fx) || prof.fx || 'ninguno';
    const kf = LV.Catalog.killFx.find(x => x.id === this.probeFx);
    this.probeFxName.setText(kf ? kf.name : '');
    if (trail !== this.probeTrail) {
      this.probeTrail = trail;
      if (this.probeEm) this.probeEm.destroy();
      const tr = LV.Catalog.trails.find(t => t.id === trail);
      this.probeEm = trail === 'ninguna' ? null : this.add.particles(930, 330, 'px', {
        lifespan: 900, speedX: { min: -140, max: -60 }, speedY: { min: -20, max: 20 }, scale: { start: 2.2, end: 0 },
        alpha: { start: 0.9, end: 0 }, blendMode: 'ADD', frequency: 22, tint: tr.colors,
        emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-30, -90, 60, 160) }
      }).setDepth(18.5);
    }
  }

  move(dir) {
    const d = this.dlg; if (!d) return;
    const n = d.node.options.length;
    d.sel = (d.sel + dir + n) % n;
    G.Sfx.play('ui_move');
    this.renderOptions();
  }

  async choose() {
    const d = this.dlg;
    if (!d || d.busy) return;
    if (d.typed < d.line.length) { d.typed = d.line.length; return; }
    const o = d.node.options[d.sel];
    if (!o) return;
    if (o.disabled) { G.Sfx.play('ui_err'); return; }
    if (o.close) { this.closeDialog(); return; }
    if (o.back) { this.back(); return; }
    if (o.go) { G.Sfx.play('ui_ok'); d.stack.push({ name: d.name, sel: d.sel }); this.showNode(o.go); return; }
    if (o.act) {
      d.busy = true;
      const res = await G.Net.act(o.act);
      if (this.dlg !== d) return;
      d.busy = false;
      G.Sfx.play(res.ok ? (o.act.type.startsWith('buy') || o.act.type === 'upgrade' || o.act.type === 'claim' ? 'coins' : 'ui_ok') : 'ui_err');
      this.showNode(d.name, true);
      if (res.msg) this.setLine(res.msg);
      if (res.ok && o.closeAfter) setTimeout(() => { if (this.dlg === d) this.closeDialog(); }, 900);
    }
  }

  back() {
    const d = this.dlg; if (!d) return;
    if (!d.stack.length) { this.closeDialog(); return; }
    const prev = d.stack.pop();
    G.Sfx.play('ui_move');
    this.showNode(prev.name);
    d.sel = prev.sel; this.renderOptions();
  }

  onKey(ev) {
    if (this.cine && this.cine.choosing) {
      if (ev.code === 'Digit1' || ev.code === 'KeyW' || ev.code === 'ArrowUp') { this.cine.pick = 0; this.drawChoices(); }
      else if (ev.code === 'Digit2' || ev.code === 'KeyS' || ev.code === 'ArrowDown') { this.cine.pick = 1; this.drawChoices(); }
      else if (ev.code === 'KeyE' || ev.code === 'Enter') this.confirmChoice();
      return;
    }
    if (this.cine) {
      if (ev.code === 'Escape') this.endCine();
      else if (ev.code === 'Space' || ev.code === 'KeyE' || ev.code === 'Enter') this.cineNext();
      return;
    }
    if (this.mode === 'none') return;
    const k = ev.code;
    if (k === 'KeyP') { const l = G.Gfx.cycle(); this.addFeed(`Calidad gráfica: ${l.toUpperCase()} (P)`, 0x39d7ff); return; }
    if (k === 'Tab') { this.toggleSheet(); return; }
    if (k === 'KeyM') { const m = G.Sfx.toggleMute(); this.addFeed(m ? 'Audio silenciado (M)' : 'Audio activado (M)', 0x8aa5b3); return; }
    if (!this.dlg) return;
    if (k === 'KeyW' || k === 'ArrowUp') this.move(-1);
    else if (k === 'KeyS' || k === 'ArrowDown') this.move(1);
    else if (k === 'KeyE' || k === 'Enter' || k === 'Space') { if (performance.now() - this.dlg.openT > 200) this.choose(); }
    else if (k === 'Escape' || k === 'Backspace') this.back();
  }

  // ------------------------------------------------------------ bucle de HUD
  update() { G.safe('UI', this.tickFrame, this); }
  tickFrame() {
    const now = performance.now();
    const dt = Math.min(this.lastNow ? (now - this.lastNow) / 1000 : 0.016, 0.25);
    this.lastNow = now;
    const g = this.g; g.clear();
    this.scan.tilePositionY -= dt * 20;
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.updateReport(dt);
    this.updateMedals(dt);
    G.safe('Tutorial', this.updateTutorial, this, dt);
    this.redFlash.setAlpha(this.flash * 0.5);
    for (let i = 0; i < this.feed.length; i++) {
      const f = this.feed[i];
      f.life -= dt;
      f.t.setY(250 + i * 22).setAlpha(Math.max(0, Math.min(1, f.life)));
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      const a = Math.min(1, this.bannerT * 2, (this.bannerT > 0 ? 1 : 0));
      this.tBanner.setAlpha(a); this.tBannerSub.setAlpha(a);
      this.tBanner.setScale(1 + Math.max(0, this.bannerT - 2.2) * 0.3);
    } else { this.tBanner.setAlpha(0); this.tBannerSub.setAlpha(0); }
    if (this.cine) {
      const c = this.cine, ln = c.script.lines[c.i];
      if (c.typed < ln.text.length) {
        const before = Math.floor(c.typed);
        c.typed = Math.min(ln.text.length, c.typed + dt * 55);
        if (Math.floor(c.typed) !== before) { this.cText.setText(ln.text.slice(0, Math.floor(c.typed))); if (Math.floor(c.typed) % 3 === 0) G.Sfx.play('type'); }
      }
      this.cPortrait.setAlpha(0.85 + Math.random() * 0.15);
    }
    if (this.mode === 'none') return;
    // Telemetría a 2 Hz (antes se re-rasterizaba cada fotograma)
    this.perfT = (this.perfT || 0) - dt;
    if (this.perfT <= 0) {
      this.perfT = 0.5;
      const buf = G.Net.INTERP_DELAY ? ` · BUF ${Math.round(G.Net.INTERP_DELAY)} ms` : '';
      this.tPerf.setText(`${Math.round(this.game.loop.actualFps)} FPS · ${Math.round(G.Net.rtt)} ms${buf} · SALA ${G.Net.room}${G.errCount ? ' · ERR ' + G.errCount : ''}`);
    }

    if (this.dlg) {
      const d = this.dlg;
      if (d.typed < d.line.length) {
        const before = Math.floor(d.typed);
        d.typed = Math.min(d.line.length, d.typed + dt * 75);
        if (Math.floor(d.typed) !== before) { this.dlgLine.setText(d.line.slice(0, Math.floor(d.typed))); if (Math.floor(d.typed) % 2 === 0) G.Sfx.play('type'); }
      }
      this.dlgPortrait.setX(150 + (Math.random() < 0.03 ? (Math.random() - 0.5) * 6 : 0));
      this.dlgPortrait.setAlpha(0.88 + Math.random() * 0.12);
      this.dlgScan.tilePositionY -= dt * 30;
    }
    this.tHelp.setVisible(!this.dlg);
    for (const t of this.squad) t.setAlpha(this.dlg && this.dlg.role === 'tailor' ? 0 : 1);
    this.tDds.setAlpha(this.dlg && this.dlg.role === 'tailor' ? 0 : 1);
    if (this.sheetOn) { this.sheetT -= dt; if (this.sheetT <= 0) { this.sheetT = 0.25; this.refreshSheet(); } }
    if (this.probe.visible && this.probeFx && this.probeFx !== 'ninguno') {
      this.probeFxT -= dt;
      if (this.probeFxT <= 0) {
        this.probeFxT = 1.2;
        const kf = LV.Catalog.killFx.find(x => x.id === this.probeFx);
        const x = 1132, y = 330;
        this.pfx.setParticleTint(kf.color || 0xffffff); this.pfx.explode(26, x, y);
        this.pring.setVisible(true).setPosition(x, y).setTint(kf.color || 0xffffff).setScale(this.probeFx === 'vacio' ? 2 : 0.2).setAlpha(1);
        this.tweens.add({ targets: this.pring, scale: this.probeFx === 'vacio' ? 0.05 : 2.2, alpha: 0, duration: 500 });
      }
    }
    if (this.mode === 'hub') this.drawHub(g); else if (this.mode === 'run') this.drawRun(g, dt);
  }

  panel(g, x, y, w, h, color) {
    g.fillStyle(0x03080c, 0.72);
    G.jPath(g, x, y, w, h, 16); g.fillPath();
    g.lineStyle(1, color || 0x1e4a5c, 0.9); g.strokePath();
    g.fillStyle(color || 0x1e4a5c, 0.9).fillRect(x, y + h * 0.45, 3, h * 0.55 - 13);
  }

  drawHub(g) {
    const prof = G.Net.profile;
    const snap = G.Net.lastSnap;
    this.panel(g, 14, 12, 340, 134);
    this.tTitle.setText(`CELDA DE DESPRESURIZACIÓN · SALA ${G.Net.room}`);
    this.tHp.setText(prof ? `OPERADOR ${prof.name.toUpperCase()}` : '');
    const sel = G.Net.sel || {};
    const cyc = prof && prof.cycle && prof.cycle[sel.variant] ? ` · CICLO ${prof.cycle[sel.variant]}` : '';
    this.tWeapon.setText(sel.name || '').setColor('#39d7ff');
    this.tWeaponSub.setText(sel.variant === 'br' ? 'LOBBY · habla con el COMANDANTE VEX para elegir escuadrón y marcarte LISTO'
      : `${sel.variant === 'coop' ? 'HISTORIA COOPERATIVA' : 'MODO HISTORIA'}${cyc} · ${sel.boss ? 'JEFE: ' + LV.Campaign.bosses[sel.boss].name : 'Extracción por elevador'}`);
    const total = G.Net.roster.size, rc = snap && snap.rc !== undefined ? snap.rc : 0;
    this.tAmmo.setText(`LISTOS ${rc}/${total}`).setColor(rc === total && total ? '#7dff4f' : '#ffd34a');
    this.tCredits.setText(prof ? `¢ ${prof.credits} BIOMASA` : '');
    if (prof) {
      const mats = Object.entries(prof.materials || {}).filter(([, v]) => v > 0).map(([k, v]) => `${LV.Campaign.materials[k].name.split(' ')[0]} ${v}`).join(' · ');
      this.tGear.setText(`${prof.season ? 'TEMPORADA: ' + prof.season.name + ' (' + prof.season.desc + ')' : ''}${mats ? '\n' + mats : ''}`).setColor('#b9a2ff');
    }
    this.dark.setAlpha(0); this.orbFx.setAlpha(0);
    if (snap && snap.lb) {
      const mine = G.Net.roster.get(G.Net.id);
      const teams = snap.lb.c.map((n, t) => n ? `${mine && mine.team === t ? '▶' : ''}E${t + 1} ${n}/${snap.lb.ts}` : null).filter(Boolean).join(' · ');
      this.tGear.setText(`ESCUADRONES: ${teams}`).setColor('#9ff8ff');
    }
    this.tDds.setText(G.Net.mode === 'br' ? `LOBBY ${total}/100` : `ESCUADRÓN ${total}/${LV.C.MAX_PLAYERS}`);
    let i = 0;
    for (const r of G.Net.roster.values()) {
      if (i >= 10) break;
      this.squad[i].setText(`${r.ready ? '✔ ' : '· '}${r.name}`).setColor(r.ready ? '#7dff4f' : r.id === G.Net.id ? '#39d7ff' : '#c6d8e2');
      i++;
    }
    for (; i < 10; i++) this.squad[i].setText('');
    this.tObj.setText('').setVisible(false);
    this.tBoss.setText('');
    if (snap && snap.cd >= 0) this.tCenter.setText(`DESCENSO EN ${Math.ceil(snap.cd)}`).setColor('#7dff4f');
    else this.tCenter.setText('');
    this.tHelp.setText('A/D mover · ESPACIO saltar · SHIFT dash · E hablar · M audio  ·  Habla con el COMANDANTE VEX para elegir descenso y marcarte LISTO');
    this.downedFx.setAlpha(0);
  }

  drawRun(g, dt) {
    const snap = G.Net.lastSnap;
    const me = snap && snap.me;
    const run = this.scene.get('Run');
    this.tHelp.setText('CLIC atacar · Q habilidad · V cuerpo a cuerpo · G granada · T tipo · R recarga (R otra vez = perfecta) · F racha · TAB hoja');
    if (!snap || !me || !snap.o) return;
    const myT = snap.p.find(t => t[0] === G.Net.id);
    const flags = myT ? myT[4] : 0;
    const info = G.Net.roster.get(G.Net.id);
    const w = info && info.weapon;
    // Panel principal
    this.panel(g, 14, 12, 360, 158, w ? w.color : 0x1e4a5c);
    this.tTitle.setText(`OPERADOR ${info ? info.name.toUpperCase() : ''}`);
    const k = Phaser.Math.Clamp(me.hp / me.mx, 0, 1);
    // Salud crítica: viñeta roja pulsante (más rápida cuanto menos vida) + música de tensión
    const crit = k < 0.3 && me.hp > 0;
    this.critVig.setAlpha(crit ? 0.55 + 0.4 * Math.abs(Math.sin(this.time.now / (180 + 500 * k))) : 0);
    this.musT = (this.musT || 0) - 1;
    if (this.musT <= 0) {
      this.musT = 20;
      const rs = this.scene.get('Run'), mp = rs && rs.myPos && rs.myPos();
      let near = false;
      if (mp && rs.enemyViews) for (const ev of rs.enemyViews.values()) if (Math.abs(ev.x - mp.x) < 650 && Math.abs(ev.y - mp.y) < 400) { near = true; break; }
      G.Sfx.music(crit ? 'critical' : near ? 'combat' : 'explore');
    }
    // Gotas de aceite del exotraje dañado (emisor ligero creado una vez por misión)
    if (crit && Math.random() < 0.25) {
      const rs = this.scene.get('Run'), mp = rs && rs.myPos && rs.myPos();
      if (mp) {
        if (!rs.oil || !rs.oil.scene) rs.oil = rs.add.particles(0, 0, 'px', { lifespan: 900, speedX: { min: -30, max: 30 }, speedY: { min: -40, max: 10 }, gravityY: 700, scale: { start: 0.9, end: 0.3 }, tint: [0x111111, 0x2a1a08], emitting: false, maxAliveParticles: 60 }).setDepth(34);
        rs.oil.explode(1, mp.x + (Math.random() - 0.5) * 14, mp.y - 20);
      }
    }
    g.fillStyle(0x000000, 0.7).fillRect(26, 58, 300, 6);
    g.fillStyle(0x1a2a33, 1).fillRect(130, 41, 230, 13);
    g.fillStyle(k > 0.5 ? 0x5dff7a : k > 0.25 ? 0xffb020 : 0xff3b3b, 1).fillRect(130, 41, 230 * k, 13);
    for (let s = 1; s < 10; s++) g.fillStyle(0x000000, 0.4).fillRect(130 + s * 23, 41, 1, 13);
    this.tHp.setText(`VIDA ${me.hp}/${me.mx}`);
    // dash
    const body = run && run.me && run.me.body;
    const dk = body ? 1 - body.dashCd / (LV.C.DASH_CD * (body.dashCdMul || 1)) : 1;
    g.fillStyle(0x1a2a33, 1).fillRect(26, 58, 100, 4);
    g.fillStyle(0x39d7ff, dk >= 1 ? 1 : 0.5).fillRect(26, 58, 100 * Phaser.Math.Clamp(dk, 0, 1), 4);
    if (w) {
      this.tWeapon.setText(w.name).setColor(Phaser.Display.Color.IntegerToColor(w.color).rgba);
      const extras = [w.rarityName].concat(w.attachments || []).concat((w.perks || []).map(p => LV.Catalog.perks[p].split(':')[0]));
      const prof3 = G.Net.profile, sd3 = prof3 && prof3.side ? LV.Campaign.side.find(x => x.id === prof3.side) : null;
      this.tWeaponSub.setText(extras.join(' · ') + (sd3 ? '  ·  CONTRATO: ' + sd3.name : ''));
      let ammo = '';
      if (w.mag > 0) {
        ammo = me.rl > 0 ? `${me.tac ? 'RECARGA TÁCTICA' : 'RECARGANDO'} · R en la zona dorada` : `MUNICIÓN ${me.am}/${w.mag}${me.pf > 0 ? '  ★+10%' : ''}`;
        if (me.rl > 0) {
          // Barra de recarga activa: zona dorada 50-72%
          const prog = 1 - me.rl / Math.max(0.1, me.rt), bx = 26, by = 140, bw = 330;
          g.fillStyle(0x0a1a24, 1).fillRect(bx, by, bw, 5);
          g.fillStyle(0xffd34a, 0.85).fillRect(bx + bw * 0.5, by, bw * 0.22, 5);
          g.fillStyle(0xffffff, 1).fillRect(bx + bw * Phaser.Math.Clamp(prog, 0, 1) - 1, by - 2, 3, 9);
        }
      }
      else if (w.arch === 'katana') ammo = 'KATANA · COMBO x3';
      else if (w.blade) ammo = `${LV.Catalog.archetypes[w.arch].toUpperCase()} · COMBO x${w.combo}`;
      else ammo = me.md ? 'MODO CAÑÓN · METRALLA' : 'MODO HACHA · GOLPE PESADO';
      const altName = { rifle: 'APUNTAR', katana: 'ONDA CINÉTICA', axe: 'TRANSFORMAR', pistol: 'RÁFAGA' }[w.arch] || (LV.Catalog.arms[w.arch] || {}).alt || '—';
      this.tAmmo.setText(`${ammo}   [Q] ${altName}${me.ac > 0 ? ' ' + me.ac.toFixed(1) + 's' : ' ✓'}`).setColor(me.rl > 0 ? '#ff9d6b' : '#ffd34a');
    }
    this.tCredits.setText(`¢ ${me.cr} (misión)   ESTIMULANTES ${'◆'.repeat(me.st)}${me.st ? '' : '—'}`);
    const set = LV.Campaign.streakSets[(G.Net.profile && G.Net.profile.streakSet) || 'asalto'];
    const nextSt = set.list.find(x => x.kills > me.sk);
    const bank = (me.sb || []).map(id => LV.Campaign.streakInfo[id].name).join(', ');
    this.tGear.setText(`${me.gt ? 'ATURDIDORAS' : 'GRANADAS'} ${'●'.repeat(me.gr)}${me.gr ? '' : '—'}${me.mc > 0 ? '  ✊' + me.mc.toFixed(1) : '  [V] ✊'}${me.ck > 0 ? '  COCINANDO ' + Math.max(0, LV.C.GREN_FUSE - me.ck).toFixed(1) + 's' : ''}   RACHA ${me.sk}${nextSt ? '/' + nextSt.kills : ''}${bank ? '   [F] ' + bank : ''}`).setColor(me.ck > 1.6 ? '#ff6b6b' : '#9ff8ff');
    // DDS y escuadrón
    const dd = snap.o.dds;
    this.tDds.setText(`AMENAZA x${(dd[1] / 100).toFixed(2)} · DAÑO x${(dd[2] / 100).toFixed(2)} · AGRESIVIDAD x${(dd[3] / 100).toFixed(2)} · ${dd[0]} VIVOS`);
    let i = 0;
    const myTeam = G.Net.mode === 'br' && G.Net.roster.get(G.Net.id) ? G.Net.roster.get(G.Net.id).team : null;
    if (snap.o.br && snap.o.br.tdm) this.tDds.setText(`5 CONTRA 5 · ${snap.o.br.sc[0]} - ${snap.o.br.sc[1]} · META ${snap.o.br.goal}`);
    else if (snap.o.br) this.tDds.setText(`BATALLA · ${snap.o.br.ta}/${snap.o.br.tt} ESCUADRONES EN PIE · ${dd[0]} NÚCLEOS VIVOS`);
    for (const t of snap.p) {
      if (i >= 10) break;
      const r = G.Net.roster.get(t[0]);
      if (myTeam !== null && (!r || r.team !== myTeam)) continue;
      const st = t[4] & 16 ? '✖ CAÍDO' : t[4] & 8 ? `⚠ DERRIBADO ${t[7]}s` : `${t[5]}/${t[6]}`;
      this.squad[i].setText(`${r ? r.name : '?'}  ${st}`).setColor(t[4] & 16 ? '#6b7f8a' : t[4] & 8 ? '#ff6b6b' : t[0] === G.Net.id ? '#39d7ff' : '#e8f4ff');
      const y = 44 + i * 20 + 15;
      if (!(t[4] & 24)) { g.fillStyle(0x000000, 0.6).fillRect(1154, y, 100, 2); g.fillStyle(0x5dff7a, 1).fillRect(1154, y, 100 * Phaser.Math.Clamp(t[5] / t[6], 0, 1), 2); }
      i++;
    }
    for (; i < 10; i++) this.squad[i].setText('');
    // Objetivos
    const o = snap.o;
    let objText = '';
    const gate = o.g.find(x => x[1] && !x[2]);
    const det = o.d.find(x => x[1] && !x[2]);
    if (det) {
      const n = det[5].filter(Boolean).length;
      objText = `⚠ DETONADORES · ${det[3]}s · ${n}/${det[5].length} DESACTIVADOS [MANTENER E]`;
      g.fillStyle(0x000000, 0.6).fillRect(490, 184, 300, 6);
      g.fillStyle(0xff3b3b, 1).fillRect(490, 184, 300 * det[3] / 50, 6);
    } else if (gate) {
      const terms = gate[5] || (run && run.level ? run.level.gates[gate[0]].terminals.length : 1);
      objText = `HACKEO DE COMPUERTA ${gate[3]}% · TERMINALES ${gate[4]}/${terms}${gate[4] < terms ? ' · ¡OCUPEN TODAS A LA VEZ!' : ''}`;
      g.fillStyle(0x000000, 0.6).fillRect(490, 184, 300, 6);
      g.fillStyle(0xffb020, 1).fillRect(490, 184, 3 * gate[3], 6);
    }
    if (!objText && o.ex) {
      objText = o.ex[0] === 1 ? `DEFENDED EL ELEVADOR · LLEGA EN ${o.ex[1]} s` : `¡TODOS AL ELEVADOR! A BORDO ${o.ex[2]}/${o.ex[3]}`;
      if (o.ex[0] === 2) { g.fillStyle(0x000000, 0.6).fillRect(490, 184, 300, 6); g.fillStyle(0x7dff4f, 1).fillRect(490, 184, 3 * o.ex[4], 6); }
    }
    if (!objText && o.orb > 0) objText = `⚠ PROTOCOLO ORBITAL · INCINERACIÓN EN ${Math.ceil(o.orb)} s ⚠`;
    const evInfo = o.ev ? LV.Campaign.events[o.ev[0]] : null;
    if (evInfo) objText = (objText ? objText + '\n' : '') + `EVENTO: ${evInfo.name} · ${o.ev[1]} s`;
    if (o.ec) objText = (objText ? objText + '\n' : '') + `⚠ BALIZA DE EMERGENCIA · EVACUACIÓN EN ${o.ec} s`;
    const anName = o.an ? { radar: 'INTERFERENCIA DE RADAR', emp: 'PULSO EMP', capsula: 'CÁPSULA DE SUMINISTRO', grieta: 'GRIETA DE BIOMASA' }[o.an[0]] : null;
    if (anName) objText = (objText ? objText + '\n' : '') + `ANOMALÍA: ${anName} · ${o.an[1]} s`;
    // Mutación de la sala actual (niebla oscurece; la gravedad la aplica la física compartida)
    let mutHere = null;
    if (o.mu && run && run.level) { const mp = run.myPos(); const rid = mp ? LV.LevelGen.roomIdAt(run.level, mp.x, mp.y - 20) : -1; const m = o.mu.find(x => x[0] === rid); mutHere = m ? m[1] : null; }
    if (mutHere) objText = (objText ? objText + '\n' : '') + 'MUTACIÓN: ' + { grav: 'GRAVEDAD REDUCIDA', niebla: 'NIEBLA TÁCTICA', blindaje: 'ENEMIGOS BLINDADOS' }[mutHere];
    this.mm.setVisible(!(o.an && o.an[0] === 'radar'));
    if (o.uav > 0) objText = (objText ? objText + '\n' : '') + `PULSO UAV ACTIVO ${o.uav} s`;
    if (o.sh > 0) objText = (objText ? objText + '\n' : '') + `DOMO DE ESCUDO ${o.sh} s`;
    const prof2 = G.Net.profile;
    // (el contrato secundario ya se compone junto al subtítulo del arma: un solo setText por frame)
    // Apagón: oscuridad total salvo el haz frontal de la linterna (sigue posición y puntería)
    let blackout = o.ev && o.ev[0] === 'apagon';
    if (!blackout && run && run.level && run.level.zone === 'noche') { const mp0 = run.myPos(); blackout = !(mp0 && LV.LevelGen.roomIdAt(run.level, mp0.x, mp0.y - 20) === run.level.arena.id); }
    let lit = false;
    if (blackout && run && run.cameras) {
      const mp = run.myPos(), cam = run.cameras.main, mv = run.players && run.players.get(G.Net.id);
      if (mp && mv && !(mv.flags & 16)) { lit = true; this.flashlight.setVisible(true).setPosition((mp.x - 24 - cam.worldView.x) * cam.zoom, (mp.y - 24 - cam.worldView.y) * cam.zoom).setRotation(mv.aim); }
    }
    if (!lit) this.flashlight.setVisible(false);
    this.dark.setAlpha(blackout && !lit ? 0.62 : mutHere === 'niebla' ? 0.5 : 0);
    this.orbFx.setAlpha(o.orb > 0 ? 0.12 + 0.12 * Math.sin(performance.now() / 120) + (14 - o.orb) * 0.02 : 0);
    if (o.br && o.br.tdm) {
      const b = o.br, mine = G.Net.roster.get(G.Net.id), t = mine ? mine.team : 0;
      objText = `ALIADOS ${b.sc[t]}  —  ${b.sc[1 - t]} RIVALES · META ${b.goal} · ${Math.floor(b.tl / 60)}:${String(b.tl % 60).padStart(2, '0')}` + (objText ? '\n' + objText : '');
    } else if (o.br) {
      const b = o.br;
      const fl = b.fs > 0 ? `INUNDACIÓN EN ${b.fs} s` : '⚠ LA INUNDACIÓN DESCIENDE';
      const bs = b.bd ? 'CORAZÓN ABATIDO · ¡ACABA CON LOS RIVALES!' : b.bt > 0 ? `CORAZÓN DESPIERTA EN ${b.bt} s` : 'CORAZÓN DESPIERTO EN LA CÁMARA CENTRAL';
      objText = `${fl} · ${bs}` + (objText ? '\n' + objText : '');
    }
    this.tObj.setText(objText).setVisible(!!objText);
    // Jefe
    const be = o.boss ? snap.e.find(e => e[0] === o.boss) : null;
    if (be) {
      const bk = be[4] / 1000;
      this.tBoss.setText(`${o.bk ? LV.Campaign.bosses[o.bk].name : 'JEFE'} · FASE ${bk > 0.66 ? 1 : bk > 0.33 ? 2 : 3}${be[5] & 16 ? ' · ATURDIDO' : ''}`);
      g.fillStyle(0x000000, 0.7).fillRect(340, 658, 600, 14);
      g.fillStyle(0x3a0a0a, 1).fillRect(342, 660, 596, 10);
      g.fillStyle(be[5] & 16 ? 0x8888ff : 0xff3b3b, 1).fillRect(342, 660, 596 * bk, 10);
      g.fillStyle(0xffffff, 0.6).fillRect(342 + 596 * 0.66, 660, 2, 10).fillRect(342 + 596 * 0.33, 660, 2, 10);
    } else this.tBoss.setText('');
    // Estado del jugador
    let center = '';
    if (flags & 16) center = G.Net.runInfo && G.Net.runInfo.tdm ? 'BAJA CONFIRMADA\nReapareces en unos segundos' : G.Net.mode === 'br' ? 'ELIMINADO\nObservas a tu escuadrón' : 'HAS CAÍDO EN COMBATE\nModo espectador · tu escuadrón aún puede completar la misión';
    else if (flags & 8) center = `DERRIBADO · ${myT[7]}s\n${me.st > 0 ? `Mantén [E] para inyectar estimulante (${me.st})` : 'Espera a que un aliado te reanime'}`;
    if (o.w > 0) center = `VENTANA TÁCTICA ${o.w.toFixed(1)}s\nTodo el escuadrón está derribado` + (center ? '\n' + center.split('\n')[1] : '');
    this.tCenter.setText(center).setColor('#ff6b6b');
    this.downedFx.setAlpha((flags & 8) ? 0.5 + 0.2 * Math.sin(performance.now() / 200) : 0);
    // Minimapa
    this.mmT -= dt;
    if (this.mmT <= 0 && run && run.level) { this.mmT = 0.2; this.drawMinimap(run, snap); }
  }

  drawMinimap(run, snap) {
    const L = run.level, mm = this.mm;
    mm.clear();
    const W = 230, H = 120, X = 18, Y = 580;
    const s = Math.min(W / (L.tw * 32), H / (L.th * 32));
    mm.fillStyle(0x03080c, 0.75).fillRect(X - 6, Y - 6, W + 12, H + 12);
    mm.lineStyle(1, 0x1e4a5c, 1).strokeRect(X - 6, Y - 6, W + 12, H + 12);
    for (const r of L.rooms) {
      if (!run.visited.has(r.id)) continue;
      const col = r.type === 'arena' ? 0xff3b3b : r.type === 'gate' ? 0xffb020 : r.type === 'elite' ? 0xb05cff : r.type === 'secret' ? 0xffd34a : r.type === 'detonator' ? 0xff7b54 : 0x39d7ff;
      mm.fillStyle(col, 0.18).fillRect(X + r.x * s + 1, Y + r.y * s + 1, r.w * s - 2, r.h * s - 2);
      mm.lineStyle(1, col, 0.6).strokeRect(X + r.x * s + 1, Y + r.y * s + 1, r.w * s - 2, r.h * s - 2);
    }
    for (const t of snap.p) {
      const c = t[0] === G.Net.id ? 0x39d7ff : (t[4] & 8) ? 0xff3b3b : (t[4] & 16) ? 0x555555 : 0xffffff;
      mm.fillStyle(c, 1).fillRect(X + t[1] * s - 2, Y + t[2] * s - 4, 4, 4);
    }
    if (snap.o.uav > 0) for (const e of snap.e) mm.fillStyle(0xff7b54, 1).fillRect(X + e[2] * s - 1, Y + e[3] * s - 3, 3, 3);
    const lift = run.level.arena.lift;
    if (run.level.arena.kind === 'extract') mm.fillStyle(0x7dff4f, 1).fillRect(X + lift.x * s, Y + lift.y * s - 3, lift.w * s, 3);
    if (snap.o.boss) {
      const be = snap.e.find(e => e[0] === snap.o.boss);
      if (be) mm.fillStyle(0xff3b3b, 1).fillRect(X + be[2] * s - 3, Y + be[3] * s - 6, 6, 6);
    }
  }

  // ------------------------------------------------------------ hoja de operaciones (estilo hoja de cálculo) · TAB
  buildSheet() {
    const c = this.add.container(0, 0).setDepth(30).setVisible(false);
    const g = this.add.graphics();
    this.sheetCols = [
      { k: 'n', t: '#', w: 36 }, { k: 'name', t: 'OPERADOR', w: 140 }, { k: 'skin', t: 'EXOTRAJE', w: 150 },
      { k: 'weapon', t: 'ARMA', w: 230 }, { k: 'finish', t: 'ACABADO', w: 140 }, { k: 'rarity', t: 'RAREZA', w: 90 },
      { k: 'hp', t: 'VIDA', w: 80 }, { k: 'state', t: 'ESTADO', w: 120 }, { k: 'cycle', t: 'BUCLE', w: 64 }
    ];
    const X0 = 640 - this.sheetCols.reduce((a, b) => a + b.w, 0) / 2, Y0 = 150, RH = 30;
    this.sheetGeo = { X0, Y0, RH };
    g.fillStyle(0x020609, 0.94); G.jPath(g, X0 - 30, Y0 - 80, 1110, 470, 24); g.fillPath();
    g.lineStyle(2, 0x39d7ff, 0.8); g.strokePath();
    c.add(g);
    c.add(this.T(X0, Y0 - 66, 18, '#39d7ff', { fontStyle: 'bold' }).setText('HOJA DE OPERACIONES'));
    c.add(this.T(X0 + 1050, Y0 - 62, 11, '#5f8292').setOrigin(1, 0).setText('TAB cerrar · clic en una columna para ordenar'));
    this.sheetG = this.add.graphics(); c.add(this.sheetG);
    this.sheetHead = []; this.sheetCells = [];
    let x = X0;
    this.sheetCols.forEach((col, ci) => {
      c.add(this.T(x + col.w / 2, Y0 - 34, 10, '#3f6272').setOrigin(0.5, 0).setText(String.fromCharCode(65 + ci)));
      const h = this.T(x + 6, Y0 - 18, 12, '#9fc4d4', { fontStyle: 'bold' });
      h.setText(col.t);
      const z = this.add.zone(x, Y0 - 20, col.w, 20).setOrigin(0).setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => { this.sheetSort = this.sheetSort === col.k ? '-' + col.k : col.k; this.refreshSheet(); });
      c.add([h, z]); this.sheetHead.push(h);
      col.x = x; x += col.w;
    });
    for (let r = 0; r < 10; r++) {
      const row = [];
      for (const col of this.sheetCols) { const t = this.T(col.x + 6, Y0 + 6 + r * RH, 12, '#e8f4ff', { strokeThickness: 2 }); c.add(t); row.push(t); }
      this.sheetCells.push(row);
    }
    this.sheetFoot = this.T(X0, Y0 + 10 * RH + 14, 12, '#ffd34a', { wordWrap: { width: 1040 }, lineSpacing: 4 }); c.add(this.sheetFoot);
    this.sheetC = c; this.sheetOn = false; this.sheetT = 0; this.sheetSort = 'n';
  }
  toggleSheet() {
    this.sheetOn = !this.sheetOn;
    this.sheetC.setVisible(this.sheetOn);
    if (this.sheetOn) { this.refreshSheet(); G.Sfx.play('ui_open'); }
  }
  refreshSheet() {
    const snap = G.Net.lastSnap, Cat = LV.Catalog;
    const tuples = new Map(); if (snap) for (const t of snap.p) tuples.set(t[0], t);
    let rows = [...G.Net.roster.values()].map((r, i) => {
      const t = tuples.get(r.id), w = r.weapon;
      const f = t ? t[4] : 0;
      const sk = Cat.skins.find(s => s.id === r.skin);
      const fin = w ? G.WeaponArt.find((r.wskins || {})[w.arch] || 'estandar') : null;
      return {
        n: i + 1, id: r.id, name: r.name, skin: sk ? sk.name : r.skin, weapon: w ? w.name : '— (en la Celda)', finish: fin ? fin.name : '—',
        rarity: w ? w.rarityName : '—', rarityN: w ? w.rarity : -1, hp: t ? t[5] : 0, hpTxt: t ? `${t[5]}/${t[6]}` : '—',
        state: f & 16 ? 'CAÍDO' : f & 8 ? 'DERRIBADO' : G.Net.phase === 'hub' ? (r.ready ? 'LISTO' : 'EN LA CELDA') : 'EN COMBATE',
        cycle: r.cycle || 0, color: w ? w.color : 0xe8f4ff
      };
    });
    const key = this.sheetSort.replace('-', ''), dir = this.sheetSort[0] === '-' ? -1 : 1;
    const kk = key === 'rarity' ? 'rarityN' : key;
    rows.sort((a, b) => (a[kk] > b[kk] ? 1 : a[kk] < b[kk] ? -1 : 0) * dir);
    const { X0, Y0, RH } = this.sheetGeo, g = this.sheetG;
    g.clear();
    const W = this.sheetCols.reduce((a, b) => a + b.w, 0);
    g.fillStyle(0x0d2230, 1).fillRect(X0, Y0 - 22, W, 22);
    for (let r = 0; r < 10; r++) {
      if (r % 2) g.fillStyle(0x07121a, 1).fillRect(X0, Y0 + r * RH, W, RH);
      const row = rows[r];
      if (row && row.id === G.Net.id) { G.jPath(g, X0, Y0 + r * RH + 1, W, RH - 2, 10); g.fillStyle(0x39d7ff, 0.14).fillPath(); }
      this.sheetCols.forEach((col, ci) => {
        const cell = this.sheetCells[r][ci];
        if (!row) { cell.setText(''); return; }
        const v = col.k === 'hp' ? row.hpTxt : col.k === 'n' ? String(r + 1) : String(row[col.k]);
        cell.setText(v.length > col.w / 7.2 ? v.slice(0, Math.floor(col.w / 7.2) - 1) + '…' : v)
          .setColor(col.k === 'weapon' || col.k === 'rarity' ? Phaser.Display.Color.IntegerToColor(row.color).rgba : col.k === 'state' && row.state !== 'EN COMBATE' && row.state !== 'LISTO' && row.state !== 'EN LA CELDA' ? '#ff6b6b' : '#e8f4ff');
      });
    }
    g.lineStyle(1, 0x1e3a48, 0.9);
    for (let r = 0; r <= 10; r++) g.lineBetween(X0, Y0 + r * RH, X0 + W, Y0 + r * RH);
    for (const col of this.sheetCols) g.lineBetween(col.x, Y0 - 22, col.x, Y0 + 10 * RH);
    g.lineBetween(X0 + W, Y0 - 22, X0 + W, Y0 + 10 * RH);
    this.sheetHead.forEach((h, i) => { const k = this.sheetCols[i].k; h.setText(this.sheetCols[i].t + (key === k ? (dir > 0 ? ' ▲' : ' ▼') : '')); });
    const p = G.Net.profile;
    if (p) {
      const mats = Object.entries(p.materials || {}).map(([k, v]) => `${LV.Campaign.materials[k].name}: ${v}`).join(' · ');
      this.sheetFoot.setText(`TOTALES DE ${p.name.toUpperCase()} · Biomasa ${p.credits} · Bajas ${p.stats.kills} · Descensos ${p.stats.runs} (victorias ${p.stats.wins}) · Historia ${p.story.solo} / Coop ${p.story.coop} · Bucles ${p.cycle.solo}\n${mats}`);
    }
  }
};
