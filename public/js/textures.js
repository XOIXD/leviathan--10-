/* LEVIATHAN - Generación procedural de todas las texturas (cero assets externos).
   Se dibujan una sola vez en BootScene sobre canvas y quedan en la caché de Phaser. */
G.Tex = (function () {
  const css = (c, a) => {
    const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    return a === undefined ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
  };
  const shade = (c, f) => {
    let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  };
  function make(scene, key, w, h, draw) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const t = scene.textures.createCanvas(key, w, h);
    const ctx = t.getContext();
    draw(ctx, w, h);
    t.refresh();
    return t;
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function glowDot(ctx, x, y, r, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, css(0xffffff, 1)); g.addColorStop(0.3, css(color, 0.9)); g.addColorStop(1, css(color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // Operador (jugador) mirando a la derecha. Pies en la base.
  function drawOperator(ctx, w, h, s, crouch) {
    const body = s.body, acc = s.accent, vis = s.visor;
    const k = crouch ? 0.64 : 1;
    const base = h;
    const legH = 12 * k, torsoH = 15 * k, headH = 13;
    // piernas
    ctx.fillStyle = css(shade(body, -0.45));
    ctx.fillRect(8, base - legH, 5, legH); ctx.fillRect(15, base - legH, 5, legH);
    ctx.fillStyle = css(shade(acc, -0.2));
    ctx.fillRect(7, base - 3, 7, 3); ctx.fillRect(14, base - 3, 7, 3);
    // mochila
    ctx.fillStyle = css(shade(body, -0.3));
    rrect(ctx, 3, base - legH - torsoH + 2, 6, torsoH - 3, 2); ctx.fill();
    ctx.fillStyle = css(acc, 0.9); ctx.fillRect(4, base - legH - torsoH + 4, 2, 4);
    // torso (silueta según el exotraje: pesado = hombreras y pecho ancho, ligero = estilizado)
    const fr = s.frame || 'std';
    const tx = fr === 'heavy' ? 5 : fr === 'light' ? 8 : 7, tw = fr === 'heavy' ? 19 : fr === 'light' ? 13 : 15;
    ctx.fillStyle = css(body);
    rrect(ctx, tx, base - legH - torsoH, tw, torsoH + 1, 3); ctx.fill();
    if (fr === 'heavy') {
      ctx.fillStyle = css(shade(body, 0.2)); rrect(ctx, 3, base - legH - torsoH - 1, 7, 6, 2); ctx.fill(); rrect(ctx, 19, base - legH - torsoH - 1, 7, 6, 2); ctx.fill();
      ctx.fillStyle = css(acc); ctx.fillRect(4, base - legH - torsoH + 3, 5, 1); ctx.fillRect(20, base - legH - torsoH + 3, 5, 1);
    } else if (fr === 'light') {
      ctx.fillStyle = css(acc, 0.85); ctx.fillRect(8, base - legH - torsoH, 13, 2);            // bufanda táctica
      ctx.fillRect(5, base - legH - torsoH + 1, 4, 7);
    }
    ctx.fillStyle = css(acc);
    ctx.fillRect(9, base - legH - torsoH + 3, 11, 3);
    ctx.fillStyle = css(shade(body, 0.25));
    ctx.fillRect(9, base - legH - 4, 11, 2);
    // casco
    const hy = base - legH - torsoH - headH + 2;
    ctx.fillStyle = css(shade(body, 0.1));
    rrect(ctx, 8, hy, 15, headH, 5); ctx.fill();
    ctx.fillStyle = css(shade(body, -0.35));
    ctx.fillRect(8, hy + headH - 4, 15, 3);
    // visor
    const vg = ctx.createLinearGradient(14, 0, 24, 0);
    vg.addColorStop(0, css(vis, 0.6)); vg.addColorStop(1, css(0xffffff, 1));
    ctx.fillStyle = vg;
    rrect(ctx, 14, hy + 4, 10, 4, 2); ctx.fill();
    ctx.fillStyle = css(vis, 0.35); ctx.fillRect(12, hy + 3, 13, 6);
    // antena (pesado: cresta blindada · ligero: capucha sin antena)
    if (fr === 'heavy') { ctx.fillStyle = css(shade(body, 0.3)); ctx.fillRect(10, hy - 2, 9, 3); }
    else if (fr === 'light') { ctx.fillStyle = css(shade(body, -0.2)); ctx.beginPath(); ctx.moveTo(7, hy + 8); ctx.quadraticCurveTo(9, hy - 4, 20, hy - 1); ctx.lineTo(13, hy + 3); ctx.closePath(); ctx.fill(); }
    else { ctx.fillStyle = css(acc); ctx.fillRect(10, hy - 3, 2, 4); }
  }

  function drawSoldier(ctx, w, h, crouch) {
    const k = crouch ? 0.6 : 1, base = h;
    const legH = 12 * k, torsoH = 15 * k;
    ctx.fillStyle = '#1b1f26'; ctx.fillRect(8, base - legH, 5, legH); ctx.fillRect(15, base - legH, 5, legH);
    ctx.fillStyle = '#3a414d'; rrect(ctx, 6, base - legH - torsoH, 16, torsoH + 1, 3); ctx.fill();
    ctx.fillStyle = '#ff3b3b'; ctx.fillRect(8, base - legH - torsoH + 4, 3, 3);
    ctx.fillStyle = '#5b6573'; ctx.fillRect(6, base - legH - torsoH, 16, 3);
    const hy = base - legH - torsoH - 12;
    ctx.fillStyle = '#2b313b'; rrect(ctx, 7, hy, 15, 13, 4); ctx.fill();
    const g = ctx.createLinearGradient(13, 0, 23, 0); g.addColorStop(0, 'rgba(255,40,40,.5)'); g.addColorStop(1, '#ffd0d0');
    ctx.fillStyle = g; ctx.fillRect(13, hy + 5, 10, 3);
    // rifle
    ctx.fillStyle = '#111'; ctx.fillRect(14, base - legH - torsoH + 7, 14, 3);
    ctx.fillStyle = '#ff5050'; ctx.fillRect(26, base - legH - torsoH + 7, 2, 2);
  }

  function drawBerserker(ctx, w, h) {
    ctx.fillStyle = '#2a1a12'; ctx.fillRect(9, h - 13, 7, 13); ctx.fillRect(19, h - 13, 7, 13);
    ctx.fillStyle = '#4d2f1f'; rrect(ctx, 4, h - 36, 27, 25, 6); ctx.fill();
    const g = ctx.createRadialGradient(18, h - 24, 1, 18, h - 24, 10);
    g.addColorStop(0, '#fff3a0'); g.addColorStop(0.4, '#ff8a00'); g.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(18, h - 24, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b4128'; ctx.fillRect(1, h - 34, 6, 18); ctx.fillRect(28, h - 34, 6, 18);
    ctx.fillStyle = '#c9c9c9';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(34, h - 32 + i * 6); ctx.lineTo(38 > w ? w : 34, h - 30 + i * 6); ctx.lineTo(28, h - 28 + i * 6); ctx.fill(); }
    ctx.fillStyle = '#3b2418'; rrect(ctx, 10, h - 46, 15, 12, 4); ctx.fill();
    ctx.fillStyle = '#ffb020'; ctx.fillRect(17, h - 42, 7, 3);
  }

  function drawDrone(ctx, w, h) {
    ctx.fillStyle = '#444b55'; ctx.fillRect(1, 3, 9, 2); ctx.fillRect(w - 10, 3, 9, 2);
    ctx.fillStyle = '#9aa4b0'; ctx.fillRect(0, 1, 11, 1); ctx.fillRect(w - 11, 1, 11, 1);
    ctx.fillStyle = '#2b3038'; ctx.beginPath(); ctx.ellipse(w / 2, h / 2 + 2, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#596270'; ctx.fillRect(w / 2 - 9, h / 2 + 1, 18, 2);
    glowDot(ctx, w / 2 + 3, h / 2 + 2, 5, 0xff2020);
    ctx.fillStyle = '#ffdd33'; ctx.fillRect(w / 2 - 2, h - 3, 4, 3);
  }

  function drawElite(ctx, w, h) {
    ctx.fillStyle = '#1d1630'; ctx.fillRect(9, h - 16, 8, 16); ctx.fillRect(22, h - 16, 8, 16);
    ctx.fillStyle = '#3b2c66'; rrect(ctx, 5, h - 44, 30, 30, 6); ctx.fill();
    ctx.fillStyle = '#6b4fc0'; ctx.fillRect(5, h - 44, 30, 5);
    ctx.fillStyle = '#b05cff'; ctx.fillRect(9, h - 34, 22, 3); ctx.fillRect(9, h - 28, 22, 2);
    ctx.fillStyle = '#2a2047'; rrect(ctx, 10, h - 56, 20, 14, 5); ctx.fill();
    glowDot(ctx, 24, h - 49, 5, 0xd18bff);
    ctx.fillStyle = '#4a3a80'; ctx.fillRect(0, h - 42, 7, 12); ctx.fillRect(33, h - 42, 7, 12);
  }

  // ---- Modelos únicos de jefe (mismo marco 136x116 que la base para conservar colisión y anclaje)
  function drawForeman(c, w, h) {        // CAPATAZ FERROSO: mecha de fundición con prensas hidráulicas
    c.fillStyle = '#1a1d22'; c.fillRect(30, h - 30, 24, 30); c.fillRect(w - 54, h - 30, 24, 30);
    c.fillStyle = '#c99a10'; for (let i = 0; i < 4; i++) { c.fillRect(30, h - 30 + i * 8, 24, 3); c.fillRect(w - 54, h - 30 + i * 8, 24, 3); }
    const g = c.createLinearGradient(0, 22, 0, h - 28); g.addColorStop(0, '#5a5f66'); g.addColorStop(1, '#262a30');
    c.fillStyle = g; rrect(c, 24, 22, w - 48, h - 52, 8); c.fill();
    c.save(); c.beginPath(); c.rect(24, h - 46, w - 48, 14); c.clip(); for (let i = -4; i < 20; i++) { c.fillStyle = i % 2 ? '#111' : '#ffb020'; c.beginPath(); c.moveTo(24 + i * 10, h - 32); c.lineTo(34 + i * 10, h - 32); c.lineTo(44 + i * 10, h - 46); c.lineTo(34 + i * 10, h - 46); c.fill(); } c.restore();
    c.fillStyle = '#0c0e10'; rrect(c, w / 2 - 22, 34, 44, 20, 4); c.fill();
    c.fillStyle = '#ff7a00'; c.fillRect(w / 2 - 18, 40, 36, 6); c.fillStyle = 'rgba(255,200,120,.8)'; c.fillRect(w / 2 - 18, 40, 36, 2);
    for (const sx of [0, 1]) {
      const x = sx ? w - 20 : 4;
      c.fillStyle = '#3a3f46'; c.fillRect(x + 2, 26, 14, 50); c.fillStyle = '#9aa4b0'; c.fillRect(x + 6, 30, 6, 40);
      c.fillStyle = '#20242a'; rrect(c, x - 4, 74, 26, 22, 3); c.fill(); c.fillStyle = '#ff3b3b'; c.fillRect(x - 2, 90, 22, 3);
    }
    c.fillStyle = '#2a2f36'; c.fillRect(w / 2 + 16, 4, 12, 20); c.fillStyle = 'rgba(255,140,40,.7)'; c.fillRect(w / 2 + 18, 2, 8, 4);
    for (const [x, y] of [[32, 28], [w - 36, 28], [32, h - 54], [w - 36, h - 54]]) { c.fillStyle = '#9aa4b0'; c.beginPath(); c.arc(x, y, 3, 0, 6.3); c.fill(); }
  }
  function drawChimera(c, w, h) {        // QUIMERA X-9: cuadrúpedo de laboratorio con tres cabezas y tanques en el lomo
    c.fillStyle = '#1a2a26'; for (const x of [18, 40, w - 52, w - 30]) c.fillRect(x, h - 34, 12, 34);
    const g = c.createLinearGradient(0, 40, 0, h - 30); g.addColorStop(0, '#3a6a5a'); g.addColorStop(1, '#14261f');
    c.fillStyle = g; c.beginPath(); c.ellipse(w / 2 + 6, h - 50, 52, 30, 0, 0, 6.3); c.fill();
    for (const [x, cl] of [[w / 2 - 6, '#60ffd8'], [w / 2 + 20, '#a0ff60']]) { c.fillStyle = 'rgba(30,50,46,.95)'; c.fillRect(x - 8, 22, 16, 30); const tg = c.createLinearGradient(x - 6, 0, x + 6, 0); tg.addColorStop(0, cl); tg.addColorStop(1, 'rgba(255,255,255,.4)'); c.fillStyle = tg; c.fillRect(x - 6, 26, 12, 22); }
    c.strokeStyle = '#2a4a40'; c.lineWidth = 7;
    for (const [ex, ey] of [[14, 34], [6, 58], [20, 80]]) { c.beginPath(); c.moveTo(w / 2 - 30, h - 56); c.quadraticCurveTo(ex + 20, ey + 10, ex + 10, ey); c.stroke(); c.fillStyle = '#3a6a5a'; c.beginPath(); c.ellipse(ex + 4, ey, 14, 9, -0.3, 0, 6.3); c.fill(); c.fillStyle = '#ffe94a'; c.fillRect(ex - 4, ey - 3, 4, 3); c.fillStyle = '#e8f8f0'; c.fillRect(ex - 10, ey + 3, 10, 2); }
    c.strokeStyle = 'rgba(96,255,216,.6)'; c.lineWidth = 2; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(w / 2 - 20 + i * 14, h - 74); c.lineTo(w / 2 - 14 + i * 16, h - 36); c.stroke(); }
    c.fillStyle = '#20302c'; c.beginPath(); c.moveTo(w - 30, h - 54); c.quadraticCurveTo(w + 4, h - 90, w - 6, h - 100); c.lineTo(w - 12, h - 96); c.quadraticCurveTo(w - 8, h - 80, w - 36, h - 48); c.fill();
  }
  function drawMatriarch(c, w, h) {      // MATRIARCA ALFA: reina insectoide con abdomen, mandíbulas y corona de púas
    c.strokeStyle = '#2a0a22'; c.lineWidth = 5;
    for (let i = 0; i < 3; i++) for (const d of [-1, 1]) { c.beginPath(); c.moveTo(w / 2 + d * 10, h - 44 + i * 6); c.lineTo(w / 2 + d * (34 + i * 14), h - 30 - i * 8); c.lineTo(w / 2 + d * (40 + i * 16), h); c.stroke(); }
    const ab = c.createRadialGradient(w - 40, h - 46, 6, w - 40, h - 46, 40); ab.addColorStop(0, '#ff80e0'); ab.addColorStop(0.5, '#7a1a5a'); ab.addColorStop(1, '#2a0820');
    c.fillStyle = ab; c.beginPath(); c.ellipse(w - 42, h - 46, 36, 26, 0.2, 0, 6.3); c.fill();
    c.strokeStyle = 'rgba(255,200,240,.5)'; c.lineWidth = 2; for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(w - 42, h - 46, 30 - i * 2, 20, 0.2, -1 + i * 0.4, -0.6 + i * 0.4); c.stroke(); }
    c.fillStyle = '#3a0a2e'; c.beginPath(); c.ellipse(w / 2 - 2, h - 56, 26, 22, 0, 0, 6.3); c.fill();
    c.fillStyle = '#4a1240'; c.beginPath(); c.ellipse(38, h - 74, 22, 18, -0.2, 0, 6.3); c.fill();
    c.fillStyle = '#ff80e0'; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(22 + i * 8, h - 88); c.lineTo(26 + i * 8, h - 108 + (i % 2) * 6); c.lineTo(30 + i * 8, h - 88); c.fill(); }
    c.fillStyle = '#ffffff'; c.fillRect(22, h - 78, 6, 3); c.fillRect(34, h - 80, 6, 3);
    c.fillStyle = '#e8d0e0'; c.beginPath(); c.moveTo(20, h - 66); c.lineTo(4, h - 54); c.lineTo(18, h - 60); c.fill(); c.beginPath(); c.moveTo(26, h - 62); c.lineTo(12, h - 46); c.lineTo(26, h - 56); c.fill();
    const gw = c.createRadialGradient(w / 2, h - 60, 2, w / 2, h - 60, 14); gw.addColorStop(0, 'rgba(255,128,224,.9)'); gw.addColorStop(1, 'rgba(255,128,224,0)'); c.fillStyle = gw; c.fillRect(w / 2 - 14, h - 74, 28, 28);
  }

  function drawWarden(ctx, w, h) {
    // piernas
    ctx.fillStyle = '#1a1f27';
    ctx.fillRect(22, h - 34, 22, 34); ctx.fillRect(w - 44, h - 34, 22, 34);
    ctx.fillStyle = '#3a4250'; ctx.fillRect(16, h - 8, 34, 8); ctx.fillRect(w - 50, h - 8, 34, 8);
    // torso
    const g = ctx.createLinearGradient(0, 20, 0, h - 30);
    g.addColorStop(0, '#3d4656'); g.addColorStop(1, '#1b2029');
    ctx.fillStyle = g; rrect(ctx, 10, 22, w - 20, h - 54, 14); ctx.fill();
    ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 2; rrect(ctx, 14, 26, w - 28, h - 62, 12); ctx.stroke();
    // núcleo
    glowDot(ctx, w / 2, h / 2 + 4, 20, 0xff3b3b);
    ctx.strokeStyle = 'rgba(255,200,200,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(w / 2, h / 2 + 4, 13, 0, Math.PI * 2); ctx.stroke();
    // cabeza
    ctx.fillStyle = '#2a313d'; rrect(ctx, w / 2 - 26, 0, 52, 30, 10); ctx.fill();
    ctx.fillStyle = '#0d0f13'; ctx.fillRect(w / 2 - 20, 10, 40, 10);
    glowDot(ctx, w / 2 + 8, 15, 9, 0xffd34a);
    // brazos cañón
    ctx.fillStyle = '#2b3240'; rrect(ctx, 0, 30, 18, 46, 6); ctx.fill(); rrect(ctx, w - 18, 30, 18, 46, 6); ctx.fill();
    ctx.fillStyle = '#ff6a00'; ctx.fillRect(4, 70, 10, 4); ctx.fillRect(w - 14, 70, 10, 4);
    // placas
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    for (let i = 0; i < 4; i++) ctx.fillRect(22 + i * 22, 30, 14, 6);
  }

  function drawNpc(ctx, w, h, key, color) {
    const base = h;
    const col = css(color);
    if (key === 'tailor') {
      ctx.fillStyle = '#2a1030'; ctx.beginPath(); ctx.moveTo(6, base); ctx.lineTo(26, base); ctx.lineTo(23, base - 30); ctx.lineTo(9, base - 30); ctx.fill();
      ctx.fillStyle = '#4a1a52'; rrect(ctx, 8, base - 36, 16, 14, 4); ctx.fill();
      ctx.fillStyle = col; ctx.fillRect(9, base - 26, 14, 2); ctx.fillRect(15, base - 36, 2, 30);
      ctx.fillStyle = '#e8c9b8'; rrect(ctx, 10, base - 49, 12, 13, 5); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(7, base - 40); ctx.lineTo(12, base - 52); ctx.lineTo(25, base - 50); ctx.lineTo(23, base - 44); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(18, base - 44, 4, 2);
    } else if (key === 'ranker') {
      const g = ctx.createRadialGradient(16, base - 22, 2, 16, base - 22, 13); g.addColorStop(0, '#5a6a78'); g.addColorStop(1, '#1a2028');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(16, base - 22, 12, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#0a0f0a'; rrect(ctx, 8, base - 28, 16, 9, 3); ctx.fill();
      ctx.fillStyle = col; ctx.fillRect(11, base - 25, 4, 3); ctx.fillRect(18, base - 25, 4, 3);
      ctx.fillStyle = '#2a333d'; ctx.fillRect(15, base - 42, 2, 8); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(16, base - 43, 2.5, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#2a333d'; ctx.fillRect(3, base - 22, 3, 7); ctx.fillRect(26, base - 22, 3, 7);
      const t = ctx.createLinearGradient(0, base - 10, 0, base); t.addColorStop(0, css(color, 0.9)); t.addColorStop(1, css(color, 0));
      ctx.fillStyle = t; ctx.beginPath(); ctx.moveTo(11, base - 10); ctx.lineTo(21, base - 10); ctx.lineTo(16, base); ctx.closePath(); ctx.fill();
    } else if (key === 'mechanic') {
      ctx.fillStyle = '#3b2a10'; ctx.fillRect(9, base - 14, 6, 14); ctx.fillRect(17, base - 14, 6, 14);
      ctx.fillStyle = '#b8720e'; rrect(ctx, 6, base - 34, 20, 22, 4); ctx.fill();
      ctx.fillStyle = '#e09a2a'; ctx.fillRect(10, base - 30, 12, 8);
      ctx.fillStyle = '#d7b49a'; rrect(ctx, 9, base - 47, 14, 14, 5); ctx.fill();
      ctx.fillStyle = '#222'; ctx.fillRect(10, base - 43, 13, 4);
      glowDot(ctx, 15, base - 41, 3, 0xffb020); glowDot(ctx, 20, base - 41, 3, 0xffb020);
      ctx.fillStyle = '#8a8f96'; ctx.fillRect(25, base - 28, 3, 14); ctx.fillRect(23, base - 30, 7, 3);
      ctx.fillStyle = '#5a3a14'; ctx.fillRect(9, base - 50, 14, 4);
    } else if (key === 'trafficker') {
      ctx.fillStyle = '#0f1a12'; ctx.beginPath(); ctx.moveTo(5, base); ctx.lineTo(27, base); ctx.lineTo(24, base - 38); ctx.lineTo(8, base - 38); ctx.fill();
      ctx.fillStyle = '#16301e'; ctx.beginPath(); ctx.moveTo(6, base - 34); ctx.lineTo(16, base - 54); ctx.lineTo(26, base - 34); ctx.fill();
      ctx.fillStyle = '#05080a'; rrect(ctx, 10, base - 46, 13, 11, 4); ctx.fill();
      ctx.fillStyle = col; ctx.fillRect(13, base - 42, 9, 2);
      ctx.fillStyle = col; ctx.fillRect(7, base - 20, 18, 1); ctx.fillRect(7, base - 12, 18, 1);
    } else {
      ctx.fillStyle = '#10202c'; ctx.fillRect(9, base - 15, 6, 15); ctx.fillRect(17, base - 15, 6, 15);
      ctx.fillStyle = '#16354a'; rrect(ctx, 5, base - 37, 22, 24, 4); ctx.fill();
      ctx.fillStyle = col; ctx.fillRect(5, base - 37, 5, 3); ctx.fillRect(22, base - 37, 5, 3);
      ctx.fillStyle = '#ffd34a'; ctx.fillRect(10, base - 31, 3, 2); ctx.fillRect(10, base - 27, 3, 2);
      ctx.fillStyle = '#c9a38d'; rrect(ctx, 9, base - 49, 14, 13, 5); ctx.fill();
      ctx.fillStyle = '#0d1d29'; ctx.fillRect(7, base - 52, 18, 5); ctx.fillRect(13, base - 48, 12, 2);
      ctx.fillStyle = col; ctx.fillRect(17, base - 44, 5, 2);
    }
  }

  function drawPortrait(ctx, w, h, key, color) {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, css(shade(color, -0.75))); bg.addColorStop(1, '#020406');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = css(color, 0.15); ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath(); const y = 10 + i * 15; ctx.moveTo(0, y); ctx.lineTo(30 + (i * 37) % 60, y); ctx.lineTo(40 + (i * 37) % 60, y + 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w, y + 4); ctx.lineTo(w - 25 - (i * 23) % 50, y + 4); ctx.stroke();
    }
    // hombros
    ctx.fillStyle = css(shade(color, -0.55));
    ctx.beginPath(); ctx.moveTo(20, h); ctx.quadraticCurveTo(w / 2, h - 70, w - 20, h); ctx.fill();
    ctx.fillStyle = css(color, 0.8); ctx.fillRect(40, h - 30, w - 80, 3);
    // cuello y cabeza
    ctx.fillStyle = '#20262e'; ctx.fillRect(w / 2 - 14, h - 70, 28, 30);
    const skin = key === 'trafficker' ? 0x0c120e : key === 'board' ? 0x1b2530 : 0x2c333d;
    ctx.fillStyle = css(skin);
    rrect(ctx, w / 2 - 38, 28, 76, 88, 30); ctx.fill();
    if (key === 'tailor') {
      ctx.fillStyle = css(color); ctx.beginPath(); ctx.moveTo(w / 2 - 50, 70); ctx.lineTo(w / 2 - 20, 14); ctx.lineTo(w / 2 + 48, 26); ctx.lineTo(w / 2 + 30, 50); ctx.fill();
    } else if (key === 'mechanic') {
      ctx.fillStyle = '#5a3a14'; ctx.fillRect(w / 2 - 40, 26, 80, 18);
    } else if (key === 'trafficker') {
      ctx.fillStyle = '#16301e'; ctx.beginPath(); ctx.moveTo(w / 2 - 56, 120); ctx.lineTo(w / 2, 8); ctx.lineTo(w / 2 + 56, 120); ctx.fill();
      ctx.fillStyle = '#05080a'; rrect(ctx, w / 2 - 32, 46, 64, 60, 20); ctx.fill();
    } else if (key === 'commander') {
      ctx.fillStyle = '#0d1d29'; ctx.fillRect(w / 2 - 46, 22, 92, 18); ctx.fillRect(w / 2 - 30, 12, 60, 14);
      ctx.fillStyle = '#ffd34a'; ctx.fillRect(w / 2 - 6, 15, 12, 6);
    }
    // visor/ojos
    ctx.fillStyle = 'rgba(0,0,0,.8)'; rrect(ctx, w / 2 - 30, 62, 60, 20, 8); ctx.fill();
    if (key === 'board') {
      ctx.fillStyle = css(color); for (let i = 0; i < 5; i++) ctx.fillRect(w / 2 - 24, 66 + i * 3, 10 + i * 9, 1);
    } else {
      glowDot(ctx, w / 2 - 13, 72, 11, color); glowDot(ctx, w / 2 + 13, 72, 11, color);
    }
    ctx.fillStyle = css(color, 0.6); ctx.fillRect(w / 2 - 20, 98, 40, 2);
    // marco
    ctx.strokeStyle = css(color, 0.9); ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    ctx.fillStyle = css(color); ctx.fillRect(0, 0, 18, 4); ctx.fillRect(0, 0, 4, 18); ctx.fillRect(w - 18, h - 4, 18, 4); ctx.fillRect(w - 4, h - 18, 4, 18);
  }

  function generate(scene) {
    const C = LV.C;
    // Partículas y utilidades
    make(scene, 'px', 4, 4, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 4, 4); });
    make(scene, 'spark', 10, 2, (c) => { const g = c.createLinearGradient(0, 0, 10, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, '#fff'); c.fillStyle = g; c.fillRect(0, 0, 10, 2); });
    make(scene, 'shard', 6, 6, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, 0); c.lineTo(6, 2); c.lineTo(3, 6); c.fill(); });
    make(scene, 'glow', 64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
    make(scene, 'ring', 64, 64, (c) => { c.strokeStyle = '#fff'; c.lineWidth = 4; c.beginPath(); c.arc(32, 32, 28, 0, Math.PI * 2); c.stroke(); });
    make(scene, 'smoke', 32, 32, (c) => { const g = c.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(200,210,220,.6)'); g.addColorStop(1, 'rgba(200,210,220,0)'); c.fillStyle = g; c.fillRect(0, 0, 32, 32); });
    make(scene, 'slash', 90, 90, (c) => {
      c.lineCap = 'round';
      for (let i = 0; i < 6; i++) { c.strokeStyle = `rgba(255,255,255,${0.15 + i * 0.15})`; c.lineWidth = 2 + i * 1.4; c.beginPath(); c.arc(20, 45, 40 - i, -1.1 + i * 0.05, 1.1 - i * 0.05); c.stroke(); }
    });
    // Proyectiles
    make(scene, 'bul', 18, 4, (c) => { const g = c.createLinearGradient(0, 0, 18, 0); g.addColorStop(0, 'rgba(255,220,120,0)'); g.addColorStop(0.7, '#ffe07a'); g.addColorStop(1, '#fff'); c.fillStyle = g; c.fillRect(0, 0, 18, 4); });
    make(scene, 'pellet', 10, 4, (c) => { c.fillStyle = '#ffd34a'; c.fillRect(0, 0, 10, 4); c.fillStyle = '#fff'; c.fillRect(6, 1, 4, 2); });
    make(scene, 'ebul', 14, 8, (c) => { glowDot(c, 9, 4, 5, 0xff3030); c.fillStyle = 'rgba(255,60,60,.4)'; c.fillRect(0, 3, 8, 2); });
    make(scene, 'gren', 10, 10, (c) => { c.fillStyle = '#556b2f'; c.beginPath(); c.arc(5, 5, 4.5, 0, Math.PI * 2); c.fill(); c.fillStyle = '#ff3b3b'; c.fillRect(4, 0, 2, 3); });
    make(scene, 'wave', 22, 48, (c) => {
      const g = c.createLinearGradient(0, 0, 22, 0); g.addColorStop(0, 'rgba(57,215,255,0)'); g.addColorStop(1, 'rgba(200,250,255,1)');
      c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(30, 24, 0, 48); c.quadraticCurveTo(16, 24, 0, 0); c.fill();
    });
    make(scene, 'shock', 44, 26, (c) => { const g = c.createLinearGradient(0, 26, 0, 0); g.addColorStop(0, 'rgba(255,140,0,1)'); g.addColorStop(1, 'rgba(255,60,0,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(0, 26); c.quadraticCurveTo(22, -10, 44, 26); c.fill(); });
    // Tiles: 0 vacío, 1 interior, 2 plataforma, 3 compuerta, 4 superficie, 5 borde
    // Tileset industrial con relieve simulado. Índices: 1 interior · 2 plataforma · 3 compuerta ·
    // 4 superficie pisable · 5 borde expuesto · 6-8 interiores alternos · 9-10 superficies · 11-12 bordes.
    // Iluminación cenital fija (luz arriba-izquierda): biseles claros arriba/izq., oscuros abajo/der.
    make(scene, 'tiles', 13 * 32, 32, (c) => {
      let seed = 7;
      const R = () => { seed = (seed * 16807) % 2147483647; return (seed % 10000) / 10000; };
      const grain = (ox, a) => { for (let i = 0; i < 140; i++) { const v = R(); c.fillStyle = v < 0.5 ? `rgba(0,0,0,${a * (0.5 + v)})` : `rgba(160,190,220,${a * 0.5 * v})`; c.fillRect(ox + Math.floor(R() * 32), Math.floor(R() * 32), 1, 1); } };
      const bevelRect = (x, y, w, h, hi, lo) => {
        c.fillStyle = `rgba(150,180,210,${hi})`; c.fillRect(x, y, w, 1); c.fillRect(x, y, 1, h);
        c.fillStyle = `rgba(0,0,0,${lo})`; c.fillRect(x, y + h - 1, w, 1); c.fillRect(x + w - 1, y, 1, h);
      };
      const rivet = (x, y) => {
        c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(x, y + 1, 3, 2); c.fillRect(x + 1, y + 2, 2, 1);
        c.fillStyle = '#3b4756'; c.fillRect(x, y, 2, 2); c.fillStyle = 'rgba(200,225,255,.55)'; c.fillRect(x, y, 1, 1);
      };
      const rust = (ox, n) => {
        for (let k = 0; k < n; k++) {
          const x = ox + 3 + Math.floor(R() * 26), y0 = Math.floor(R() * 10), len = 8 + Math.floor(R() * 18);
          const g = c.createLinearGradient(0, y0, 0, y0 + len); g.addColorStop(0, 'rgba(150,70,20,.55)'); g.addColorStop(1, 'rgba(110,50,15,0)');
          c.fillStyle = g; c.fillRect(x, y0, 1 + Math.floor(R() * 2), len);
        }
      };
      const plate = (ox, v) => {
        // Base de acero con gradiente vertical (volumen) y suciedad acumulada abajo
        const g = c.createLinearGradient(0, 0, 0, 32); g.addColorStop(0, '#1d2632'); g.addColorStop(0.55, '#141b25'); g.addColorStop(1, '#0a0f15');
        c.fillStyle = g; c.fillRect(ox, 0, 32, 32);
        // Juntas de placa (cambian por variante) con bisel: lee como relieve, no como dibujo plano
        if (v === 0) { bevelRect(ox, 0, 32, 16, 0.10, 0.55); bevelRect(ox, 16, 32, 16, 0.10, 0.55); }
        else if (v === 1) { bevelRect(ox, 0, 16, 32, 0.10, 0.55); bevelRect(ox + 16, 0, 16, 32, 0.10, 0.55); }
        else if (v === 2) { bevelRect(ox, 0, 32, 32, 0.12, 0.6); c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(ox + 6, 10, 20, 12); bevelRect(ox + 6, 10, 20, 12, 0.08, 0.5); for (let y = 12; y < 21; y += 3) { c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(ox + 8, y, 16, 1); } }
        else { bevelRect(ox, 0, 32, 10, 0.1, 0.5); bevelRect(ox, 10, 32, 22, 0.1, 0.55); c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(ox + 3, 18, 26, 2); c.fillStyle = 'rgba(57,215,255,.10)'; c.fillRect(ox + 3, 17, 26, 1); }
        rivet(ox + 3, 3); rivet(ox + 27, 3); rivet(ox + 3, 27); rivet(ox + 27, 27);
        grain(ox, 0.22);
        // Arañazos y desgaste
        for (let i = 0; i < 3; i++) { c.fillStyle = 'rgba(170,200,230,.10)'; const x = ox + Math.floor(R() * 24), y = Math.floor(R() * 30); c.fillRect(x, y, 4 + Math.floor(R() * 6), 1); }
        if (v === 1 || v === 3) rust(ox, 2 + Math.floor(R() * 3));
        const s2 = c.createLinearGradient(0, 22, 0, 32); s2.addColorStop(0, 'rgba(0,0,0,0)'); s2.addColorStop(1, 'rgba(10,8,4,.35)');
        c.fillStyle = s2; c.fillRect(ox, 22, 32, 10);
      };
      const surface = (ox, v) => {
        plate(ox, v === 0 ? 0 : 3);
        // Chapa de piso con relieve en diamante (tread) y sombra de contacto bajo el labio
        const g = c.createLinearGradient(0, 0, 0, 7); g.addColorStop(0, '#3d4b5c'); g.addColorStop(1, '#232c37');
        c.fillStyle = g; c.fillRect(ox, 0, 32, 7);
        for (let x = 1; x < 32; x += 4) for (let y = 2; y < 6; y += 3) { const dx = (y === 5 ? 2 : 0); c.fillStyle = 'rgba(190,215,240,.35)'; c.fillRect(ox + x + dx, y, 2, 1); c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(ox + x + dx + 1, y + 1, 2, 1); }
        c.fillStyle = '#5fe3ff'; c.fillRect(ox, 0, 32, 1);                      // canto pulido/iluminado
        c.fillStyle = 'rgba(57,215,255,.18)'; c.fillRect(ox, 1, 32, 1);
        const sh = c.createLinearGradient(0, 7, 0, 14); sh.addColorStop(0, 'rgba(0,0,0,.75)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = sh; c.fillRect(ox, 7, 32, 7);                               // oclusión bajo el labio
        if (v === 1) { c.fillStyle = 'rgba(255,176,32,.75)'; c.fillRect(ox + 10, 4, 12, 1); }
        if (v === 2) { c.fillStyle = 'rgba(120,60,20,.45)'; c.fillRect(ox + 4 + Math.floor(R() * 18), 2, 6, 3); }
      };
      const edge = (ox, v) => {
        plate(ox, v);
        // Borde expuesto: chaflán grueso y suciedad en las aristas
        c.fillStyle = 'rgba(120,150,180,.22)'; c.fillRect(ox, 0, 32, 2); c.fillRect(ox, 0, 2, 32);
        c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(ox, 30, 32, 2); c.fillRect(ox + 30, 0, 2, 32);
        c.strokeStyle = 'rgba(80,110,140,.35)'; c.lineWidth = 1; c.strokeRect(ox + 2.5, 2.5, 27, 27);
      };
      plate(32, 0);
      // Plataforma de rejilla (con huecos y sombra propia)
      const pg = c.createLinearGradient(0, 0, 0, 8); pg.addColorStop(0, '#3a4757'); pg.addColorStop(1, '#1e2630');
      c.fillStyle = pg; c.fillRect(64, 0, 32, 7);
      c.fillStyle = '#ffb020'; c.fillRect(64, 0, 32, 1);
      for (let i = 0; i < 8; i++) { c.fillStyle = 'rgba(0,0,0,.65)'; c.fillRect(65 + i * 4, 2, 2, 4); }
      c.fillStyle = '#161c24'; for (let i = 0; i < 4; i++) { c.fillRect(66 + i * 8, 7, 3, 5); c.fillStyle = 'rgba(120,150,180,.3)'; c.fillRect(66 + i * 8, 7, 1, 5); c.fillStyle = '#161c24'; }
      const ps = c.createLinearGradient(0, 7, 0, 16); ps.addColorStop(0, 'rgba(0,0,0,.45)'); ps.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = ps; c.fillRect(64, 7, 32, 9);
      // Compuerta: chapa con franjas de peligro gastadas, marco y luz de estado
      c.save(); c.beginPath(); c.rect(96, 0, 32, 32); c.clip();
      c.fillStyle = '#141414'; c.fillRect(96, 0, 32, 32);
      for (let i = -2; i < 8; i++) { if (i & 1) continue; c.fillStyle = '#b8890e'; c.beginPath(); c.moveTo(96 + i * 8, 32); c.lineTo(104 + i * 8, 32); c.lineTo(112 + i * 8, 0); c.lineTo(104 + i * 8, 0); c.fill(); }
      grain(96, 0.35);
      for (let i = 0; i < 10; i++) { c.fillStyle = 'rgba(20,20,20,.7)'; c.fillRect(96 + Math.floor(R() * 30), Math.floor(R() * 30), 2 + Math.floor(R() * 3), 1); }
      c.restore();
      bevelRect(96, 0, 32, 32, 0.25, 0.7);
      c.fillStyle = '#1b1b1b'; c.fillRect(108, 12, 8, 8); c.fillStyle = '#ff2b2b'; c.fillRect(110, 14, 4, 4); c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(110, 14, 1, 1);
      surface(128, 0);
      edge(160, 0);
      plate(192, 1); plate(224, 2); plate(256, 3);
      surface(288, 1); surface(320, 2);
      edge(352, 1); edge(384, 3);
    });
    // Coberturas
    make(scene, 'crate', 32, 32, (c) => {
      c.fillStyle = '#3c4552'; c.fillRect(0, 0, 32, 32);
      c.fillStyle = '#4e5967'; c.fillRect(2, 2, 28, 28);
      c.strokeStyle = '#2a313a'; c.lineWidth = 3; c.beginPath(); c.moveTo(3, 3); c.lineTo(29, 29); c.moveTo(29, 3); c.lineTo(3, 29); c.stroke();
      c.fillStyle = '#c99a10'; c.fillRect(0, 0, 32, 3); c.fillRect(0, 29, 32, 3);
      c.fillStyle = '#1b1f24'; for (let i = 0; i < 4; i++) c.fillRect(2 + i * 8, 0, 4, 3);
    });
    make(scene, 'barricade', 56, 40, (c) => {
      c.fillStyle = '#2b3138'; rrect(c, 0, 0, 56, 40, 4); c.fill();
      c.fillStyle = '#3c4550'; c.fillRect(3, 3, 50, 34);
      for (let i = -2; i < 9; i++) { c.fillStyle = i % 2 ? '#111' : '#c99a10'; c.beginPath(); c.moveTo(i * 8, 40); c.lineTo(i * 8 + 8, 40); c.lineTo(i * 8 + 16, 30); c.lineTo(i * 8 + 8, 30); c.fill(); }
      c.fillStyle = '#5ea3c4'; c.fillRect(8, 8, 40, 4);
      c.fillStyle = 'rgba(57,215,255,.5)'; c.fillRect(8, 9, 40, 2);
      c.fillStyle = '#1b2026'; c.fillRect(10, 16, 4, 10); c.fillRect(42, 16, 4, 10);
    });
    // Objetivos y entorno
    make(scene, 'terminal', 30, 44, (c) => {
      c.fillStyle = '#1d2530'; c.fillRect(6, 14, 18, 30); c.fillStyle = '#2a3542'; rrect(c, 0, 0, 30, 18, 3); c.fill();
      c.fillStyle = '#05121a'; c.fillRect(3, 3, 24, 12);
      c.fillStyle = '#39d7ff'; for (let i = 0; i < 4; i++) c.fillRect(5, 5 + i * 3, 6 + (i * 7) % 15, 1);
      c.fillStyle = '#ffb020'; c.fillRect(10, 30, 10, 3);
    });
    make(scene, 'bomb', 28, 24, (c) => {
      c.fillStyle = '#2b2f36'; rrect(c, 0, 4, 28, 20, 3); c.fill();
      c.fillStyle = '#7d1a1a'; c.fillRect(3, 8, 22, 8);
      c.fillStyle = '#ff3b3b'; c.fillRect(5, 10, 18, 4);
      c.strokeStyle = '#ffd34a'; c.beginPath(); c.moveTo(6, 4); c.quadraticCurveTo(14, -4, 22, 4); c.stroke();
    });
    make(scene, 'pylon', 34, 90, (c) => {
      c.fillStyle = '#1d2530'; c.fillRect(8, 30, 18, 60); c.fillStyle = '#2f3b4a'; c.fillRect(2, 80, 30, 10);
      for (let i = 0; i < 5; i++) { c.fillStyle = '#4a5a6e'; c.fillRect(5, 34 + i * 9, 24, 3); }
      c.fillStyle = '#2f3b4a'; c.beginPath(); c.arc(17, 18, 15, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#0b1218'; c.beginPath(); c.arc(17, 18, 10, 0, Math.PI * 2); c.fill();
    });
    make(scene, 'vent', 64, 14, (c) => {
      c.fillStyle = '#2a3038'; c.fillRect(0, 0, 64, 14);
      c.fillStyle = '#0b0e12'; for (let i = 0; i < 7; i++) c.fillRect(4 + i * 8.5, 3, 5, 8);
      c.fillStyle = '#ff6a00'; c.fillRect(0, 0, 64, 2);
    });
    make(scene, 'cache', 28, 24, (c) => {
      c.fillStyle = '#6b5210'; rrect(c, 0, 4, 28, 20, 3); c.fill();
      c.fillStyle = '#ffd34a'; c.fillRect(0, 10, 28, 3); c.fillRect(12, 4, 4, 20);
      c.fillStyle = '#fff6c9'; c.fillRect(13, 11, 2, 1);
    });
    make(scene, 'orb', 20, 20, (c) => { glowDot(c, 10, 10, 10, 0x5dff7a); c.fillStyle = '#fff'; c.fillRect(8, 5, 4, 10); c.fillRect(5, 8, 10, 4); });
    // Armas (orientadas a la derecha, empuñadura en x≈4)
    // Armas: alta resolución y camuflajes por geometría (weaponart.js)
    G.WeaponArt.generate(scene);
    // Operadores por skin
    for (const s of LV.Catalog.skins) {
      make(scene, 'pl_' + s.id, 28, 44, (c, w, h) => drawOperator(c, w, h, s, false));
      make(scene, 'plc_' + s.id, 28, 30, (c, w, h) => drawOperator(c, w, h, s, true));
    }
    // Enemigos
    make(scene, 'e_soldier', 30, 42, (c, w, h) => drawSoldier(c, w, h, false));
    make(scene, 'e_soldier_c', 30, 26, (c, w, h) => drawSoldier(c, w, h, true));
    make(scene, 'e_berserker', 38, 46, drawBerserker);
    make(scene, 'e_drone', 30, 20, drawDrone);
    make(scene, 'e_elite', 40, 56, drawElite);
    make(scene, 'e_warden', 136, 116, drawWarden);
    make(scene, 'e_boss_foreman', 136, 116, drawForeman);
    make(scene, 'e_boss_chimera', 136, 116, drawChimera);
    make(scene, 'e_boss_matriarch', 136, 116, drawMatriarch);
    // NPCs y retratos
    for (const n of LV.Hub.build().npcs) {
      make(scene, 'npc_' + n.key, 32, 54, (c, w, h) => drawNpc(c, w, h, n.key, n.color));
      make(scene, 'pt_' + n.key, 180, 180, (c, w, h) => drawPortrait(c, w, h, n.key, n.color));
    }
    make(scene, 'pt_board', 180, 180, (c, w, h) => drawPortrait(c, w, h, 'board', 0x7dff4f));
    make(scene, 'board', 76, 88, (c) => {
      c.fillStyle = '#1d2530'; c.fillRect(34, 60, 8, 28);
      c.fillStyle = '#2a3542'; rrect(c, 0, 0, 76, 62, 4); c.fill();
      c.fillStyle = '#04120a'; c.fillRect(4, 4, 68, 54);
      c.fillStyle = '#7dff4f'; c.font = 'bold 9px monospace'; c.fillText('MISIONES', 14, 15);
      for (let i = 0; i < 3; i++) { c.fillStyle = 'rgba(125,255,79,.7)'; c.fillRect(8, 22 + i * 11, 40 + (i * 13) % 20, 2); c.fillStyle = '#ffd34a'; c.fillRect(60, 21 + i * 11, 6, 4); }
    });
    // Parte 2: nuevos enemigos, jefe final y elementos de nivel
    make(scene, 'e_turret', 32, 30, (c) => {
      c.fillStyle = '#2a2f36'; c.fillRect(2, 20, 28, 10); c.fillStyle = '#3c4552'; c.fillRect(6, 16, 20, 6);
      c.fillStyle = '#4e5967'; c.beginPath(); c.arc(16, 13, 9, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#c99a10'; c.fillRect(2, 27, 28, 3);
      glowDot(c, 16, 13, 5, 0xff2020);
      c.strokeStyle = 'rgba(57,255,207,.5)'; c.beginPath(); c.moveTo(8, 22); c.quadraticCurveTo(16, 18, 24, 22); c.stroke();
    });
    make(scene, 'e_turret_gun', 26, 8, (c) => { c.fillStyle = '#1b1f26'; c.fillRect(0, 1, 24, 6); c.fillStyle = '#ff5050'; c.fillRect(22, 2, 4, 4); });
    make(scene, 'e_alpha', 62, 46, (c, w, h) => {
      c.fillStyle = '#3a1630'; c.fillRect(8, h - 12, 7, 12); c.fillRect(20, h - 12, 7, 12); c.fillRect(38, h - 12, 7, 12); c.fillRect(48, h - 12, 7, 12);
      const g = c.createLinearGradient(0, 8, 0, h - 8); g.addColorStop(0, '#7a2a64'); g.addColorStop(1, '#2a0f24');
      c.fillStyle = g; rrect(c, 4, 10, 52, 26, 12); c.fill();
      c.fillStyle = '#c9c9c9'; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(18 + i * 8, 12); c.lineTo(22 + i * 8, 2); c.lineTo(26 + i * 8, 12); c.fill(); }
      c.fillStyle = '#5a5a6a'; rrect(c, 42, 8, 20, 22, 6); c.fill();
      c.fillStyle = '#8a8a9a'; c.fillRect(44, 10, 16, 4);
      glowDot(c, 55, 19, 4, 0xff4fd8);
      c.fillStyle = '#e8e8e8'; c.beginPath(); c.moveTo(56, 26); c.lineTo(62, 30); c.lineTo(54, 30); c.fill();
      c.fillStyle = 'rgba(255,79,216,.6)'; c.fillRect(6, 20, 10, 3);
    });
    make(scene, 'e_heart', 210, 230, (c, w, h) => {
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2;
        c.strokeStyle = i % 2 ? '#4a0d14' : '#6a1420'; c.lineWidth = 10 - (i % 3) * 2;
        c.beginPath(); c.moveTo(w / 2, h / 2); c.quadraticCurveTo(w / 2 + Math.cos(a + 0.6) * 90, h / 2 + Math.sin(a + 0.6) * 90, w / 2 + Math.cos(a) * 104, h / 2 + Math.sin(a) * 112); c.stroke();
      }
      const g = c.createRadialGradient(w / 2 - 20, h / 2 - 20, 10, w / 2, h / 2, 86);
      g.addColorStop(0, '#ff7b7b'); g.addColorStop(0.45, '#a0102a'); g.addColorStop(1, '#3a0610');
      c.fillStyle = g; c.beginPath(); c.ellipse(w / 2, h / 2, 78, 88, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#2a3038'; c.lineWidth = 8;
      for (const y of [-40, 0, 40]) { c.beginPath(); c.ellipse(w / 2, h / 2 + y, 80 - Math.abs(y) * 0.4, 12, 0, 0, Math.PI); c.stroke(); }
      c.fillStyle = '#4a525e'; for (const [x, y] of [[-60, -50], [58, -46], [-64, 40], [62, 44]]) { rrect(c, w / 2 + x - 9, h / 2 + y - 9, 18, 18, 4); c.fill(); }
      glowDot(c, w / 2, h / 2, 34, 0xff3b3b);
      c.strokeStyle = 'rgba(255,220,220,.8)'; c.lineWidth = 3; c.beginPath(); c.arc(w / 2, h / 2, 22, 0, Math.PI * 2); c.stroke();
    });
    make(scene, 'wall', 32, 160, (c) => {
      c.fillStyle = '#1d242e'; c.fillRect(0, 0, 32, 160);
      for (let y = 0; y < 160; y += 32) { c.fillStyle = '#26303c'; c.fillRect(2, y + 2, 28, 28); }
      c.strokeStyle = 'rgba(255,211,74,.55)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(8, 10); c.lineTo(18, 40); c.lineTo(10, 70); c.lineTo(22, 104); c.lineTo(14, 150); c.stroke();
      c.beginPath(); c.moveTo(18, 40); c.lineTo(28, 52); c.moveTo(22, 104); c.lineTo(4, 118); c.stroke();
    });
    make(scene, 'lid', 128, 32, (c) => {
      c.fillStyle = '#1d242e'; c.fillRect(0, 0, 128, 32);
      for (let x = 0; x < 128; x += 32) { c.fillStyle = '#26303c'; c.fillRect(x + 2, 2, 28, 28); }
      c.strokeStyle = 'rgba(255,211,74,.55)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(6, 16); c.lineTo(40, 8); c.lineTo(70, 22); c.lineTo(100, 10); c.lineTo(124, 18); c.stroke();
    });
    make(scene, 'mover', 96, 14, (c) => {
      c.fillStyle = '#2a3442'; c.fillRect(0, 0, 96, 10); c.fillStyle = '#39d7ff'; c.fillRect(0, 0, 96, 2);
      c.fillStyle = '#161c24'; c.fillRect(6, 10, 10, 4); c.fillRect(80, 10, 10, 4);
      for (let x = 20; x < 76; x += 12) { c.fillStyle = 'rgba(57,215,255,.5)'; c.fillRect(x, 4, 6, 3); }
    });
    make(scene, 'blackbox', 24, 20, (c) => {
      c.fillStyle = '#ff6a00'; rrect(c, 0, 2, 24, 18, 3); c.fill();
      c.fillStyle = '#1b1b1b'; c.fillRect(3, 6, 18, 10); c.fillStyle = '#ffd34a'; c.fillRect(5, 8, 6, 2); c.fillStyle = '#ff3b3b'; c.fillRect(16, 8, 3, 3);
    });
    make(scene, 'lift', 160, 20, (c) => {
      c.fillStyle = '#2a2f36'; c.fillRect(0, 4, 160, 16);
      for (let i = -2; i < 22; i++) { c.fillStyle = (i & 1) ? '#111' : '#c99a10'; c.beginPath(); c.moveTo(i * 8, 20); c.lineTo(i * 8 + 8, 20); c.lineTo(i * 8 + 16, 12); c.lineTo(i * 8 + 8, 12); c.fill(); }
      c.fillStyle = '#7dff4f'; c.fillRect(0, 4, 160, 2);
    });
    make(scene, 'core', 24, 24, (c) => { glowDot(c, 12, 12, 12, 0x39d7ff); c.fillStyle = '#fff'; c.beginPath(); c.arc(12, 12, 4, 0, Math.PI * 2); c.fill(); });
    // Fondos
    make(scene, 'bg_far', 256, 512, (c) => {
      c.fillStyle = '#05080d'; c.fillRect(0, 0, 256, 512);
      c.fillStyle = '#0a1018';
      c.fillRect(20, 0, 40, 512); c.fillRect(150, 0, 24, 512); c.fillRect(210, 60, 30, 452);
      c.fillStyle = '#0c141e';
      for (let y = 0; y < 512; y += 64) { c.fillRect(0, y + 20, 256, 6); }
      c.fillStyle = 'rgba(57,215,255,.12)'; c.fillRect(38, 0, 2, 512); c.fillRect(160, 0, 1, 512);
      for (let i = 0; i < 18; i++) { c.fillStyle = `rgba(255,${120 + (i * 40) % 120},40,${0.2 + (i % 3) * 0.15})`; c.fillRect((i * 53) % 256, (i * 97) % 512, 2, 2); }
    });
    make(scene, 'bg_mid', 512, 512, (c) => {
      c.clearRect(0, 0, 512, 512);
      c.strokeStyle = 'rgba(40,60,80,.55)'; c.lineWidth = 6;
      c.beginPath(); c.moveTo(0, 400); c.lineTo(512, 380); c.stroke();
      c.beginPath(); c.moveTo(0, 120); c.lineTo(512, 140); c.stroke();
      c.lineWidth = 3;
      for (let x = 0; x < 512; x += 64) { c.beginPath(); c.moveTo(x, 120); c.lineTo(x + 32, 400); c.stroke(); }
      c.fillStyle = 'rgba(20,30,40,.8)'; c.fillRect(300, 0, 18, 512); c.fillRect(90, 0, 12, 512);
      c.fillStyle = 'rgba(255,60,60,.5)'; c.fillRect(305, 200, 8, 4);
      c.fillStyle = 'rgba(57,215,255,.4)'; c.fillRect(93, 300, 6, 3);
    });
    make(scene, 'vignette', 256, 144, (c) => {
      const g = c.createRadialGradient(128, 72, 40, 128, 72, 150);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.75)');
      c.fillStyle = g; c.fillRect(0, 0, 256, 144);
    });
    make(scene, 'scan', 4, 4, (c) => { c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(0, 0, 4, 1); });
  }

  return { generate, css, shade };
})();
