/* LEVIATHAN - Cinemáticas ilustradas: secuencias de viñetas estáticas pintadas por código (1280x580),
   con paneo lento tipo "Ken Burns". Cada línea de diálogo muestra la viñeta de su momento narrativo.
   Las viñetas se pintan sólo la primera vez que se necesitan. */
G.CineArt = (function () {
  const W = 1280, H = 580;
  // ---------------------------------------------------------------- utilidades de pintura
  let seed = 1;
  const R = () => { seed = (seed * 16807) % 2147483647; return (seed % 100000) / 100000; };
  function sky(c, a, b, m) { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, a); if (m) g.addColorStop(0.55, m); g.addColorStop(1, b); c.fillStyle = g; c.fillRect(0, 0, W, H); }
  function glowAt(c, x, y, r, col) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
  function fog(c, y, h, col) { const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, y, W, h); }
  // Rayos volumétricos desde un foco (luz que atraviesa polvo)
  function rays(c, x, y, col, n, spread, len) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + (i / (n - 1) - 0.5) * spread + (R() - 0.5) * 0.05, w = 0.015 + R() * 0.03;
      const g = c.createLinearGradient(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a - w) * len, y + Math.sin(a - w) * len); c.lineTo(x + Math.cos(a + w) * len, y + Math.sin(a + w) * len); c.closePath(); c.fill();
    }
    c.restore();
  }
  // Silueta urbana con ventanas, antenas y pasarelas (capa a distancia d: 0 lejos → 1 cerca)
  function skyline(c, baseY, col, d, win) {
    for (let x = -20; x < W + 40;) {
      const w = 40 + R() * 90 * (0.6 + d), h = 80 + R() * (240 + 160 * (1 - d));
      c.fillStyle = col; c.fillRect(x, baseY - h, w, h + 200);
      if (R() < 0.5) { c.fillRect(x + w * 0.4, baseY - h - 30 - R() * 40, 3, 60); c.fillStyle = 'rgba(255,60,60,.8)'; c.fillRect(x + w * 0.4 - 1, baseY - h - 70, 5, 3); c.fillStyle = col; }
      if (win) for (let wy = baseY - h + 10; wy < baseY - 10; wy += 9 + d * 4) for (let wx = x + 5; wx < x + w - 6; wx += 7 + d * 3) if (R() < 0.32) { c.fillStyle = R() < 0.15 ? 'rgba(160,220,255,.7)' : win; c.fillRect(wx, wy, 2 + d * 2, 3 + d * 2); }
      if (R() < 0.3 && d > 0.4) { c.fillStyle = col; c.fillRect(x + w, baseY - h * 0.5, 50, 4); }
      x += w + 4 + R() * 20;
    }
  }
  // Operador con luz de contorno (casco, mochila, fusil)
  function figure(c, x, y, s, rim, face) {
    c.save(); c.translate(x, y); c.scale(face || 1, 1);
    c.fillStyle = '#05060a';
    c.fillRect(-8 * s, -46 * s, 8 * s, 46 * s); c.fillRect(2 * s, -46 * s, 8 * s, 46 * s);   // piernas
    c.beginPath(); c.moveTo(-14 * s, -48 * s); c.lineTo(14 * s, -48 * s); c.lineTo(12 * s, -92 * s); c.lineTo(-12 * s, -92 * s); c.fill();   // torso
    c.fillRect(-22 * s, -90 * s, 10 * s, 34 * s);   // mochila
    c.beginPath(); c.arc(0, -104 * s, 13 * s, 0, 6.3); c.fill();   // casco
    c.fillRect(6 * s, -82 * s, 46 * s, 6 * s); c.fillRect(18 * s, -78 * s, 6 * s, 12 * s);   // fusil
    c.strokeStyle = rim; c.lineWidth = 2 * s; c.globalAlpha = 0.9;
    c.beginPath(); c.arc(0, -104 * s, 13 * s, -1.9, 0.2); c.moveTo(12 * s, -92 * s); c.lineTo(14 * s, -48 * s); c.moveTo(10 * s, -46 * s); c.lineTo(10 * s, 0); c.moveTo(6 * s, -82 * s); c.lineTo(52 * s, -82 * s); c.stroke();
    c.globalAlpha = 1; c.fillStyle = rim; c.fillRect(2 * s, -107 * s, 10 * s, 3 * s);   // visor
    c.restore();
  }
  function particles(c, n, col, y0, y1, size) { for (let i = 0; i < n; i++) { c.globalAlpha = 0.3 + R() * 0.7; c.fillStyle = col; const s = (size || 2) * (0.5 + R()); c.fillRect(R() * W, y0 + R() * (y1 - y0), s, s); } c.globalAlpha = 1; }
  function pipes(c, y, col, n) { for (let i = 0; i < n; i++) { const yy = y + i * 14; c.fillStyle = col; c.fillRect(0, yy, W, 8); c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(0, yy, W, 2); for (let x = 30 + i * 40; x < W; x += 160) { c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(x, yy - 2, 10, 12); } } }
  function tendrils(c, col, n, w) { c.strokeStyle = col; for (let i = 0; i < n; i++) { c.lineWidth = (w || 7) * (0.5 + R()); c.beginPath(); const x = R() * W; c.moveTo(x, -10); c.bezierCurveTo(x + (R() - 0.5) * 200, 120 + R() * 80, x + (R() - 0.5) * 200, 240, x + (R() - 0.5) * 120, 300 + R() * 200); c.stroke(); } }
  // Acabado de cine: gradación de color, viñeta, grano y líneas de barrido
  function finish(c, tint) {
    if (tint) { c.save(); c.globalCompositeOperation = 'soft-light'; c.fillStyle = tint; c.fillRect(0, 0, W, H); c.restore(); }
    const v = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.7); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.75)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
    const img = c.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    c.putImageData(img, 0, 0);
    c.fillStyle = 'rgba(0,0,0,.12)'; for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
  }

  // ---------------------------------------------------------------- viñetas
  const P = {
    cunas(c) {
      sky(c, '#04070c', '#1a2a38', '#0b1420');
      glowAt(c, 640, -40, 520, 'rgba(57,215,255,.22)'); rays(c, 640, -20, 'rgba(120,220,255,.16)', 9, 1.1, 640);
      skyline(c, 470, '#0a121c', 0, 'rgba(255,200,90,.35)'); fog(c, 320, 220, 'rgba(40,80,110,.35)');
      skyline(c, 520, '#070b11', 0.5, 'rgba(255,190,80,.7)'); fog(c, 430, 160, 'rgba(20,40,60,.4)');
      skyline(c, 600, '#030508', 1, 'rgba(255,210,120,.9)');
      c.strokeStyle = 'rgba(20,30,40,.9)'; c.lineWidth = 3; for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(i * 210, 0); c.quadraticCurveTo(i * 210 + 110, 150 + R() * 60, i * 210 + 240, 20); c.stroke(); }
      particles(c, 90, '#9ff8ff', 0, 400, 1.5); finish(c, 'rgba(60,140,200,.4)');
    },
    perforacion(c) {
      sky(c, '#0a0604', '#3a1408', '#1a0a06');
      c.fillStyle = '#140806'; c.beginPath(); c.moveTo(0, H); c.bezierCurveTo(200, 260, 1080, 180, W, H); c.fill();   // lomo del Leviathan
      c.strokeStyle = 'rgba(255,90,40,.25)'; c.lineWidth = 2; for (let i = 0; i < 14; i++) { c.beginPath(); c.moveTo(120 + i * 75, H); c.quadraticCurveTo(200 + i * 70, 360, 420 + i * 40, 290 + R() * 40); c.stroke(); }
      glowAt(c, 860, 400, 160, 'rgba(255,60,30,.55)'); c.fillStyle = '#ffd34a'; c.beginPath(); c.ellipse(860, 400, 30, 52, 0, 0, 6.3); c.fill();
      const ir = c.createRadialGradient(860, 400, 4, 860, 400, 40); ir.addColorStop(0, '#fff3b0'); ir.addColorStop(0.6, '#ff8a00'); ir.addColorStop(1, '#8a1a00'); c.fillStyle = ir; c.beginPath(); c.ellipse(860, 400, 26, 46, 0, 0, 6.3); c.fill();
      c.fillStyle = '#000'; c.beginPath(); c.ellipse(860, 400, 6, 40, 0, 0, 6.3); c.fill(); c.fillStyle = 'rgba(255,255,255,.8)'; c.fillRect(848, 380, 6, 8);
      // torre de perforación detallada
      c.fillStyle = '#1a1e24'; c.fillRect(360, 0, 60, 380); for (let y = 0; y < 380; y += 26) { c.strokeStyle = '#2a3038'; c.lineWidth = 3; c.beginPath(); c.moveTo(360, y); c.lineTo(420, y + 26); c.moveTo(420, y); c.lineTo(360, y + 26); c.stroke(); c.fillStyle = '#c99a10'; c.fillRect(352, y, 76, 4); }
      c.fillStyle = '#5a626e'; c.beginPath(); c.moveTo(350, 380); c.lineTo(430, 380); c.lineTo(390, 470); c.fill(); glowAt(c, 390, 470, 80, 'rgba(255,200,80,.6)');
      particles(c, 140, '#ffb020', 200, H, 2); finish(c, 'rgba(200,80,30,.45)');
    },
    colmena(c) {
      sky(c, '#060104', '#2a0610', '#14020a'); glowAt(c, 640, 560, 520, 'rgba(255,30,50,.3)');
      tendrils(c, 'rgba(110,10,30,.65)', 14, 9); fog(c, 360, 200, 'rgba(80,0,20,.45)');
      for (let r = 0; r < 3; r++) for (let i = 0; i < 8 - r; i++) { const s = 0.7 + r * 0.35, x = 90 + i * (160 + r * 30) + r * 40, y = 470 + r * 60; figure(c, x, y, s, r === 2 ? '#ff3040' : 'rgba(255,60,80,.5)', i % 2 ? 1 : -1); c.fillStyle = '#ff2030'; c.fillRect(x + 2 * s, y - 106 * s, 10 * s, 3 * s); }
      particles(c, 80, 'rgba(255,90,110,1)', 0, H, 2); finish(c, 'rgba(200,20,40,.45)');
    },
    celda(c) {
      sky(c, '#03070b', '#0e1e2a', '#081420');
      c.fillStyle = '#0a141c'; c.fillRect(0, 430, W, 150); for (let x = 0; x < W; x += 64) { c.fillStyle = 'rgba(57,215,255,.08)'; c.fillRect(x, 430, 2, 150); }
      pipes(c, 40, '#0e1a24', 3);
      glowAt(c, 640, 280, 260, 'rgba(57,215,255,.35)'); rays(c, 640, 60, 'rgba(120,230,255,.12)', 7, 0.8, 420);
      c.strokeStyle = '#39d7ff'; c.lineWidth = 6; c.beginPath(); c.ellipse(640, 290, 100, 170, 0, 0, 6.3); c.stroke(); c.fillStyle = 'rgba(57,215,255,.12)'; c.fill();
      c.strokeStyle = 'rgba(157,248,255,.5)'; c.lineWidth = 1; for (let i = 0; i < 8; i++) { c.beginPath(); c.ellipse(640, 290, 90 - i * 6, 160 - i * 10, 0, 0, 6.3); c.stroke(); }
      figure(c, 640, 430, 1.4, '#9ff8ff');
      for (const x of [170, 1110]) { c.fillStyle = '#121e2a'; c.fillRect(x - 70, 250, 140, 180); c.fillStyle = 'rgba(57,215,255,.55)'; c.fillRect(x - 56, 268, 112, 60); for (let k = 0; k < 6; k++) { c.fillStyle = k % 2 ? '#ffb020' : '#5dff7a'; c.fillRect(x - 56 + k * 18, 340, 10, 6); } }
      particles(c, 60, '#9ff8ff', 60, 430, 1.5); finish(c, 'rgba(40,140,200,.35)');
    },
    nucleo(c) {
      sky(c, '#000', '#06101a'); particles(c, 220, '#bff6ff', 0, H, 1.2);
      glowAt(c, 640, 290, 360, 'rgba(57,215,255,.35)'); rays(c, 640, 290, 'rgba(150,240,255,.18)', 16, 6.2, 520);
      glowAt(c, 640, 290, 110, 'rgba(255,255,255,1)');
      c.strokeStyle = 'rgba(157,248,255,.7)'; for (let i = 0; i < 4; i++) { c.lineWidth = 3 - i * 0.5; c.beginPath(); c.ellipse(640, 290, 180 + i * 45, 46 + i * 14, i * 0.45 - 0.3, 0, 6.3); c.stroke(); }
      for (let i = 0; i < 6; i++) { const a = i * 1.05, x = 640 + Math.cos(a) * 230, y = 290 + Math.sin(a) * 70; glowAt(c, x, y, 16, 'rgba(255,255,255,.9)'); }
      finish(c, 'rgba(40,160,220,.4)');
    },
    fundicion(c) {
      sky(c, '#080302', '#3a1204', '#1a0804');
      for (let i = 0; i < 5; i++) { const x = 120 + i * 260; c.fillStyle = '#140a06'; c.fillRect(x - 80, 120, 160, H - 120); c.fillStyle = '#1e120a'; for (let k = 0; k < 5; k++) c.fillRect(x - 80, 140 + k * 70, 160, 6);
        glowAt(c, x, H - 130, 150, 'rgba(255,110,20,.8)'); const m = c.createLinearGradient(0, H - 170, 0, H - 100); m.addColorStop(0, '#fff0a0'); m.addColorStop(1, '#ff5a00'); c.fillStyle = m; c.fillRect(x - 50, H - 170, 100, 60); }
      for (let i = 0; i < 8; i++) { c.strokeStyle = '#2a2018'; c.lineWidth = 5; c.beginPath(); c.moveTo(40 + i * 170, 0); c.lineTo(40 + i * 170, 90 + (i % 3) * 30); c.stroke(); c.fillStyle = '#3a2a18'; c.fillRect(30 + i * 170, 90 + (i % 3) * 30, 20, 14); }
      fog(c, 300, 200, 'rgba(255,90,20,.18)'); figure(c, 640, H - 40, 1.1, '#ffb020', -1);
      particles(c, 220, '#ffd34a', 100, H, 2.4); finish(c, 'rgba(230,100,20,.5)');
    },
    laboratorio(c) {
      sky(c, '#030a08', '#0e2a24', '#071612');
      c.fillStyle = '#081210'; c.fillRect(0, H - 80, W, 80); for (let x = 0; x < W; x += 40) { c.fillStyle = 'rgba(96,255,216,.06)'; c.fillRect(x, H - 80, 1, 80); }
      for (let i = 0; i < 7; i++) { const x = 90 + i * 183;
        glowAt(c, x, 300, 120, 'rgba(60,255,200,.28)');
        const tg = c.createLinearGradient(x - 50, 0, x + 50, 0); tg.addColorStop(0, 'rgba(60,255,200,.18)'); tg.addColorStop(0.5, 'rgba(160,255,230,.38)'); tg.addColorStop(1, 'rgba(60,255,200,.14)'); c.fillStyle = tg; c.fillRect(x - 50, 130, 100, 340);
        c.fillStyle = 'rgba(8,36,28,.95)'; c.beginPath(); c.ellipse(x, 300, 22, 64, 0, 0, 6.3); c.fill(); c.fillRect(x - 3, 220, 6, 30); c.beginPath(); c.arc(x, 220, 13, 0, 6.3); c.fill();
        c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(x - 42, 135, 4, 330);
        for (let b = 0; b < 8; b++) { c.fillStyle = 'rgba(200,255,240,.6)'; c.beginPath(); c.arc(x - 30 + R() * 60, 150 + R() * 300, 1 + R() * 3, 0, 6.3); c.fill(); }
        c.fillStyle = '#1a222a'; c.fillRect(x - 56, 110, 112, 22); c.fillRect(x - 56, 470, 112, 46); c.fillStyle = '#ff3b3b'; c.fillRect(x - 40, 480, 10, 4); }
      pipes(c, 20, '#0a1a16', 4); finish(c, 'rgba(40,200,160,.35)');
    },
    cavernas(c) {
      sky(c, '#0e0205', '#3a0812', '#200410');
      tendrils(c, 'rgba(170,30,60,.6)', 18, 10); fog(c, 200, 260, 'rgba(120,10,40,.35)');
      for (let i = 0; i < 12; i++) { const x = R() * W, y = 80 + R() * 380, r = 30 + R() * 50; glowAt(c, x, y, r, 'rgba(255,80,120,.35)'); c.fillStyle = 'rgba(255,170,190,.9)'; c.beginPath(); c.arc(x, y, 3, 0, 6.3); c.fill(); }
      c.fillStyle = '#18020a'; c.beginPath(); c.moveTo(0, H); for (let x = 0; x <= W; x += 40) c.lineTo(x, H - 70 - Math.sin(x * 0.015) * 50 - R() * 20); c.lineTo(W, H); c.fill();
      figure(c, 300, H - 70, 1, 'rgba(255,120,150,.9)');
      particles(c, 160, 'rgba(255,160,180,1)', 0, H, 2); finish(c, 'rgba(200,30,70,.45)');
    },
    corazon(c) {
      sky(c, '#080001', '#3a0008', '#1a0004');
      rays(c, 640, 280, 'rgba(255,60,60,.12)', 18, 6.2, 700); glowAt(c, 640, 290, 340, 'rgba(255,30,40,.55)');
      const hg = c.createRadialGradient(600, 230, 20, 640, 300, 230); hg.addColorStop(0, '#c0202a'); hg.addColorStop(0.6, '#6a0010'); hg.addColorStop(1, '#2a0006');
      c.fillStyle = hg; c.beginPath(); c.moveTo(640, 490); c.bezierCurveTo(360, 320, 450, 70, 640, 190); c.bezierCurveTo(830, 70, 920, 320, 640, 490); c.fill();
      c.strokeStyle = 'rgba(255,170,180,.55)'; c.lineWidth = 3; for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(640, 210); c.bezierCurveTo(520 + i * 30, 260, 500 + i * 35, 380, 560 + i * 20, 460); c.stroke(); }
      c.strokeStyle = '#3a0008'; c.lineWidth = 22; for (const [a, b] of [[560, 0], [720, 0], [460, 100]]) { c.beginPath(); c.moveTo(a, b); c.quadraticCurveTo(a + 40, 120, 640, 200); c.stroke(); }
      glowAt(c, 640, 300, 60, 'rgba(255,255,255,.7)');
      tendrils(c, 'rgba(90,0,16,.7)', 10, 12); particles(c, 120, '#ff6070', 0, H, 2); finish(c, 'rgba(220,20,40,.5)');
    },
    orbital(c) {
      sky(c, '#06060e', '#4a1a0a', '#1a0c14');
      skyline(c, H - 20, '#080404', 0.9, 'rgba(255,140,60,.8)');
      const g = c.createLinearGradient(560, 0, 720, 0); g.addColorStop(0, 'rgba(255,60,40,0)'); g.addColorStop(0.5, 'rgba(255,250,235,1)'); g.addColorStop(1, 'rgba(255,60,40,0)'); c.fillStyle = g; c.fillRect(520, 0, 240, H);
      glowAt(c, 640, H - 20, 420, 'rgba(255,140,40,.75)'); rays(c, 640, H - 20, 'rgba(255,200,120,.2)', 14, 3, 500);
      fog(c, H - 220, 200, 'rgba(255,120,40,.3)'); figure(c, 220, H - 30, 1.1, '#ffb070');
      particles(c, 260, '#ffb060', 0, H, 2.6); finish(c, 'rgba(255,110,40,.45)');
    },
    elevador(c) {
      sky(c, '#1a1408', '#6a5428', '#3a2c14');
      for (let i = 0; i < 6; i++) { const x = 120 + i * 210; const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(255,240,190,.6)'); g.addColorStop(1, 'rgba(255,240,190,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 70, 0); c.lineTo(x + 130, H); c.lineTo(x - 40, H); c.fill(); }
      c.fillStyle = '#2a2014'; c.fillRect(0, H - 60, W, 60); c.fillStyle = '#1a140c'; c.fillRect(440, 0, 16, H - 110); c.fillRect(824, 0, 16, H - 110);
      for (let y = 0; y < H - 110; y += 30) { c.fillStyle = '#3a2c18'; c.fillRect(440, y, 400, 3); }
      c.fillStyle = '#3a2c1a'; c.fillRect(430, H - 120, 420, 30); for (let i = 0; i < 21; i++) { c.fillStyle = i % 2 ? '#111' : '#c99a10'; c.fillRect(430 + i * 20, H - 92, 20, 10); }
      figure(c, 600, H - 120, 1, '#fff0c0'); figure(c, 690, H - 120, 1, '#fff0c0', -1);
      particles(c, 200, '#fff0c0', 0, H, 2); finish(c, 'rgba(255,210,120,.35)');
    },
    nova(c) {
      sky(c, '#080310', '#2c0c34', '#14061c'); glowAt(c, 640, 250, 300, 'rgba(255,79,216,.35)'); rays(c, 640, 120, 'rgba(255,150,230,.12)', 10, 1.2, 500);
      c.fillStyle = '#07030c'; c.beginPath(); c.moveTo(540, H); c.quadraticCurveTo(540, 240, 640, 160); c.quadraticCurveTo(740, 240, 740, H); c.fill(); c.beginPath(); c.arc(640, 168, 58, Math.PI, 0); c.fill();
      c.strokeStyle = 'rgba(255,120,230,.9)'; c.lineWidth = 2; c.beginPath(); c.arc(640, 168, 58, Math.PI + 0.3, -0.2); c.moveTo(738, 260); c.quadraticCurveTo(742, 400, 740, H); c.stroke();
      c.fillStyle = '#ff4fd8'; c.fillRect(612, 176, 56, 7); glowAt(c, 640, 180, 40, 'rgba(255,79,216,.6)');
      for (let i = 0; i < 20; i++) { c.strokeStyle = `rgba(255,${100 + i * 6},230,.4)`; c.lineWidth = 1; c.beginPath(); c.moveTo(560 + i * 9, 300); c.lineTo(540 + i * 11, H); c.stroke(); }
      particles(c, 120, '#ffc0f0', 0, H, 1.6); finish(c, 'rgba(220,60,200,.4)');
    },
    noche(c) {
      sky(c, '#000', '#05070a'); pipes(c, 30, '#07090c', 3);
      c.fillStyle = '#04060a'; c.fillRect(0, H - 90, W, 90);
      c.save(); c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(330, 330, 10, 330, 330, 820); g.addColorStop(0, 'rgba(255,248,210,.55)'); g.addColorStop(1, 'rgba(255,248,210,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(330, 330); c.lineTo(1280, 120); c.lineTo(1280, 560); c.closePath(); c.fill(); c.restore();
      particles(c, 160, 'rgba(255,250,220,1)', 150, 520, 1.4);
      figure(c, 300, H - 90, 1.3, '#fff3c0');
      for (let i = 0; i < 4; i++) { const x = 900 + i * 90, y = 340 + (i % 2) * 50; figure(c, x, y + 130, 0.8, 'rgba(255,240,200,.35)', -1); c.fillStyle = '#ff2030'; c.fillRect(x - 10, y + 44, 9, 3); }
      finish(c, 'rgba(120,140,180,.3)');
    }
  };
  // Viñeta por línea (la última se repite si hay más líneas que viñetas)
  const MAP = {
    intro: ['cunas', 'perforacion', 'perforacion', 'colmena', 'celda', 'nucleo', 'celda', 'fundicion'],
    layer1: ['fundicion'], layer2: ['laboratorio'], layer3: ['cavernas'], layer4: ['corazon'],
    ending_solo_0: ['corazon', 'orbital', 'celda'], ending_solo_1: ['orbital', 'cunas', 'celda'], ending_solo_2: ['nucleo', 'nova', 'celda'], ending_solo_3: ['nova', 'nucleo', 'corazon', 'cunas'],
    truth_romper: ['orbital', 'cunas'], truth_fusion: ['corazon', 'nova'], loop1: ['orbital', 'celda'], loop2: ['nucleo', 'celda'], loop3: ['nova', 'celda'], ending_coop: ['corazon', 'orbital', 'elevador', 'celda'],
    z_noche: ['noche'], z_capataz: ['fundicion'], z_cuarentena: ['laboratorio'], z_gemelas: ['laboratorio', 'colmena'], z_quimera: ['laboratorio'], z_garganta: ['cavernas'], z_venas: ['cavernas'], z_elevador: ['elevador']
  };
  function key(scene, id, i) {
    const list = MAP[id] || (id.startsWith('ending') ? ['orbital'] : ['nucleo']);
    const name = list[Math.min(i, list.length - 1)], k = 'cine_' + name;
    if (!scene.textures.exists(k)) { const t = scene.textures.createCanvas(k, W, H); seed = 7 + name.length * 131 + name.charCodeAt(0); P[name](t.getContext()); t.refresh(); }
    return k;
  }
  // Cinemáticas de zona (primera vez que se entra a cada una)
  const Ln = (who, text) => ({ who, text });
  const scripts = {
    z_noche: { title: 'TURNO DE NOCHE', lines: [Ln('vex', 'La red eléctrica de la Fundición cayó hace tres ciclos. Allí abajo sólo verás lo que ilumine tu linterna.'), Ln('core', 'Oscuridad total. La colmena no necesita luz. Yo sí.')] },
    z_capataz: { title: 'SALA DEL CAPATAZ', lines: [Ln('rivets', 'Esas prensas hidráulicas aplastan veinte toneladas. El Capataz las usa como trampa. No te quedes debajo.')] },
    z_cuarentena: { title: 'PABELLÓN DE CUARENTENA', lines: [Ln('nova', 'Tanques de cultivo, alarmas de contención… aquí cosechaban el Flujo de los propios soldados.')] },
    z_gemelas: { title: 'INCUBADORAS GEMELAS', lines: [Ln('vex', 'Dos cápsulas gemelas alimentan a la colmena junto al elevador. Mientras sigan vivas, seguirán pariendo crías.'), Ln('kai', 'Rómpelas primero. Luego llama al elevador.')] },
    z_quimera: { title: 'CÁMARA DE LA QUIMERA', lines: [Ln('nova', 'Cubetas de ácido rodean a la Quimera X-9. Si hay un conducto oculto en las ramas laterales, úsalo para prepararte.')] },
    z_garganta: { title: 'GARGANTA PALPITANTE', lines: [Ln('sys', 'ADVERTENCIA: el tejido sufre espasmos periódicos. Los operadores en el suelo serán lanzados al aire.')] },
    z_venas: { title: 'BOSQUE DE VENAS', lines: [Ln('kai', 'Venas colgando del techo como lianas. Cada una bombea Flujo hacia el Corazón. Hermoso. Y asqueroso.')] }
  };
  return { key, scripts };
})();
