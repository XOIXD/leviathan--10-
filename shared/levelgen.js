/* LEVIATHAN - Generador procedural de niveles (determinista por semilla).
   Estructura Metroidvania en cuadrícula de salas: camino principal, ramas secretas,
   pasillos cruzados extra (más con más jugadores), compuertas de hackeo cooperativo,
   salas de detonadores, coberturas destructibles y arena colosal del jefe. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./constants'), require('./rng'));
  else { root.LV = root.LV || {}; root.LV.LevelGen = factory(root.LV.C, root.LV.RNG); }
})(typeof self !== 'undefined' ? self : this, function (C, RNG) {
  const RW = C.ROOM_W, RH = C.ROOM_H, TS = C.TILE;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function generate(seed, nPlayers, opts) {
    const rng = new RNG(seed);
    const n = clamp(nPlayers | 0, 1, 10);
    const O = Object.assign({ rows: 0, cols: 0, movers: 0, terrain: 0, vert: 2, extract: false }, opts || {});
    const GC = clamp(4 + Math.floor(n * 0.5) + O.cols, 4, 11);
    const GR = clamp(2 + Math.floor((n - 1) / 3) + O.rows, 2, 6);
    const tw = (GC + 2) * RW, th = GR * RH;
    const tiles = new Uint8Array(tw * th).fill(1);
    const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < tw && y < th) tiles[y * tw + x] = v; };
    const get = (x, y) => (x < 0 || y < 0 || x >= tw || y >= th) ? 1 : tiles[y * tw + x];

    const grid = [];
    for (let gy = 0; gy < GR; gy++) grid.push(new Array(GC).fill(-1));
    const rooms = [];
    function addRoom(gx, gy, type) {
      const id = rooms.length;
      rooms.push({ id, gx, gy, x: gx * RW * TS, y: gy * RH * TS, w: RW * TS, h: RH * TS, type,
        sector: 1, pathIdx: -1, side: 0, surfaces: [], shafts: [], floorTop: (gy * RH + RH - 1) * TS });
      grid[gy][gx] = id;
      return rooms[id];
    }
    const conns = [];
    const connKeys = new Set();
    const ck = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
    function connect(a, b, gate) {
      const k = ck(a, b);
      if (connKeys.has(k)) return;
      connKeys.add(k);
      conns.push({ a, b, gate: gate || 0 });
    }

    // --- Camino principal (random walk hacia la derecha) ---
    let gx = 0, gy = rng.int(0, GR - 1), vert = 0;
    const path = [addRoom(gx, gy, 'combat')];
    while (gx < GC - 1) {
      const opts = ['R', 'R'];
      if (vert < O.vert) {
        if (gy > 0 && grid[gy - 1][gx] < 0) opts.push('U');
        if (gy < GR - 1 && grid[gy + 1][gx] < 0) opts.push('D');
      }
      const m = rng.pick(opts);
      if (m === 'R') { gx++; vert = 0; } else { gy += m === 'U' ? -1 : 1; vert++; }
      const r = addRoom(gx, gy, 'combat');
      connect(path[path.length - 1].id, r.id);
      path.push(r);
    }
    path.forEach((r, i) => { r.pathIdx = i; r.sector = 1 + Math.floor(3 * i / path.length); });
    path[0].type = 'start';

    // --- Compuertas cooperativas (hackeo simultáneo) ---
    const hSteps = [];
    for (let i = 1; i < path.length - 1; i++) if (path[i + 1].gx > path[i].gx) hSteps.push(i);
    const gateIdx = [];
    const nearest = (target, excl) => {
      let best = -1, bd = 1e9;
      for (const i of hSteps) { if (excl.includes(i)) continue; const d = Math.abs(i - target); if (d < bd) { bd = d; best = i; } }
      return best;
    };
    const g1 = nearest(Math.floor(path.length * 0.45), []);
    if (g1 >= 0) gateIdx.push(g1);
    if (n >= 6) {
      const cands = hSteps.filter(i => i > g1 + 1);
      if (cands.length) gateIdx.push(cands[Math.min(cands.length - 1, Math.floor(cands.length * 0.6))]);
    }
    gateIdx.sort((a, b) => a - b);
    path.forEach(r => { r.side = gateIdx.filter(g => g < r.pathIdx).length; });
    gateIdx.forEach(i => { path[i].type = 'gate'; });

    // --- Salas élite y detonadores ---
    const free = path.filter(r => r.type === 'combat' && r.pathIdx > 0);
    rng.shuffle(free);
    const eliteCount = Math.min(free.length, 1 + Math.floor(n / 4));
    for (let i = 0; i < eliteCount; i++) free[i].type = 'elite';
    if (n >= 4) {
      const det = free.slice(eliteCount).find(r => r.pathIdx > (gateIdx[0] || 0)) || free[eliteCount];
      if (det) det.type = 'detonator';
    }

    // --- Ramas secretas ---
    const maxBranches = 2 + Math.floor(n / 3);
    let branches = 0;
    for (let i = 1; i < path.length - 1 && branches < maxBranches; i++) {
      const forceSecret = opts && opts.extract === false && branches === 0 && i >= path.length - 3;   // los jefes siempre tienen subdescenso secreto
      if (!rng.chance(0.3 + n * 0.03) && !forceSecret) continue;
      const p = path[i];
      const dirs = rng.shuffle([[0, -1], [0, 1], [-1, 0]]);
      for (const [dx, dy] of dirs) {
        const nx = p.gx + dx, ny = p.gy + dy;
        if (nx < 0 || ny < 0 || nx >= GC || ny >= GR || grid[ny][nx] >= 0) continue;
        const r = addRoom(nx, ny, 'secret');
        r.sector = p.sector; r.side = p.side;
        connect(p.id, r.id);
        branches++;
        break;
      }
    }

    // --- Pasillos cruzados extra (bucles) ---
    const loops = n >= 2 ? Math.floor(n / 2) + 1 : 0;
    const pairs = [];
    for (const r of rooms) {
      if (r.type === 'secret') continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const nx = r.gx + dx, ny = r.gy + dy;
        if (nx >= GC || ny >= GR) continue;
        const o = grid[ny][nx];
        if (o < 0) continue;
        const ro = rooms[o];
        if (ro.type === 'secret' || ro.side !== r.side) continue;
        if (connKeys.has(ck(r.id, o))) continue;
        pairs.push([r.id, o]);
      }
    }
    rng.shuffle(pairs);
    for (let i = 0; i < Math.min(loops, pairs.length); i++) connect(pairs[i][0], pairs[i][1]);

    // --- Arena del jefe ---
    const last = path[path.length - 1];
    const arenaRow = last.gy;
    const arenaRows = arenaRow > 0 ? 2 : 1;
    const arenaTopT = (arenaRow + 1) * RH - arenaRows * RH;
    const arena = {
      id: rooms.length, gx: GC, gy: arenaRow, x: GC * RW * TS, y: arenaTopT * TS, w: 2 * RW * TS,
      h: arenaRows * RH * TS, type: 'arena', sector: 4, pathIdx: path.length, side: gateIdx.length,
      surfaces: [], shafts: [], floorTop: (arenaRow * RH + RH - 1) * TS
    };
    rooms.push(arena);

    // --- Tallado de salas ---
    for (const r of rooms) {
      if (r.type === 'arena') continue;
      const bx = r.gx * RW, by = r.gy * RH;
      for (let y = 1; y <= RH - 2; y++) for (let x = 1; x <= RW - 2; x++) set(bx + x, by + y, 0);
    }
    const ax = GC * RW;
    for (let y = arenaTopT + 1; y <= arenaRow * RH + RH - 2; y++)
      for (let x = ax + 1; x <= ax + 2 * RW - 2; x++) set(x, y, 0);

    // --- Conexiones ---
    const gates = [];
    const secretWalls = [];
    function openH(left, right, gateRoom) {
      const row0 = left.gy * RH + RH - 6, row1 = left.gy * RH + RH - 2;
      const c1 = left.gx * RW + RW - 1, c2 = right.gx * RW;
      const doorTiles = [];
      for (let y = row0; y <= row1; y++) for (const x of [c1, c2]) {
        if (gateRoom) { set(x, y, 3); doorTiles.push(y * tw + x); } else set(x, y, 0);
      }
      return doorTiles;
    }
    for (const c of conns) {
      let a = rooms[c.a], b = rooms[c.b];
      if (a.gy === b.gy) {
        if (a.gx > b.gx) { const t = a; a = b; b = t; }
        const isGate = a.type === 'gate' && a.pathIdx >= 0 && b.pathIdx === a.pathIdx + 1;
        const doorTiles = openH(a, b, isGate);
        if (isGate) gates.push({ id: gates.length, roomId: a.id, tiles: doorTiles, terminals: [] });
        if (a.type === 'secret' || b.type === 'secret') {
          const sec = a.type === 'secret' ? a : b;
          const col = sec === b ? b.gx * RW : a.gx * RW + RW - 1;
          secretWalls.push({ kind: 'wall', x: col * TS, y: (a.gy * RH + RH - 6) * TS, w: TS, h: 5 * TS, roomId: sec.id });
        }
      } else {
        if (a.gy > b.gy) { const t = a; a = b; b = t; }
        const cx = rng.int(8, RW - 9);
        const bx = a.gx * RW;
        for (let x = cx - 2; x <= cx + 1; x++) {
          set(bx + x, a.gy * RH + RH - 1, 2);
          set(bx + x, b.gy * RH, 0);
        }
        for (const rr of [14, 11, 8, 5, 2])
          for (let x = cx - 3; x <= cx + 2; x++) set(bx + x, b.gy * RH + rr, 2);
        a.shafts.push([cx - 5, cx + 4]);
        b.shafts.push([cx - 5, cx + 4]);
        if (a.type === 'secret' || b.type === 'secret')
          secretWalls.push({ kind: 'lid', x: (bx + cx - 2) * TS, y: (a.gy * RH + RH - 1) * TS, w: 4 * TS, h: TS, roomId: (a.type === 'secret' ? a : b).id });
        for (const rr of [14, 11, 8, 5, 2])
          b.surfaces.push({ x: b.x + (cx - 3) * TS, y: b.y + rr * TS, w: 6 * TS });
      }
    }
    // Entrada a la arena
    {
      const row0 = arenaRow * RH + RH - 6, row1 = arenaRow * RH + RH - 2;
      for (let y = row0; y <= row1; y++) { set(last.gx * RW + RW - 1, y, 0); set(ax, y, 0); }
    }

    // --- Contenido de salas ---
    const covers = [], traps = [], detonators = [], caches = [], movers = [];
    let coverId = 0, trapId = 0, objId = 0;
    for (const sw of secretWalls) covers.push({ id: coverId++, kind: sw.kind, x: sw.x, y: sw.y, w: sw.w, h: sw.h, maxHp: 220, roomId: sw.roomId });
    function addCover(kind, x, y, roomId) {
      const w = kind === 'crate' ? 32 : 56, h = kind === 'crate' ? 32 : 40;
      covers.push({ id: coverId++, kind, x, y: y - h, w, h, maxHp: kind === 'crate' ? 140 : 360, roomId });
      return covers[covers.length - 1];
    }
    for (const r of rooms) {
      if (r.type === 'arena') continue;
      const bx = r.gx * RW, by = r.gy * RH;
      const reserved = [[0, 3], [RW - 4, RW - 1]].concat(r.shafts);
      const isFree = (a, b) => !reserved.some(([x0, x1]) => a <= x1 && b >= x0);
      const reserve = (a, b) => reserved.push([a, b]);
      r.surfaces.push({ x: r.x + 4 * TS, y: r.floorTop, w: (RW - 8) * TS });

      // Plataformas flotantes
      const pc = rng.int(1, 3);
      for (let i = 0; i < pc; i++) {
        const row = rng.pick([12, 9, 6]);
        const len = rng.int(4, 7);
        const x0 = rng.int(4, RW - 5 - len);
        if (r.shafts.some(([s0, s1]) => x0 <= s1 && x0 + len >= s0)) continue;
        let ok = true;
        for (let x = x0; x < x0 + len; x++) if (get(bx + x, by + row) !== 0) ok = false;
        if (!ok) continue;
        for (let x = x0; x < x0 + len; x++) set(bx + x, by + row, 2);
        const s = { x: r.x + x0 * TS, y: r.y + row * TS, w: len * TS };
        r.surfaces.push(s);
        if (r.type !== 'start' && rng.chance(0.3)) addCover('crate', s.x + Math.floor(len / 2) * TS, s.y, r.id);
      }
      // Pilares sólidos
      if (r.type !== 'start' && rng.chance(0.5)) {
        const h = rng.int(1, 2);
        const x0 = rng.int(6, RW - 8);
        if (isFree(x0 - 1, x0 + 2)) {
          for (let y = 0; y < h; y++) for (let x = x0; x < x0 + 2; x++) set(bx + x, by + RH - 2 - y, 1);
          reserve(x0 - 1, x0 + 2);
        }
      }
      if (r.type === 'start') reserve(RW / 2 - 3, RW / 2 + 2);

      // Terminales de compuerta (hackeo simultáneo)
      if (r.type === 'gate') {
        const g = gates.find(gg => gg.roomId === r.id);
        const K = n <= 1 ? 1 : clamp(Math.ceil(n / 3), 2, 3);
        for (let k = 0; k < K; k++) {
          const xt = K === 1 ? Math.floor(RW / 2) : Math.round(6 + k * (RW - 13) / (K - 1));
          let xx = xt;
          for (let tries = 0; tries < 12 && !isFree(xx - 1, xx + 1); tries++) xx += (tries % 2 ? -tries : tries);
          reserve(xx - 1, xx + 1);
          if (g) g.terminals.push({ id: k, x: r.x + xx * TS + TS / 2, y: r.floorTop });
        }
      }
      // Detonadores (n >= 4)
      if (r.type === 'detonator') {
        const D = clamp(Math.ceil(n / 3), 2, 4);
        const det = { id: detonators.length, roomId: r.id, bombs: [] };
        for (let k = 0; k < D; k++) {
          let xx = Math.round(6 + k * (RW - 13) / Math.max(1, D - 1));
          for (let tries = 0; tries < 12 && !isFree(xx - 1, xx + 1); tries++) xx += (tries % 2 ? -tries : tries);
          reserve(xx - 1, xx + 1);
          det.bombs.push({ id: k, x: r.x + xx * TS + TS / 2, y: r.floorTop });
        }
        detonators.push(det);
      }
      // Trampas de energía
      if ((r.type === 'combat' || r.type === 'elite') && rng.chance(0.4)) {
        const w = rng.int(3, 5);
        const x0 = rng.int(5, RW - 6 - w);
        if (isFree(x0, x0 + w)) {
          reserve(x0, x0 + w);
          traps.push({ id: trapId++, x: r.x + x0 * TS, y: r.floorTop - 10, w: w * TS, h: 10,
            period: 3.4, on: 1.2, offset: rng.range(0, 3.4), roomId: r.id });
        }
      }
      // Coberturas balísticas
      if (r.type !== 'secret') {
        const cc = r.type === 'start' ? 2 : rng.int(2, 3) + (n >= 5 ? 1 : 0);
        for (let i = 0; i < cc; i++) {
          const kind = r.type === 'start' || rng.chance(0.55) ? 'crate' : 'barricade';
          const wt = kind === 'crate' ? 1 : 2;
          let placed = false;
          for (let tries = 0; tries < 10 && !placed; tries++) {
            const x0 = rng.int(4, RW - 5 - wt);
            if (!isFree(x0 - 1, x0 + wt)) continue;
            reserve(x0 - 1, x0 + wt);
            addCover(kind, r.x + x0 * TS, r.floorTop, r.id);
            if (kind === 'crate' && rng.chance(0.25)) addCover('crate', r.x + x0 * TS, r.floorTop - 32, r.id);
            placed = true;
          }
        }
      }
      // Terreno orgánico: escalones, montículos y estalactitas (más agresivo en cavernas)
      if (r.type !== 'start' && r.type !== 'gate' && rng.chance(O.terrain)) {
        const steps = rng.int(1, O.terrain > 0.8 ? 3 : 2);
        for (let i = 0; i < steps; i++) {
          const w = rng.int(3, 6), x0 = rng.int(4, RW - 5 - w);
          if (!isFree(x0 - 1, x0 + w)) continue;
          reserve(x0 - 1, x0 + w);
          const h = rng.int(1, O.terrain > 0.8 ? 3 : 2);
          for (let y = 0; y < h; y++) for (let x = x0; x < x0 + w; x++) set(bx + x, by + RH - 2 - y, 1);
          r.surfaces.push({ x: r.x + x0 * TS, y: r.floorTop - h * TS, w: w * TS });
        }
        if (O.terrain > 0.6) {
          const k = rng.int(1, 3);
          for (let i = 0; i < k; i++) {
            const w = rng.int(2, 4), x0 = rng.int(4, RW - 5 - w), h = rng.int(1, 3);
            if (r.shafts.some(([s0, s1]) => x0 <= s1 && x0 + w >= s0)) continue;
            for (let y = 1; y <= h; y++) for (let x = x0; x < x0 + w; x++) if (get(bx + x, by + y) === 0 && get(bx + x, by + y + 1) === 0) set(bx + x, by + y, 1);
          }
        }
      }
      // Plataformas móviles (horizontales y elevadores verticales): potencian doble salto y dash
      if (r.type !== 'start' && rng.chance(O.movers)) {
        if (rng.chance(0.55)) {
          const row = rng.pick([7, 9, 10]);
          let run = 0, best = null;
          for (let x = 3; x <= RW - 4; x++) {
            const free = get(bx + x, by + row) === 0 && get(bx + x, by + row - 1) === 0 && get(bx + x, by + row - 2) === 0 &&
              !r.shafts.some(([s0, s1]) => x >= s0 && x <= s1);
            run = free ? run + 1 : 0;
            if (run >= 11 && (!best || run > best.len)) best = { end: x, len: run };
          }
          if (best) {
            const x0 = best.end - best.len + 1;
            movers.push({ id: movers.length, x: r.x + x0 * TS, y: r.y + row * TS, w: 3 * TS, dx: (best.len - 3) * TS, dy: 0, period: rng.range(4, 6.5), phase: rng.next(), roomId: r.id });
          }
        } else {
          for (let tries = 0; tries < 8; tries++) {
            const c = rng.int(5, RW - 8);
            if (r.shafts.some(([s0, s1]) => c <= s1 && c + 2 >= s0)) continue;
            let ok = true;
            for (let y = 3; y <= 15 && ok; y++) for (let x = c; x < c + 3; x++) if (get(bx + x, by + y) !== 0) ok = false;
            if (!ok) continue;
            movers.push({ id: movers.length, x: r.x + c * TS, y: r.y + 15 * TS, w: 3 * TS, dx: 0, dy: -11 * TS, period: rng.range(5.5, 7.5), phase: rng.next(), roomId: r.id });
            break;
          }
        }
      }
      // Alijo secreto
      if (r.type === 'secret') {
        const s = r.surfaces.length > 1 ? r.surfaces[1 + rng.int(0, r.surfaces.length - 2)] : r.surfaces[0];
        caches.push({ id: objId++, x: s.x + s.w / 2, y: s.y - 14, roomId: r.id });
      }
    }

    // --- Contenido de arena ---
    const floorRow = arenaRow * RH + RH - 1;
    const platsA = [[6, 12, 4], [51, 57, 4], [18, 26, 8], [37, 45, 8]];
    if (arenaRows > 1) platsA.push([28, 35, 12], [8, 15, 16], [48, 55, 16]);
    for (const [x0, x1, up] of platsA) {
      for (let x = x0; x <= x1; x++) set(ax + x, floorRow - up, 2);
      arena.surfaces.push({ x: (ax + x0) * TS, y: (floorRow - up) * TS, w: (x1 - x0 + 1) * TS });
    }
    arena.surfaces.push({ x: (ax + 4) * TS, y: arena.floorTop, w: (2 * RW - 8) * TS });
    arena.vents = [14, 31, 48].map((x, i) => ({ id: i, x: (ax + x) * TS, y: arena.floorTop, w: 2 * TS, h: 260 }));
    arena.pylons = [5, 58].map((x, i) => ({ id: i, x: (ax + x) * TS + TS / 2, y: arena.floorTop }));
    addCover('barricade', (ax + 22) * TS, arena.floorTop, arena.id);
    addCover('barricade', (ax + 40) * TS, arena.floorTop, arena.id);
    arena.bossSpawn = { x: (ax + RW) * TS, y: arena.floorTop };
    arena.kind = O.extract ? 'extract' : 'boss';
    arena.lift = { x: (ax + 2 * RW - 8) * TS, y: arena.floorTop, w: 5 * TS };
    // Plataformas móviles altas en la arena (verticalidad en la cacería)
    movers.push({ id: movers.length, x: (ax + 8) * TS, y: (floorRow - 12) * TS, w: 4 * TS, dx: 18 * TS, dy: 0, period: 7, phase: 0, roomId: arena.id });
    movers.push({ id: movers.length, x: (ax + 38) * TS, y: (floorRow - 12) * TS, w: 4 * TS, dx: 16 * TS, dy: 0, period: 7, phase: 0.5, roomId: arena.id });
    // Cajas negras (contrato de campo) en salas fuera del camino de inicio
    const boxes = [];
    const boxRooms = rng.shuffle(rooms.filter(r => r.type !== 'start' && r.type !== 'arena' && r.type !== 'gate'));
    for (let i = 0; i < Math.min(3, boxRooms.length); i++) {
      const r = boxRooms[i], s2 = rng.pick(r.surfaces);
      boxes.push({ id: i, x: s2.x + 16 + rng.next() * Math.max(1, s2.w - 32), y: s2.y - 14, roomId: r.id });
    }

    const start = path[0];
    const level = {
      seed, n, tw, th, tiles, GC, GR, grid, rooms, covers, traps, gates, detonators, caches, arena, movers, boxes, time: 0,
      pathLen: path.length,
      spawn: { x: start.x + (RW / 2) * TS - C.PW / 2, y: start.floorTop - C.PH }
    };
    applyZone(level, opts || {}, rng);
    return level;
  }

  // Zonas con identidad propia (deterministas: servidor y cliente generan exactamente lo mismo)
  function applyZone(L, o, rng) {
    L.zone = o.zone || null;
    L.props = [];
    const A = L.arena, fl = A.floorTop;
    const prop = (kind, x, y, extra) => L.props.push(Object.assign({ kind, x: Math.round(x), y: Math.round(y) }, extra || {}));
    const combat = L.rooms.filter(r => r.type === 'combat');
    switch (L.zone) {
      case 'capataz':   // prensas hidráulicas en la sala del jefe
        for (const f of [0.3, 0.7]) L.traps.push({ id: L.traps.length, x: A.x + A.w * f - 48, y: fl - 10, w: 96, h: 10, period: 4, on: 1, offset: f * 4, roomId: A.id, press: true });
        for (const f of [0.3, 0.7]) prop('prensa', A.x + A.w * f, fl);
        break;
      case 'cuarentena': // tanques de cultivo, luces de contención y charcos tóxicos
        for (const r of combat) { prop('tanque', r.x + r.w * 0.25, r.floorTop); prop('tanque', r.x + r.w * 0.75, r.floorTop); prop('sirena', r.x + r.w / 2, r.y + 50); }
        break;
      case 'gemelas':   // dos incubadoras funcionales en el andén: generan crías hasta destruirlas
        for (const f of [0.22, 0.78]) L.covers.push({ id: L.covers.length, kind: 'incubadora', x: Math.round(A.x + A.w * f - 28), y: fl - 64, w: 56, h: 64, maxHp: 900, roomId: A.id, pod: true });
        break;
      case 'quimera':   // cubetas de ácido alrededor de la quimera
        for (const f of [0.18, 0.82]) L.traps.push({ id: L.traps.length, x: A.x + A.w * f - 64, y: fl - 10, w: 128, h: 10, period: 5, on: 2, offset: f * 5, roomId: A.id, acid: true });
        for (const r of combat) prop('tanque', r.x + r.w / 2, r.floorTop, { roto: true });
        break;
      case 'garganta':  // tejido que late: paredes con pulso y espasmos
        for (const r of L.rooms) for (let i = 0; i < 3; i++) prop('carne', r.x + rng.range(40, r.w - 40), r.y + rng.range(30, r.h - 60), { s: rng.range(0.8, 1.6) });
        break;
      case 'venas':     // bosque de venas colgantes
        for (const r of L.rooms) for (let i = 0; i < 5; i++) prop('vena', r.x + rng.range(20, r.w - 20), r.y + 34, { len: rng.range(80, 260) });
        break;
    }
    // Subdescenso secreto antes de un jefe: sala oculta de preparación con conducto a la antesala
    L.prep = null;
    if (o.extract === false) {
      const sec = L.rooms.find(r => r.type === 'secret');
      if (sec) L.prep = { roomId: sec.id, x: sec.x + sec.w / 2, y: sec.floorTop, to: { x: A.x + 90, y: fl - C.PH } };
    }
  }

  function roomIdAt(L, x, y) {
    const gx = Math.floor(x / (RW * TS)), gy = Math.floor(y / (RH * TS));
    const a = L.arena;
    if (x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h) return a.id;
    if (gx < 0 || gy < 0 || gx >= L.GC || gy >= L.GR) return -1;
    return L.grid[gy][gx];
  }

  return { generate, roomIdAt };
});
