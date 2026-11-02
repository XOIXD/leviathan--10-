/* LEVIATHAN - Generador procedural de armas por run.
   Arquetipos: Katana de energía cinética (Dead Cells), Rifle táctico con accesorios (CoD),
   Hacha mecánica transformable hacha/cañón (Monster Hunter). */
const Catalog = require('../shared/catalog');

const PREFIX = ['Ferrosa', 'Neónica', 'Abisal', 'Cinética', 'Espectral', 'Tectónica', 'Voltaica', 'Carmesí'];
const NICK = ['Colmillo', 'Tormenta', 'Viuda', 'Mareógrafo', 'Kraken', 'Réquiem', 'Ancla', 'Sirena', 'Fosa', 'Ballena'];
const ATTACH = {
  mira: { name: 'Mira holográfica', apply: w => { w.spread *= 0.5; } },
  cargador: { name: 'Cargador extendido', apply: w => { w.mag = Math.round(w.mag * 1.5); } },
  empunadura: { name: 'Empuñadura vertical', apply: w => { w.spread *= 0.7; w.recoil *= 0.6; } },
  silenciador: { name: 'Silenciador', apply: w => { w.dmg *= 1.08; w.quiet = true; } },
  canon: { name: 'Cañón pesado', apply: w => { w.dmg *= 1.25; w.rate *= 1.15; } },
  perforante: { name: 'Munición perforante', apply: w => { w.pierce = 1; w.coverMul = 1.6; } }
};

function rollRarity(rng, boost) {
  let r = rng.next();
  if (boost) r = Math.min(0.999, r + 0.35);
  if (r > 0.94) return 3;
  if (r > 0.75) return 2;
  if (r > 0.45) return 1;
  return 0;
}

function generateWeapon(rng, profile) {
  const A = Catalog.arms;
  // Botín: clásicas + arsenal ampliado; el Cetro sólo si se desbloqueó en la guarida secreta
  // Botín: todo el arsenal salvo las armas especiales (Cetro secreto, Pistola de clavos de penalización)
  const archs = Object.keys(Catalog.archetypes).filter(k => k !== 'cetro' && k !== 'clavos');
  const owned = (profile && profile.arms) || [];
  if (owned.includes('cetro')) archs.push('cetro');
  let arch = rng.pick(archs);
  // Penalización: descenso sin arma comprada y sin biomasa → Pistola de clavos (sin rareza, perks ni habilidad)
  if (profile && profile.forceNail) {
    const d = A.clavos;
    return { arch: 'clavos', rarity: 0, color: 0x8a8a8a, rarityName: 'Estropeada', perks: [], attachments: [], pierce: 0, coverMul: 1, recoil: 1, quiet: false,
      name: 'Pistola de clavos oxidada', dmg: rng.range(d.dmg[0], d.dmg[1]), rate: d.rate, mag: 8, reload: rng.range(d.reload[0], d.reload[1]), spread: d.spread[0], speed: d.speed, life: d.life,
      pellets: 1, selfKnock: 0, bloomAdd: d.bloomAdd, bloomMax: d.bloomMax, auto: false, ads: false, move: 1, kick: d.kick, altCd: 0, shake: 0.05, gun: true };
  }
  if (profile && profile.contract && (archs.includes(profile.contract))) arch = profile.contract;
  const mods = (profile && profile.mods) || {};
  let rarity = rollRarity(rng, profile && profile.rarityBoost);
  if (mods.nucleo_vivo) rarity = Math.max(1, rarity);
  const rar = Catalog.rarities[rarity];
  const w = {
    arch, rarity, color: rar.color, rarityName: rar.name, perks: [], attachments: [],
    pierce: 0, coverMul: 1, recoil: 1, quiet: false
  };
  if (arch === 'katana') {
    Object.assign(w, {
      dmg: rng.range(22, 30), rate: rng.range(0.24, 0.32), range: 74, height: 56, knock: 160,
      altCd: 2.2, waveDmg: rng.range(30, 42), shake: 0.12
    });
  } else if (arch === 'rifle') {
    Object.assign(w, {
      dmg: rng.range(9, 13), rate: rng.range(0.085, 0.12), mag: rng.int(24, 34), reload: rng.range(1.4, 1.9),
      spread: rng.range(0.03, 0.06), speed: 1700, knock: 50, altCd: 0, shake: 0.08
    });
    const keys = rng.shuffle(Object.keys(ATTACH)).slice(0, 1 + Math.min(2, rarity) + (mods.canon_estriado ? 1 : 0));
    if (mods.canon_estriado) w.reload *= 0.8;
    for (const k of keys) { ATTACH[k].apply(w); w.attachments.push(ATTACH[k].name); }
  } else if (arch === 'pistol') {
    Object.assign(w, {
      dmg: rng.range(24, 32), rate: 0.16, mag: rng.int(10, 14), reload: rng.range(0.9, 1.2),
      spread: rng.range(0.015, 0.03), speed: 1800, knock: 70, altCd: 3.2, shake: 0.1, pierce: rarity >= 2 ? 1 : 0
    });
  } else if (A[arch]) {
    const d = A[arch], R2 = (v) => Array.isArray(v) ? rng.range(v[0], v[1]) : v;
    Object.assign(w, {
      dmg: R2(d.dmg), rate: d.rate, mag: d.mag ? rng.int(d.mag[0], d.mag[1]) : 0, reload: d.reload ? R2(d.reload) : 0,
      spread: d.spread ? R2(d.spread) : 0, speed: d.speed || 0, life: d.life, pellets: d.pellets || 1, pierce: (d.pierce || 0) + (rarity >= 2 && d.kind === 'gun' ? 1 : 0),
      coverMul: d.coverMul || 1, selfKnock: d.selfKnock || 0, bloomAdd: d.bloomAdd || 0, bloomMax: d.bloomMax || 0, auto: !!d.auto, ads: !!d.ads,
      move: d.move || 1, kick: d.kick || 0.5, range: d.range, height: d.height, knock: d.knock || 80, combo: d.combo, finMul: d.finMul,
      altCd: d.altCd || 0, altShots: d.altShots || 0, altDmg: d.altDmg ? R2(d.altDmg) : 0, shake: d.kind === 'gun' ? 0.06 + 0.2 * (d.kick || 0.5) : 0.12,
      gun: d.kind === 'gun', blade: d.kind === 'blade',
      burst: d.burst || 0, rocket: d.rocket || 0, stun: d.stun || 0, altKind: d.altKind || 'wave', lunge: !!d.lunge, fam: d.fam || ''
    });
    if (w.altDmg) w.altDmg *= rar.mul;
  } else {
    Object.assign(w, {
      dmg: rng.range(55, 72), rate: rng.range(0.6, 0.72), range: 96, height: 70, knock: 380,
      pellets: 6, pelletDmg: rng.range(10, 13), cannonRate: 0.8, spread: 0.16, speed: 1250,
      coverMul: 2.2, altCd: 0.45, shake: 0.35
    });
  }
  if (arch === 'katana' && mods.filo_resonante) { w.dmg *= 1.15; w.waveDmg *= 1.15; w.waveCover = true; }
  if (arch === 'axe' && mods.pistones_alfa) { w.pellets += 2; w.instantTransform = true; }
  w.dmg *= rar.mul;
  if (w.waveDmg) w.waveDmg *= rar.mul;
  if (w.pelletDmg) w.pelletDmg *= rar.mul;
  const perkKeys = Object.keys(Catalog.perks);
  if (rarity === 3) w.perks.push(rng.pick(perkKeys));
  else if (rarity >= 1 && rng.chance(0.3)) w.perks.push(rng.pick(perkKeys));
  if (mods.flujo_cristalizado) { const left = perkKeys.filter(k => !w.perks.includes(k)); if (left.length) w.perks.push(rng.pick(left)); }
  const base = { katana: 'Katana', rifle: 'Rifle', axe: 'Hacha', pistol: 'Pistola', smg: 'Subfusil', shotgun: 'Escopeta', sniper: 'Francotirador', lmg: 'M42', dagas: 'Dagas', cetro: 'Cetro' }[arch] || (A[arch] ? A[arch].name : 'Arma');
  w.name = `${base} ${rng.pick(PREFIX)} "${rng.pick(NICK)}" MK-${rng.int(2, 9)}`;
  return w;
}

function publicWeapon(w) {
  return {
    arch: w.arch, name: w.name, rarity: w.rarity, rarityName: w.rarityName, color: w.color,
    perks: w.perks, attachments: w.attachments, mag: w.mag || 0,
    dmg: Math.round(w.dmg), rate: w.rate, cannonRate: w.cannonRate || 0, reload: w.reload || 0,
    speed: w.speed || 0, life: w.life || 0.9, altCd: w.altCd, shake: w.shake, gun: !!w.gun, blade: !!w.blade, auto: !!w.auto, ads: !!w.ads, pellets: w.pellets || 1, combo: w.combo || 0, kick: w.kick || 0, burst: w.burst || 0, altKind: w.altKind || '', fam: w.fam || ''
  };
}

module.exports = { generateWeapon, publicWeapon };
