/* LEVIATHAN - Física compartida (determinista). La MISMA función simula al jugador en el
   servidor (autoridad) y en el cliente (predicción + reconciliación).
   Incluye coyote time, jump buffering, salto variable, doble salto, dash con i-frames,
   agacharse (cobertura) y atravesar plataformas. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./constants'));
  else { root.LV = root.LV || {}; root.LV.Phys = factory(root.LV.C); }
})(typeof self !== 'undefined' ? self : this, function (C) {
  const TS = C.TILE;
  const B = C.B;
  const CHUNK = 256;

  function tileAt(L, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= L.tw || ty >= L.th) return 1;
    return L.tiles[ty * L.tw + tx];
  }
  function isSolid(v) { return v === 1 || v === 3; }

  function buildCoverGrid(L) {
    L.coverGrid = new Map();
    L.coverById = new Map();
    for (const cv of L.covers) {
      L.coverById.set(cv.id, cv);
      const c0 = Math.floor(cv.x / CHUNK), c1 = Math.floor((cv.x + cv.w) / CHUNK);
      for (let c = c0; c <= c1; c++) {
        if (!L.coverGrid.has(c)) L.coverGrid.set(c, []);
        L.coverGrid.get(c).push(cv);
      }
    }
  }

  function coverHit(L, x, y, w, h) {
    if (!L.coverGrid) return null;
    const c0 = Math.floor(x / CHUNK), c1 = Math.floor((x + w) / CHUNK);
    for (let c = c0; c <= c1; c++) {
      const arr = L.coverGrid.get(c);
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const cv = arr[i];
        if (!cv.alive) continue;
        if (x < cv.x + cv.w && x + w > cv.x && y < cv.y + cv.h && y + h > cv.y) return cv;
      }
    }
    return null;
  }

  function tilesHit(L, x, y, w, h) {
    const x0 = Math.floor(x / TS), x1 = Math.floor((x + w - 0.001) / TS);
    const y0 = Math.floor(y / TS), y1 = Math.floor((y + h - 0.001) / TS);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (isSolid(tileAt(L, tx, ty))) return true;
    return false;
  }

  function rectHitsSolid(L, x, y, w, h) {
    if (tilesHit(L, x, y, w, h)) return true;
    return coverHit(L, x, y, w, h) !== null;
  }

  function pointSolid(L, x, y) {
    return isSolid(tileAt(L, Math.floor(x / TS), Math.floor(y / TS)));
  }

  function blockedY(L, b, ny, dy, dropping) {
    if (rectHitsSolid(L, b.x, ny, b.w, b.h)) return true;
    if (dy > 0 && !dropping) {
      const oldBottom = b.y + b.h, newBottom = ny + b.h;
      const ty = Math.floor((newBottom - 0.001) / TS);
      const top = ty * TS;
      if (oldBottom <= top + 0.01 && newBottom > top) {
        const x0 = Math.floor(b.x / TS), x1 = Math.floor((b.x + b.w - 0.001) / TS);
        for (let tx = x0; tx <= x1; tx++) if (tileAt(L, tx, ty) === 2) return true;
      }
    }
    return false;
  }

  // Mueve un cuerpo AABB con sub-pasos. Devuelve bits: 1=chocó X, 2=chocó Y abajo (suelo), 4=chocó Y arriba
  function moveBody(L, b, dx, dy, dropping) {
    let res = 0;
    let rem = dx;
    while (rem !== 0) {
      const s = Math.abs(rem) > 4 ? Math.sign(rem) * 4 : rem;
      if (rectHitsSolid(L, b.x + s, b.y, b.w, b.h)) {
        const sg = Math.sign(s); let m = Math.abs(s);
        while (m > 0) {
          const st = Math.min(0.5, m) * sg;
          if (rectHitsSolid(L, b.x + st, b.y, b.w, b.h)) break;
          b.x += st; m -= Math.abs(st);
        }
        res |= 1; break;
      }
      b.x += s; rem -= s;
    }
    rem = dy;
    while (rem !== 0) {
      const s = Math.abs(rem) > 4 ? Math.sign(rem) * 4 : rem;
      if (blockedY(L, b, b.y + s, s, dropping)) {
        const sg = Math.sign(s); let m = Math.abs(s);
        while (m > 0) {
          const st = Math.min(0.5, m) * sg;
          if (blockedY(L, b, b.y + st, st, dropping)) break;
          b.y += st; m -= Math.abs(st);
        }
        res |= sg > 0 ? 2 : 4; break;
      }
      b.y += s; rem -= s;
    }
    return res;
  }

  function onOneWay(L, b) {
    const ty = Math.floor((b.y + b.h + 1) / TS);
    const x0 = Math.floor(b.x / TS), x1 = Math.floor((b.x + b.w - 0.001) / TS);
    let plat = false;
    for (let tx = x0; tx <= x1; tx++) {
      const v = tileAt(L, tx, ty);
      if (isSolid(v)) return false;
      if (v === 2) plat = true;
    }
    return plat && !coverHit(L, b.x, b.y + b.h, b.w, 2);
  }

  // Plataformas móviles: posición pura en función del tiempo (idéntica en cliente y servidor, cero red)
  function moverPos(m, t) {
    const s = (1 - Math.cos(Math.PI * 2 * (t / m.period + m.phase))) / 2;
    return { x: m.x + m.dx * s, y: m.y + m.dy * s };
  }

  function riderCheck(L, p, dt) {
    if (p.dropT > 0 || p.vy < 0) return;
    const t = L.time || 0;
    for (let i = 0; i < L.movers.length; i++) {
      const m = L.movers[i];
      const c = moverPos(m, t);
      if (p.x + p.w <= c.x || p.x >= c.x + m.w) continue;
      const bottom = p.y + p.h;
      if (bottom >= c.y - 2 && bottom <= c.y + Math.max(10, p.vy * dt + 10)) {
        if (rectHitsSolid(L, p.x, c.y - p.h, p.w, p.h)) continue;
        p.y = c.y - p.h; p.vy = 0; p.onGround = true; p.ride = i;
        return;
      }
    }
  }

  function carryRider(L, p, dt) {
    if (p.ride === undefined || p.ride < 0 || !L.movers) return;
    const m = L.movers[p.ride];
    if (!m) { p.ride = -1; return; }
    const t = L.time || 0;
    const a = moverPos(m, t - dt), c = moverPos(m, t);
    if (p.x + p.w <= a.x - 2 || p.x >= a.x + m.w + 2 || Math.abs(p.y + p.h - a.y) > 3) { p.ride = -1; return; }
    moveBody(L, p, c.x - a.x, 0, true);
    if (!rectHitsSolid(L, p.x, c.y - p.h, p.w, p.h)) p.y = c.y - p.h;
    else p.ride = -1;
  }

  function approach(v, t, d) { return v < t ? Math.min(v + d, t) : Math.max(v - d, t); }

  function makePlayerBody(x, y) {
    return {
      x, y, w: C.PW, h: C.PH, vx: 0, vy: 0, onGround: false, coyote: 0, jumpBuf: 0,
      airJumps: C.AIR_JUMPS, dashT: 0, dashCd: 0, dashDir: 1, prevB: 0, crouch: false,
      dropT: 0, facing: 1, ctrl: true, speedMul: 1, ride: -1, ads: false
    };
  }

  // Simula un frame de input del jugador. Devuelve bits de eventos: 1 salto, 2 doble salto, 4 dash, 8 aterrizaje
  function stepPlayer(L, p, b, dt) {
    let ev = 0;
    if (!p.ctrl) b = b & (B.L | B.R); // derribado: solo se arrastra
    const pressed = b & ~p.prevB;
    p.prevB = b;
    if (rectHitsSolid(L, p.x, p.y, p.w, p.h)) p.y -= 2; // anti-atasco
    if (L.movers) carryRider(L, p, dt);

    p.dashCd = Math.max(0, p.dashCd - dt);
    if (pressed & B.JUMP) p.jumpBuf = C.JUMP_BUFFER; else p.jumpBuf = Math.max(0, p.jumpBuf - dt);
    if (p.onGround) { p.coyote = C.COYOTE; p.airJumps = C.AIR_JUMPS; }
    else p.coyote = Math.max(0, p.coyote - dt);
    p.dropT = Math.max(0, p.dropT - dt);

    // Agacharse (cobertura balística)
    const wantCrouch = p.ctrl && (b & B.D) && p.onGround && p.dashT <= 0;
    if (wantCrouch && !p.crouch) {
      p.y += C.PH - C.PH_CROUCH; p.h = C.PH_CROUCH; p.crouch = true;
    } else if (!wantCrouch && p.crouch) {
      const ny = p.y - (C.PH - C.PH_CROUCH);
      if (!rectHitsSolid(L, p.x, ny, p.w, C.PH)) { p.y = ny; p.h = C.PH; p.crouch = false; }
    }

    const dir = ((b & B.R) ? 1 : 0) - ((b & B.L) ? 1 : 0);
    if (dir !== 0) p.facing = dir;

    if ((pressed & B.DASH) && p.dashCd <= 0 && !p.crouch && p.ctrl) {
      p.dashT = C.DASH_TIME; p.dashCd = C.DASH_CD * (p.dashCdMul || 1);
      p.dashDir = dir !== 0 ? dir : p.facing; p.vy = 0; ev |= 4;
    }

    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = p.dashDir * C.DASH_SPEED;
      p.vy = 0;
      if (p.dashT <= 0) p.vx = p.dashDir * C.RUN;
    } else {
      const aiming = p.ads && (b & B.ALT);
      const spd = C.RUN * (p.crouch ? 0.3 : 1) * (p.ctrl ? 1 : 0.18) * (p.speedMul || 1) * (aiming ? 0.55 : 1);
      const target = dir * spd;
      const acc = p.onGround ? (dir === 0 ? C.DECEL_GROUND : C.ACC_GROUND) : C.ACC_AIR;
      p.vx = approach(p.vx, target, acc * dt);

      if (p.jumpBuf > 0 && p.ctrl) {
        if ((b & B.D) && p.onGround && onOneWay(L, p)) {
          p.dropT = C.DROP_TIME; p.jumpBuf = 0;
          if (p.crouch) { p.y -= C.PH - C.PH_CROUCH; p.h = C.PH; p.crouch = false; }
        } else if (p.coyote > 0 && !p.crouch) {
          p.vy = -C.JUMP_V; p.coyote = 0; p.jumpBuf = 0; p.onGround = false; ev |= 1;
        } else if (p.airJumps > 0 && !p.onGround) {
          p.vy = -C.AIR_JUMP_V; p.airJumps--; p.jumpBuf = 0; ev |= 2;
        }
      }
      let g = C.GRAVITY * (p.gravMul || 1);   // mutación de sala (servidor y predicción comparten el valor)
      if (!(b & B.JUMP) && p.vy < 0) g *= C.JUMP_CUT_GRAVITY;
      p.vy = Math.min(p.vy + g * dt, C.MAX_FALL);
    }

    const wasGround = p.onGround;
    const r = moveBody(L, p, p.vx * dt, p.vy * dt, p.dropT > 0);
    if (r & 1) { if (p.dashT > 0) p.dashT = 0; p.vx = 0; }
    if (r & 2) { p.onGround = true; p.vy = 0; } else p.onGround = false;
    if (r & 4) p.vy = 0;
    if (!p.onGround) p.ride = -1;
    if (L.movers) riderCheck(L, p, dt);
    if (p.ride >= 0) { p.coyote = C.COYOTE; p.airJumps = C.AIR_JUMPS; }
    if (!wasGround && p.onGround) ev |= 8;
    return ev;
  }

  // Cuerpo con gravedad genérico (enemigos, NPCs, pickups)
  function stepGroundBody(L, e, dt) {
    e.vy = Math.min(e.vy + C.GRAVITY * dt, C.MAX_FALL);
    const r = moveBody(L, e, e.vx * dt, e.vy * dt, false);
    if (r & 2) { e.onGround = true; e.vy = 0; } else e.onGround = false;
    if (r & 4) e.vy = 0;
    if (r & 1) e.hitWall = true; else e.hitWall = false;
    return r;
  }

  function stepFlyBody(L, e, dt) {
    const r = moveBody(L, e, e.vx * dt, e.vy * dt, true);
    if (r & 1) e.vx *= -0.3;
    if (r & 6) e.vy *= -0.3;
    return r;
  }

  // Raycast DDA sobre tiles (línea de visión). Devuelve true si hay visión libre.
  function lineOfSight(L, x0, y0, x1, y1, checkCovers) {
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const steps = Math.ceil(dist / 12);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x0 + dx * t, y = y0 + dy * t;
      if (pointSolid(L, x, y)) return false;
      if (checkCovers && coverHit(L, x - 1, y - 1, 2, 2)) return false;
    }
    return true;
  }

  // Distancia hasta el primer tile sólido a lo largo de un rayo
  function rayLength(L, x0, y0, ang, maxLen) {
    const cx = Math.cos(ang), cy = Math.sin(ang);
    for (let d = 0; d < maxLen; d += 8) {
      if (pointSolid(L, x0 + cx * d, y0 + cy * d)) return d;
    }
    return maxLen;
  }

  return {
    tileAt, isSolid, buildCoverGrid, coverHit, rectHitsSolid, tilesHit, pointSolid, moveBody,
    stepPlayer, stepGroundBody, stepFlyBody, makePlayerBody, lineOfSight, rayLength, onOneWay, moverPos
  };
});
