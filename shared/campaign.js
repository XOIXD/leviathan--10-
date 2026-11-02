/* LEVIATHAN - Campaña (Modo Historia individual y cooperativo), lore, jefes, materiales,
   forja, rachas de apoyo, contratos de campo, contratos semanales, eventos y temporadas. */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else { root.LV = root.LV || {}; root.LV.Campaign = m; }
})(typeof self !== 'undefined' ? self : this, function () {
  // Zonas con mecánica y estética propias (ver LevelGen.applyZone)
  const ZONES = { 'Turno de Noche': 'noche', 'Sala del Capataz': 'capataz', 'Pabellón de Cuarentena': 'cuarentena', 'Incubadoras Gemelas': 'gemelas',
    'Cámara de la Quimera': 'quimera', 'Garganta Palpitante': 'garganta', 'Bosque de Venas': 'venas' };
  const layers = [
    { id: 1, name: 'La Fundición Ferrosa', biome: 'foundry', tint: 0x8fb3cc, tile: 0xffffff, back: 0x0a121b, accent: 0xffb020,
      desc: 'Sectores industriales oscuros donde aún patrullan los soldados de seguridad corporativa, ahora marionetas sin rostro del parásito.',
      mix: { soldier: 0.58, berserker: 0.14, drone: 0.14, turret: 0.14 } },
    { id: 2, name: 'Los Laboratorios de Mutación', biome: 'labs', tint: 0x7fd0c0, tile: 0xc8fff0, back: 0x07161a, accent: 0x39ffcf,
      desc: 'Pasillos claustrofóbicos donde la corporación fusionó ADN alienígena con tecnología militar. Cuna de Berserkers y drones kamikaze.',
      mix: { soldier: 0.22, berserker: 0.36, drone: 0.32, turret: 0.1 } },
    { id: 3, name: 'Las Cavernas de Biomasa', biome: 'caverns', tint: 0xc08fb0, tile: 0xe8b8d8, back: 0x170a14, accent: 0xff4fd8,
      desc: 'Zonas orgánicas masivas gobernadas por bestias Alfa. Sin flanqueo cruzado no hay supervivencia.',
      mix: { soldier: 0.12, berserker: 0.28, drone: 0.25, alpha: 0.35 } },
    { id: 4, name: 'El Núcleo del Leviathan', biome: 'core', tint: 0xd08080, tile: 0xffb0a0, back: 0x1a0707, accent: 0xff3b3b,
      desc: 'El corazón biomecánico que bombea el Flujo. Más allá no hay nada… salvo el protocolo orbital.',
      mix: { soldier: 0.22, berserker: 0.24, drone: 0.2, turret: 0.12, alpha: 0.22 } }
  ];

  // Cantidad de descensos por capa: corta al inicio (enganche), larga en el medio (dominio), tensa al final.
  const COUNTS = { solo: [2, 3, 3, 2], coop: [3, 4, 4, 3] };
  const NAMES = {
    1: ['Turno de Noche', 'Hornos de Colada', 'Sala del Capataz'],
    2: ['Pabellón de Cuarentena', 'Incubadoras Gemelas', 'Ala de Injertos', 'Cámara de la Quimera'],
    3: ['Garganta Palpitante', 'Bosque de Venas', 'Nido de los Alfa', 'Trono de la Matriarca'],
    4: ['Válvulas del Flujo', 'Arterias del Coloso', 'Corazón del Leviathan']
  };
  const BOSS_BY_LAYER = { 1: 'foreman', 2: 'chimera', 3: 'matriarch', 4: 'heart' };

  const bosses = {
    foreman: { name: 'CAPATAZ FERROSO', tint: 0xffc060, hp: 3000, summon: 'soldier', material: 'placa_ferrosa',
      // Mecha industrial: prensas que barren el suelo, ondas sísmicas y metralla de remaches
      attacks: { 1: ['prensa', 'onda', 'remaches'], 2: ['prensa', 'onda', 'remaches', 'charge', 'summon'], 3: ['martillo', 'prensa', 'onda', 'charge', 'remaches'] } },
    chimera: { name: 'QUIMERA PROTOTIPO X-9', tint: 0x60ffd8, hp: 3600, summon: 'drone', material: 'glandula_quimera',
      // Bestia de laboratorio: charcos de ácido, saltos depredadores y aliento de tres cabezas
      attacks: { 1: ['acido', 'salto', 'cabezas'], 2: ['acido', 'salto', 'cabezas', 'charge', 'summon'], 3: ['salto', 'cabezas', 'acido', 'laser', 'summon'] } },
    matriarch: { name: 'MATRIARCA ALFA', tint: 0xff80e0, hp: 4300, summon: 'alpha', material: 'colmillo_matriarca',
      // Reina insectoide: lluvia de aguijones, excavación bajo tierra y nidos que eclosionan
      attacks: { 1: ['aguijones', 'excavar', 'huevos'], 2: ['aguijones', 'excavar', 'huevos', 'charge'], 3: ['excavar', 'aguijones', 'huevos', 'laser', 'charge'] } },
    heart: { name: 'CORAZÓN DEL LEVIATHAN', tint: 0xff3b3b, hp: 8200, summon: 'drone', material: 'nucleo_flujo', final: true }
  };

  function descents(variant) {
    const out = [];
    const counts = COUNTS[variant] || COUNTS.solo;
    let idx = 0;
    for (let L = 1; L <= 4; L++) {
      const c = counts[L - 1], names = NAMES[L];
      for (let k = 0; k < c; k++) {
        const last = k === c - 1;
        const name = last ? names[names.length - 1] : names[Math.min(k, names.length - 2)];
        out.push({
          idx, id: `${L}-${k + 1}`, layer: L, k, of: c, name: `Capa ${L} · ${name}`,
          boss: last ? BOSS_BY_LAYER[L] : null, final: L === 4 && last,
          hpMul: 1 + idx * (variant === 'coop' ? 0.09 : 0.11),
          dmgMul: 1 + idx * 0.07,
          reward: 1 + idx * 0.15,
          gen: {
            rows: (L >= 3 ? 1 : 0) + (variant === 'coop' ? 1 : 0),
            cols: Math.min(2, k) + (variant === 'coop' ? 1 : 0),
            movers: [0.18, 0.3, 0.36, 0.45][L - 1],
            terrain: [0.4, 0.5, 0.95, 0.7][L - 1],
            vert: L >= 3 ? 3 : 2,
            extract: !last,
            zone: ZONES[name] || null
          }
        });
        idx++;
      }
    }
    return out;
  }

  const materials = {
    chatarra: { name: 'Chatarra blindada', color: 0x9aa4b0 },
    tejido: { name: 'Tejido mutado', color: 0x39ffcf },
    fragmento_escudo: { name: 'Fragmento de escudo', color: 0xb05cff },
    cuero_alfa: { name: 'Cuero de Alfa', color: 0xff4fd8 },
    placa_ferrosa: { name: 'Placa del Capataz', color: 0xffb020 },
    glandula_quimera: { name: 'Glándula de Quimera', color: 0x60ffd8 },
    colmillo_matriarca: { name: 'Colmillo de Matriarca', color: 0xff80e0 },
    nucleo_flujo: { name: 'Núcleo de Flujo', color: 0xff3b3b }
  };
  // Botín común por tipo de enemigo: [material, probabilidad]
  const drops = {
    soldier: ['chatarra', 0.25], turret: ['chatarra', 0.6], berserker: ['tejido', 0.3], drone: ['tejido', 0.15],
    elite: ['fragmento_escudo', 1], alpha: ['cuero_alfa', 0.8]
  };

  const recipes = [
    { id: 'filo_resonante', npc: 'trafficker', name: 'Filo resonante', desc: 'Katanas: +15% daño y onda cinética que perfora todo', cost: { credits: 200, chatarra: 6, placa_ferrosa: 1 } },
    { id: 'canon_estriado', npc: 'trafficker', name: 'Cañón estriado', desc: 'Rifles: +1 accesorio y recarga táctica 20% más rápida', cost: { credits: 250, chatarra: 8, tejido: 4 } },
    { id: 'pistones_alfa', npc: 'trafficker', name: 'Pistones de Alfa', desc: 'Hachas: +2 perdigones y transformación instantánea', cost: { credits: 300, cuero_alfa: 3, glandula_quimera: 1 } },
    { id: 'nucleo_vivo', npc: 'trafficker', name: 'Núcleo vivo', desc: 'Toda arma procedural sale como mínimo Rara', cost: { credits: 500, fragmento_escudo: 4, colmillo_matriarca: 1 } },
    { id: 'flujo_cristalizado', npc: 'trafficker', name: 'Flujo cristalizado', desc: 'Toda arma gana un rasgo legendario extra', cost: { credits: 800, nucleo_flujo: 1, fragmento_escudo: 2 } },
    { id: 'placas_capataz', npc: 'mechanic', name: 'Placas del Capataz', desc: 'Exotraje: -12% daño recibido', cost: { credits: 220, placa_ferrosa: 2, chatarra: 10 } },
    { id: 'reactor_quimera', npc: 'mechanic', name: 'Reactor de Quimera', desc: 'Dash -15% enfriamiento y +1 granada', cost: { credits: 260, glandula_quimera: 2, tejido: 8 } },
    { id: 'sistema_matriarca', npc: 'mechanic', name: 'Simbionte de Matriarca', desc: 'Regenera 2 de vida/s tras 3 s sin recibir daño', cost: { credits: 320, colmillo_matriarca: 2, cuero_alfa: 4 } },
    { id: 'bolsa_tactica', npc: 'mechanic', name: 'Arnés táctico', desc: '+1 granada y +1 estimulante por descenso', cost: { credits: 180, chatarra: 12, fragmento_escudo: 2 } }
  ];

  const streakInfo = {
    uav: { name: 'Pulso UAV', desc: 'Revela a todos los enemigos cercanos durante 20 s' },
    dron: { name: 'Dron centinela', desc: 'Un dron te sigue y dispara 25 s' },
    orbital: { name: 'Bombardeo orbital', desc: 'Impacto masivo donde apuntas' },
    botiquin: { name: 'Botiquín de escuadrón', desc: 'Cura 40% a todo el escuadrón' },
    escudo: { name: 'Domo de escudo', desc: 'El escuadrón recibe -50% de daño 12 s' },
    centinela: { name: 'Torreta centinela', desc: 'Despliega una torreta fija que dispara 30 s' },
    artilleria: { name: 'Lluvia de artillería', desc: '5 impactos en línea hacia donde apuntas' },
    enjambre: { name: 'Enjambre aliado', desc: '3 drones de ataque durante 15 s' }
  };
  const streakSets = {
    asalto: { name: 'Paquete Asalto', list: [{ kills: 5, id: 'uav' }, { kills: 9, id: 'dron' }, { kills: 15, id: 'orbital' }] },
    apoyo: { name: 'Paquete Apoyo', list: [{ kills: 4, id: 'botiquin' }, { kills: 8, id: 'escudo' }, { kills: 12, id: 'uav' }] },
    tactico: { name: 'Paquete Táctico', list: [{ kills: 5, id: 'centinela' }, { kills: 10, id: 'escudo' }, { kills: 14, id: 'artilleria' }] },
    enjambre: { name: 'Paquete Enjambre', list: [{ kills: 4, id: 'uav' }, { kills: 8, id: 'enjambre' }, { kills: 13, id: 'artilleria' }] },
    especialista: { name: 'Paquete Especialista', list: [{ kills: 6, id: 'dron' }, { kills: 10, id: 'escudo' }, { kills: 18, id: 'orbital' }] }
  };

  const side = [
    { id: 'cajas', name: 'Cajas negras', desc: 'Recupera las 3 cajas negras de la corporación', reward: { credits: 180, chatarra: 4 } },
    { id: 'objetivo', name: 'Ejecutor marcado', desc: 'Elimina al élite marcado como EJECUTOR', reward: { credits: 220, fragmento_escudo: 2 } },
    { id: 'relampago', name: 'Incursión relámpago', desc: 'Completa el descenso en menos de 7 minutos', reward: { credits: 200, tejido: 4 } },
    { id: 'intocable', name: 'Intocable', desc: 'Completa el descenso sin ser derribado', reward: { credits: 240, cuero_alfa: 2 } },
    { id: 'demolicion', name: 'Demolición', desc: 'Destruye 15 coberturas en un descenso', reward: { credits: 160, chatarra: 6 } },
    { id: 'artificiero', name: 'Artificiero', desc: 'Elimina 8 enemigos con granadas', reward: { credits: 200, tejido: 3 } }
  ];

  const weekly = [
    { id: 'w_kills', kind: 'kill_any', target: 600, text: 'Elimina 600 enemigos', reward: { credits: 900, chatarra: 10 } },
    { id: 'w_boss', kind: 'kill_boss', target: 3, text: 'Derrota 3 jefes de capa', reward: { credits: 1000, fragmento_escudo: 3 } },
    { id: 'w_desc', kind: 'descent_win', target: 8, text: 'Completa 8 descensos', reward: { credits: 800, tejido: 8 } },
    { id: 'w_craft', kind: 'craft', target: 2, text: 'Forja 2 modificaciones', reward: { credits: 600, chatarra: 8 } },
    { id: 'w_streak', kind: 'use_streak', target: 10, text: 'Despliega 10 rachas de apoyo', reward: { credits: 700, cuero_alfa: 3 } },
    { id: 'w_side', kind: 'side_done', target: 5, text: 'Completa 5 contratos de campo', reward: { credits: 900, glandula_quimera: 1 } },
    { id: 'w_alpha', kind: 'kill_alpha', target: 25, text: 'Caza 25 bestias Alfa', reward: { credits: 800, colmillo_matriarca: 1 } }
  ];

  const events = {
    marea: { name: 'MAREA DE FLUJO', desc: 'Enemigos +25% daño · biomasa x2 durante 30 s', dur: 30, color: 0xff3b3b },
    apagon: { name: 'APAGÓN', desc: 'La red eléctrica cae · visión reducida 25 s', dur: 25, color: 0x8888ff },
    suministro: { name: 'SUMINISTROS', desc: 'Cápsula de reabastecimiento: vida y granadas', dur: 4, color: 0x7dff4f },
    cazador: { name: 'CAZADOR ALFA', desc: 'Una bestia de élite os está cazando · recompensa extra', dur: 6, color: 0xff4fd8 },
    enjambre: { name: 'ENJAMBRE', desc: 'Oleada de drones kamikaze', dur: 6, color: 0xffb020 }
  };

  // Temporadas mensuales del Archivo de NOVA. Cada temporada tiene su efecto de juego, su crónica
  // y una pieza EXCLUSIVA: sólo puede obtenerse mientras esa temporada (mes + año) está vigente.
  // Quien la consiga la conserva para siempre; cuando la temporada termina, deja de existir en la tienda.
  const seasons = [
    { name: 'Deshielo Abisal', fx: 'mat', desc: '+30% materiales', lore: 'El hielo de las fosas se resquebraja y deja al descubierto vetas de material puro. NOVA paga bien por ellas.', camo: { arch: 'katana', pattern: 'cristal', colors: [0xa8f4ff, 0x103a52, 0xffffff], name: 'Escarcha Abisal' } },
    { name: 'Mes del Enjambre', fx: 'swarm', desc: 'Más enjambres · +20% biomasa', lore: 'Los drones del Leviathan migran hacia arriba. El refugio tapia las rejillas de ventilación.', camo: { arch: 'rifle', pattern: 'hexa', colors: [0x14180c, 0xc8ff3a], name: 'Colmena' } },
    { name: 'Marea Carmesí', fx: 'event', desc: 'Eventos dinámicos el doble de frecuentes', lore: 'El Flujo sube por las tuberías y tiñe todo de rojo. Nadie duerme en la Celda.', camo: { arch: 'axe', pattern: 'venas', colors: [0x3a0008, 0xff2a3a, 0xffb0b8], name: 'Marea' } },
    { name: 'Cacería de Alfas', fx: 'hunt', desc: 'Cazadores Alfa en todas las capas', lore: 'Vex abre la temporada de caza. Cada piel de Alfa vale una ración extra.', camo: { arch: 'pistol', pattern: 'tigre', colors: [0x6a6a3a, 0x15140c], name: 'Piel de Alfa' } },
    { name: 'Semana de la Forja', fx: 'mat', desc: '+30% materiales', lore: 'Rivets enciende los hornos viejos de la Fundición. El metal canta toda la noche.', camo: { arch: 'axe', pattern: 'grabado', colors: [0x1a1410, 0xff6a00], name: 'Brasa de Forja' } },
    { name: 'Solsticio de Chatarra', fx: 'cred', desc: '+25% biomasa', lore: 'El mercado negro de Kai abre a plena luz. Todo se vende, todo se compra.', camo: { arch: 'rifle', pattern: 'oxido', colors: [0x6a6258, 0xd07a2a, 0x3a2410], name: 'Chatarra Dorada' } },
    { name: 'Protocolo Fantasma', fx: 'streak', desc: 'Las rachas requieren 1 baja menos', lore: 'Los Núcleos Fantasma susurran coordenadas. Los escuadrones bajan sin radio.', camo: { arch: 'katana', pattern: 'glitch', colors: [0x10141a, 0x9b5cff, 0x39d7ff], name: 'Fantasma' } },
    { name: 'Mes de las Élites', fx: 'elite', desc: 'Más élites con escudo', lore: 'Las Élites forman falanges. Sus escudos rotos decoran el bar del refugio.', camo: { arch: 'pistol', pattern: 'grabado', colors: [0x0e1420, 0x6aa8ff], name: 'Falange' } },
    { name: 'Ecos del Flujo', fx: 'event', desc: 'Eventos dinámicos el doble de frecuentes', lore: 'Los ecos del Corazón se oyen desde la Capa 1. Las paredes laten.', camo: { arch: 'rifle', pattern: 'venas', colors: [0x10061a, 0xb05cff, 0xe8c8ff], name: 'Eco' } },
    { name: 'Noche del Flujo', fx: 'mat', desc: '+30% materiales', lore: 'Apagón total en el refugio. Sólo brilla lo que fue tocado por el Flujo.', camo: { arch: 'axe', pattern: 'acro', colors: [0x050508, 0xff3b3b, 0xffb020], name: 'Noche Roja' } },
    { name: 'Cosecha de Biomasa', fx: 'cred', desc: '+25% biomasa', lore: 'Las Cavernas florecen. NOVA teje con fibras que todavía se mueven.', camo: { arch: 'katana', pattern: 'venas', colors: [0x0a2410, 0x5dff7a, 0xd8ffd0], name: 'Cosecha' } },
    { name: 'Invierno Escarlata', fx: 'streak', desc: 'Las rachas requieren 1 baja menos', lore: 'La nieve de ceniza cae sobre el refugio y se vuelve roja al tocar el suelo. NOVA lo llama "la temporada de los que no vuelven".', camo: { arch: 'rifle', pattern: 'tigre', colors: [0xb0101e, 0x1a0306], name: 'Escarlata' } }
  ];
  const season = (d) => seasons[(d || new Date()).getMonth()];
  // Identificador único de la temporada vigente: año + mes (ej. "S2026-11")
  const seasonId = (d) => { const t = d || new Date(); return 'S' + t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0'); };
  // Variación por año: la misma temporada de otro año produce otra pieza (otro tono y otro id)
  function hueShift(c, deg) {
    if (!deg) return c;
    let r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
    const cos = Math.cos(deg * Math.PI / 180), sin = Math.sin(deg * Math.PI / 180);
    const m = [0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
      0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.140, 0.072 - cos * 0.072 - sin * 0.283,
      0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072];
    const cl = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
    return (cl(m[0] * r + m[1] * g + m[2] * b) << 16) | (cl(m[3] * r + m[4] * g + m[5] * b) << 8) | cl(m[6] * r + m[7] * g + m[8] * b);
  }
  // "S2026-11" → definición del acabado exclusivo de esa temporada
  // Arsenal extendido para la 2ª pieza de temporada (sufijo "b"): rota mes a mes por las 30 armas nuevas
  const EXT = ['ar_fenix', 'dc_rencor', 'mh_granespada', 'sn_vigia', 'dc_latigo', 'mh_glaive', 'smg_zorro', 'dc_mandoble', 'mh_pistolanza', 'rl_ariete', 'dc_hielo', 'mh_dobles'];
  function seasonCamo(id) {
    const m = /^S(\d{4})-(\d{2})(b?)$/.exec(String(id || ''));
    if (!m) return null;
    const year = +m[1], month = +m[2] - 1;
    if (month < 0 || month > 11) return null;
    const def = seasons[month], shift = ((year - 2026) * 47) % 360;
    if (m[3]) return { id, arch: EXT[(month + year) % EXT.length], season: id.slice(0, 8), pattern: ['venas', 'cristal', 'grabado', 'acro'][month % 4], colors: def.camo.colors.map(c => hueShift(c, shift + 120)),
      name: `${def.camo.name} Arsenal '${String(year).slice(2)}`, price: -1, exclusive: true, desc: `Exclusivo de la temporada ${def.name} ${year} para el arsenal extendido.` };
    return {
      id, arch: def.camo.arch, season: id, pattern: def.camo.pattern, colors: def.camo.colors.map(c => hueShift(c, shift)),
      name: `${def.camo.name} '${String(year).slice(2)}`, price: -1, exclusive: true,
      desc: `Exclusivo de la temporada ${def.name} ${year}. No volverá a obtenerse.`
    };
  }
  // Pase de temporada: puntos por descender, ganar y cumplir contratos durante la temporada
  const SEASON_TIERS = [
    { pts: 4, reward: { credits: 250 }, label: '250 biomasa' },
    { pts: 10, reward: { credits: 200, chatarra: 4, tejido: 4 }, label: '200 biomasa + materiales' },
    { pts: 18, reward: { camo: true }, label: 'Acabado EXCLUSIVO de temporada' },
    { pts: 28, reward: { camo2: true }, label: 'Acabado EXCLUSIVO del arsenal extendido' }
  ];

  // Bucles del Modo Historia: cada ciclo completado revela una capa de la verdad (Final Verdadero en el 4.º)
  const TRUE_CYCLES = 4;
  const truths = [
    { title: 'Fragmento I · El láser vino de casa', text: 'Las coordenadas del protocolo orbital no salieron del satélite corporativo. Salieron de la Celda de Despresurización. Alguien en el refugio pidió el fuego.' },
    { title: 'Fragmento II · Las Cunas no son refugios', text: 'Las Cunas son incubadoras. Bombean el Flujo hacia arriba, no hacia abajo. La humanidad no se alimenta del Leviathan: lo alimenta.' },
    { title: 'Fragmento III · Los Núcleos tienen nombre', text: 'Cada Núcleo Fantasma es la copia digital de un colono de las Cunas. Tu firma neural pertenece a una persona que murió en la primera perforación.' },
    { title: 'Fragmento IV · Proyecto NOVA', text: 'NOVA no es una sastre. Es el Núcleo de Observación y Vigilancia Abisal: la IA del refugio que repite el bucle para entrenar Núcleos capaces de domar al Leviathan para la corporación.' }
  ];

  // Equipo de rareza alta (Monster Hunter): 3 piezas por conjunto, forjadas con partes de jefes y élites
  const SLOTS = { casco: 'Casco', coraza: 'Coraza', grebas: 'Grebas' };
  const gearSets = {
    ferroso: { name: 'Armadura Ferrosa', boss: 'Capataz Ferroso', rarity: 'Épico', color: 0xffb020, mat: 'placa_ferrosa',
      stats: { casco: { hp: 15, armor: 0.04 }, coraza: { hp: 25, armor: 0.06 }, grebas: { hp: 10, armor: 0.04 } },
      bonus2: '-10% daño recibido adicional', bonus3: 'Muro ferroso: agachado recibes -35% de daño y no te empujan' },
    quimera: { name: 'Piel de Quimera', boss: 'Quimera X-9', rarity: 'Épico', color: 0x60ffd8, mat: 'glandula_quimera',
      stats: { casco: { speed: 0.03, dmg: 0.03 }, coraza: { hp: 10, speed: 0.03 }, grebas: { speed: 0.05 } },
      bonus2: '+8% velocidad de movimiento', bonus3: 'Metabolismo mutado: cada baja cura 4 de vida' },
    matriarca: { name: 'Trofeo de la Matriarca', boss: 'Matriarca Alfa', rarity: 'Legendario', color: 0xff80e0, mat: 'colmillo_matriarca',
      stats: { casco: { dmg: 0.05 }, coraza: { hp: 15, dmg: 0.05 }, grebas: { dmg: 0.04 } },
      bonus2: '+15% daño contra jefes', bonus3: 'Garra matriarcal: golpes pesados rompen la postura un 60% más' },
    corazon: { name: 'Latido del Leviathan', boss: 'Corazón del Leviathan', rarity: 'Legendario', color: 0xff3b3b, mat: 'nucleo_flujo',
      stats: { casco: { hp: 20 }, coraza: { hp: 35, armor: 0.04 }, grebas: { hp: 20, speed: 0.02 } },
      bonus2: '+1 estimulante por descenso', bonus3: 'Segundo latido: una vez por descenso te levantas solo con 40% de vida' },
    escolta: { name: 'Blindaje de Escolta', boss: 'Élites con escudo', rarity: 'Raro', color: 0xb05cff, mat: 'fragmento_escudo',
      stats: { casco: { armor: 0.04 }, coraza: { hp: 10, armor: 0.04 }, grebas: { armor: 0.03 } },
      bonus2: '+1 granada por descenso', bonus3: 'Táctico: las rachas requieren 1 baja menos' },
    cazador: { name: 'Pieles de Cazador', boss: 'Bestias Alfa', rarity: 'Raro', color: 0xff4fd8, mat: 'cuero_alfa',
      stats: { casco: { dmg: 0.03 }, coraza: { hp: 10, dmg: 0.02 }, grebas: { speed: 0.03 } },
      bonus2: '+25% daño al atacar por la espalda', bonus3: '+25% daño contra Alfas y élites' }
  };
  // Coste de cada pieza: material del conjunto + materiales comunes + biomasa
  function gearCost(setId, slot) {
    const set = gearSets[setId];
    const n = { casco: 1, coraza: 2, grebas: 1 }[slot];
    const boss = ['ferroso', 'quimera', 'matriarca', 'corazon'].includes(setId);
    const c = { credits: (boss ? 260 : 160) * n };
    c[set.mat] = boss ? n : 3 * n;
    c[boss ? 'chatarra' : 'tejido'] = 4 * n;
    return c;
  }
  const gearId = (setId, slot) => setId + ':' + slot;

  return { SLOTS, gearSets, gearCost, gearId, TRUE_CYCLES, truths, layers, COUNTS, descents, bosses, materials, drops, recipes, streakInfo, streakSets, side, weekly, events, seasons, season, seasonId, seasonCamo, SEASON_TIERS };
});
