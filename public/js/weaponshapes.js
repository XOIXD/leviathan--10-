/* LEVIATHAN - Siluetas paramétricas para el arsenal extendido (30 armas).
   Cada arma declara su forma (shape) en el catálogo: tipo + longitud + piezas (culata, cargador, mira,
   guarda, curvatura, cabeza…). Aquí se convierte en tres capas (base · máscara de camuflaje · detalle)
   que WeaponArt pinta a 4x. Dos armas del mismo tipo nunca comparten silueta porque sus parámetros difieren. */
G.WeaponShapes = (function () {
  const vol = (c, x, y, w, h, base, hi, lo) => { const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, hi); g.addColorStop(0.35, base); g.addColorStop(1, lo); c.fillStyle = g; c.fillRect(x, y, w, h); };
  const metal = (c, x, y, w, h) => vol(c, x, y, w, h, '#262d36', '#46525f', '#12161b');
  const steel = (c, x, y, w, h) => vol(c, x, y, w, h, '#a8b4c0', '#e8eef4', '#5a6672');
  const wood = (c, x, y, w, h) => vol(c, x, y, w, h, '#5a3a1e', '#7a5430', '#2a1a0a');
  const hl = (c, x, y, w) => { c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(x, y, w, 0.35); };
  const dk = (c, x, y, w) => { c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(x, y, w, 0.35); };
  const scopeAt = (c, x, w) => { c.fillStyle = '#10141a'; c.fillRect(x, 0, w, 2.6); const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#0a2a3a'); g.addColorStop(1, '#5ae8ff'); c.fillStyle = g; c.fillRect(x + w - 1.4, 0.4, 1.4, 1.8); hl(c, x, 0, w); };

  // Cada constructor devuelve { size:[w,h], base, mask, detail }
  const T = {
    gunlike(s, kind) {        // rifle · smg · sniper · lmg · shotgun · pistol · tube · bowgun
      const L = s.len, H = kind === 'lmg' || s.heavy ? 18 : kind === 'pistol' ? 16 : 14;
      const top = kind === 'pistol' ? 1 : 3, bodyH = kind === 'lmg' ? 8.6 : 6.4;
      const stockW = s.stock ? (s.stock === 2 ? 12 : 9) : (kind === 'pistol' ? 0 : 4);
      const recX = stockW, recW = Math.max(10, L * (kind === 'smg' ? 0.55 : 0.42)), barX = recX + recW;
      const magX = recX + recW * 0.35;
      return {
        size: [L, H],
        base(c) {
          if (stockW) { c.fillStyle = s.heavy || kind === 'shotgun' ? '#2a1d12' : '#1a1e24'; c.beginPath(); c.moveTo(0, top + 1); c.lineTo(stockW + 0.5, top); c.lineTo(stockW + 0.5, top + bodyH); c.lineTo(1, top + bodyH + 1); c.closePath(); c.fill(); }
          if (kind === 'tube') { metal(c, 2, top, L - 4, 7); c.fillStyle = '#0c0f13'; c.fillRect(L - 3, top - 0.5, 3, 8); return; }
          metal(c, recX, top, recW, bodyH);
          metal(c, barX, top + bodyH * 0.3, L - barX, kind === 'shotgun' ? 2.4 : 2);
          if (kind === 'shotgun') wood(c, barX + 2, top + bodyH * 0.6, (L - barX) * 0.5, 2.4);
          if (kind === 'bowgun') { c.strokeStyle = '#3a2a1a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(barX, top - 2); c.quadraticCurveTo(barX + 6, top + 3, barX, top + bodyH + 2); c.stroke(); }
          const m = s.mag;
          c.fillStyle = '#14181d';
          if (m === 'curva') { c.beginPath(); c.moveTo(magX, top + bodyH); c.lineTo(magX + 4, top + bodyH); c.quadraticCurveTo(magX + 6, top + bodyH + 4, magX + 3.4, top + bodyH + 6.6); c.lineTo(magX - 0.4, top + bodyH + 6); c.closePath(); c.fill(); }
          else if (m === 'recta') c.fillRect(magX, top + bodyH, 3.6, kind === 'smg' ? 7 : 5.6);
          else if (m === 'caja') { c.beginPath(); c.roundRect ? c.roundRect(magX - 1, top + bodyH, 9, 5.4, 1) : c.rect(magX - 1, top + bodyH, 9, 5.4); c.fill(); }
          else if (m === 'tambor') { c.beginPath(); c.arc(recX + 6, top + bodyH * 0.5, 3, 0, 6.3); c.fill(); }
          if (kind === 'pistol' || kind === 'smg') { c.fillStyle = '#14181d'; c.beginPath(); c.moveTo(recX + 1, top + bodyH); c.lineTo(recX + 5, top + bodyH); c.lineTo(recX + 3.6, H); c.lineTo(recX, H); c.closePath(); c.fill(); }
        },
        mask(c) { if (stockW) { c.moveTo(0, top + 1); c.lineTo(stockW + 0.5, top); c.lineTo(stockW + 0.5, top + bodyH); c.lineTo(1, top + bodyH + 1); c.closePath(); } c.rect(kind === 'tube' ? 2 : recX, top, kind === 'tube' ? L - 6 : recW, kind === 'tube' ? 7 : bodyH); },
        detail(c) {
          hl(c, recX, top, recW); dk(c, recX, top + bodyH * 0.55, recW);
          for (let x = barX - recW * 0.35; x < barX - 1; x += 1.5) { c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(x, top + 1.2, 0.6, bodyH * 0.4); }
          if (s.scope) scopeAt(c, recX + recW * 0.25, s.scope === 2 ? recW * 0.65 : recW * 0.4); else { c.fillStyle = '#39d7ff'; c.fillRect(recX + recW * 0.4, top - 1, 3, 1); }
          c.fillStyle = '#0c0f13'; c.fillRect(L - 1.4, top + bodyH * 0.25, 1.4, 3);
          if (kind === 'lmg' || kind === 'sniper') { c.strokeStyle = '#1a1e24'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(barX + 4, top + bodyH * 0.6); c.lineTo(barX + 2, H); c.moveTo(barX + 6, top + bodyH * 0.6); c.lineTo(barX + 8, H); c.stroke(); }
          if (kind === 'tube') { c.fillStyle = '#ff3b3b'; c.fillRect(6, top + 2.6, L - 14, 1); scopeAt(c, L * 0.4, 8); }
          c.fillStyle = '#ffb020'; c.fillRect(recX + recW * 0.7, top + bodyH * 0.3, 2.2, 0.9);
        }
      };
    },
    bladelike(s, kind) {      // sword · dagger · lance · glaive · whip
      const L = s.len, H = kind === 'lance' && s.shield ? 18 : s.broad ? 14 : kind === 'whip' ? 12 : 10;
      const mid = H / 2, hilt = kind === 'whip' ? 8 : kind === 'dagger' ? 6 : 10, guard = s.guard || 1;
      const bw = (s.broad ? 2 + s.broad : 1) * 1.6 + 2.2, curve = (s.curve || 0) * 3;
      const tipX = L - 1;
      const blade = (c) => { c.moveTo(hilt + guard, mid - bw / 2); c.quadraticCurveTo(hilt + (L - hilt) * 0.6, mid - bw / 2 - curve, tipX, mid - curve * 0.6); c.lineTo(tipX - 3, mid + bw / 2 - curve * 0.4); c.quadraticCurveTo(hilt + (L - hilt) * 0.5, mid + bw / 2 - curve * 0.5, hilt + guard, mid + bw / 2); c.closePath(); };
      return {
        size: [L, H],
        base(c) {
          vol(c, 0, mid - 1.6, hilt, 3.2, '#1c1c1c', '#333', '#0d0d0d');
          if (kind === 'whip') { c.strokeStyle = '#7a5430'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(hilt, mid); for (let x = hilt; x <= L; x += 2) c.lineTo(x, mid + Math.sin(x * 0.45) * 2.6 * (x / L)); c.stroke(); return; }
          if (kind === 'lance' || kind === 'glaive') {
            vol(c, hilt, mid - 1, L - hilt - 10, 2, '#3a3f46', '#5a626e', '#1a1e24');
            c.fillStyle = '#c0ccd8'; c.beginPath(); c.moveTo(L - 12, mid - 2.6); c.lineTo(L, mid); c.lineTo(L - 12, mid + 2.6); c.closePath(); c.fill();
            if (kind === 'glaive') { c.beginPath(); c.moveTo(L - 12, mid - 2); c.quadraticCurveTo(L - 16, mid - 7, L - 8, mid - 6); c.lineTo(L - 10, mid - 2); c.fill(); }
            if (s.shield) { vol(c, 2, 0, 9, H, '#3a4450', '#5a6a7a', '#1a2028'); }
            if (s.gun) metal(c, L - 22, mid + 1.2, 10, 2.4);
            return;
          }
          c.fillStyle = '#c99a10'; c.fillRect(hilt, mid - guard * 1.4 - 1, guard, guard * 2.8 + 2);
          c.fillStyle = '#b8c4cf'; c.beginPath(); blade(c); c.fill();
          if (s.twin) { c.fillStyle = 'rgba(184,196,207,.45)'; c.save(); c.translate(-3, 2.6); c.beginPath(); blade(c); c.fill(); c.restore(); }
        },
        mask(c) {
          if (kind === 'whip') { c.rect(0, mid - 1.6, hilt, 3.2); return; }
          if (kind === 'lance' || kind === 'glaive') { c.rect(hilt, mid - 1, L - hilt - 12, 2); if (s.shield) c.rect(2, 0, 9, H); return; }
          c.moveTo(hilt + guard, mid - bw / 2); c.quadraticCurveTo(hilt + (L - hilt) * 0.6, mid - bw / 2 - curve, tipX - 2, mid - curve * 0.6 - 0.4); c.lineTo(hilt + guard, mid + 0.2); c.closePath();
          c.rect(0.4, mid - 1.4, hilt - 0.8, 2.8);
        },
        detail(c) {
          if (kind === 'whip') { c.fillStyle = '#39d7ff'; for (let x = hilt + 6; x < L; x += 7) c.fillRect(x, mid + Math.sin(x * 0.45) * 2.6 * (x / L) - 0.4, 1, 0.8); return; }
          if (kind !== 'lance' && kind !== 'glaive') { c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.moveTo(hilt + guard, mid + bw / 2 - 0.6); c.quadraticCurveTo(hilt + (L - hilt) * 0.5, mid + bw / 2 - curve * 0.5 - 0.6, tipX - 3, mid + bw / 2 - curve * 0.4 - 0.6); c.lineTo(tipX, mid - curve * 0.6); c.lineTo(tipX - 3, mid + bw / 2 - curve * 0.4); c.quadraticCurveTo(hilt + (L - hilt) * 0.5, mid + bw / 2 - curve * 0.5, hilt + guard, mid + bw / 2); c.closePath(); c.fill(); }
          c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 0.3; for (let x = 0.6; x < hilt; x += 1.4) { c.beginPath(); c.moveTo(x, mid - 1.6); c.lineTo(x + 0.7, mid + 1.6); c.stroke(); }
          if (s.broad) { c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(hilt + guard + 2, mid - 0.3, (L - hilt) * 0.55, 0.6); }
          if (s.gun) { c.fillStyle = '#ff6a00'; c.fillRect(L - 20, mid + 1.6, 6, 0.8); }
        }
      };
    },
    hammer(s) {
      const L = s.len, hd = s.head, H = hd + 4;
      return {
        size: [L, H],
        base(c) { wood(c, 0, H / 2 - 1.4, L - hd * 0.6, 2.8); vol(c, L - hd, 2, hd, H - 4, '#4a525e', '#7a8696', '#20262e'); c.fillStyle = '#20262e'; c.fillRect(L - hd - 2, 1, 2, H - 2); },
        mask(c) { c.rect(L - hd, 2, hd, H - 4); },
        detail(c) { hl(c, L - hd, 2, hd); dk(c, L - hd, H - 3, hd); c.fillStyle = '#ff6a00'; c.fillRect(L - hd * 0.6, H / 2 - 1, hd * 0.3, 2); for (const y of [4, H - 5]) { c.fillStyle = '#9aa4b0'; c.beginPath(); c.arc(L - hd + 2, y, 0.8, 0, 6.3); c.fill(); } }
      };
    },
    bow(s) {
      const L = s.len, H = 18;
      return {
        size: [L, H],
        base(c) {
          if (s.cross) { wood(c, 0, H / 2 - 1.6, L - 8, 3.2); c.strokeStyle = '#2a2f36'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(L - 10, 1); c.quadraticCurveTo(L - 2, H / 2, L - 10, H - 1); c.stroke(); }
          else { c.strokeStyle = '#5a3a1e'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(L * 0.4, 0.5); c.quadraticCurveTo(L * 0.9, H / 2, L * 0.4, H - 0.5); c.stroke(); vol(c, L * 0.55, H / 2 - 2, 4, 4, '#2a1a0a', '#4a2a10', '#1a0a00'); }
          c.strokeStyle = 'rgba(230,230,230,.8)'; c.lineWidth = 0.4; c.beginPath(); c.moveTo(s.cross ? L - 10 : L * 0.4, 1); c.lineTo(s.cross ? L - 14 : L * 0.3, H / 2); c.lineTo(s.cross ? L - 10 : L * 0.4, H - 1); c.stroke();
          c.fillStyle = '#c8d0d8'; c.fillRect(s.cross ? 4 : L * 0.3, H / 2 - 0.3, s.cross ? L - 6 : L * 0.68, 0.6); c.beginPath(); c.moveTo(L, H / 2); c.lineTo(L - 3, H / 2 - 1.4); c.lineTo(L - 3, H / 2 + 1.4); c.fill();
        },
        mask(c) { if (s.cross) c.rect(0, H / 2 - 1.6, L - 8, 3.2); else c.rect(L * 0.55, H / 2 - 2, 4, 4); },
        detail(c) { c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(s.cross ? 0 : L * 0.55, H / 2 - 1.6, s.cross ? L - 8 : 4, 0.3); if (s.cross) scopeAt(c, 10, 8); }
      };
    },
    boot(s) {
      const L = s.len, H = 14;
      return {
        size: [L, H],
        base(c) { vol(c, 2, 0, 9, 10, '#5a3a1e', '#7a5430', '#2a1a0a'); vol(c, 2, 9, L - 2, 5, '#4a3018', '#6a4a28', '#1a0a00'); c.fillStyle = '#c99a10'; c.fillRect(2, 3, 9, 1); c.fillRect(2, 6, 9, 1); },
        mask(c) { c.rect(2, 0, 9, 9); },
        detail(c) { c.fillStyle = '#c99a10'; c.fillRect(L - 4, 10, 4, 3); hl(c, 2, 9, L - 2); }
      };
    }
  };
  const BUILD = {
    rifle: s => T.gunlike(s, 'rifle'), smg: s => T.gunlike(s, 'smg'), sniper: s => T.gunlike(s, 'sniper'), lmg: s => T.gunlike(s, 'lmg'),
    shotgun: s => T.gunlike(s, 'shotgun'), pistol: s => T.gunlike(s, 'pistol'), tube: s => T.gunlike(s, 'tube'), bowgun: s => T.gunlike(s, 'bowgun'),
    sword: s => T.bladelike(s, 'sword'), dagger: s => T.bladelike(s, 'dagger'), lance: s => T.bladelike(s, 'lance'), glaive: s => T.bladelike(s, 'glaive'), whip: s => T.bladelike(s, 'whip'),
    hammer: s => T.hammer(s), bow: s => T.bow(s), boot: s => T.boot(s)
  };
  // Registra en WeaponArt todas las armas del catálogo que traen forma
  function register(ARMS, SIZE, KEY) {
    for (const [arch, d] of Object.entries(LV.Catalog.arms)) {
      if (!d.shape || ARMS[arch] || !BUILD[d.shape.t]) continue;
      const def = BUILD[d.shape.t](d.shape);
      ARMS[arch] = def; SIZE[arch] = def.size; KEY[arch] = 'w_' + arch;
    }
  }
  return { register };
})();
