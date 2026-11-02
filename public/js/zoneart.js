/* LEVIATHAN - Identidad visual de las zonas del Modo Historia y del andén del elevador.
   Texturas generadas una vez; los objetos son estáticos o animados con tweens (sin coste por fotograma). */
G.ZoneArt = (function () {
  function tex(scene, key, w, h, draw) { if (scene.textures.exists(key)) return; const t = scene.textures.createCanvas(key, w, h); draw(t.getContext(), w, h); t.refresh(); }
  function textures(scene) {
    tex(scene, 'p_tanque', 48, 96, (c) => {   // tanque de cultivo con espécimen
      c.fillStyle = '#20272e'; c.fillRect(4, 0, 40, 10); c.fillRect(4, 86, 40, 10);
      const g = c.createLinearGradient(6, 0, 42, 0); g.addColorStop(0, 'rgba(60,255,200,.25)'); g.addColorStop(0.5, 'rgba(160,255,230,.45)'); g.addColorStop(1, 'rgba(60,255,200,.2)');
      c.fillStyle = g; c.fillRect(6, 10, 36, 76);
      c.fillStyle = 'rgba(20,60,40,.85)'; c.beginPath(); c.ellipse(24, 52, 9, 18, 0, 0, 6.3); c.fill(); c.fillRect(22, 30, 4, 10);
      c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(10, 12, 3, 70);
      for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(200,255,240,.6)'; c.beginPath(); c.arc(14 + (i * 7) % 24, 20 + i * 11, 1.5, 0, 6.3); c.fill(); }
    });
    tex(scene, 'p_prensa', 96, 140, (c) => {  // prensa hidráulica del Capataz
      c.fillStyle = '#2a2f36'; c.fillRect(40, 0, 16, 100);
      c.fillStyle = '#c99a10'; for (let y = 0; y < 100; y += 14) c.fillRect(40, y, 16, 6);
      const g = c.createLinearGradient(0, 100, 0, 140); g.addColorStop(0, '#5a626e'); g.addColorStop(1, '#2a2f36'); c.fillStyle = g; c.fillRect(0, 100, 96, 40);
      c.fillStyle = '#ff3b3b'; c.fillRect(6, 106, 84, 4);
    });
    tex(scene, 'p_carne', 64, 64, (c) => {    // tejido palpitante
      const g = c.createRadialGradient(32, 32, 4, 32, 32, 30); g.addColorStop(0, 'rgba(255,90,110,.9)'); g.addColorStop(0.6, 'rgba(140,20,40,.7)'); g.addColorStop(1, 'rgba(60,0,10,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
      c.strokeStyle = 'rgba(255,160,170,.6)'; c.lineWidth = 1.5; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(32, 32); c.quadraticCurveTo(32 + Math.cos(i) * 30, 32 + Math.sin(i * 2) * 20, 32 + Math.cos(i * 1.3) * 28, 32 + Math.sin(i * 1.3) * 28); c.stroke(); }
    });
    tex(scene, 'p_vena', 12, 128, (c) => {    // vena colgante
      const g = c.createLinearGradient(0, 0, 12, 0); g.addColorStop(0, '#3a0812'); g.addColorStop(0.5, '#b0203a'); g.addColorStop(1, '#3a0812');
      c.fillStyle = g; c.beginPath(); c.moveTo(3, 0); c.quadraticCurveTo(10, 64, 4, 128); c.lineTo(8, 128); c.quadraticCurveTo(12, 64, 9, 0); c.fill();
      c.fillStyle = 'rgba(255,120,140,.7)'; c.fillRect(5, 20, 1, 90);
    });
    tex(scene, 'incubadora', 56, 64, (c) => { // cápsula incubadora (cobertura destructible)
      c.fillStyle = '#1a1f26'; c.fillRect(0, 54, 56, 10); c.fillRect(4, 0, 48, 8);
      const g = c.createRadialGradient(28, 32, 4, 28, 32, 26); g.addColorStop(0, 'rgba(255,120,200,.9)'); g.addColorStop(1, 'rgba(90,10,60,.85)');
      c.fillStyle = g; c.beginPath(); c.ellipse(28, 31, 22, 24, 0, 0, 6.3); c.fill();
      c.fillStyle = 'rgba(40,0,20,.85)'; c.beginPath(); c.ellipse(28, 34, 9, 12, 0.3, 0, 6.3); c.fill();
      c.strokeStyle = '#5a626e'; c.lineWidth = 3; c.beginPath(); c.ellipse(28, 31, 23, 25, 0, 0, 6.3); c.stroke();
    });
    tex(scene, 'p_rayo', 64, 256, (c) => {    // haz de luz cenital (andén del elevador)
      const g = c.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, 'rgba(255,230,170,0)'); g.addColorStop(0.5, 'rgba(255,230,170,.55)'); g.addColorStop(1, 'rgba(255,230,170,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 256);
      const v = c.createLinearGradient(0, 0, 0, 256); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
      c.globalCompositeOperation = 'destination-out'; c.fillStyle = v; c.fillRect(0, 0, 64, 256);
    });
  }

  function build(scene, L) {
    textures(scene);
    const views = { carne: [], pad: null };
    for (const p of L.props || []) {
      if (p.kind === 'tanque') {
        const im = scene.add.image(p.x, p.y, 'p_tanque').setOrigin(0.5, 1).setDepth(-6).setAlpha(p.roto ? 0.55 : 1);
        if (p.roto) im.setTint(0x88aa99).setAngle(4);
      } else if (p.kind === 'sirena') {
        const s = scene.add.image(p.x, p.y, 'glow').setScale(1.4).setTint(0xff2020).setBlendMode(Phaser.BlendModes.ADD).setDepth(-5);
        scene.tweens.add({ targets: s, alpha: { from: 0.15, to: 0.8 }, duration: 600, yoyo: true, repeat: -1 });
      } else if (p.kind === 'prensa') {
        const pr = scene.add.image(p.x, p.y - 160, 'p_prensa').setOrigin(0.5, 1).setDepth(16);
        scene.tweens.add({ targets: pr, y: p.y - 10, duration: 420, ease: 'Quad.easeIn', yoyo: true, hold: 300, repeatDelay: 2900, repeat: -1 });
      } else if (p.kind === 'carne') {
        const c = scene.add.image(p.x, p.y, 'p_carne').setScale(p.s).setDepth(-7).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.7);
        scene.tweens.add({ targets: c, scale: p.s * 1.15, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        views.carne.push(c);
      } else if (p.kind === 'vena') {
        const v = scene.add.image(p.x, p.y, 'p_vena').setOrigin(0.5, 0).setDisplaySize(10, p.len).setDepth(-4);
        scene.tweens.add({ targets: v, angle: { from: -3, to: 3 }, duration: 1800 + (p.x % 900), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    }
    // Andén del elevador con estética clara: haces de luz cálida y polvo dorado (contraste con las capas oscuras)
    const A = L.arena;
    if (A.kind === 'extract') {
      for (let i = 0; i < 5; i++) {
        const r = scene.add.image(A.x + A.w * (0.15 + i * 0.175), A.y + 20, 'p_rayo').setOrigin(0.5, 0).setDisplaySize(110, A.h).setBlendMode(Phaser.BlendModes.ADD).setDepth(-3).setAlpha(0.35);
        scene.tweens.add({ targets: r, alpha: 0.6, duration: 2000 + i * 300, yoyo: true, repeat: -1 });
      }
      scene.add.rectangle(A.x + A.w / 2, A.y + A.h / 2, A.w, A.h, 0xffe0a0, 0.06).setDepth(-2).setBlendMode(Phaser.BlendModes.ADD);
      scene.add.particles(0, 0, 'px', { x: { min: A.x, max: A.x + A.w }, y: { min: A.y, max: A.floorTop }, lifespan: 5000, speedY: { min: -8, max: 8 }, speedX: { min: -6, max: 6 },
        scale: { min: 0.3, max: 0.8 }, alpha: { start: 0.6, end: 0 }, tint: [0xffe0a0, 0xffffff], blendMode: 'ADD', frequency: 120, maxAliveParticles: 60 }).setDepth(-1);
    }
    // Conducto del subdescenso secreto (visible al descubrir la sala)
    if (L.prep) {
      const pad = scene.add.image(L.prep.x, L.prep.y - 4, 'glow').setScale(2.2, 0.6).setTint(0x7dff4f).setBlendMode(Phaser.BlendModes.ADD).setDepth(14).setVisible(false);
      scene.tweens.add({ targets: pad, alpha: { from: 0.4, to: 1 }, duration: 500, yoyo: true, repeat: -1 });
      views.pad = pad;
    }
    return views;
  }
  return { build };
})();
