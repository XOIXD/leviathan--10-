/* LEVIATHAN - Contenido de diálogos inmersivos de la Celda de Despresurización.
   Cada nodo devuelve { line, options[] }. Las opciones navegan (go), ejecutan una acción
   autoritativa en el servidor (act), vuelven (back) o cierran (close). */
G.Dialogue = (function () {
  const Cat = LV.Catalog, Cmp = LV.Campaign;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const ALL_ARCH = ['pistol', 'rifle', 'katana', 'axe', 'smg', 'shotgun', 'sniper', 'lmg', 'dagas', 'cetro'];
  // Texto de pasivas de un exotraje
  const passText = (p) => !p ? 'Sin pasivas' : [p.hp && `${p.hp > 0 ? '+' : ''}${p.hp} vida`, p.armor && `-${Math.round(p.armor * 100)}% daño recibido`, p.speed && `${p.speed > 0 ? '+' : ''}${Math.round(p.speed * 100)}% velocidad`, p.dmg && `+${Math.round(p.dmg * 100)}% daño`, p.dash && `dash ${Math.round(p.dash * 100)}% más rápido`, p.gren && `+${p.gren} granadas`, p.stims && `+${p.stims} estimulante`, p.regen && 'regeneración'].filter(Boolean).join(' · ');
  const cr = (n) => `${n} ¢`;
  const matName = (k) => k === 'credits' ? 'biomasa' : Cmp.materials[k].name;
  const costText = (cost) => Object.entries(cost).map(([k, v]) => `${v} ${matName(k)}`).join(' · ');
  const canPay = (prof, cost) => Object.entries(cost).every(([k, v]) => (k === 'credits' ? prof.credits : prof.materials[k] || 0) >= v);

  const NPC = {
    tailor: {
      name: 'NOVA', title: 'Sastre de exotrajes · Coleccionista', color: 0xff4fd8, portrait: 'pt_tailor',
      greet: [
        'Otro cuerpo recién impreso. Quieto, déjame calibrar la luz de tu visor.',
        'Tu Núcleo volvió temblando por la ventilación. Tranquilo, aquí la armadura también habla por ti.',
        'El abismo no perdona, pero tampoco tiene buen gusto. Nosotros sí.'
      ],
      murmursLoop: ['…ya hemos tenido esta conversación…', '…el fuego vino de aquí, ¿lo recuerdas?…', '…NOVA no es un nombre, es una sigla…', '…cada bucle me cuesta más mentirte…'],
      murmurs: ['…canta más fuerte cuanto más bajas…', '…la Matriarca sueña con nosotros…', '…el Flujo tiene color de recuerdo…', '…¿alguien más oye el segundo latido?…']
    },
    mechanic: {
      name: 'RIVETS', title: 'Mecánica jefe · Exotrajes', color: 0xffb020, portrait: 'pt_mechanic',
      greet: [
        'Si vuelves con el exotraje fundido otra vez, te imprimo uno de cartón. ¿Qué ajustamos?',
        'Tráeme placas del Capataz y te blindo como a una caja fuerte.',
        'Cada tornillo que aprieto aquí es una bala que no te atraviesa allá abajo.'
      ],
      murmurs: ['¿Quién dejó Flujo en mi soldadora?', 'Placas, glándulas, colmillos… tráelo todo.', 'Esta impresora tiene más horas que yo.']
    },
    trafficker: {
      name: 'KAI "SOMBRA"', title: 'Traficante de armas · Forja', color: 0x5dff7a, portrait: 'pt_trafficker',
      greet: [
        'Shh. Biomasa por acero. Todo lo que vendo lo recogí de los caídos. Algunos eran tú.',
        'Katanas, rifles, hachas que se transforman. Y si traes partes de jefes, te forjo algo que no se vende.',
        'El armero del descenso reparte hierro al azar… a menos que alguien le susurre al oído.'
      ],
      murmurs: ['Biomasa fresca, pago bien.', 'Ese rifle era de un Núcleo con mala suerte.', 'No preguntes de dónde saco las glándulas.']
    },
    ranker: {
      name: 'B-0T', title: 'Registro de combate · Clasificación global', color: 0x7dff4f, portrait: 'pt_ranker',
      greet: ['¡Bip! Bienvenido, operador. Registro todas las bajas del refugio. Todas. Incluidas las tuyas.', 'Consultando la clasificación global… ¡bip-bop!'],
      murmurs: ['…bip…', '…K/D recalculado…'], murmursLoop: ['…ya registré este bucle…']
    },
    commander: {
      name: 'COMANDANTE VEX', title: 'Holograma de mando · Descensos', color: 0x39d7ff, portrait: 'pt_commander',
      greet: [
        'Unidad. El Leviathan se agi-agi-ta bajo nosotros. Señal inestable. Escuadrón: prepárense.',
        'Cuantos más Núcleos bajan, más fuerte responde la colmena. Coordinen o mueran juntos. Bueno, mueran y vuelvan.',
        'El elevador está caliente. Dime cuándo estás listo para el descenso.'
      ],
      murmurs: ['[ERROR 0x7F] …repito, descenso autorizado…', 'Directiva: purgar. Directiva: purgar.', 'Señal orbital… intermitente.']
    },
    board: {
      name: 'TABLERO TÁCTICO', title: 'Misiones diarias y contratos semanales', color: 0x7dff4f, portrait: 'pt_board',
      greet: ['> CONEXIÓN ESTABLECIDA. Objetivos del Mando cargados.']
    }
  };

  function myReady() { const r = G.Net.roster.get(G.Net.id); return r && r.ready; }
  function variant() { return G.Net.roster.size > 1 ? 'coop' : 'solo'; }

  const nodes = {
    // ------------------------------------------------------------ NOVA
    tailor_root() {
      return {
        line: pick(NPC.tailor.greet),
        options: [
          { label: 'Exotrajes', sub: 'Skins visuales para tu operador', go: 'tailor_skins' },
          { label: 'Estelas de neón', sub: 'Rastros de luz al moverte y hacer dash', go: 'tailor_trails' },
          { label: 'Acabados de armas', sub: 'Pistolas, rifles, katanas y hachas transformables', go: 'tailor_warch' },
          { label: 'Efectos de eliminación', sub: 'Lo que ve tu escuadrón cuando liquidas a un enemigo', go: 'tailor_fx' },
          { label: 'Pase de temporada', sub: (() => { const p = G.Net.profile, sp = p && p.seasonProg; return `${(p && p.season && p.season.name) || ''} · ${sp ? sp.pts : 0} puntos · recompensas exclusivas`; })(), go: 'tailor_season' },
          { label: 'Archivo de la verdad', sub: 'Lo que el láser orbital no pudo borrar', go: 'tailor_truth' },
          { label: '¿Qué hay allá abajo, Nova?', go: 'tailor_lore' },
          { label: '¿Hay piezas exclusivas?', go: 'tailor_info' },
          { label: 'Despedirse', close: true }
        ]
      };
    },
    tailor_season(prof) {
      const se = prof.season || {}, sp = prof.seasonProg || { pts: 0, claimed: [] };
      const camo = Cmp.seasonCamo(sp.id || se.id);
      const end = new Date(); end.setMonth(end.getMonth() + 1, 1); end.setHours(0, 0, 0, 0);
      const days = Math.max(0, Math.ceil((end - new Date()) / 86400000));
      return {
        line: `TEMPORADA: ${(se.name || '').toUpperCase()} · quedan ${days} día(s).\n${se.lore || ''}\nPuntos: ${sp.pts} (descenso +1 · victoria +2 · contrato +1). Lo que no reclames antes del cierre se pierde para siempre.`,
        options: Cmp.SEASON_TIERS.map((t, i) => {
          const got = sp.claimed.includes(i), can = sp.pts >= t.pts;
          const label = t.reward.camo && camo ? `${camo.name} · camuflaje exclusivo de ${({ pistol: 'pistola', rifle: 'rifle', katana: 'katana', axe: 'hacha' })[camo.arch]}` : t.label;
          return {
            label: `Nivel ${i + 1} · ${label}`, sub: `Requiere ${t.pts} puntos`,
            right: got ? '✓ OBTENIDO' : can ? 'RECLAMAR' : `${sp.pts}/${t.pts}`,
            rightColor: got ? '#5f8292' : can ? '#7dff4f' : '#ffd34a',
            disabled: got || !can, act: { type: 'seasonClaim', tier: i },
            preview: t.reward.camo && camo ? { arch: camo.arch, wskin: camo.id } : undefined
          };
        }).concat([{ label: 'Atrás', back: true }])
      };
    },
    tailor_warch(prof) {
      const ARCH = {};
      for (const k of ALL_ARCH) if (k !== 'cetro' || (prof.arms || []).includes('cetro')) ARCH[k] = Cat.archetypes[k];
      return {
        line: 'Cada arma tiene su propio catálogo de camuflajes, pintados sobre su geometría. Las piezas de maestría sirven para todas.',
        options: Object.entries(ARCH).map(([k, n]) => {
          const cur = G.WeaponArt.find(prof.wskins[k] || 'estandar');
          return { label: n, sub: `Acabado actual: ${cur ? cur.name : 'Estándar'}`, go: 'tailor_wskin_' + k, preview: { arch: k, wskin: prof.wskins[k] || 'estandar' } };
        }).concat([{ label: 'Atrás', back: true }])
      };
    },
    tailor_fx(prof) {
      return {
        line: 'Un final con estilo. Todo tu escuadrón verá estos efectos cuando liquides a un objetivo.',
        options: Cat.killFx.map(f => {
          const owned = prof.fxOwned.includes(f.id), eq = prof.fx === f.id;
          return {
            label: f.name, sub: f.desc,
            right: eq ? 'EQUIPADO' : owned ? 'EQUIPAR' : f.price < 0 ? 'EXCLUSIVO' : cr(f.price),
            rightColor: eq ? '#7dff4f' : owned ? '#39d7ff' : f.price < 0 ? '#b05cff' : (prof.credits >= f.price ? '#ffd34a' : '#ff6b6b'),
            disabled: eq || (!owned && f.price < 0), preview: { fx: f.id },
            act: owned ? { type: 'equipFx', id: f.id } : { type: 'buyFx', id: f.id }
          };
        }).concat([{ label: 'Atrás', back: true }])
      };
    },
    tailor_truth(prof) {
      const n = Math.min(prof.cycle.solo || 0, Cmp.truths.length);
      const opts = Cmp.truths.map((t, i) => i < n
        ? { label: t.title, sub: t.text.slice(0, 90) + (t.text.length > 90 ? '…' : ''), go: 'truth_' + i }
        : { label: `Fragmento ${['I', 'II', 'III', 'IV'][i]} · [CIFRADO]`, sub: `Completa ${i + 1} bucle${i ? 's' : ''} del Modo Historia`, disabled: true, right: 'BLOQUEADO', rightColor: '#ff6b6b' });
      return {
        line: n === 0 ? 'Aún no recuerdas nada, ¿verdad? Termina la campaña. El fuego del cielo… a veces deja cicatrices legibles.'
          : n >= Cmp.truths.length ? (prof.truthChoice ? `Ya decidiste: ${prof.truthChoice === 'romper' ? 'romper el bucle' : 'fundirte con el Leviathan'}. Y aún así seguimos aquí. Curioso.` : 'Ya lo sabes todo. Yo también lo sé. Ahora decide qué hacer conmigo.')
          : `Has sobrevivido a ${n} bucle${n > 1 ? 's' : ''}. Cada vez recuerdas un poco más. Cada vez yo… también.`,
        options: opts.concat([{ label: 'Atrás', back: true }])
      };
    },
    tailor_lore() {
      return {
        line: 'Cuatro capas. Fundición, laboratorios, cavernas… y el Corazón. Cuanto más bajas, más canta. No es un grito, ¿sabes? Es una canción de cuna. Las Cunas se llaman así por algo.',
        options: [{ label: 'Volver', back: true }]
      };
    },
    tailor_info() {
      return {
        line: 'Algunas piezas no se compran: se ganan. Completa las tres misiones diarias en un mismo día y te coso el "Operador Constante". Derriba a un jefe de capa desde el tablero y la "Corona Abisal" es tuya.',
        options: [{ label: 'Volver', back: true }]
      };
    },
    tailor_skins(prof) {
      return {
        line: 'Elige un exotraje. Lo verás puesto en el probador holográfico.',
        options: Cat.skins.map(s => {
          const owned = prof.skins.includes(s.id), eq = prof.skin === s.id;
          return {
            label: s.name + (s.frame && s.frame !== 'std' ? (s.frame === 'heavy' ? '  [PESADO]' : '  [LIGERO]') : ''), sub: s.pass ? passText(s.pass) + (s.cost && !owned ? ' · ' + costText(s.cost) : '') : s.desc,
            right: eq ? 'EQUIPADO' : owned ? 'EQUIPAR' : s.cost ? (canPay(prof, s.cost) ? 'FORJAR' : 'FALTAN MAT.') : s.price < 0 ? 'EXCLUSIVO' : cr(s.price),
            rightColor: eq ? '#7dff4f' : owned ? '#39d7ff' : s.cost ? (canPay(prof, s.cost) ? '#ffd34a' : '#ff6b6b') : s.price < 0 ? '#b05cff' : (prof.credits >= s.price ? '#ffd34a' : '#ff6b6b'),
            disabled: (!owned && s.price < 0 && !s.cost) || eq,
            preview: { skin: s.id },
            act: owned ? { type: 'equipSkin', id: s.id } : { type: 'buySkin', id: s.id }
          };
        }).concat([{ label: 'Atrás', back: true }])
      };
    },
    tailor_trails(prof) {
      return {
        line: 'Las estelas se alimentan de tu reactor. Cuanto más rápido te muevas, más brillan.',
        options: Cat.trails.map(t => {
          const owned = prof.trails.includes(t.id), eq = prof.trail === t.id;
          return {
            label: t.name, sub: t.desc || (t.id === 'ninguna' ? 'Movimiento discreto' : 'Estela de partículas de neón'),
            right: eq ? 'EQUIPADA' : owned ? 'EQUIPAR' : t.price < 0 ? 'EXCLUSIVA' : cr(t.price),
            rightColor: eq ? '#7dff4f' : owned ? '#39d7ff' : t.price < 0 ? '#b05cff' : (prof.credits >= t.price ? '#ffd34a' : '#ff6b6b'),
            disabled: (!owned && t.price < 0) || eq,
            preview: { trail: t.id },
            act: owned ? { type: 'equipTrail', id: t.id } : { type: 'buyTrail', id: t.id }
          };
        }).concat([{ label: 'Atrás', back: true }])
      };
    },
    // ------------------------------------------------------------ RIVETS
    mechanic_root() {
      return {
        line: pick(NPC.mechanic.greet),
        options: [
          { label: 'Mejoras de exotraje', sub: 'Vida, daño, propulsores y kits (biomasa)', go: 'mechanic_upg' },
          { label: 'Equipo de jefe', sub: 'Casco, coraza y grebas con bonificaciones de conjunto', go: 'mechanic_gear' },
          { label: 'Módulos de jefe', sub: 'Forja con materiales de enemigos y jefes', go: 'mechanic_forge' },
          { label: 'Inventario de materiales', go: 'inventory' },
          { label: 'Despedirse', close: true }
        ]
      };
    },
    mechanic_upg(prof) {
      return {
        line: 'Mejoras permanentes. Se instalan en cada exotraje que imprimimos para ti.',
        options: Cat.upgrades.map(u => {
          const lvl = prof.upgrades[u.id] || 0;
          const bar = '■'.repeat(lvl) + '□'.repeat(u.max - lvl);
          const cost = Cat.upgradeCost(u, lvl);
          return {
            label: `${u.name}  ${bar}`, sub: u.desc,
            right: lvl >= u.max ? 'MÁX' : cr(cost),
            rightColor: lvl >= u.max ? '#7dff4f' : prof.credits >= cost ? '#ffd34a' : '#ff6b6b',
            disabled: lvl >= u.max,
            act: { type: 'upgrade', id: u.id }
          };
        }).concat([{ label: 'Atrás', back: true }])
      };
    },
    mechanic_forge(prof) { return forgeNode(prof, 'mechanic', 'Partes de jefe y de bestias. Así se blinda un exotraje de verdad.'); },
    trafficker_forge(prof) { return forgeNode(prof, 'trafficker', 'Tráeme partes y te forjo modificaciones que se aplican a cada arma procedural.'); },
    inventory(prof) {
      const lines = Object.keys(Cmp.materials).map(k => `${Cmp.materials[k].name}: ${prof.materials[k] || 0}`);
      return { line: 'INVENTARIO · ' + lines.join(' · '), options: [{ label: 'Volver', back: true }] };
    },
    // ------------------------------------------------------------ KAI
    trafficker_root(prof) {
      const c = prof.contract ? Cat.archetypes[prof.contract] : 'ninguno';
      return {
        line: pick(NPC.trafficker.greet) + `\nContrato: ${c} · Núcleo de rareza: ${prof.rarityBoost ? 'sí' : 'no'} · Estimulantes extra: ${prof.extraStims || 0}/2.`,
        options: [
          { label: 'Forja de armas', sub: 'Modificaciones permanentes con materiales', go: 'trafficker_forge' },
          ...ALL_ARCH.filter(k => k !== 'cetro' || (prof.arms || []).includes('cetro')).map(k => ({
            label: 'Contrato: ' + Cat.archetypes[k], sub: Cat.arms[k] ? `${Cat.arms[k].kind === 'gun' ? (Cat.arms[k].auto ? 'Automática' : 'Semiautomática') : 'Cuerpo a cuerpo'} · [Q] ${Cat.arms[k].alt}` : 'Arma clásica de la Flota',
            right: prof.contract === k ? 'ACTIVO' : cr(Cat.arms[k] ? 600 : 300), disabled: prof.contract === k, act: { type: 'contract', id: k }
          })),
          { label: 'Núcleo de rareza', sub: 'Mejora la rareza del arma del próximo descenso', right: prof.rarityBoost ? 'INSTALADO' : cr(250), disabled: prof.rarityBoost, act: { type: 'rarity' } },
          { label: 'Estimulante de reanimación', sub: 'Úsalo derribado manteniendo E', right: (prof.extraStims || 0) >= 2 ? 'MÁX' : cr(90), disabled: (prof.extraStims || 0) >= 2, act: { type: 'stim' } },
          { label: 'Largarse', close: true }
        ]
      };
    },
    // ------------------------------------------------------------ VEX
    ranker_root(prof) {
      const L = G.rankCache;
      if (!L || Date.now() - G.rankAt > 15000) {
        G.Net.act({ type: 'ranking', cat: G.rankCat || 'k' }).then(r => { if (r && r.board) { G.rankCache = r.board; G.rankAt = Date.now(); if (G.UI && G.UI.dlg) G.UI.showNode('ranker_root'); } });
        return { line: pick(NPC.ranker.greet), options: [{ label: 'Esperar…', disabled: true }, { label: 'Salir', close: true }] };
      }
      const row = (r, i) => `#${i} ${r.n} · ${r.k} bajas · ${r.d} muertes · K/D ${r.kd.toFixed(2)} · ¢ ${r.bio}`;
      const me = L.me;
      const CAT = { k: 'BAJAS', kd: 'K/D', bio: 'BIOMASA' };
      const tabs = Object.keys(CAT).filter(c => c !== L.cat).map(c => ({ label: 'Ver tabla: ' + CAT[c], go: 'ranker_' + c }));
      return {
        line: me ? `TABLA DE ${CAT[L.cat]} · TU PUESTO: #${me.rank} de ${L.total}\nBajas ${me.k} · Muertes ${me.d} · K/D ${me.kd.toFixed(2)} · Biomasa total ${me.bio} · Victorias ${me.w}` : 'Aún no tienes registros de combate. ¡Bip!',
        options: L.top.map((r, i) => ({ label: row(r, i + 1), disabled: true, right: me && r.n === me.n ? 'TÚ' : '', rightColor: '#7dff4f' }))
          .concat(tabs).concat([{ label: 'Actualizar', go: 'ranker_refresh' }, { label: 'Salir', close: true }])
      };
    },
    commander_root(prof) {
      if (G.Net.mode === 'br') return nodes.br_root(prof);
      const ready = myReady();
      const v = variant();
      const sel = G.Net.sel || {};
      const cyc = prof.cycle[v] ? ` · CICLO ${prof.cycle[v]}` : '';
      const side = prof.side ? Cmp.side.find(s => s.id === prof.side).name : 'ninguno';
      const done = (prof.story[v] || 0) >= Cmp.COUNTS[v].reduce((a, b) => a + b, 0);
      const opts = [
        { label: ready ? 'Cancelar preparación' : 'Preparar descenso (LISTO)', sub: 'El descenso inicia cuando todo el escuadrón está listo', right: ready ? 'LISTO' : '', rightColor: '#7dff4f', act: { type: 'ready' }, closeAfter: true },
        { label: v === 'coop' ? 'Campaña cooperativa' : 'Modo Historia', sub: `Objetivo: ${sel.name || '—'}`, go: 'commander_campaign' },
        { label: 'Contrato de campo', sub: `Misión secundaria activa: ${side}`, go: 'commander_side' },
        { label: 'Rachas de apoyo', sub: `Paquete: ${Cmp.streakSets[prof.streakSet] ? Cmp.streakSets[prof.streakSet].name : '—'}`, go: 'commander_streaks' },
        { label: 'Informe táctico', sub: 'Escalado dinámico y temporada actual', go: 'commander_report' }
      ];
      if (done) opts.push({ label: `Iniciar CICLO ${(prof.cycle[v] || 0) + 1}`, sub: 'Reinicia la campaña: enemigos más fuertes, botín mayor', act: { type: 'cycle' } });
      opts.push({ label: 'Retirarse', close: true });
      return { line: pick(NPC.commander.greet) + `\n${v === 'coop' ? 'HISTORIA COOPERATIVA' : 'MODO HISTORIA'}${cyc} · ${sel.name || ''}`, options: opts };
    },
    commander_campaign(prof) {
      const v = variant(), list = Cmp.descents(v), reached = prof.story[v] || 0;
      return {
        line: v === 'coop'
          ? 'Ruta cooperativa: más descensos, más densidad de enemigos y hackeos simultáneos. La colmena escala con cada Núcleo vivo.'
          : 'Modo Historia: cuatro capas hasta el Corazón del Leviathan. Cada capa termina con un jefe.',
        options: list.map(d => ({
          label: `${d.id}  ${d.name.replace(/^Capa \d · /, '')}${d.boss ? '  ☠' : ''}`,
          sub: `${Cmp.layers[d.layer - 1].name} · ${d.boss ? 'JEFE: ' + Cmp.bosses[d.boss].name : 'Extracción por elevador'}`,
          right: d.idx > reached ? 'BLOQUEADO' : (G.Net.sel && G.Net.sel.idx === d.idx) ? 'FIJADO' : d.idx < reached ? 'REPETIR' : 'SIGUIENTE',
          rightColor: d.idx > reached ? '#ff6b6b' : d.idx === reached ? '#7dff4f' : '#39d7ff',
          disabled: d.idx > reached || (G.Net.sel && G.Net.sel.idx === d.idx),
          act: { type: 'campaign', id: d.idx }
        })).concat([{ label: 'Atrás', back: true }])
      };
    },
    commander_side(prof) {
      return {
        line: 'Contratos de campo del día. Se cumplen durante el descenso y se cobran al regresar con vida.',
        options: prof.sideOffer.ids.map(id => {
          const s = Cmp.side.find(x => x.id === id);
          return {
            label: s.name, sub: `${s.desc} · ${costText(s.reward)}`,
            right: prof.side === id ? 'ACTIVO' : 'ACEPTAR', rightColor: prof.side === id ? '#7dff4f' : '#39d7ff',
            disabled: prof.side === id, act: { type: 'side', id }
          };
        }).concat(prof.side ? [{ label: 'Cancelar contrato activo', act: { type: 'side', id: null } }] : []).concat([{ label: 'Atrás', back: true }])
      };
    },
    commander_streaks(prof) {
      return {
        line: 'Encadena bajas sin caer para ganar apoyo. Despliega con [F]. Si te derriban, la racha se reinicia.',
        options: Object.entries(Cmp.streakSets).map(([id, s]) => ({
          label: s.name, sub: s.list.map(x => `${x.kills}: ${Cmp.streakInfo[x.id].name}`).join(' · '),
          right: prof.streakSet === id ? 'EQUIPADO' : 'EQUIPAR', rightColor: prof.streakSet === id ? '#7dff4f' : '#39d7ff',
          disabled: prof.streakSet === id, act: { type: 'streakSet', id }
        })).concat([{ label: 'Atrás', back: true }])
      };
    },
    commander_report(prof) {
      const n = Math.max(1, G.Net.roster.size), coop = n > 1;
      const hp = Math.pow(coop ? 1.3 : 1.25, n - 1), dmg = 1 + (coop ? 0.12 : 0.1) * (n - 1), sp = 1 + (coop ? 0.45 : 0.35) * (n - 1);
      const s = prof.season || Cmp.season();
      return {
        line: `Núcleos en sala: ${n}. Vida enemiga x${hp.toFixed(2)}, daño x${dmg.toFixed(2)}, densidad de hordas x${sp.toFixed(2)} (se recalcula con los Núcleos VIVOS). Temporada: ${s.name} (${s.desc}). Finales vistos: ${JSON.stringify(prof.endings || {}) === '{}' ? 'ninguno' : Object.entries(prof.endings).map(([k, v]) => k + ' x' + v).join(', ')}.`,
        options: [{ label: 'Entendido', back: true }]
      };
    },
    // ------------------------------------------------------------ TABLERO
    board_root(prof) {
      const d = prof.daily, w = prof.weekly;
      const daily = d.ids.map(id => {
        const m = Cat.missions.find(x => x.id === id);
        const pr = Math.min(m.target, d.progress[id] || 0);
        const done = pr >= m.target, claimed = d.claimed[id];
        const shown = m.mode === 'max' ? `${Math.floor(pr / 60)}:${String(pr % 60).padStart(2, '0')} / ${m.target / 60}:00` : `${pr}/${m.target}`;
        return {
          label: '[DIARIA] ' + m.text, sub: `Recompensa: ${m.reward} biomasa${m.unlock ? ' + estela exclusiva' : ''}`,
          right: claimed ? '✓ COBRADA' : done ? 'RECLAMAR' : shown,
          rightColor: claimed ? '#5f8292' : done ? '#7dff4f' : '#ffd34a',
          disabled: claimed || !done, act: { type: 'claim', id }
        };
      });
      const weekly = w.ids.map(id => {
        const m = Cmp.weekly.find(x => x.id === id);
        const pr = Math.min(m.target, w.progress[id] || 0);
        const done = pr >= m.target, claimed = w.claimed[id];
        return {
          label: '[SEMANAL] ' + m.text, sub: `Recompensa: ${costText(m.reward)}`,
          right: claimed ? '✓ COBRADA' : done ? 'RECLAMAR' : `${pr}/${m.target}`,
          rightColor: claimed ? '#5f8292' : done ? '#7dff4f' : '#ffd34a',
          disabled: claimed || !done, act: { type: 'claim', id }
        };
      });
      return {
        line: `> ${d.date} · semana ${w.week}. Completa las 3 diarias para el bono de 250 ¢ y la skin "Operador Constante"${d.bonus ? ' (BONO COBRADO)' : ''}.`,
        options: daily.concat(weekly).concat([{ label: 'Desconectar', close: true }])
      };
    }
  };

  // Lobby de la Batalla de Escuadrones
  nodes.br_root = () => {
    const mine = G.Net.roster.get(G.Net.id), ready = myReady();
    return {
      line: `Batalla de Escuadrones. Las alcantarillas convergen en la Cámara Central y el Corazón despierta a los 3:30. Perteneces al ESCUADRÓN ${mine ? mine.team + 1 : '?'}. La batalla empieza cuando todos están listos (mínimo 2 escuadrones).`,
      options: [
        { label: ready ? 'Cancelar preparación' : 'Marcarme LISTO', right: ready ? 'LISTO' : '', rightColor: '#7dff4f', act: { type: 'ready' }, closeAfter: true },
        { label: 'Elegir escuadrón', sub: 'Cambia de equipo antes de la batalla', go: 'br_teams' },
        { label: 'Rachas de apoyo', sub: 'También funcionan en la batalla', go: 'commander_streaks' },
        { label: 'Retirarse', close: true }
      ]
    };
  };
  nodes.br_teams = () => {
    const lb = (G.Net.lastSnap && G.Net.lastSnap.lb) || { c: new Array(10).fill(0), ts: 5 };
    const mine = G.Net.roster.get(G.Net.id);
    return {
      line: 'Elige escuadrón. Los aliados aparecen en verde y los rivales en rojo.',
      options: lb.c.map((n, t) => ({
        label: `ESCUADRÓN ${t + 1}`, sub: [...G.Net.roster.values()].filter(r => r.team === t).map(r => r.name).join(', ') || 'vacío',
        right: mine && mine.team === t ? 'TU EQUIPO' : `${n}/${lb.ts}`, rightColor: mine && mine.team === t ? '#7dff4f' : n >= lb.ts ? '#ff6b6b' : '#39d7ff',
        disabled: (mine && mine.team === t) || n >= lb.ts, act: { type: 'team', id: t }
      })).concat([{ label: 'Atrás', back: true }])
    };
  };

  // Equipo de jefe (Monster Hunter): conjuntos de 3 piezas con bonificaciones a 2 y 3 piezas
  nodes.mechanic_gear = (prof) => {
    const eq = prof.gear.equip || {};
    const worn = Object.keys(Cmp.SLOTS).map(k => `${Cmp.SLOTS[k]}: ${eq[k] ? Cmp.gearSets[eq[k]].name : '—'}`).join(' · ');
    return {
      line: `Cada pieza sale de lo que les arrancas a los monstruos. Lleva varias del mismo conjunto y se despiertan sus bonificaciones.\nPuesto: ${worn}`,
      options: Object.entries(Cmp.gearSets).map(([id, set]) => {
        const owned = Object.keys(Cmp.SLOTS).filter(sl => prof.gear.owned.includes(Cmp.gearId(id, sl))).length;
        const worn2 = Object.values(eq).filter(v => v === id).length;
        return { label: `${set.name}  [${set.rarity}]`, sub: `De: ${set.boss} · forjadas ${owned}/3 · puestas ${worn2}/3`, right: worn2 >= 3 ? 'CONJUNTO' : worn2 >= 2 ? '2 PIEZAS' : '', rightColor: '#7dff4f', go: 'gear_' + id };
      }).concat([{ label: 'Inventario de materiales', go: 'inventory' }, { label: 'Atrás', back: true }])
    };
  };
  for (const [id, set] of Object.entries(Cmp.gearSets)) {
    nodes['gear_' + id] = (prof) => {
      const eq = prof.gear.equip || {};
      const pieces = Object.entries(Cmp.SLOTS).map(([slot, sname]) => {
        const own = prof.gear.owned.includes(Cmp.gearId(id, slot)), on = eq[slot] === id;
        const st = set.stats[slot];
        const stat = [st.hp ? `+${st.hp} vida` : '', st.armor ? `-${Math.round(st.armor * 100)}% daño recibido` : '', st.dmg ? `+${Math.round(st.dmg * 100)}% daño` : '', st.speed ? `+${Math.round(st.speed * 100)}% velocidad` : ''].filter(Boolean).join(', ');
        const cost = Cmp.gearCost(id, slot);
        return {
          label: `${sname} · ${set.name}`, sub: stat + (own ? '' : ' · ' + costText(cost)),
          right: on ? 'QUITAR' : own ? 'EQUIPAR' : canPay(prof, cost) ? 'FORJAR' : 'FALTAN MAT.',
          rightColor: on ? '#ff9d6b' : own ? '#39d7ff' : canPay(prof, cost) ? '#ffd34a' : '#ff6b6b',
          act: on ? { type: 'equipGear', slot, set: null } : own ? { type: 'equipGear', slot, set: id } : { type: 'craftGear', slot, set: id }
        };
      });
      return {
        line: `${set.name.toUpperCase()} (${set.rarity})\n2 piezas: ${set.bonus2}\n3 piezas: ${set.bonus3}`,
        options: pieces.concat([{ label: 'Atrás', back: true }])
      };
    };
  }

  // Nodos generados: acabados por arma y fragmentos de la verdad
  for (const arch of ALL_ARCH) {
    nodes['tailor_wskin_' + arch] = (prof) => ({
      line: 'Pasa el cursor sobre un acabado para verlo en el probador holográfico.',
      options: Cat.weaponSkins.concat(prof.wskinOwned.filter(id => /^S\d/.test(id)).map(id => Cmp.seasonCamo(id)).filter(Boolean))
        .filter(f => (!f.arch || f.arch === arch) && (!f.legacy || prof.wskinOwned.includes(f.id)))
        .map(f => {
        const owned = prof.wskinOwned.includes(f.id), eq = (prof.wskins[arch] || 'estandar') === f.id;
        const price = f.cost ? costText(f.cost) : cr(f.price);
        return {
          label: (f.arch ? '' : f.legacy ? '' : f.id === 'estandar' ? '' : '◆ ') + f.name + (f.season ? '  ✦ TEMPORADA' : ''), sub: f.desc + (!owned && f.cost ? ' · ' + price : ''),
          right: eq ? 'EQUIPADO' : owned ? 'EQUIPAR' : (f.price < 0 && !f.cost) ? 'EXCLUSIVO' : f.cost ? (canPay(prof, f.cost) ? 'FORJAR' : 'FALTAN MAT.') : price,
          rightColor: eq ? '#7dff4f' : owned ? '#39d7ff' : (f.price < 0 && !f.cost) ? '#b05cff' : ((f.cost ? canPay(prof, f.cost) : prof.credits >= f.price) ? '#ffd34a' : '#ff6b6b'),
          disabled: eq || (!owned && f.price < 0 && !f.cost),
          preview: { arch, wskin: f.id },
          act: owned ? { type: 'equipWSkin', id: f.id, arch } : { type: 'buyWSkin', id: f.id }
        };
      }).concat([{ label: 'Atrás', back: true }])
    });
  }
  nodes.ranker_refresh = (prof) => { G.rankAt = 0; return nodes.ranker_root(prof); };
  for (const c of ['k', 'kd', 'bio']) nodes['ranker_' + c] = (prof) => { G.rankCat = c; G.rankAt = 0; return nodes.ranker_root(prof); };
  Cmp.truths.forEach((t, i) => { nodes['truth_' + i] = () => ({ line: `${t.title.toUpperCase()}\n${t.text}`, options: [{ label: 'Volver', back: true }] }); });

  function forgeNode(prof, npc, line) {
    return {
      line,
      options: Cmp.recipes.filter(r => r.npc === npc).map(r => ({
        label: r.name, sub: `${r.desc} · ${costText(r.cost)}`,
        right: prof.mods[r.id] ? 'FORJADO' : canPay(prof, r.cost) ? 'FORJAR' : 'FALTAN MAT.',
        rightColor: prof.mods[r.id] ? '#7dff4f' : canPay(prof, r.cost) ? '#ffd34a' : '#ff6b6b',
        disabled: !!prof.mods[r.id], act: { type: 'craft', id: r.id }
      })).concat([{ label: 'Inventario de materiales', go: 'inventory' }, { label: 'Atrás', back: true }])
    };
  }

  return { NPC, nodes };
})();
