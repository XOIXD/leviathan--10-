/* LEVIATHAN - Arte de armas en alta resolución y camuflajes por geometría.
   Cada arma se dibuja a 4x (S) en coordenadas lógicas y se muestra a escala 1/S: el tamaño en
   pantalla no cambia, pero el detalle sí (biseles, remaches, cantos, ópticas).
   Un camuflaje sólo se pinta sobre las superficies "pintables" de SU arma (máscara por geometría)
   y después se aplica el sombreado y los detalles: el patrón respeta volúmenes y piezas. */
G.WeaponArt = (function () {
  const S = 4;
  const SCALE = 1 / S;
  // Tamaños lógicos (idénticos a las texturas antiguas: el anclaje y el retroceso no cambian)
  const SIZE = { pistol: [30, 16], rifle: [42, 14], katana: [48, 10], axe: [54, 30], cannon: [50, 18], smg: [34, 14], shotgun: [46, 12], sniper: [58, 13], lmg: [52, 18], dagas: [26, 8], cetro: [50, 16], clavos: [30, 16] };
  const KEY = { pistol: 'w_pistol', rifle: 'w_rifle', katana: 'w_katana', axe: 'w_axe', cannon: 'w_cannon', smg: 'w_smg', shotgun: 'w_shotgun', sniper: 'w_sniper', lmg: 'w_lmg', dagas: 'w_dagas', cetro: 'w_cetro', clavos: 'w_clavos' };

  const css = (c, a) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a === undefined ? 1 : a})`;
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  // Gradiente vertical de volumen (luz arriba, sombra abajo) sobre un rectángulo
  function vol(c, x, y, w, h, base, hi, lo) {
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, hi); g.addColorStop(0.35, base); g.addColorStop(1, lo);
    c.fillStyle = g; c.fillRect(x, y, w, h);
  }
  const rivet = (c, x, y) => { c.fillStyle = 'rgba(0,0,0,.6)'; c.beginPath(); c.arc(x + 0.12, y + 0.12, 0.45, 0, 6.3); c.fill(); c.fillStyle = 'rgba(200,215,230,.75)'; c.beginPath(); c.arc(x, y, 0.32, 0, 6.3); c.fill(); };

  // ---------------------------------------------------------------- geometría por arma
  // base(c): silueta y materiales · mask(c): trazado de superficies pintables · detail(c): sombreado/piezas encima
  const ARMS = {
    pistol: {
      base(c) {
        vol(c, 4, 1, 24, 5, '#2a3038', '#4a5562', '#161a20');            // corredera
        vol(c, 4, 5.6, 22, 2.6, '#1d2228', '#2e3640', '#111418');        // armazón
        c.fillStyle = '#14181d'; c.beginPath(); c.moveTo(4.5, 7.6); c.lineTo(11.5, 7.6); c.lineTo(9.6, 16); c.lineTo(3.2, 16); c.closePath(); c.fill(); // empuñadura
        c.fillStyle = '#0e1114'; c.fillRect(27.2, 2.2, 2.8, 2.4);          // boca
      },
      mask(c) {
        c.rect(4, 1, 23.2, 5);
        c.moveTo(4.5, 7.6); c.lineTo(11.5, 7.6); c.lineTo(9.6, 16); c.lineTo(3.2, 16); c.closePath();
      },
      detail(c) {
        c.fillStyle = 'rgba(255,255,255,.28)'; c.fillRect(4, 1, 23.2, 0.35);
        c.fillStyle = 'rgba(0,0,0,.45)'; for (let x = 6; x < 13; x += 1.1) c.fillRect(x, 1.6, 0.45, 3.6);   // estrías de la corredera
        c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(15, 3.2, 6, 0.4); c.fillRect(4, 5.6, 22, 0.3);
        c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 0.3;
        for (let y = 9; y < 15.5; y += 1.2) { c.beginPath(); c.moveTo(4.6 - (y - 9) * 0.15, y); c.lineTo(10.6 - (y - 9) * 0.22, y); c.stroke(); } // grabado de agarre
        c.fillStyle = '#39d7ff'; c.fillRect(20, 0.4, 2.6, 0.9); c.fillStyle = 'rgba(57,215,255,.35)'; c.fillRect(19.4, 0, 3.8, 1.6);   // mira
        c.fillStyle = '#ffb020'; c.fillRect(8, 9, 1.6, 2.6);              // indicador de carga
        c.strokeStyle = '#0c0e11'; c.lineWidth = 0.5; c.beginPath(); c.arc(12.5, 9.2, 1.7, 0, Math.PI); c.stroke(); // guardamonte
        rivet(c, 24.6, 6.9);
      }
    },
    rifle: {
      base(c) {
        c.fillStyle = '#1a1e24'; c.beginPath(); c.moveTo(0, 4); c.lineTo(11, 3.4); c.lineTo(11, 9.6); c.lineTo(1.2, 10.4); c.closePath(); c.fill(); // culata
        vol(c, 10, 2, 24, 7.4, '#232a32', '#3c4754', '#12161b');          // cajón
        vol(c, 34, 3.8, 8, 3.2, '#2c343e', '#4a5664', '#161a20');         // cañón
        c.fillStyle = '#181c22'; c.beginPath(); c.moveTo(16, 9.4); c.lineTo(21.6, 9.4); c.lineTo(22.6, 14); c.lineTo(17.4, 14); c.closePath(); c.fill(); // cargador
      },
      mask(c) {
        c.moveTo(0, 4); c.lineTo(11, 3.4); c.lineTo(11, 9.6); c.lineTo(1.2, 10.4); c.closePath();
        c.rect(10, 2, 24, 7.4);
        c.moveTo(16, 9.4); c.lineTo(21.6, 9.4); c.lineTo(22.6, 14); c.lineTo(17.4, 14); c.closePath();
      },
      detail(c) {
        c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(10, 2, 24, 0.35); c.fillRect(0, 4, 11, 0.3);
        c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(10, 5.4, 24, 0.3); c.fillRect(1, 7.2, 9, 0.3);
        for (let x = 24; x < 33; x += 1.6) { c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(x, 6.2, 0.8, 2.4); }  // ventilación del guardamanos
        c.fillStyle = '#0c0f13'; c.fillRect(40.4, 3.4, 1.6, 4);                                             // bocacha
        c.fillStyle = '#10141a'; rr(c, 13.6, -0.1, 9, 2.4, 0.6); c.fill();                                  // óptica
        const g = c.createLinearGradient(14, 0, 22, 0); g.addColorStop(0, '#39d7ff'); g.addColorStop(1, '#bff6ff');
        c.fillStyle = g; c.fillRect(21.2, 0.3, 1.2, 1.6);
        c.fillStyle = '#ffb020'; c.fillRect(26, 3.6, 3.6, 1.2);
        c.fillStyle = 'rgba(0,0,0,.45)'; for (let y = 10.6; y < 13.6; y += 1) c.fillRect(17.6, y, 4.2, 0.3); // estrías del cargador
        rivet(c, 12, 7.8); rivet(c, 31.6, 3.3);
      }
    },
    katana: {
      base(c) {
        vol(c, 0, 3, 10, 4, '#1c1c1c', '#333', '#0d0d0d');                // tsuka
        vol(c, 10, 0.8, 3, 8.4, '#a37c0e', '#f0c84a', '#5a4206');         // tsuba
        c.fillStyle = '#b8c4cf'; c.beginPath(); c.moveTo(13, 3); c.lineTo(44, 3); c.lineTo(48, 5); c.lineTo(44, 7); c.lineTo(13, 7); c.closePath(); c.fill(); // hoja
      },
      mask(c) {
        // Cuerpo de la hoja (sin el filo: el filo afilado siempre queda brillante) + envoltura
        c.moveTo(13, 3); c.lineTo(44, 3); c.lineTo(46.4, 4.2); c.lineTo(13, 5.6); c.closePath();
        c.rect(0.4, 3.2, 9.4, 3.6);
      },
      detail(c) {
        // Filo pulido y canal (bo-hi)
        const e = c.createLinearGradient(0, 5.4, 0, 7); e.addColorStop(0, 'rgba(255,255,255,.95)'); e.addColorStop(1, 'rgba(160,240,255,.6)');
        c.fillStyle = e; c.beginPath(); c.moveTo(13, 5.6); c.lineTo(46.4, 4.2); c.lineTo(48, 5); c.lineTo(44, 7); c.lineTo(13, 7); c.closePath(); c.fill();
        c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(14, 3.7, 26, 0.45);
        c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(13, 3, 31, 0.3);
        // Ito (envoltura en rombos) y menuki
        c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 0.35;
        for (let x = 0.5; x < 10; x += 1.6) { c.beginPath(); c.moveTo(x, 3.2); c.lineTo(x + 0.8, 5); c.lineTo(x, 6.8); c.stroke(); }
        c.fillStyle = 'rgba(255,220,120,.6)'; c.fillRect(4.6, 4.6, 1.2, 0.8);
        c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(10, 0.8, 0.5, 8.4);
        c.fillStyle = '#c8cdd2'; c.fillRect(13, 2.6, 1.4, 4.8);           // habaki
      }
    },
    axe: {
      base(c) {
        vol(c, 0, 13, 36, 5, '#3a2a1a', '#5a4430', '#1e140b');             // mango
        c.fillStyle = '#4e5662'; c.beginPath(); c.moveTo(30, 2); c.lineTo(52, 0); c.quadraticCurveTo(56, 15, 52, 30); c.lineTo(30, 28); c.closePath(); c.fill(); // cabeza
      },
      mask(c) {
        c.moveTo(30, 2); c.lineTo(48.6, 0.6); c.quadraticCurveTo(53.6, 15, 48.6, 29.4); c.lineTo(30, 28); c.closePath();
        c.rect(0, 13, 30, 5);
      },
      detail(c) {
        // Filo pulido
        const e = c.createLinearGradient(48, 0, 55, 0); e.addColorStop(0, 'rgba(200,212,224,.9)'); e.addColorStop(1, 'rgba(255,255,255,1)');
        c.fillStyle = e; c.beginPath(); c.moveTo(48, 1); c.quadraticCurveTo(54, 15, 48, 29); c.lineTo(52, 30); c.quadraticCurveTo(56, 15, 52, 0); c.closePath(); c.fill();
        // Volumen de la cabeza: luz arriba-izquierda, sombra abajo
        const v = c.createLinearGradient(30, 0, 30, 30); v.addColorStop(0, 'rgba(255,255,255,.22)'); v.addColorStop(0.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.45)');
        c.fillStyle = v; c.beginPath(); c.moveTo(30, 2); c.lineTo(48, 1); c.quadraticCurveTo(53, 15, 48, 29); c.lineTo(30, 28); c.closePath(); c.fill();
        // Mecanismo de transformación
        c.fillStyle = '#20252c'; rr(c, 31, 10.4, 12, 9.2, 1.2); c.fill();
        c.fillStyle = '#ff6a00'; c.fillRect(34, 12.6, 7, 1.2); c.fillRect(34, 16.2, 7, 1.2);
        c.fillStyle = 'rgba(255,106,0,.35)'; c.fillRect(33.4, 12, 8.2, 5.8);
        rivet(c, 32.6, 4.4); rivet(c, 32.6, 25.6); rivet(c, 44.2, 4); rivet(c, 44.2, 26);
        // Grip del mango
        c.fillStyle = 'rgba(0,0,0,.45)'; for (let x = 2; x < 14; x += 1.4) c.fillRect(x, 13, 0.6, 5);
        c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(0, 13, 30, 0.4);
      }
    },
    cannon: {
      base(c) {
        vol(c, 0, 7, 14, 5, '#3a2a1a', '#5a4430', '#1e140b');
        c.fillStyle = '#434b56'; rr(c, 12, 2, 32, 14, 3); c.fill();
        vol(c, 40, 3.6, 10, 10.8, '#262c34', '#3e4855', '#121519');
      },
      mask(c) { rr(c, 12, 2, 32, 14, 3); },
      detail(c) {
        const v = c.createLinearGradient(0, 2, 0, 16); v.addColorStop(0, 'rgba(255,255,255,.25)'); v.addColorStop(0.4, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.5)');
        c.fillStyle = v; rr(c, 12, 2, 32, 14, 3); c.fill();
        c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(12, 8.8, 32, 0.4);
        for (let x = 22; x < 38; x += 2.2) { c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(x, 3.4, 1, 3.6); }  // disipadores
        c.fillStyle = '#ff6a00'; c.fillRect(16, 11, 16, 1.4); c.fillStyle = 'rgba(255,106,0,.35)'; c.fillRect(15, 10.2, 18, 3);
        c.fillStyle = '#0a0c0f'; c.beginPath(); c.arc(48.4, 9, 3, 0, 6.3); c.fill();                     // boca de metralla
        c.fillStyle = 'rgba(255,140,40,.8)'; c.beginPath(); c.arc(48.4, 9, 1.2, 0, 6.3); c.fill();
        rivet(c, 14.6, 4.4); rivet(c, 14.6, 13.6); rivet(c, 41.6, 5.2); rivet(c, 41.6, 12.8);
      }
    },
    clavos: {
      base(c) {
        vol(c, 3, 2, 22, 6, '#6a5a3a', '#8a7650', '#3a2e1a');                   // carcasa amarilla gastada
        c.fillStyle = '#2a2a2a'; c.beginPath(); c.moveTo(6, 8); c.lineTo(12, 8); c.lineTo(10, 16); c.lineTo(4, 16); c.closePath(); c.fill();
        c.fillStyle = '#444'; c.fillRect(25, 3.6, 5, 2.8);
      },
      mask(c) { c.rect(3, 2, 22, 6); },
      detail(c) {
        c.fillStyle = 'rgba(120,60,20,.7)'; c.fillRect(8, 3, 4, 2); c.fillRect(17, 5, 5, 2);                 // óxido
        c.fillStyle = '#9a9a9a'; for (let i = 0; i < 4; i++) c.fillRect(13 + i * 2, 8, 0.6, 3);            // clavos en el cargador
        c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 0.4; c.beginPath(); c.moveTo(14, 2); c.lineTo(16, 5); c.lineTo(15, 7.6); c.stroke(); // grieta
        c.fillStyle = '#1a1a1a'; c.fillRect(5, 9, 6, 1.4);                                                   // cinta aislante
      }
    },
    // ---- Arsenal ampliado
    smg: {
      base(c) {
        vol(c, 6, 2.4, 22, 6, '#232a32', '#3c4754', '#12161b');
        vol(c, 28, 4, 6, 2.4, '#2c343e', '#4a5664', '#161a20');
        c.fillStyle = '#181c22'; c.fillRect(0, 4, 7, 2); c.fillRect(0, 4, 2, 5);
        c.fillStyle = '#14181d'; c.beginPath(); c.moveTo(14, 8.4); c.lineTo(18, 8.4); c.lineTo(17.2, 14); c.lineTo(14.6, 14); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(8, 8.4); c.lineTo(11.4, 8.4); c.lineTo(10.4, 12.6); c.lineTo(7.4, 12.6); c.closePath(); c.fill();
      },
      mask(c) { c.rect(6, 2.4, 22, 6); c.moveTo(14, 8.4); c.lineTo(18, 8.4); c.lineTo(17.2, 14); c.lineTo(14.6, 14); c.closePath(); },
      detail(c) {
        c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(6, 2.4, 22, 0.35);
        c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(6, 5.4, 22, 0.3); for (let x = 20; x < 27; x += 1.4) c.fillRect(x, 3.2, 0.6, 1.8);
        c.fillStyle = '#39d7ff'; c.fillRect(12, 1.4, 4, 1); c.fillStyle = '#ffb020'; c.fillRect(22, 6.2, 2.4, 0.9);
        c.fillStyle = '#0c0f13'; c.fillRect(32.6, 3.6, 1.4, 3.2); rivet(c, 8, 4);
      }
    },
    shotgun: {
      base(c) {
        c.fillStyle = '#2a1d12'; c.beginPath(); c.moveTo(0, 3.6); c.lineTo(10, 3); c.lineTo(10, 8.4); c.lineTo(1, 9.4); c.closePath(); c.fill();
        vol(c, 10, 2.4, 14, 5.6, '#232a32', '#3c4754', '#12161b');
        vol(c, 24, 2.6, 22, 2.4, '#2c343e', '#4a5664', '#161a20');
        vol(c, 26, 5, 14, 2.6, '#3a2a1a', '#5a4430', '#1e140b');
        c.fillStyle = '#181c22'; c.fillRect(24, 5, 18, 1.2);
      },
      mask(c) { c.moveTo(0, 3.6); c.lineTo(10, 3); c.lineTo(10, 8.4); c.lineTo(1, 9.4); c.closePath(); c.rect(10, 2.4, 14, 5.6); },
      detail(c) {
        c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(10, 2.4, 14, 0.35); c.fillRect(24, 2.6, 22, 0.3);
        c.fillStyle = 'rgba(0,0,0,.55)'; for (let x = 27; x < 39; x += 1.6) c.fillRect(x, 5.2, 0.6, 2.2);
        c.fillStyle = '#ff3b3b'; c.fillRect(44.6, 1.8, 1, 0.9); c.fillStyle = '#c99a10'; c.fillRect(15, 4.6, 3, 1.2);
        c.fillStyle = '#0c0f13'; c.fillRect(45, 2.6, 1, 2.4); rivet(c, 12, 6.4);
      }
    },
    sniper: {
      base(c) {
        c.fillStyle = '#1a1e24'; c.beginPath(); c.moveTo(0, 4); c.lineTo(12, 4); c.lineTo(14, 9); c.lineTo(9, 11); c.lineTo(1.5, 11); c.closePath(); c.fill();
        vol(c, 12, 4, 20, 5.4, '#232a32', '#3c4754', '#12161b');
        vol(c, 32, 5, 24, 2, '#2c343e', '#4a5664', '#161a20');
        c.fillStyle = '#0e1114'; c.fillRect(52, 4.2, 6, 3.6);
        c.fillStyle = '#14181d'; c.fillRect(19, 9.4, 4.2, 3.4);
      },
      mask(c) { c.moveTo(0, 4); c.lineTo(12, 4); c.lineTo(14, 9); c.lineTo(9, 11); c.lineTo(1.5, 11); c.closePath(); c.rect(12, 4, 20, 5.4); c.rect(32, 5, 18, 2); },
      detail(c) {
        c.fillStyle = '#10141a'; rr(c, 15, 0, 14, 3.4, 1.2); c.fill();
        const g = c.createLinearGradient(15, 0, 29, 0); g.addColorStop(0, '#0a2a3a'); g.addColorStop(1, '#5ae8ff');
        c.fillStyle = g; c.fillRect(27.6, 0.6, 1.4, 2.2); c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(15, 0, 14, 0.4);
        c.fillStyle = '#20252c'; c.fillRect(17, 3.2, 1.4, 1); c.fillRect(25, 3.2, 1.4, 1);
        c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(12, 4, 20, 0.35);
        c.fillStyle = 'rgba(0,0,0,.6)'; for (let x = 53; x < 58; x += 1.4) c.fillRect(x, 4.4, 0.5, 3.2);
        c.strokeStyle = '#1a1e24'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(34, 7); c.lineTo(32, 12.6); c.moveTo(36, 7); c.lineTo(38, 12.6); c.stroke();
        rivet(c, 14, 7.4);
      }
    },
    lmg: {
      base(c) {
        c.fillStyle = '#1a1e24'; c.beginPath(); c.moveTo(0, 5); c.lineTo(10, 4.4); c.lineTo(10, 11); c.lineTo(1, 12); c.closePath(); c.fill();
        vol(c, 10, 3, 24, 8.6, '#232a32', '#3c4754', '#12161b');
        vol(c, 34, 5, 18, 3, '#2c343e', '#4a5664', '#161a20');
        vol(c, 34, 4.2, 12, 4.6, '#20252c', '#3a434e', '#101317');
        c.fillStyle = '#14181d'; rr(c, 14, 11.4, 10, 6.4, 1.4); c.fill();
      },
      mask(c) { c.moveTo(0, 5); c.lineTo(10, 4.4); c.lineTo(10, 11); c.lineTo(1, 12); c.closePath(); c.rect(10, 3, 24, 8.6); rr(c, 14, 11.4, 10, 6.4, 1.4); },
      detail(c) {
        c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(10, 3, 24, 0.4);
        c.fillStyle = 'rgba(0,0,0,.6)'; for (let x = 35.4; x < 45.6; x += 1.6) c.fillRect(x, 4.6, 0.8, 3.8);
        c.fillStyle = '#c99a10'; for (let i = 0; i < 4; i++) c.fillRect(24.4 + i * 1.6, 8.6 + (i & 1) * 0.4, 1, 2.4);
        c.fillStyle = '#20252c'; c.fillRect(18, 1.2, 8, 1.8); c.fillStyle = '#ff6a00'; c.fillRect(24.6, 1.4, 1.2, 1.2);
        c.strokeStyle = '#1a1e24'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(46, 8); c.lineTo(43, 16); c.moveTo(48, 8); c.lineTo(51, 16); c.stroke();
        c.fillStyle = '#0c0f13'; c.fillRect(50.6, 4.6, 1.4, 3.8);
        rivet(c, 12, 5); rivet(c, 31.6, 5); rivet(c, 12, 9.6); rivet(c, 31.6, 9.6);
      }
    },
    dagas: {
      base(c) {
        c.fillStyle = 'rgba(184,196,207,.45)'; c.beginPath(); c.moveTo(4, 5.8); c.lineTo(18, 6.2); c.lineTo(21, 6.8); c.lineTo(18, 7.4); c.lineTo(4, 7.8); c.closePath(); c.fill();
        vol(c, 0, 2.6, 6, 2.8, '#1c1c1c', '#333', '#0d0d0d');
        c.fillStyle = '#7a8692'; c.fillRect(6, 1.2, 1.6, 5.6);
        c.fillStyle = '#b8c4cf'; c.beginPath(); c.moveTo(7.6, 2.4); c.lineTo(22, 3.2); c.lineTo(26, 4); c.lineTo(22, 4.8); c.lineTo(7.6, 5.6); c.closePath(); c.fill();
      },
      mask(c) { c.moveTo(7.6, 2.4); c.lineTo(22, 3.2); c.lineTo(24, 3.7); c.lineTo(7.6, 4.4); c.closePath(); c.rect(0.4, 2.8, 5.4, 2.4); },
      detail(c) {
        c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.moveTo(7.6, 4.6); c.lineTo(24, 3.9); c.lineTo(26, 4); c.lineTo(22, 4.8); c.lineTo(7.6, 5.6); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 0.3; for (let x = 0.6; x < 6; x += 1.2) { c.beginPath(); c.moveTo(x, 2.8); c.lineTo(x + 0.6, 5.2); c.stroke(); }
        c.fillStyle = '#7dff4f'; c.fillRect(6.2, 3.6, 1.2, 0.8);
      }
    },
    cetro: {
      base(c) {
        vol(c, 0, 6.4, 34, 3.2, '#5a4410', '#c99a10', '#2a1e06');
        c.fillStyle = '#3a2a08'; for (let x = 4; x < 32; x += 7) c.fillRect(x, 6, 1.6, 4);
        c.fillStyle = '#c99a10'; c.beginPath(); c.moveTo(34, 2); c.lineTo(40, 6); c.lineTo(46, 0.6); c.lineTo(50, 8); c.lineTo(46, 15.4); c.lineTo(40, 10); c.lineTo(34, 14); c.closePath(); c.fill();
      },
      mask(c) { c.rect(0, 6.4, 34, 3.2); c.moveTo(34, 2); c.lineTo(40, 6); c.lineTo(46, 0.6); c.lineTo(50, 8); c.lineTo(46, 15.4); c.lineTo(40, 10); c.lineTo(34, 14); c.closePath(); },
      detail(c) {
        const g = c.createRadialGradient(43, 8, 0, 43, 8, 4); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#ff3df0'); g.addColorStop(1, 'rgba(255,61,240,0)');
        c.fillStyle = g; c.beginPath(); c.arc(43, 8, 4, 0, 6.3); c.fill();
        c.fillStyle = 'rgba(255,240,180,.5)'; c.fillRect(0, 6.4, 34, 0.4);
        c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 0.4; c.beginPath(); c.moveTo(34, 2); c.lineTo(40, 6); c.lineTo(46, 0.6); c.lineTo(50, 8); c.lineTo(46, 15.4); c.lineTo(40, 10); c.lineTo(34, 14); c.closePath(); c.stroke();
        rivet(c, 36, 8);
      }
    }
  };

  // ---------------------------------------------------------------- patrones de camuflaje
  // Cada patrón rellena el rectángulo completo; la máscara del arma recorta dónde se ve.
  const PAT = {
    none() {},
    urbano(c, w, h, k, R) {         // pixelado digital agrupado (manchas de 3-4 tonos)
      c.fillStyle = css(k[0]); c.fillRect(0, 0, w, h);
      const cell = 1.25;
      for (let pass = 1; pass < k.length; pass++) {
        for (let i = 0; i < (w * h) / 9; i++) {
          let x = Math.floor(R() * w / cell) * cell, y = Math.floor(R() * h / cell) * cell;
          const n = 2 + Math.floor(R() * 5);
          c.fillStyle = css(k[pass]);
          for (let j = 0; j < n; j++) { c.fillRect(x, y, cell, cell); if (R() < 0.5) x += cell * (R() < 0.5 ? 1 : -1); else y += cell * (R() < 0.5 ? 1 : -1); }
        }
      }
    },
    tigre(c, w, h, k, R) {          // rayas onduladas en diagonal
      c.fillStyle = css(k[0]); c.fillRect(0, 0, w, h);
      c.fillStyle = css(k[1]);
      for (let x = -h; x < w + h; x += 3 + R() * 3) {
        const t = 0.6 + R() * 1.1;
        c.beginPath(); c.moveTo(x, 0);
        for (let y = 0; y <= h; y += 1) c.lineTo(x + y * 0.7 + Math.sin(y * 0.9 + x) * 0.8, y);
        for (let y = h; y >= 0; y -= 1) c.lineTo(x + y * 0.7 + t + Math.sin(y * 0.9 + x + 1) * 0.6, y);
        c.fill();
      }
    },
    acro(c, w, h, k, R) {           // negro mate + trazos vectoriales de neón con resplandor
      c.fillStyle = css(k[0]); c.fillRect(0, 0, w, h);
      c.lineCap = 'square';
      for (let i = 0; i < Math.max(4, w / 4); i++) {
        const col = i % 3 === 2 ? k[2] : k[1];
        let x = R() * w, y = R() * h;
        c.beginPath(); c.moveTo(x, y);
        for (let s = 0; s < 3; s++) { if (s % 2) x += (R() - 0.3) * 9; else y += (R() - 0.5) * 6; c.lineTo(x, y); }
        c.strokeStyle = css(col, 0.35); c.lineWidth = 1.1; c.stroke();
        c.strokeStyle = css(col, 1); c.lineWidth = 0.35; c.stroke();
      }
      c.fillStyle = css(k[1], 0.9); for (let i = 0; i < w / 6; i++) c.fillRect(R() * w, R() * h, 0.6, 0.6);
    },
    oxido(c, w, h, k, R) {          // metal + manchas de óxido + rayones
      c.fillStyle = css(k[0]); c.fillRect(0, 0, w, h);
      for (let i = 0; i < (w * h) / 28; i++) {
        const x = R() * w, y = R() * h, r = 0.8 + R() * 3.2;
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, css(k[R() < 0.4 ? 2 : 1], 0.95)); g.addColorStop(1, css(k[1], 0));
        c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      c.strokeStyle = 'rgba(230,220,200,.35)'; c.lineWidth = 0.18;
      for (let i = 0; i < w / 3; i++) { const x = R() * w, y = R() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (R() - 0.5) * 6, y + (R() - 0.5) * 2); c.stroke(); }
      c.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < w * h / 6; i++) c.fillRect(R() * w, R() * h, 0.25, 0.25);
    },
    grabado(c, w, h, k, R) {        // pavonado + filigrana/circuito grabado con láser
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, css(k[0], 1)); g.addColorStop(1, css(k[0], 1));
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.strokeStyle = css(k[1], 0.95); c.lineWidth = 0.22;
      for (let i = 0; i < w / 3; i++) {
        const x = R() * w, y = R() * h, r = 0.8 + R() * 1.6;
        c.beginPath(); c.arc(x, y, r, R() * 6, R() * 6 + 3.5); c.stroke();          // volutas
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + (R() < 0.5 ? 3 : -3), y); c.lineTo(x + (R() < 0.5 ? 4 : -4), y + (R() < 0.5 ? 1.5 : -1.5)); c.stroke(); // trazas
      }
      c.fillStyle = css(k[1], 1); for (let i = 0; i < w / 4; i++) { c.beginPath(); c.arc(R() * w, R() * h, 0.28, 0, 6.3); c.fill(); }
    },
    hexa(c, w, h, k) {              // panal hexagonal
      c.fillStyle = css(k[0]); c.fillRect(0, 0, w, h);
      c.strokeStyle = css(k[1], 0.75); c.lineWidth = 0.22;
      const r = 1.3, dx = r * 1.732, dy = r * 1.5;
      for (let row = -1, y = 0; y < h + r; row++, y += dy) for (let x = (row & 1) ? dx / 2 : 0; x < w + r; x += dx) {
        c.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); c.stroke();
      }
    },
    carbono(c, w, h, k) {           // trenzado de carbono
      c.fillStyle = css(k[0]); c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
        const on = ((Math.floor(x) + Math.floor(y)) & 1);
        c.fillStyle = on ? css(k[1], 1) : css(k[0], 1); c.fillRect(x, y, 1, 1);
        c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(x, y + (on ? 0 : 0.5), 1, 0.25);
      }
    },
    hamon(c, w, h, k) {             // acero con línea de temple ondulada (katana)
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, css(k[2])); g.addColorStop(1, css(k[0]));
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = css(k[1], 0.85);
      c.beginPath(); c.moveTo(0, h);
      for (let x = 0; x <= w; x += 0.5) c.lineTo(x, 4.6 + Math.sin(x * 0.9) * 0.35 + Math.sin(x * 2.3) * 0.18);
      c.lineTo(w, h); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,.35)'; for (let x = 13; x < w; x += 1.3) c.fillRect(x, 4.3 + Math.sin(x) * 0.3, 0.3, 0.3); // nie
    },
    damasco(c, w, h, k) {           // capas plegadas onduladas
      c.fillStyle = css(k[0]); c.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        c.strokeStyle = css(i % 2 ? k[1] : k[2], 0.75); c.lineWidth = 0.28;
        c.beginPath();
        for (let x = 0; x <= w; x += 0.5) { const y = i * 0.45 + Math.sin(x * 0.45 + i * 0.6) * 1.2 + Math.sin(x * 0.13) * 1.6; c[x ? 'lineTo' : 'moveTo'](x, y); }
        c.stroke();
      }
    },
    cristal(c, w, h, k, R) {        // facetas de cristal refractivo
      c.fillStyle = css(k[1]); c.fillRect(0, 0, w, h);
      for (let i = 0; i < w * h / 6; i++) {
        const x = R() * w, y = R() * h, s = 1 + R() * 3;
        c.fillStyle = css(R() < 0.5 ? k[0] : k[2], 0.25 + R() * 0.55);
        c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s * 0.7, y); c.lineTo(x, y + s * 0.6); c.lineTo(x - s * 0.6, y); c.closePath(); c.fill();
      }
    },
    venas(c, w, h, k, R) {          // tejido orgánico con venas luminosas
      c.fillStyle = css(k[0]); c.fillRect(0, 0, w, h);
      for (let i = 0; i < Math.max(5, w / 5); i++) {
        let x = R() * w, y = R() * h;
        c.beginPath(); c.moveTo(x, y);
        for (let s = 0; s < 6; s++) { x += (R() - 0.3) * 4; y += (R() - 0.5) * 3; c.lineTo(x, y); }
        c.strokeStyle = css(k[1], 0.45); c.lineWidth = 1; c.stroke();
        c.strokeStyle = css(k[2] || k[1], 0.95); c.lineWidth = 0.25; c.stroke();
      }
    },
    escamas(c, w, h, k) {           // escamas superpuestas
      c.fillStyle = css(k[0]); c.fillRect(0, 0, w, h);
      for (let row = 0, y = 0; y < h + 2; row++, y += 1.2) for (let x = (row & 1) ? 1 : 0; x < w + 2; x += 2) {
        const g = c.createLinearGradient(0, y - 1, 0, y + 1); g.addColorStop(0, css(k[1], 0.9)); g.addColorStop(1, css(k[0], 0.9));
        c.fillStyle = g; c.beginPath(); c.arc(x, y, 1.05, 0, Math.PI); c.fill();
      }
    },
    peligro(c, w, h, k) {           // rayas de peligro industriales
      c.fillStyle = css(k[0]); c.fillRect(0, 0, w, h);
      c.fillStyle = css(k[1]);
      for (let x = -h; x < w + h; x += 4) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 2, 0); c.lineTo(x + 2 + h, h); c.lineTo(x + h, h); c.closePath(); c.fill(); }
      c.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < w; i += 1.7) c.fillRect((i * 7.3) % w, (i * 3.1) % h, 0.5, 0.3);
    },
    glitch(c, w, h, k, R) {         // fragmento de la verdad: blanco con cortes de señal
      c.fillStyle = css(k[0]); c.fillRect(0, 0, w, h);
      for (let i = 0; i < w / 2; i++) { c.fillStyle = css(i % 2 ? k[1] : k[2], 0.85); c.fillRect(R() * w, Math.floor(R() * h / 0.6) * 0.6, 1 + R() * 6, 0.45); }
    }
  };

  // ---------------------------------------------------------------- render
  function paint(c, arch, skin) {
    const A = ARMS[arch];
    c.save(); c.scale(S, S);
    A.base(c);
    if (skin && skin.pattern && skin.pattern !== 'none' && PAT[skin.pattern]) {
      const [w, h] = SIZE[arch];
      c.save();
      c.beginPath(); A.mask(c); c.clip();
      PAT[skin.pattern](c, w, h, skin.colors || [0x777777, 0xffffff], rng(hash(skin.id + ':' + arch)));
      c.restore();
    }
    A.detail(c);
    // Oclusión de contorno: borde oscuro de 1 subpíxel (lee como volumen, no como recorte de cartón)
    c.restore();
    outline(c);
  }
  function outline(c) {
    const W = c.canvas.width, H = c.canvas.height;
    const src = c.getImageData(0, 0, W, H), d = src.data, out = c.createImageData(W, H), o = out.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] > 20) continue;
      let near = 0;
      if (x > 0 && d[i - 1] > 60) near++;
      if (x < W - 1 && d[i + 7] > 60) near++;
      if (y > 0 && d[i - W * 4 + 3] > 60) near++;
      if (y < H - 1 && d[i + W * 4 + 3] > 60) near++;
      if (near) { o[i] = 6; o[i + 1] = 8; o[i + 2] = 12; o[i + 3] = 200; }
    }
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
    tmp.getContext('2d').putImageData(out, 0, 0);
    c.save(); c.globalCompositeOperation = 'destination-over'; c.drawImage(tmp, 0, 0); c.restore();
  }

  function make(scene, key, arch, skin) {
    if (scene.textures.exists(key)) return key;
    const [w, h] = SIZE[arch];
    const t = scene.textures.createCanvas(key, w * S, h * S);
    paint(t.getContext(), arch, skin);
    t.refresh();
    return key;
  }

  // Acabado por id (catálogo fijo o temporada)
  function find(id) { return LV.Catalog.weaponSkins.find(x => x.id === id) || LV.Campaign.seasonCamo(id); }
  // ¿Puede este acabado ir en esta arma? (cañón = segundo modo del hacha)
  function fits(skin, arch) { return !skin.arch || skin.arch === arch || (skin.arch === 'axe' && arch === 'cannon'); }

  // Clave de textura para (arma, acabado); se genera bajo demanda y queda en caché
  function key(scene, arch, skinId) {
    const base = KEY[arch];
    if (!skinId || skinId === 'estandar') return make(scene, base, arch, null);
    const sk = find(skinId);
    if (!sk || !fits(sk, arch)) return make(scene, base, arch, null);
    return make(scene, base + '__' + skinId, arch, sk);
  }
  // Pre-genera las armas base (el resto se crea la primera vez que alguien las equipa)
  function generate(scene) { for (const a of Object.keys(ARMS)) key(scene, a, 'estandar'); }

  return { S, SCALE, generate, key, find, fits, paint };
})();
