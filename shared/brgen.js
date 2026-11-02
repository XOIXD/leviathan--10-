/* LEVIATHAN - Generador del mapa de la Batalla de Escuadrones: red de tuberías y alcantarillas.
   Fila 0: un pozo de inserción aislado por equipo (sin conexión lateral → nadie choca al inicio).
   Cada fila inferior fusiona conductos en grupos de 2^fila (convergencia progresiva).
   Última fila: la Cámara Central, un único espacio donde aguarda el jefe final definitivo.
   Mismo esquema de datos que levelgen.js para reutilizar física, IA, objetivos y render. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./constants'), require('./rng'));
  else { root.LV = root.LV || {}; root.LV.BRGen = factory(root.LV.C, root.LV.RNG); }
})(typeof self !== 'undefined' ? self : this, function (C, RNG) {
  const RW = C.ROOM_W, RH = C.ROOM_H, TS = C.TILE;
  const ROW_NAMES = ['Pozos de inserción', 'Colectores gemelos', 'Gran cloaca', 'Arteria de drenaje', 'Cámara Central'];

  function generate(seed, teams) {
    const rng = new RNG(seed);
    const GC = Math.max(4, Math.min(10, teams | 0));
    const GR = Math.ceil(Math.log2(GC)) + 1;
    const tw = GC * RW, th = GR * RH;
    const tiles = new Uint8Array(tw * th).fill(1);
    const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < tw && y < th) tiles[y * tw + x] = v; };
    const get = (x, y) => (x < 0 || y < 0 || x >= tw || y >= th) ? 1 : tiles[y * tw + x];
    const grid = [];
    const rooms = [];
    for (let gy = 0; gy < GR - 1; gy++) {
      grid.push([]);
      for (let gx = 0; gx < GC; gx++) {
        const id = rooms.length;
        rooms.push({ id, gx, gy, x: gx * RW * TS, y: gy * RH * TS, w: RW * TS, h: RH * TS, type: gy === 0 ? 'start' : 'combat',
          sector: gy + 1, pathIdx: gy, side: 0, surfaces: [], shafts: [], floorTop: (gy * RH + RH - 1) * TS, team: gy === 0 ? gx : -1 });
        grid[gy].push(id);
        for (let y = 1; y <= RH - 2; y++) for (let x = 1; x <= RW - 2; x++) set(gx * RW + x, gy * RH + y, 0);
      }
    }
    // Cámara Central (última fila completa)
    const ay = GR - 1;
    const arena = { id: rooms.length, gx: 0, gy: ay, x: 0, y: ay * RH * TS, w: tw * TS, h: RH * TS, type: 'arena', sector: GR,
      pathIdx: ay, side: 0, surfaces: [], shafts: [], floorTop: (ay * RH + RH - 1) * TS, kind: 'boss' };
    rooms.push(arena);
    grid.push(new Array(GC).fill(arena.id));
    for (let y = ay * RH + 1; y <= ay * RH + RH - 2; y++) for (let x = 1; x <= tw - 2; x++) set(x, y, 0);

    // Fusiones horizontales: en la fila r se conectan las celdas del mismo grupo de tamaño 2^r
    for (let gy = 1; gy < GR - 1; gy++) {
      const size = 1 << gy;
      for (let gx = 0; gx < GC - 1; gx++) {
        if (Math.floor(gx / size) !== Math.floor((gx + 1) / size)) continue;
        for (let y = gy * RH + RH - 7; y <= gy * RH + RH - 2; y++) { set(gx * RW + RW - 1, y, 0); set((gx + 1) * RW, y, 0); }
      }
    }
    // Pozos verticales hacia abajo (con plataformas para poder volver a subir)
    for (let gy = 0; gy < GR - 1; gy++) {
      for (let gx = 0; gx < GC; gx++) {
        const a = rooms[grid[gy][gx]];
        const cx = rng.int(8, RW - 9), bx = gx * RW;
        for (let x = cx - 2; x <= cx + 1; x++) { set(bx + x, gy * RH + RH - 1, 2); set(bx + x, (gy + 1) * RH, 0); }
        for (const rr of [14, 11, 8, 5, 2]) for (let x = cx - 3; x <= cx + 2; x++) set(bx + x, (gy + 1) * RH + rr, 2);
        a.shafts.push([cx - 5, cx + 4]);
        if (gy + 1 < GR - 1) rooms[grid[gy + 1][gx]].shafts.push([cx - 5, cx + 4]);
        else arena.shafts.push([gx * RW + cx - 5, gx * RW + cx + 4]);
      }
    }

    const covers = [], traps = [], caches = [], movers = [];
    let coverId = 0, trapId = 0, cacheId = 0;
    const addCover = (kind, x, y, roomId) => {
      const w = kind === 'crate' ? 32 : 56, h = kind === 'crate' ? 32 : 40;
      covers.push({ id: coverId++, kind, x, y: y - h, w, h, maxHp: kind === 'crate' ? 140 : 360, roomId });
    };
    for (const r of rooms) {
      if (r.type === 'arena') continue;
      const bx = r.gx * RW, by = r.gy * RH;
      const reserved = [[0, 3], [RW - 4, RW - 1]].concat(r.shafts);
      const isFree = (a, b) => !reserved.some(([x0, x1]) => a <= x1 && b >= x0);
      r.surfaces.push({ x: r.x + 4 * TS, y: r.floorTop, w: (RW - 8) * TS });
      // Pasarelas de mantenimiento
      for (let i = 0; i < rng.int(1, 3); i++) {
        const row = rng.pick([12, 9, 6]), len = rng.int(4, 7), x0 = rng.int(4, RW - 5 - len);
        if (r.shafts.some(([s0, s1]) => x0 <= s1 && x0 + len >= s0)) continue;
        let ok = true;
        for (let x = x0; x < x0 + len; x++) if (get(bx + x, by + row) !== 0) ok = false;
        if (!ok) continue;
        for (let x = x0; x < x0 + len; x++) set(bx + x, by + row, 2);
        r.surfaces.push({ x: r.x + x0 * TS, y: r.y + row * TS, w: len * TS });
      }
      // Agua residual tóxica (trampas) y coberturas
      if (r.type === 'combat' && rng.chance(0.5)) {
        const w = rng.int(3, 5), x0 = rng.int(5, RW - 6 - w);
        if (isFree(x0, x0 + w)) { reserved.push([x0, x0 + w]); traps.push({ id: trapId++, x: r.x + x0 * TS, y: r.floorTop - 10, w: w * TS, h: 10, period: 3.4, on: 1.2, offset: rng.range(0, 3.4), roomId: r.id }); }
      }
      for (let i = 0; i < rng.int(2, 3); i++) {
        const kind = rng.chance(0.55) ? 'crate' : 'barricade', wt = kind === 'crate' ? 1 : 2;
        for (let tries = 0; tries < 8; tries++) {
          const x0 = rng.int(4, RW - 5 - wt);
          if (!isFree(x0 - 1, x0 + wt)) continue;
          reserved.push([x0 - 1, x0 + wt]);
          addCover(kind, r.x + x0 * TS, r.floorTop, r.id);
          break;
        }
      }
      // Recursos en disputa: alijos en los colectores (filas fusionadas)
      if (r.gy >= 1 && rng.chance(0.55)) {
        const s = rng.pick(r.surfaces);
        caches.push({ id: cacheId++, x: s.x + s.w / 2, y: s.y - 14, roomId: r.id });
      }
      // Plataformas móviles en las grandes cloacas
      if (r.gy >= 2 && rng.chance(0.35)) {
        movers.push({ id: movers.length, x: r.x + 6 * TS, y: r.y + 8 * TS, w: 3 * TS, dx: (RW - 15) * TS, dy: 0, period: rng.range(4.5, 6.5), phase: rng.next(), roomId: r.id });
      }
    }
    // Cámara Central: plataformas, coberturas y la plataforma del jefe
    const floorRow = ay * RH + RH - 1;
    for (let gx = 0; gx < GC; gx++) {
      const bx = gx * RW;
      for (const [x0, x1, up] of [[5, 11, 4], [19, 26, 8]]) {
        if (arena.shafts.some(([s0, s1]) => bx + x0 <= s1 && bx + x1 >= s0)) continue;
        for (let x = x0; x <= x1; x++) set(bx + x, floorRow - up, 2);
        arena.surfaces.push({ x: (bx + x0) * TS, y: (floorRow - up) * TS, w: (x1 - x0 + 1) * TS });
      }
      if (gx % 2 === 0) addCover('barricade', (bx + 14) * TS, arena.floorTop, arena.id);
    }
    arena.surfaces.push({ x: 4 * TS, y: arena.floorTop, w: (tw - 8) * TS });
    const mid = Math.floor(tw / 2);
    arena.bossSpawn = { x: mid * TS, y: arena.floorTop };
    arena.vents = [-14, 0, 14].map((o, i) => ({ id: i, x: (mid + o - 1) * TS, y: arena.floorTop, w: 2 * TS, h: 260 }));
    arena.pylons = [-24, 24].map((o, i) => ({ id: i, x: (mid + o) * TS + TS / 2, y: arena.floorTop }));
    arena.lift = { x: (mid - 2) * TS, y: arena.floorTop, w: 5 * TS };

    const spawns = [];
    for (let gx = 0; gx < GC; gx++) {
      const r = rooms[grid[0][gx]];
      spawns.push({ x: r.x + (RW / 2) * TS - C.PW / 2, y: r.floorTop - C.PH });
    }
    return {
      seed, n: teams, tw, th, tiles, GC, GR, grid, rooms, covers, traps, gates: [], detonators: [], caches, arena, movers,
      boxes: [], time: 0, pathLen: GR, spawn: spawns[0], spawns, rowNames: ROW_NAMES.slice(0, GR - 1).concat(['Cámara Central']), br: true
    };
  }

  // Igual que LevelGen.roomIdAt, pero la última fila completa pertenece a la Cámara Central
  function roomIdAt(L, x, y) {
    const gx = Math.floor(x / (RW * TS)), gy = Math.floor(y / (RH * TS));
    if (gx < 0 || gy < 0 || gx >= L.GC || gy >= L.GR) return -1;
    return L.grid[gy][gx];
  }
  return { generate, roomIdAt };
});
