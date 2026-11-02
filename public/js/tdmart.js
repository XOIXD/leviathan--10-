/* LEVIATHAN - Tilesets únicos para los 15 mapas 5 contra 5.
   Cada mapa tiene material (hielo, acero, azulejo, hormigón, óxido, ladrillo, madera, biomasa, malla, roca),
   paleta y semilla propios: ningún mapa comparte textura. Se genera una sola vez al cargar el mapa. */
G.TDMArt = (function () {
  const hex = (c, a) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a === undefined ? 1 : a})`;
  function rngOf(seed) { let s = seed * 9301 + 49297; return () => { s = (s * 16807) % 2147483647; return (s % 10000) / 10000; }; }

  // Dibuja el material en una celda 32x32 (v = variante 0..3)
  function material(c, ox, M, v, R) {
    const [base, mid, acc, dirt] = M.pal;
    const g = c.createLinearGradient(0, 0, 0, 32); g.addColorStop(0, hex(mid)); g.addColorStop(1, hex(base));
    c.fillStyle = g; c.fillRect(ox, 0, 32, 32);
    const bevel = (x, y, w, h) => { c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(ox + x, y, w, 1); c.fillRect(ox + x, y, 1, h); c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(ox + x, y + h - 1, w, 1); c.fillRect(ox + x + w - 1, y, 1, h); };
    switch (M.mat) {
      case 'ladrillo': for (let r = 0; r < 4; r++) for (let k = -1; k < 3; k++) { const x = k * 16 + (r & 1 ? 8 : 0); c.fillStyle = hex(R() < 0.3 ? base : mid, 0.9); c.fillRect(ox + x + 1, r * 8 + 1, 14, 6); bevel(x + 1, r * 8 + 1, 14, 6); } break;
      case 'hormigon': bevel(0, 0, 32, 32); for (let i = 0; i < 2 + v; i++) { c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1; c.beginPath(); let x = ox + R() * 32, y = R() * 32; c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (R() - 0.5) * 10; y += R() * 8; c.lineTo(x, y); } c.stroke(); } break;
      case 'madera': for (let y = 0; y < 32; y += 8) { c.fillStyle = hex(R() < 0.5 ? mid : base); c.fillRect(ox, y, 32, 7); for (let k = 0; k < 3; k++) { c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(ox + R() * 30, y + 2 + R() * 3, 6, 1); } c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(ox, y + 7, 32, 1); c.fillStyle = '#222'; c.fillRect(ox + 3, y + 3, 2, 2); c.fillRect(ox + 27, y + 3, 2, 2); } break;
      case 'azulejo': for (let y = 0; y < 32; y += 8) for (let x = 0; x < 32; x += 8) { c.fillStyle = hex((x + y) % 16 ? mid : base, 0.9 + R() * 0.1); c.fillRect(ox + x, y, 7, 7); c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(ox + x, y, 7, 1); } if (v === 2) { c.fillStyle = hex(dirt, 0.6); c.fillRect(ox + 4, 20, 10, 12); } break;
      case 'hielo': for (let i = 0; i < 6; i++) { c.fillStyle = hex(dirt, 0.15 + R() * 0.3); const x = ox + R() * 28, y = R() * 28; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 6, y + 2); c.lineTo(x + 2, y + 7); c.fill(); } c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(ox, 0, 32, 2); bevel(0, 0, 32, 32); break;
      case 'bio': for (let i = 0; i < 5; i++) { const x = ox + R() * 32, y = R() * 32, r = 3 + R() * 6; const gg = c.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, hex(acc, 0.5)); gg.addColorStop(1, hex(acc, 0)); c.fillStyle = gg; c.fillRect(x - r, y - r, r * 2, r * 2); } c.strokeStyle = hex(acc, 0.5); c.lineWidth = 1; c.beginPath(); c.moveTo(ox, R() * 32); for (let x = 0; x <= 32; x += 4) c.lineTo(ox + x, 16 + Math.sin(x * 0.4 + v) * 8); c.stroke(); break;
      case 'malla': c.fillStyle = 'rgba(0,0,0,.55)'; for (let y = 2; y < 32; y += 4) for (let x = 2; x < 32; x += 4) c.fillRect(ox + x, y, 2, 2); bevel(0, 0, 32, 32); c.fillStyle = hex(acc, 0.7); c.fillRect(ox, 15, 32, 1); break;
      case 'roca': for (let i = 0; i < 7; i++) { c.fillStyle = hex(R() < 0.5 ? mid : base, 0.8); const x = ox + R() * 26, y = R() * 26, w = 6 + R() * 8, h = 5 + R() * 6; c.fillRect(x, y, w, h); c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(x, y, w, 1); c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x, y + h - 1, w, 1); } break;
      case 'oxido': bevel(0, 0, 32, 16); bevel(0, 16, 32, 16); for (let i = 0; i < 6; i++) { const x = ox + R() * 30, y = R() * 20, gg = c.createLinearGradient(0, y, 0, y + 12); gg.addColorStop(0, hex(dirt, 0.8)); gg.addColorStop(1, hex(dirt, 0)); c.fillStyle = gg; c.fillRect(x, y, 2, 12); } break;
      default: /* acero */ bevel(0, 0, v & 1 ? 16 : 32, v & 1 ? 32 : 16); bevel(v & 1 ? 16 : 0, v & 1 ? 0 : 16, v & 1 ? 16 : 32, v & 1 ? 32 : 16);
        for (const [x, y] of [[3, 3], [27, 3], [3, 27], [27, 27]]) { c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(ox + x, y + 1, 3, 2); c.fillStyle = hex(mid); c.fillRect(ox + x, y, 2, 2); }
    }
    // Grano y suciedad acumulada abajo (sombra de contacto)
    for (let i = 0; i < 70; i++) { c.fillStyle = R() < 0.5 ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.06)'; c.fillRect(ox + R() * 32, R() * 32, 1, 1); }
    const s = c.createLinearGradient(0, 22, 0, 32); s.addColorStop(0, 'rgba(0,0,0,0)'); s.addColorStop(1, hex(dirt, 0.35)); c.fillStyle = s; c.fillRect(ox, 22, 32, 10);
  }
  function surface(c, ox, M, v, R) {
    material(c, ox, M, v, R);
    const acc = M.pal[2];
    c.fillStyle = hex(M.pal[1]); c.fillRect(ox, 0, 32, 6);
    c.fillStyle = hex(acc); c.fillRect(ox, 0, 32, 1);
    c.fillStyle = hex(acc, 0.25); c.fillRect(ox, 1, 32, 2);
    const sh = c.createLinearGradient(0, 6, 0, 13); sh.addColorStop(0, 'rgba(0,0,0,.7)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = sh; c.fillRect(ox, 6, 32, 7);
    if (v === 1) { c.fillStyle = hex(acc, 0.8); c.fillRect(ox + 10, 3, 12, 1); }
  }
  // Mismos índices que el tileset principal: 1 interior · 2 plataforma · 3 compuerta · 4 superficie · 5 borde · 6-12 variantes
  function tileset(scene, idx) {
    const key = 'tiles_tdm' + idx;
    if (scene.textures.exists(key)) return key;
    const M = LV.TDMGen.MAPS[idx], R = rngOf(idx + 11);
    const t = scene.textures.createCanvas(key, 13 * 32, 32), c = t.getContext();
    material(c, 32, M, 0, R);
    c.fillStyle = hex(M.pal[1]); c.fillRect(64, 0, 32, 7); c.fillStyle = hex(M.pal[2]); c.fillRect(64, 0, 32, 1); c.fillStyle = 'rgba(0,0,0,.6)'; for (let i = 0; i < 8; i++) c.fillRect(65 + i * 4, 2, 2, 4);
    material(c, 96, M, 3, R);
    surface(c, 128, M, 0, R);
    material(c, 160, M, 1, R); c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(160, 30, 32, 2); c.fillRect(190, 0, 2, 32);
    material(c, 192, M, 1, R); material(c, 224, M, 2, R); material(c, 256, M, 3, R);
    surface(c, 288, M, 1, R); surface(c, 320, M, 2, R);
    material(c, 352, M, 2, R); material(c, 384, M, 0, R);
    t.refresh();
    return key;
  }
  return { tileset };
})();
