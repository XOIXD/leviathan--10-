/* LEVIATHAN - Punto de entrada del cliente: configuración de Phaser 3, login y cambio de fases. */
(function () {
  // Tipografía militar condensada (Bahnschrift viene con Windows 10/11); respaldo seguro en otros sistemas
  G.FONT = '"Bahnschrift SemiCondensed", Bahnschrift, "Agency FB", "Arial Narrow", "Segoe UI", Arial, sans-serif';
  // --- Parche de rendimiento (anti micro-tirones) ---
  // En Phaser, Text.setColor/setFontSize re-rasterizan el canvas y re-suben la textura
  // a la GPU AUNQUE el valor no cambie. El HUD los llama en cada fotograma: eso eran
  // varias subidas de textura por frame. Sólo se re-renderiza si el valor cambia.
  (function patchText() {
    const TP = Phaser.GameObjects.Text.prototype;
    const setColor = TP.setColor, setFontSize = TP.setFontSize;
    TP.setColor = function (c) { if (this.style && this.style.color === c) return this; return setColor.call(this, c); };
    TP.setFontSize = function (sz) {
      const v = typeof sz === 'number' ? sz + 'px' : sz;
      if (this.style && this.style.fontSize === v) return this;
      return setFontSize.call(this, sz);
    };
  })();
  // Aísla excepciones por fotograma: un error en un frame se registra (limitado) y el
  // juego sigue corriendo en lugar de congelarse con el bucle de Phaser detenido.
  G.safe = function (tag, fn, ctx, a, b) {
    try { return fn.call(ctx, a, b); } catch (e) {
      const now = Date.now();
      G._errs = G._errs || {};
      if (!G._errs[tag] || now - G._errs[tag] > 3000) {
        G._errs[tag] = now; console.error('[' + tag + ']', e); G.errCount = (G.errCount || 0) + 1;
        G.errLog = G.errLog || []; G.errLog.push(tag + ': ' + (e && e.stack || e)); if (G.errLog.length > 20) G.errLog.shift();
      }
    }
  };
  // Red de seguridad del bucle principal: si cualquier sistema de Phaser lanza una excepción,
  // el requestAnimationFrame se perdería y la imagen quedaría congelada con el audio sonando.
  // Aquí se captura, se registra y el siguiente fotograma se dibuja con normalidad.
  (function patchLoop() {
    const step = Phaser.Game.prototype.step;
    Phaser.Game.prototype.step = function (time, delta) {
      try { step.call(this, time, delta); }
      catch (e) { G.safe('Loop', () => { throw e; }); }
    };
  })();
  const config = {
    type: Phaser.AUTO,
    parent: 'game',
    width: 1280,
    height: 720,
    backgroundColor: '#04070b',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    fps: { target: 60 },
    render: { antialias: true, powerPreference: 'high-performance', batchSize: 4096 },
    disableContextMenu: true,
    scene: [G.BootScene, G.HubScene, G.RunScene, G.UIScene]
  };
  G.game = new Phaser.Game(config);

  G.enterPhase = function (phase) {
    const sm = G.game.scene;
    sm.stop('Hub');
    sm.stop('Run');
    sm.start(phase === 'run' ? 'Run' : 'Hub');
    sm.bringToTop('UI');
    if (G.UI) G.UI.setMode(phase);
  };

  G.Net.on('welcome', (w) => G.enterPhase(w.phase));
  G.Net.on('run', () => G.enterPhase('run'));
  G.Net.on('hub', () => G.enterPhase('hub'));

  const $ = (id) => document.getElementById(id);
  const form = $('loginForm'), btn = $('joinBtn'), regBtn = $('regBtn'), err = $('loginErr');
  const nameInput = $('callsign'), passInput = $('password'), remember = $('remember');
  const menu = $('menu'), menuBtn = $('menuBtn'), mMsg = $('mMsg');
  btn.disabled = true; regBtn.disabled = true;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
  };
  nameInput.value = store.get('lv_name') || '';
  const params = new URLSearchParams(location.search);
  if (params.get('name')) nameInput.value = params.get('name');
  if (params.get('pass')) passInput.value = params.get('pass');
  let inGame = false, tab = store.get('lv_tab') || 'story', listTimer = 0;

  function showLogin(msg) {
    inGame = false;
    menu.classList.add('hidden'); menuBtn.classList.add('hidden');
    $('login').style.display = 'flex';
    err.textContent = msg || '';
    btn.disabled = false; regBtn.disabled = false;
    stopGame();
  }
  function stopGame() {
    const sm = G.game.scene;
    sm.stop('Hub'); sm.stop('Run');
    const cl = $('chatLog'); if (cl) cl.textContent = '';
    if (G.UI) G.UI.setMode('none');
  }
  function fillMenu() {
    const p = G.Net.profile;
    if (!p) return;
    $('mUser').textContent = p.name + (p.admin ? ' [ADMIN]' : '') + (p.gold ? ' 🏅' : '');
    $('mUser').title = p.gold ? 'Medalla de oro: completaste la campaña del Leviathan' : ''; $('mCred').textContent = p.credits; $('mCycle').textContent = p.cycle ? p.cycle.solo : 0;
    const total = LV.Campaign.COUNTS.solo.reduce((a, b) => a + b, 0);
    $('mStory').textContent = `Progreso: ${Math.min(p.story.solo, total)}/${total} descensos · bucles completados: ${p.cycle.solo}${p.cycle.solo >= LV.Campaign.TRUE_CYCLES ? ' · FINAL VERDADERO alcanzado' : ''}`;
    const done = Math.min(p.story.solo, total);
    $('mStoryBar').innerHTML = Array.from({ length: total }, (_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('');
    // Temporada vigente (NOVA): nombre, crónica, progreso del pase y días restantes
    const se = p.season, sp = p.seasonProg;
    if (se) {
      const end = new Date(); end.setMonth(end.getMonth() + 1, 1); end.setHours(0, 0, 0, 0);
      const days = Math.max(0, Math.ceil((end - new Date()) / 86400000));
      const tiers = LV.Campaign.SEASON_TIERS, max = tiers[tiers.length - 1].pts, pts = sp ? sp.pts : 0;
      const camo = LV.Campaign.seasonCamo(se.id);
      $('mSeasonName').textContent = se.name;
      $('mSeasonDesc').textContent = `${se.desc}. ${camo ? 'Exclusivo: ' + camo.name + '.' : ''}`;
      $('mSeasonBar').style.width = Math.min(100, pts / max * 100) + '%';
      $('mSeasonPts').textContent = `${pts}/${max} PUNTOS · CIERRA EN ${days} DÍA${days === 1 ? '' : 'S'} · RECLAMA CON NOVA`;
    }
  }
  function setTab(t) {
    tab = t; store.set('lv_tab', t);
    for (const b of document.querySelectorAll('#menu .tab')) b.classList.toggle('on', b.dataset.tab === t);
    for (const sec of document.querySelectorAll('#menu section')) sec.classList.toggle('hidden', sec.dataset.sec !== t);
    refreshLists();
  }
  // --- Audio de interfaz y ambiente (el navegador exige un gesto antes de sonar)
  const menusOpen = () => !menu.classList.contains('hidden') || $('login').style.display !== 'none';
  document.addEventListener('pointerdown', () => { G.Sfx.init(); if (menusOpen()) G.Sfx.ambient(true); }, true);
  document.addEventListener('mouseover', (e) => { if (e.target.closest && e.target.closest('.j, .tab')) G.Sfx.play('ui_hover'); });
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.j, .tab')) G.Sfx.play('ui_ok'); });
  // --- Chat táctico (ENTER abre; el teclado del juego se suspende mientras escribes)
  const chat = $('chat'), chatIn = $('chatIn');
  const chatLog = $('chatLog');
  G.Voice.bind();
  const closeChat = () => { chatLog.classList.remove('open'); chat.classList.add('hidden'); chatIn.value = ''; chatIn.blur(); G.game.input.keyboard.enabled = true; G.game.canvas.focus(); };
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !inGame || !chat.classList.contains('hidden') || (G.UI && (G.UI.dlg || G.UI.cine))) return;
    e.preventDefault(); chatLog.classList.add('open'); chat.classList.remove('hidden'); G.game.input.keyboard.enabled = false; chatIn.focus();
  });
  chatIn.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') closeChat();
    else if (e.key === 'Enter') { const t = chatIn.value.trim(); if (t) G.Net.act({ type: 'chat', text: t }); closeChat(); }
  });
  G.Net.on('chat', (c) => {
    if (!Array.isArray(c)) return;
    const line = document.createElement('div');
    const b = document.createElement('b'); b.textContent = c[1] + ': ';
    line.appendChild(b); line.appendChild(document.createTextNode(c[2]));   // textContent: sin inyección de HTML
    chatLog.appendChild(line);
    while (chatLog.children.length > 8) chatLog.removeChild(chatLog.firstChild);
    setTimeout(() => line.classList.add('old'), 10000);
    G.Sfx.play('chat');
  });
  function showMenu(msg) {
    inGame = false;
    $('login').style.display = 'none';
    menu.classList.remove('hidden'); menuBtn.classList.add('hidden');
    mMsg.textContent = msg || '';
    fillMenu(); setTab(tab);
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
  async function refreshLists() {
    if (menu.classList.contains('hidden') || tab === 'story') return;
    const list = await G.Net.listRooms(tab);
    const body = $(tab === 'coop' ? 'mCoopList' : tab === 'tdm' ? 'mTdmList' : 'mBrList');
    if (!list.length) { body.innerHTML = `<tr><td colspan="7" class="dim">No hay salas públicas · crea una</td></tr>`; return; }
    body.innerHTML = list.map((r, i) => tab === 'tdm'
      ? `<tr><td>${i + 1}</td><td>${esc(r.code)}</td><td>${esc(r.host)}</td><td>${r.players}/${r.max}</td><td>${esc(r.label)}</td><td>${r.phase === 'hub' ? 'LOBBY' : 'EN COMBATE'}</td><td><button class="j small" data-join="${esc(r.code)}" ${r.joinable ? '' : 'disabled'}>UNIRSE</button></td></tr>`
      : tab === 'coop'
      ? `<tr><td>${i + 1}</td><td>${esc(r.code)}</td><td>${esc(r.host)}</td><td>${r.players}/${r.max}</td><td>${r.phase === 'hub' ? 'EN LA CELDA' : 'EN DESCENSO'}</td><td>${esc(r.label)}</td><td><button class="j small" data-join="${esc(r.code)}" ${r.joinable ? '' : 'disabled'}>UNIRSE</button></td></tr>`
      : `<tr><td>${i + 1}</td><td>${esc(r.code)}</td><td>${esc(r.host)}</td><td>${r.players}/${r.max}</td><td>${r.teamSize}</td><td>${r.phase === 'hub' ? 'LOBBY' : 'EN BATALLA'}</td><td><button class="j small" data-join="${esc(r.code)}" ${r.joinable ? '' : 'disabled'}>UNIRSE</button></td></tr>`).join('');
  }
  async function joinRoom(opts) {
    mMsg.textContent = '';
    for (const b of document.querySelectorAll('#menu button')) b.disabled = true;
    const res = await G.Net.join(opts);
    for (const b of document.querySelectorAll('#menu button')) b.disabled = false;
    if (!res.ok) { mMsg.textContent = res.msg || 'No se pudo entrar.'; refreshLists(); return; }
    inGame = true;
    G.Sfx.ambient(false);
    menu.classList.add('hidden'); menuBtn.classList.remove('hidden');
    G.game.canvas.focus();
    if (G.Net.profile && !G.Net.profile.seen.intro) G.UI.playCine('intro', () => G.Net.act({ type: 'seen', id: 'intro' }));
  }

  document.querySelectorAll('#menu .tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('mStoryGo').addEventListener('click', () => joinRoom({ mode: 'solo', create: true }));
  $('mCoopCreate').addEventListener('click', () => joinRoom({ mode: 'coop', create: true, public: $('mCoopPublic').checked }));
  $('mCodeGo').addEventListener('click', () => { const c = $('mCode').value.trim(); if (c) joinRoom({ mode: 'coop', room: c }); });
  // 5 contra 5: selector de los 15 mapas
  const mapSel = $('mMap');
  mapSel.innerHTML = '<option value="-1">Mapa aleatorio</option>' + LV.TDMGen.MAPS.map((m, i) => `<option value="${i}">${i + 1}. ${esc(m.name)}</option>`).join('');
  const mapDesc = () => { const m = LV.TDMGen.MAPS[+mapSel.value]; $('mMapDesc').textContent = m ? `${m.desc}.` : 'Se elige uno de los 15 mapas al azar.'; };
  mapSel.addEventListener('change', mapDesc); mapDesc();
  $('mTdmCreate').addEventListener('click', () => joinRoom({ mode: 'tdm', create: true, public: $('mTdmPublic').checked, map: +mapSel.value }));
  $('mBrCreate').addEventListener('click', () => joinRoom({ mode: 'br', create: true, public: $('mBrPublic').checked, teamSize: +$('mTeam').value }));
  menu.addEventListener('click', (e) => { const t = e.target.closest('[data-join]'); if (t && !t.disabled) joinRoom({ mode: tab, room: t.dataset.join }); });
  $('mLogout').addEventListener('click', () => { store.set('lv_token', null); if (G.Net.socket) G.Net.socket.disconnect(); G.Net.session = null; showLogin(''); });
  menuBtn.addEventListener('click', async () => { menuBtn.disabled = true; await G.Net.leave(); stopGame(); menuBtn.disabled = false; showMenu(''); });
  listTimer = setInterval(refreshLists, 3000);

  G.Net.on('profile', () => { if (!inGame) fillMenu(); });
  G.Net.on('disconnect', () => { if (inGame && G.UI) G.UI.banner('RECONECTANDO…', 'Tu exotraje se mantiene en la sala 25 s', '#ffb020', 9999); });
  G.Net.on('reconnected', () => { if (G.UI) G.UI.banner('CONEXIÓN RESTABLECIDA', '', '#7dff4f', 2); });
  G.Net.on('leftroom', (m) => { stopGame(); showMenu(m); });
  G.Net.on('fatal', (m) => showLogin(m));

  function fail(msg) {
    err.textContent = msg || 'Error de conexión.';
    btn.disabled = false; regBtn.disabled = false;
  }
  function enter(mode, token) {
    const name = nameInput.value.trim();
    if (mode !== 'token' && name.length < 3) return fail('El usuario debe tener al menos 3 caracteres.');
    if (mode !== 'token' && passInput.value.length < 4) return fail('La contraseña debe tener al menos 4 caracteres.');
    btn.disabled = true; regBtn.disabled = true; err.textContent = '';
    G.Sfx.init();
    G.Net.connect({ mode, user: name, pass: passInput.value, token }, (res) => {
      if (!res || !res.ok) {
        if (mode === 'token') store.set('lv_token', null);
        if (G.Net.socket) { G.Net.socket.removeAllListeners(); G.Net.socket.disconnect(); G.Net.socket = null; }
        return fail(mode === 'token' ? '' : (res && res.msg));
      }
      if (res.name) { store.set('lv_name', res.name); nameInput.value = res.name; }
      store.set('lv_token', remember.checked && res.token ? res.token : null);
      passInput.value = '';
      showMenu('');
      const pm = params.get('mode'), pr = params.get('room');
      if (pm === 'solo') joinRoom({ mode: 'solo', create: true });
      else if (pr) joinRoom({ mode: pm || 'coop', room: pr, teamSize: +(params.get('ts') || 5) });
    });
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); if (G.bootReady) enter('login'); });
  regBtn.addEventListener('click', () => { if (G.bootReady) enter('register'); });
  G.onBoot = () => {
    btn.disabled = false; regBtn.disabled = false;
    if (params.get('auto') === '1') enter(params.get('reg') === '1' ? 'register' : 'login');
    else if (store.get('lv_token')) enter('token', store.get('lv_token'));
  };
})();
