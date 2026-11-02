/* LEVIATHAN - 5 contra 5: 15 mapas fijos, cada uno con arquitectura, material y paleta propios.
   Cada mapa es determinista (misma semilla = mismo mapa en servidor y cliente) y simétrico en espejo
   para que ambos equipos compitan en igualdad. Mismo esquema de datos que brgen.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./constants'), require('./rng'));
  else { root.LV = root.LV || {}; root.LV.TDMGen = factory(root.LV.C, root.LV.RNG); }
})(typeof self !== 'undefined' ? self : this, function (C, RNG) {
  const RW = C.ROOM_W, RH = C.ROOM_H, TS = C.TILE;
  // arch: estructura · mat: material del tileset · pal: [base, medio, acento, suciedad] · back: fondo
  const MAPS = [
    { name: 'Refinería Ártica', desc: 'Pasarelas heladas sobre tanques de crudo', arch: 'lanes', W: 4, R: 2, mat: 'hielo', pal: [0x2a3a48, 0x6a8aa0, 0x9ff8ff, 0xd8f0ff], back: 0x0a1620 },
    { name: 'Puerto de Carga', desc: 'Contenedores apilados y grúas', arch: 'crates', W: 4, R: 2, mat: 'acero', pal: [0x2a2620, 0x5a4a30, 0xff7a00, 0x3a2a10], back: 0x100c08 },
    { name: 'Estación Fantasma', desc: 'Andenes de metro abandonados', arch: 'tunnels', W: 5, R: 2, mat: 'azulejo', pal: [0x1e2a26, 0x4a6a5a, 0xffd34a, 0x1a2a20], back: 0x060c0a },
    { name: 'Búnker Omega', desc: 'Casamatas de hormigón y trincheras', arch: 'bunkers', W: 4, R: 2, mat: 'hormigon', pal: [0x3a3a36, 0x6a6a62, 0xff3b3b, 0x2a2a26], back: 0x0c0c0a },
    { name: 'Desguace Ferroso', desc: 'Montañas de chatarra escalonada', arch: 'stairs', W: 4, R: 2, mat: 'oxido', pal: [0x3a2a20, 0x7a4a2a, 0xffb020, 0x5a2a10], back: 0x120a06 },
    { name: 'Ciudadela de Ceniza', desc: 'Torres de ladrillo bombardeadas', arch: 'towers', W: 4, R: 3, mat: 'ladrillo', pal: [0x3a2420, 0x6a3a2a, 0xff6a3a, 0x1a1210], back: 0x100806 },
    { name: 'Laboratorio Kronos', desc: 'Salas limpias en torno a un pozo central', arch: 'pit', W: 4, R: 2, mat: 'azulejo', pal: [0xc8d0d6, 0xe8eef2, 0x39d7ff, 0x8a98a4], back: 0x1a2028 },
    { name: 'Muelle Seco', desc: 'Puentes de madera sobre el dique', arch: 'bridges', W: 5, R: 2, mat: 'madera', pal: [0x3a2a1a, 0x6a4a2a, 0x7dff4f, 0x2a1a0a], back: 0x0a0806 },
    { name: 'Granja de Biomasa', desc: 'Invernaderos tomados por el tejido', arch: 'pit', W: 5, R: 2, mat: 'bio', pal: [0x1a2a14, 0x3a6a2a, 0x9dff4f, 0x0a1a06], back: 0x061006 },
    { name: 'Torre de Comunicaciones', desc: 'Combate vertical por la antena', arch: 'towers', W: 3, R: 3, mat: 'malla', pal: [0x1a2030, 0x3a4a6a, 0xff3df0, 0x10141c], back: 0x05070e },
    { name: 'Fundición Roja', desc: 'Pasarelas sobre crisoles de metal fundido', arch: 'lanes', W: 5, R: 2, mat: 'acero', pal: [0x2a1410, 0x6a2a1a, 0xff5a1a, 0x1a0806], back: 0x140402, hazard: true },
    { name: 'Cantera Vertical', desc: 'Desfiladero con túneles de minería', arch: 'canyon', W: 4, R: 3, mat: 'roca', pal: [0x3a3228, 0x6a5a48, 0xffd34a, 0x2a2018], back: 0x0e0a06 },
    { name: 'Barrio Sumergido', desc: 'Calles inundadas y escalinatas', arch: 'stairs', W: 5, R: 2, mat: 'ladrillo', pal: [0x1e2a24, 0x3a5a46, 0x5ae8ff, 0x0e1a14], back: 0x040c0a, hazard: true },
    { name: 'Hangar Orbital', desc: 'Plataformas de carga en movimiento', arch: 'movers', W: 5, R: 2, mat: 'malla', pal: [0xd0d8e0, 0x8a9aa8, 0xffb020, 0x5a6a78], back: 0x10161c },
    { name: 'Santuario del Flujo', desc: 'Catedral orgánica del Leviathan', arch: 'canyon', W: 4, R: 2, mat: 'bio', pal: [0x2a0a20, 0x6a1a4a, 0xff3df0, 0x1a0412], back: 0x0c0208 }
  ];

  function generate(mapIdx) {
    const M = MAPS[((mapIdx | 0) % MAPS.length + MAPS.length) % MAPS.length];
    const rng = new RNG(0x7d3 + (mapIdx | 0) * 7919);
    const GC = M.W, GR = M.R, tw = GC * RW, th = GR * RH, half = Math.ceil(tw / 2);
    const tiles = new Uint8Array(tw * th).fill(1);
    const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < tw && y < th) tiles[y * tw + x] = v; };
    const fill = (x0, y0, x1, y1, v) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, v); };
    // Cada fila es un gran espacio abierto; los suelos intermedios tienen huecos para cambiar de nivel
    for (let gy = 0; gy < GR; gy++) fill(1, gy * RH + 1, tw - 2, gy * RH + RH - 2, 0);
    for (let gy = 0; gy < GR - 1; gy++) {
      const fy = gy * RH + RH - 1;
      fill(1, fy, half, fy + 1, 1);
      for (const g of [4, Math.floor(half / 2), half - 3]) fill(g, fy, g + 2, fy + 1, 2);   // pasos atravesables
    }
    // Arquitectura propia de cada mapa (sólo la mitad izquierda; luego se refleja)
    for (let gy = 0; gy < GR; gy++) {
      const by = gy * RH, floor = by + RH - 2;
      switch (M.arch) {
        case 'lanes': for (const row of [5, 9, 13]) fill(rng.int(3, 6), by + row, half - rng.int(2, 6), by + row, 2); break;
        case 'crates': for (let i = 0; i < 4; i++) { const x = 6 + i * Math.floor(half / 5), h = rng.int(2, 4); fill(x, floor - h + 1, x + 2, floor, 1); fill(x, floor - h - 3, x + 4, floor - h - 3, 2); } break;
        case 'tunnels': fill(2, by + 7, half, by + 8, 1); for (const x of [6, half - 8]) fill(x, by + 7, x + 2, by + 8, 0); fill(4, by + 12, half - 4, by + 12, 2); break;
        case 'bunkers': for (const x of [8, half - 6]) { fill(x, floor - 3, x + 5, floor - 3, 1); fill(x, floor - 3, x, floor - 1, 1); } fill(3, by + 6, 9, by + 6, 2); break;
        case 'stairs': for (let s = 0; s < 6; s++) fill(3 + s * 4, floor - s, 6 + s * 4, floor, 1); fill(half - 6, by + 5, half, by + 5, 2); break;
        case 'towers': for (const x of [7, half - 5]) { fill(x, by + 4, x + 1, floor, 1); for (const r of [5, 9, 13]) fill(x - 3, by + r, x + 4, by + r, 2); fill(x, by + 9, x + 1, by + 10, 0); } break;
        case 'pit': fill(half - 6, floor - 1, half, floor + 1, 0); fill(half - 8, by + 9, half, by + 9, 2); fill(4, by + 6, 12, by + 6, 2); fill(4, floor - 2, 8, floor, 1); break;
        case 'bridges': for (let x = 4; x < half; x += 7) fill(x, by + 10, x + 4, by + 10, 2); fill(2, floor - 1, half, floor, 1); fill(Math.floor(half / 2), floor - 1, Math.floor(half / 2) + 3, floor, 0); break;
        case 'canyon': fill(half - 3, by + 3, half, floor - 5, 1); fill(half - 3, by + 9, half, by + 11, 0); for (const r of [6, 12]) fill(3, by + r, 10, by + r, 2); break;
        case 'movers': fill(3, by + 12, 9, by + 12, 2); fill(half - 5, by + 6, half, by + 6, 2); break;
      }
    }
    // Espejo: el lado derecho es idéntico al izquierdo
    for (let y = 0; y < th; y++) for (let x = 0; x < half; x++) tiles[y * tw + (tw - 1 - x)] = tiles[y * tw + x];
    fill(0, 0, tw - 1, 0, 1); fill(0, th - 1, tw - 1, th - 1, 1); fill(0, 0, 0, th - 1, 1); fill(tw - 1, 0, tw - 1, th - 1, 1);
    // Salas lógicas (cámaras de seguridad, interés de red) en rejilla
    const rooms = [], grid = [];
    for (let gy = 0; gy < GR; gy++) {
      grid.push([]);
      for (let gx = 0; gx < GC; gx++) {
        const id = rooms.length;
        rooms.push({ id, gx, gy, x: gx * RW * TS, y: gy * RH * TS, w: RW * TS, h: RH * TS, type: 'start', sector: gy + 1, pathIdx: gy, side: 0, surfaces: [], shafts: [], floorTop: (gy * RH + RH - 1) * TS });
        grid[gy].push(id);
      }
    }
    // Coberturas reflejadas (estilo de cada material)
    const covers = [];
    const fl = (GR - 1) * RH + RH - 1;
    for (let i = 0; i < 3; i++) {
      const x = rng.int(5, half - 4), kind = rng.chance(0.5) ? 'crate' : 'barricade', w = kind === 'crate' ? 32 : 56, h = kind === 'crate' ? 32 : 40;
      if (tiles[(fl - 1) * tw + x] !== 0) continue;
      for (const px of [x * TS, (tw - x) * TS - w]) covers.push({ id: covers.length, kind, x: px, y: fl * TS - h, w, h, maxHp: kind === 'crate' ? 140 : 360, roomId: 0 });
    }
    const movers = [];
    if (M.arch === 'movers' || M.arch === 'towers') {
      const y = (GR - 1) * RH * TS + 8 * TS;
      movers.push({ id: 0, x: (half - 6) * TS, y, w: 3 * TS, dx: 9 * TS, dy: 0, period: 5, phase: 0, roomId: 0 });
    }
    const traps = [];
    if (M.hazard) for (const x of [Math.floor(half / 2), tw - Math.floor(half / 2) - 4]) traps.push({ id: traps.length, x: x * TS, y: fl * TS - 10, w: 4 * TS, h: 10, period: 3.2, on: 1.1, offset: traps.length * 1.6, roomId: 0 });
    // Aparición: primer hueco libre (2 tiles de alto) con suelo debajo, buscando desde el borde de cada lado
    const free = (x, y) => x > 0 && x < tw - 1 && tiles[y * tw + x] === 0 && tiles[(y - 1) * tw + x] === 0;
    const findSpawn = (fromLeft) => {
      for (let i = 2; i < half; i++) {
        const x = fromLeft ? i : tw - 1 - i;
        for (let y = fl - 1; y > (GR - 1) * RH; y--) if (free(x, y) && tiles[(y + 1) * tw + x] !== 0) return { x: x * TS + (TS - C.PW) / 2, y: (y + 1) * TS - C.PH };
      }
      return { x: (fromLeft ? 3 : tw - 4) * TS, y: fl * TS - C.PH };
    };
    const spawns = [findSpawn(true), findSpawn(false)];
    const arena = { id: rooms.length - 1, x: 0, y: (GR - 1) * RH * TS, w: tw * TS, h: RH * TS, floorTop: fl * TS, kind: 'tdm', surfaces: [], shafts: [],
      pylons: [], vents: [], bossSpawn: { x: tw * TS / 2, y: fl * TS }, lift: { x: tw * TS / 2 - 80, y: fl * TS, w: 160 } };
    return {
      seed: mapIdx, n: 10, tw, th, tiles, GC, GR, grid, rooms, covers, traps, gates: [], detonators: [], caches: [], arena, movers,
      boxes: [], time: 0, pathLen: GR, spawn: spawns[0], spawns, rowNames: [], br: true, tdm: true, map: M
    };
  }
  function roomIdAt(L, x, y) {
    const gx = Math.floor(x / (RW * TS)), gy = Math.floor(y / (RH * TS));
    if (gx < 0 || gy < 0 || gx >= L.GC || gy >= L.GR) return -1;
    return L.grid[gy][gx];
  }
  return { MAPS, generate, roomIdAt };
});
