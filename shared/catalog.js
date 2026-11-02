/* LEVIATHAN - Catálogo compartido: skins, estelas, mejoras, misiones diarias, descensos. */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else { root.LV = root.LV || {}; root.LV.Catalog = m; }
})(typeof self !== 'undefined' ? self : this, function () {
  const skins = [
    { id: 'recluta', name: 'Exotraje Recluta', price: 0, body: 0x3a4a5c, accent: 0x8fb3cc, visor: 0x39d7ff, desc: 'Placas estándar de la Flota. Fiable, gris, olvidable.' },
    { id: 'vanguardia', name: 'Vanguardia Cobalto', price: 600, body: 0x1d3f8f, accent: 0x6aa8ff, visor: 0xfff35c, desc: 'Blindaje de asalto con visor ámbar de puntería.' },
    { id: 'carmesi', name: 'Protocolo Carmesí', price: 900, body: 0x7a1020, accent: 0xff4060, visor: 0xffffff, desc: 'Pintura de los batallones de ruptura.' },
    { id: 'espectro', name: 'Espectro Óptico', price: 1300, body: 0x16161e, accent: 0x9b5cff, visor: 0xd18bff, desc: 'Fibra de camuflaje con núcleo violeta.' },
    { id: 'abismo', name: 'Abismo Bioluminiscente', price: 1800, body: 0x062a2a, accent: 0x00ffc8, visor: 0x00ffc8, desc: 'Cultivado en las fosas del Leviatán.' },
    { id: 'oro_leviatan', name: 'Oro Leviatán', price: 2800, body: 0x8a6a10, accent: 0xffd34a, visor: 0xff3b3b, desc: 'Sólo para quienes han mirado al Corazón del Leviathan.' },
    // Exotrajes tácticos: silueta propia (frame) y perfil pasivo (pass). Alta gama = materiales.
    { id: 'bastion', name: 'Bastión Pesado', price: 3200, frame: 'heavy', pass: { hp: 40, speed: -0.08, armor: 0.1 }, body: 0x3c4148, accent: 0xffb020, visor: 0xff6a00, desc: 'Blindaje de asedio. +40 vida, -10% daño recibido, -8% velocidad.' },
    { id: 'sombra', name: 'Sombra Ligera', price: 3000, frame: 'light', pass: { hp: -15, speed: 0.1, dash: 0.2 }, body: 0x101216, accent: 0x5a6a78, visor: 0x9b5cff, desc: 'Fibra de infiltración. +10% velocidad, dash 20% más rápido, -15 vida.' },
    { id: 'zapador', name: 'Zapador de Fundición', price: 3400, frame: 'heavy', pass: { gren: 2, hp: 10 }, body: 0x4a3a1a, accent: 0xff7a00, visor: 0xffd34a, desc: 'Cinturón de cargas. +2 granadas, +10 vida.' },
    { id: 'corpsman', name: 'Corpsman de Campaña', price: 3600, frame: 'std', pass: { regen: true, stims: 1 }, body: 0xd8dde2, accent: 0xff3b4a, visor: 0x39d7ff, desc: 'Sistemas médicos. Regeneración fuera de combate y +1 estimulante.' },
    { id: 'asaltante', name: 'Asaltante Neón', price: 3800, frame: 'light', pass: { dmg: 0.07, speed: 0.04 }, body: 0x14101c, accent: 0xff3df0, visor: 0x39d7ff, desc: 'Servomotores de asalto. +7% daño, +4% velocidad.' },
    { id: 'centinela', name: 'Centinela Ferroso', price: -1, cost: { credits: 4000, placa_ferrosa: 12, fragmento_escudo: 10 }, frame: 'heavy', pass: { hp: 30, armor: 0.15 }, body: 0x5a6270, accent: 0x9ff8ff, visor: 0x9ff8ff, desc: 'Forjado con placas del Capataz. +30 vida, -15% daño recibido.' },
    { id: 'heraldo', name: 'Heraldo del Corazón', price: -1, cost: { credits: 6000, nucleo_flujo: 6, colmillo_matriarca: 6 }, frame: 'std', pass: { hp: 20, dmg: 0.1, speed: 0.05 }, body: 0x3a0008, accent: 0xff2020, visor: 0xffffff, desc: 'Pieza de veterano. +20 vida, +10% daño, +5% velocidad.' },
    { id: 'operador_diario', name: 'Operador Constante', price: -1, body: 0x2d2d2d, accent: 0x7dff4f, visor: 0x7dff4f, desc: 'Exclusivo: completa las 3 misiones diarias en un mismo día.' }
  ];
  const trails = [
    { id: 'ninguna', name: 'Sin estela', price: 0, colors: [0x8fb3cc] },
    { id: 'neon_cian', name: 'Neón Cian', price: 400, colors: [0x39d7ff, 0x0080ff] },
    { id: 'plasma_magenta', name: 'Plasma Magenta', price: 700, colors: [0xff3df0, 0x8a00ff] },
    { id: 'fuego_frio', name: 'Fuego Frío', price: 1000, colors: [0x9ffcff, 0x2e6bff, 0xffffff] },
    { id: 'sintetico', name: 'Espectro Sintético', price: 1600, colors: [0xff3b3b, 0xffd34a, 0x5dff7a, 0x39d7ff, 0x9b5cff] },
    { id: 'corona_abisal', name: 'Corona Abisal', price: -1, colors: [0xffd34a, 0xff6a00], desc: 'Exclusiva: misión diaria de jefe de capa.' }
  ];
  const upgrades = [
    { id: 'vida', name: 'Blindaje reforzado', desc: '+15 de vida máxima por nivel', max: 5, base: 160 },
    { id: 'dano', name: 'Calibración de daño', desc: '+8% de daño por nivel', max: 5, base: 180 },
    { id: 'dash', name: 'Propulsores de esquiva', desc: '-8% enfriamiento de dash por nivel', max: 4, base: 140 },
    { id: 'kit', name: 'Kit de reanimación', desc: '+1 estimulante de auto-reanimación por misión', max: 2, base: 300 }
  ];
  const upgradeCost = (u, lvl) => Math.round(u.base * (1 + lvl * 0.75));
  const missions = [
    { id: 'drones50', kind: 'kill_drone', target: 50, text: 'Elimina 50 drones kamikaze', reward: 300 },
    { id: 'berserk20', kind: 'kill_berserker', target: 20, text: 'Elimina 20 berserkers cibernéticos', reward: 280 },
    { id: 'soldiers60', kind: 'kill_soldier', target: 60, text: 'Neutraliza 60 soldados de asalto', reward: 260 },
    { id: 'elites3', kind: 'kill_elite', target: 3, text: 'Derriba 3 élites con escudo', reward: 350 },
    { id: 'sector2', kind: 'sector2_nocrit', target: 1, text: 'Supera el Sector 2 sin recibir daño crítico', reward: 400 },
    { id: 'onelife5', kind: 'survive_onelife', target: 300, mode: 'max', text: 'Sobrevive 5 minutos con una sola vida', reward: 350 },
    { id: 'cover40', kind: 'destroy_cover', target: 40, text: 'Destruye 40 coberturas balísticas', reward: 200 },
    { id: 'revive3', kind: 'revive', target: 3, text: 'Reanima a 3 aliados en combate', reward: 300 },
    { id: 'hack2', kind: 'hack', target: 2, text: 'Completa 2 hackeos de compuerta', reward: 250 },
    { id: 'defuse4', kind: 'defuse', target: 4, text: 'Desactiva 4 detonadores', reward: 300 },
    { id: 'boss1', kind: 'kill_boss', target: 1, text: 'Derrota a un jefe de capa', reward: 500, unlock: { trail: 'corona_abisal' } },
    { id: 'alpha8', kind: 'kill_alpha', target: 8, text: 'Caza 8 bestias Alfa', reward: 300 },
    { id: 'turret10', kind: 'kill_turret', target: 10, text: 'Desmantela 10 torretas asimiladas', reward: 220 },
    { id: 'streak3', kind: 'use_streak', target: 3, text: 'Despliega 3 rachas de apoyo', reward: 260 },
    { id: 'extract2', kind: 'extract', target: 2, text: 'Completa 2 extracciones por elevador', reward: 280 }
  ];
  const descents = [
    { id: 1, name: 'Descenso I · Fundición Ferrosa', hpMul: 1, dmgMul: 1, reward: 1 },
    { id: 2, name: 'Descenso II · Colector Abisal', hpMul: 1.4, dmgMul: 1.25, reward: 1.5 },
    { id: 3, name: 'Descenso III · Corazón del Leviatán', hpMul: 1.9, dmgMul: 1.5, reward: 2.2 }
  ];
  const rarities = [
    { id: 0, name: 'Común', color: 0xd8e2ea, mul: 1 },
    { id: 1, name: 'Raro', color: 0x3fa9ff, mul: 1.12 },
    { id: 2, name: 'Épico', color: 0xb05cff, mul: 1.26 },
    { id: 3, name: 'Legendario', color: 0xff9d1c, mul: 1.42 }
  ];
  // Acabados de arma (se aplican a pistolas, rifles, katanas y hachas transformables)
  // Acabados de arma. Cada arma tiene su PROPIO catálogo de camuflajes pintados sobre su geometría
  // (arch). Los de maestría (sin arch) sirven para todas. Los "legado" ya no se venden: quien los
  // tenga los conserva. Las piezas de temporada se resuelven en Campaign.seasonCamo().
  const weaponSkins = [
    { id: 'estandar', name: 'Estándar de la Flota', price: 0, pattern: 'none', desc: 'Acero mate de fábrica.' },
    // Pistola
    { id: 'p_urbano', arch: 'pistol', name: 'Urbano Gris', price: 600, pattern: 'urbano', colors: [0x3d434b, 0x6b737d, 0x9aa2ab, 0x23272d], desc: 'Camuflaje digital de patrulla en los anillos habitacionales.' },
    { id: 'p_hexa', arch: 'pistol', name: 'Panal Táctico', price: 840, pattern: 'hexa', colors: [0x1c2128, 0xffb020], desc: 'Malla hexagonal de polímero con hilo ámbar.' },
    { id: 'p_acro', arch: 'pistol', name: 'Acro-Neón Cian', price: 1140, pattern: 'acro', colors: [0x0b0f14, 0x39d7ff, 0xff3df0], desc: 'Corredera negra con trazos de neón vectorial.' },
    { id: 'p_oxido', arch: 'pistol', name: 'Óxido de Fundición', price: 960, pattern: 'oxido', colors: [0x5a5550, 0xa04a14, 0x5a2408], desc: 'Recuperada de la Capa 1. Aún dispara.' },
    { id: 'p_grabado', arch: 'pistol', name: 'Grabado de Oficial', price: 1560, pattern: 'grabado', colors: [0x121214, 0xd9b04a], desc: 'Filigrana láser dorada sobre pavonado negro.' },
    // Rifle
    { id: 'r_urbano', arch: 'rifle', name: 'Digital Ciudad', price: 660, pattern: 'urbano', colors: [0x2a2f36, 0x56606b, 0x8a949e, 0x15181c], desc: 'Pixelado urbano de las brigadas de asalto.' },
    { id: 'r_tigre', arch: 'rifle', name: 'Tigre Ferroso', price: 960, pattern: 'tigre', colors: [0xb8742a, 0x1a1410], desc: 'Rayas de tigre sobre bronce quemado.' },
    { id: 'r_carbono', arch: 'rifle', name: 'Fibra Táctica', price: 900, pattern: 'carbono', colors: [0x15171c, 0x2c3038], desc: 'Trenzado de carbono negro mate.' },
    { id: 'r_acro', arch: 'rifle', name: 'Acro-Neón Magenta', price: 1260, pattern: 'acro', colors: [0x0d0a12, 0xff3df0, 0x39d7ff], desc: 'Líneas vectoriales de plasma sobre negro.' },
    { id: 'r_oxido', arch: 'rifle', name: 'Óxido Bélico', price: 1140, pattern: 'oxido', colors: [0x4a4f55, 0xb4561a, 0x3a1a08], desc: 'Óxido real, rayones reales, bajas reales.' },
    // Katana
    { id: 'k_hamon', arch: 'katana', name: 'Hamon de Acero', price: 720, pattern: 'hamon', colors: [0xc8d2dc, 0xffffff, 0x6f7a86], desc: 'Línea de temple ondulada, forjada a la antigua.' },
    { id: 'k_damasco', arch: 'katana', name: 'Damasco de las Cunas', price: 1200, pattern: 'damasco', colors: [0x8a929c, 0x3c434c, 0xd8e0e8], desc: 'Capas plegadas mil veces en los astilleros orbitales.' },
    { id: 'k_acro', arch: 'katana', name: 'Filo Acro-Neón', price: 1260, pattern: 'acro', colors: [0x08080c, 0x7dff4f, 0x39d7ff], desc: 'Hoja negra con circuitos verdes de alto voltaje.' },
    { id: 'k_grabado', arch: 'katana', name: 'Grabado Ritual', price: 1560, pattern: 'grabado', colors: [0x1a0e10, 0xff3b3b], desc: 'Inscripciones láser del culto del Flujo.' },
    { id: 'k_cristal', arch: 'katana', name: 'Cristal de Flujo', price: 1800, pattern: 'cristal', colors: [0x5ae8ff, 0x0a3a5a, 0xe8ffff], desc: 'Hoja de cristal facetado que refracta la luz.' },
    // Hacha transformable (y su modo cañón/escopeta)
    { id: 'a_oxido', arch: 'axe', name: 'Óxido de Alcantarilla', price: 720, pattern: 'oxido', colors: [0x55524e, 0x9a4410, 0x40200a], desc: 'Hierro de las cloacas de la Capa 3.' },
    { id: 'a_peligro', arch: 'axe', name: 'Rayas de Peligro', price: 900, pattern: 'peligro', colors: [0xffc21a, 0x111111], desc: 'Señalética industrial de demolición.' },
    { id: 'a_urbano', arch: 'axe', name: 'Demolición Urbana', price: 960, pattern: 'urbano', colors: [0x3a3f36, 0x6a7058, 0x8f9478, 0x22251f], desc: 'Pixelado oliva de los zapadores.' },
    { id: 'a_grabado', arch: 'axe', name: 'Grabado Forjado', price: 1440, pattern: 'grabado', colors: [0x22201c, 0xffb020], desc: 'Runas de forja grabadas al rojo vivo.' },
    { id: 'a_venas', arch: 'axe', name: 'Biomasa Viva', price: 1680, pattern: 'venas', colors: [0x2a0a12, 0xff3b5a, 0xffc0c8], desc: 'Tejido del Leviathan que aún late.' },
    // Maestría (todas las armas)
    { id: 'escamas', name: 'Escamas de Matriarca', price: -1, cost: { credits: 1500, colmillo_matriarca: 6, cuero_alfa: 10 }, pattern: 'escamas', colors: [0x3a0a30, 0xff80e0], desc: 'Forjado con partes de la Matriarca Alfa.' },
    { id: 'corazon', name: 'Latido del Corazón', price: -1, cost: { credits: 2500, nucleo_flujo: 6 }, pattern: 'venas', colors: [0x4a0008, 0xff2020, 0xffffff], desc: 'Forjado con Núcleos de Flujo del jefe final.' },
    { id: 'verdad', name: 'Fragmento de la Verdad', price: -1, pattern: 'glitch', colors: [0xe8eef4, 0x39d7ff, 0xff3b3b], desc: 'Exclusivo: alcanza el Final Verdadero.' },
    // Legado (fuera de venta)
    { id: 'carbono', legacy: true, name: 'Fibra de carbono (legado)', price: -1, pattern: 'carbono', colors: [0x15171c, 0x2c3038], desc: 'Pieza retirada del catálogo.' },
    { id: 'hielo', legacy: true, name: 'Criogénico (legado)', price: -1, pattern: 'cristal', colors: [0x9ffcff, 0x2a5a6a, 0xffffff], desc: 'Pieza retirada del catálogo.' },
    { id: 'neon', legacy: true, name: 'Neón Sintético (legado)', price: -1, pattern: 'acro', colors: [0x120812, 0xff3df0, 0xff3df0], desc: 'Pieza retirada del catálogo.' },
    { id: 'oro', legacy: true, name: 'Oro de las Cunas (legado)', price: -1, pattern: 'grabado', colors: [0xc99a10, 0xfff2a8], desc: 'Pieza retirada del catálogo.' },
    { id: 'abisal', legacy: true, name: 'Abisal (legado)', price: -1, pattern: 'venas', colors: [0x062a2a, 0x00ffc8, 0xa0fff0], desc: 'Pieza retirada del catálogo.' },
    { id: 'flujo', legacy: true, name: 'Flujo Vivo (legado)', price: -1, pattern: 'venas', colors: [0x5a0010, 0xff6a6a, 0xffd0d0], desc: 'Pieza retirada del catálogo.' }
  ];
  // Efectos de eliminación visibles para todo el escuadrón
  const killFx = [
    { id: 'ninguno', name: 'Sin efecto', price: 0, desc: 'Muertes discretas.' },
    { id: 'fractal', name: 'Fractal de neón', price: 250, color: 0x39d7ff, desc: 'Anillos fractales cian.' },
    { id: 'vacio', name: 'Implosión del vacío', price: 400, color: 0xb05cff, desc: 'El enemigo colapsa hacia dentro.' },
    { id: 'llamarada', name: 'Llamarada de Flujo', price: 550, color: 0xff3b3b, desc: 'Columna de fuego carmesí.' },
    { id: 'eco', name: 'Eco de Núcleo', price: -1, color: 0xffffff, desc: 'Exclusivo: completa un ciclo del Modo Historia.' }
  ];
  // Arsenal ampliado (Dead Cells + Call of Duty). kind: gun = fuego genérico parametrizado,
  // blade = cuerpo a cuerpo parametrizado. Rangos [min,max] se tiran al generar el arma.
  const arms = {
    smg: { name: 'Subfusil táctico', kind: 'gun', auto: 1, dmg: [7, 9], rate: 0.062, mag: [34, 42], reload: [1.3, 1.6], spread: [0.07, 0.1], speed: 1650, life: 0.6, bloomAdd: 0.004, bloomMax: 0.07, move: 1.06, kick: 0.25, alt: 'CORRER' },
    shotgun: { name: 'Escopeta táctica', kind: 'gun', auto: 0, pellets: 8, dmg: [11, 14], rate: 0.72, mag: [6, 8], reload: [1.8, 2.2], spread: [0.13, 0.16], speed: 1300, life: 0.42, coverMul: 1.8, selfKnock: 140, bloomAdd: 0, bloomMax: 0, kick: 1, alt: 'CORREDERA' },
    sniper: { name: 'Rifle de precisión pesado', kind: 'gun', auto: 0, ads: 1, dmg: [95, 120], rate: 1.15, mag: [5, 6], reload: [2.4, 2.8], spread: [0.002, 0.004], speed: 2600, life: 1.2, pierce: 3, coverMul: 2, bloomAdd: 0.03, bloomMax: 0.06, move: 0.92, kick: 1, alt: 'MIRA' },
    lmg: { name: 'Plataforma M42', kind: 'gun', auto: 1, dmg: [12, 15], rate: 0.09, mag: [70, 90], reload: [3.4, 3.9], spread: [0.05, 0.08], speed: 1750, life: 0.9, pierce: 1, bloomAdd: 0.003, bloomMax: 0.08, move: 0.84, kick: 0.4, alt: 'BÍPODE' },
    dagas: { name: 'Dagas gemelas', kind: 'blade', combo: 4, dmg: [13, 17], rate: 0.13, range: 56, height: 44, knock: 60, finMul: 2.4, altCd: 2.6, altShots: 3, altDmg: [18, 24], move: 1.08, alt: 'ABANICO' },
    clavos: { name: 'Pistola de clavos', kind: 'gun', auto: 0, dmg: [12, 15], rate: 0.3, mag: [8, 8], reload: [1.7, 1.9], spread: [0.05, 0.06], speed: 1300, life: 0.6, bloomAdd: 0.01, bloomMax: 0.05, kick: 0.3, alt: '—' },
    cetro: { name: 'Cetro del Rey', kind: 'blade', secret: 1, combo: 3, dmg: [40, 52], rate: 0.42, range: 88, height: 72, knock: 300, finMul: 1.8, altCd: 4, altShots: 5, altDmg: [45, 60], coverMul: 2, alt: 'DECRETO REAL' }
  };
  const archetypes = {
    pistol: 'Pistola táctica',
    katana: 'Katana de energía cinética',
    rifle: 'Rifle táctico',
    axe: 'Hacha mecánica transformable',
    smg: arms.smg.name, shotgun: arms.shotgun.name, sniper: arms.sniper.name, lmg: arms.lmg.name, dagas: arms.dagas.name, cetro: arms.cetro.name
  };
  // Camuflajes propios de cada arma nueva (3 de tienda + 1 de élite con materiales) y élite para las clásicas.
  // [arma, prefijo, [nombre, patrón, colores]...]: se expande una sola vez al cargar.
  const NEWCAMO = {
    smg: [['Asfalto Mojado', 'urbano', [0x22262b, 0x3d444c, 0x5d6670, 0x111316]], ['Voltio', 'acro', [0x0a0c06, 0xd8ff3a, 0x39d7ff]], ['Ceniza', 'oxido', [0x504c48, 0x7a3a18, 0x2a140a]]],
    shotgun: [['Cazador de Pantano', 'tigre', [0x4a5a2a, 0x1a2010]], ['Puerta Roja', 'peligro', [0xb0101e, 0x111111]], ['Hierro de Cloaca', 'oxido', [0x46423e, 0x8a3a10, 0x30180a]]],
    sniper: [['Fantasma Ártico', 'urbano', [0xc8d0d6, 0x9aa4ad, 0xe8eef2, 0x6a747d]], ['Ojo de Halcón', 'grabado', [0x14100a, 0xd9b04a]], ['Desierto Táctico', 'tigre', [0xc0a070, 0x6a5030]]],
    lmg: [['Acorazado', 'hexa', [0x1c2128, 0x7dff4f]], ['Brigada Oliva', 'urbano', [0x3a4030, 0x5a6248, 0x7a8466, 0x23261d]], ['Fundición', 'oxido', [0x56524e, 0xc05a14, 0x3a1a08]]],
    dagas: [['Colmillo', 'escamas', [0x101a12, 0x7dff4f]], ['Filo Lunar', 'cristal', [0xd8e8ff, 0x203050, 0xffffff]], ['Veneno', 'venas', [0x0a1a0a, 0x7dff4f, 0xd8ffd0]]],
    cetro: [['Corona Hundida', 'grabado', [0x1a1408, 0xffd34a]], ['Trono de Biomasa', 'venas', [0x200010, 0xff3df0, 0xffd0f0]], ['Rey Olvidado', 'damasco', [0x6a5a3a, 0x2a2010, 0xd8c8a0]]]
  };
  const ELITE = {
    pistol: ['Obsidiana Pulida', 'cristal', [0x1a1a22, 0x050508, 0x9b5cff]], rifle: ['Diamante de Flujo', 'cristal', [0xff6a8a, 0x3a0010, 0xffffff]],
    katana: ['Eclipse', 'damasco', [0x101014, 0x000000, 0xffd34a]], axe: ['Magma Forjado', 'venas', [0x1a0600, 0xff6a00, 0xffe0a0]],
    smg: ['Plasma Negro', 'acro', [0x000000, 0x9b5cff, 0xff3df0]], shotgun: ['Hueso de Alfa', 'escamas', [0xd8d0c0, 0x5a4a3a]],
    sniper: ['Ojo del Leviatán', 'venas', [0x200006, 0xff2020, 0xffffff]], lmg: ['Tormenta de Acero', 'damasco', [0x9aa4ad, 0x3a424a, 0xffffff]],
    dagas: ['Sangre de Rey', 'cristal', [0xff2a3a, 0x300006, 0xffd0d0]], cetro: ['Majestad Eterna', 'cristal', [0xffd34a, 0x5a3a00, 0xffffff]]
  };
  for (const [arch, list] of Object.entries(NEWCAMO)) list.forEach(([name, pattern, colors], i) =>
    weaponSkins.push({ id: arch + '_' + i, arch, name, price: 900 + i * 450, pattern, colors, desc: 'Diseñado para la geometría de ' + archetypes[arch].toLowerCase() + '.' }));
  for (const [arch, [name, pattern, colors]] of Object.entries(ELITE))
    weaponSkins.push({ id: arch + '_elite', arch, name: name + ' ★', price: -1, elite: true, cost: { credits: 5000, nucleo_flujo: 4, placa_ferrosa: 8, glandula_quimera: 6 }, pattern, colors, desc: 'Camuflaje de ÉLITE. Hito de veterano: requiere Núcleos de Flujo y partes de jefe.' });
  const perks = {
    vampirico: 'Vampírico: roba 4% del daño como vida',
    sobrecarga: 'Sobrecarga: 15% de crítico x2',
    arco: 'Arco eléctrico: encadena a un enemigo cercano',
    ejecutor: 'Ejecutor: +50% de daño a enemigos bajo 30%'
  };
  return { arms, weaponSkins, killFx, skins, trails, upgrades, upgradeCost, missions, descents, rarities, archetypes, perks };
});
