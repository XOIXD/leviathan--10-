/* LEVIATHAN - Cuentas y perfiles persistentes.
   - Registro / inicio de sesión con usuario + contraseña (scrypt con sal, comparación en tiempo constante).
   - Tokens de sesión ("recordarme") guardados como hash SHA-256.
   - Progreso de campaña, biomasa, materiales, forja, rachas, misiones diarias/semanales y contratos de campo.
   La carpeta de datos se puede mover a una carpeta sincronizada (OneDrive/Dropbox/Drive) con
   la variable LEVIATHAN_DATA para llevar las cuentas entre computadores. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Catalog = require('../shared/catalog');
const Campaign = require('../shared/campaign');
const RNG = require('../shared/rng');

const DIR = process.env.LEVIATHAN_DATA ? path.resolve(process.env.LEVIATHAN_DATA) : path.join(__dirname, '..', 'data');
const FILE = path.join(DIR, 'profiles.json');
let db = {};
let saveTimer = null;

function load() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    if (fs.existsSync(FILE)) db = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
  } catch (e) {
    console.error('[perfiles] No se pudo leer profiles.json, se inicia vacío:', e.message);
    db = {};
  }
}
const fsp = fs.promises;
const scryptAsync = (pass, salt) => new Promise((res, rej) => crypto.scrypt(String(pass), salt, 64, (e, k) => (e ? rej(e) : res(k.toString('hex')))));
let saving = false, dirty = false;
// Guardado asíncrono: nunca bloquea el bucle de juego (escritura atómica tmp + rename)
async function saveAsync() {
  if (saving) { dirty = true; return; }
  saving = true; dirty = false;
  try {
    const tmp = FILE + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(db));
    await fsp.rename(tmp, FILE);
  } catch (e) { console.error('[perfiles] Error al guardar:', e.message); }
  saving = false;
  if (dirty) save();
}
function saveNow() {
  try {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, FILE);
  } catch (e) { console.error('[perfiles] Error al guardar:', e.message); }
}
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; saveAsync(); }, 1500);
}

function today() { return new Date().toLocaleDateString('en-CA'); }
function weekKey(d) {
  d = d || new Date();
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() + '-S' + Math.ceil(((t - y0) / 86400000 + 1) / 7);
}
function pickIds(seedStr, list, k) {
  const rng = new RNG(RNG.hashStr(seedStr));
  return rng.shuffle(list.map(m => m.id)).slice(0, k);
}

function ensureRotations(p) {
  const d = today();
  if (!p.daily || p.daily.date !== d) p.daily = { date: d, ids: pickIds('leviathan-' + d, Catalog.missions, 3), progress: {}, claimed: {}, bonus: false };
  if (!p.sideOffer || p.sideOffer.date !== d) p.sideOffer = { date: d, ids: pickIds('side-' + d, Campaign.side, 3) };
  const w = weekKey();
  if (!p.weekly || p.weekly.week !== w) p.weekly = { week: w, ids: pickIds('weekly-' + w, Campaign.weekly, 3), progress: {}, claimed: {} };
  // Pase de temporada: al cambiar de temporada el progreso se reinicia (lo ya obtenido se conserva)
  const sid = Campaign.seasonId();
  if (!p.seasonProg || p.seasonProg.id !== sid) p.seasonProg = { id: sid, pts: 0, claimed: [] };
}

// Puntos de temporada (endRun): descender +1, victoria +2, contrato de campo +1
// Clasificación global: se ordena como mucho cada 30 s (O(n log n) sobre cuentas, nunca por petición)
// Tres tablas independientes (bajas, K/D, biomasa). Se reordenan como mucho cada 30 s; el admin no figura.
let lbCache = null, lbAt = 0;
const LB_SORT = { k: (a, b) => b.k - a.k || b.kd - a.kd, kd: (a, b) => b.kd - a.kd || b.k - a.k, bio: (a, b) => b.bio - a.bio || b.k - a.k };
function leaderboard(name, cat) {
  const now = Date.now();
  if (!lbCache || now - lbAt > 30000) {
    const rows = Object.values(db).filter(p => p && p.auth && p.stats && !p.admin).map(p => {
      const k = p.stats.kills || 0, d = p.stats.deaths || 0;
      return { n: p.name, k, d, kd: +(k / Math.max(1, d)).toFixed(2), bio: p.stats.bio || 0, w: p.stats.wins || 0 };
    });
    lbCache = {};
    for (const c of Object.keys(LB_SORT)) lbCache[c] = rows.slice().sort(LB_SORT[c]);
    lbAt = now;
  }
  const list = lbCache[LB_SORT[cat] ? cat : 'k'];
  const i = list.findIndex(r => r.n.toLowerCase() === String(name).toLowerCase());
  return { cat: LB_SORT[cat] ? cat : 'k', top: list.slice(0, 10), me: i >= 0 ? Object.assign({ rank: i + 1 }, list[i]) : null, total: list.length };
}

// Cuenta de administrador: se crea al arrancar (hash scrypt, nunca la contraseña en disco).
// Cambia la contraseña con la variable de entorno LEVIATHAN_ADMIN_PASS.
function ensureAdmin() {
  const k = 'admin';
  if (!db[k] || !db[k].auth) {
    const p = db[k] = normalize(defaults('admin'));
    const salt = crypto.randomBytes(16).toString('hex');
    p.auth = { salt, hash: crypto.scryptSync(process.env.LEVIATHAN_ADMIN_PASS || 'Leviathan_Root_99#X', salt, 64).toString('hex') };
  }
  db[k].admin = true;
  save();
}
// Recursos infinitos: el admin se rellena cada vez que se consulta su perfil
function adminFill(p) {
  if (!p.admin) return;
  p.credits = 9999999;
  for (const m of Object.keys(p.materials)) p.materials[m] = 9999;
  p.skins = Catalog.skins.map(s => s.id); p.trails = Catalog.trails.map(t => t.id);
  p.wskinOwned = Array.from(new Set(p.wskinOwned.concat(Catalog.weaponSkins.map(w => w.id))));
  p.fxOwned = Catalog.killFx.map(f => f.id); p.arms = ['cetro'];
  p.story.solo = 99; p.story.coop = 99;   // todos los descensos desbloqueados
  if (p.god === undefined) p.god = true;
}

function addSeasonPoints(p, n) {
  ensureRotations(p);
  p.seasonProg.pts = Math.min(999, p.seasonProg.pts + Math.max(0, n | 0));
}
// Reclamo de un nivel del pase. Sólo existe durante su temporada: el id se valida contra la vigente.
function claimSeason(p, tier) {
  ensureRotations(p);
  const T = Campaign.SEASON_TIERS[tier | 0];
  const sp = p.seasonProg;
  if (!T) return { ok: false, msg: 'Nivel de temporada desconocido.' };
  if (sp.claimed.includes(tier | 0)) return { ok: false, msg: 'Ya reclamaste esa recompensa.' };
  if (sp.pts < T.pts) return { ok: false, msg: `Necesitas ${T.pts} puntos de temporada (tienes ${sp.pts}).` };
  sp.claimed.push(tier | 0);
  if (T.reward.camo2) {
    const camo = Campaign.seasonCamo(sp.id + 'b');
    if (camo && !p.wskinOwned.includes(camo.id)) p.wskinOwned.push(camo.id);
    if (camo) p.wskins[camo.arch] = camo.id;
    return { ok: true, msg: `¡${camo ? camo.name : 'Acabado'} obtenido! Exclusivo de esta temporada.` };
  }
  if (T.reward.camo) {
    const camo = Campaign.seasonCamo(sp.id);
    if (camo && !p.wskinOwned.includes(camo.id)) p.wskinOwned.push(camo.id);
    if (camo) p.wskins[camo.arch] = camo.id;   // equipado al reclamar: se ve de inmediato
    return { ok: true, msg: `¡${camo ? camo.name : 'Acabado'} obtenido! Exclusivo de esta temporada.` };
  }
  addMaterials(p, T.reward);
  return { ok: true, msg: `Recompensa de temporada: ${T.label}.` };
}

function defaults(name) {
  const mats = {};
  for (const k of Object.keys(Campaign.materials)) mats[k] = 0;
  return {
    name, credits: 300,
    upgrades: { vida: 0, dano: 0, dash: 0, kit: 0 },
    skins: ['recluta'], trails: ['ninguna'], skin: 'recluta', trail: 'ninguna',
    contract: null, rarityBoost: false, extraStims: 0,
    story: { solo: 0, coop: 0 }, cycle: { solo: 0, coop: 0 }, endings: {},
    materials: mats, mods: {}, streakSet: 'asalto', side: null, seen: {},
    wskins: {}, wskinOwned: ['estandar'], fx: 'ninguno', fxOwned: ['ninguno'], truthChoice: null,
    gear: { owned: [], equip: {} }, arms: [],
    stats: { runs: 0, wins: 0, kills: 0 },
    daily: null, weekly: null, sideOffer: null, auth: null, tokens: []
  };
}

function key(name) { return String(name).trim().toLowerCase(); }

function normalize(p) {
  const d = defaults(p.name);
  for (const f of Object.keys(d)) if (p[f] === undefined || p[f] === null && d[f] !== null) p[f] = d[f];
  for (const u of Object.keys(d.upgrades)) if (p.upgrades[u] === undefined) p.upgrades[u] = 0;
  for (const m of Object.keys(d.materials)) if (p.materials[m] === undefined) p.materials[m] = 0;
  ensureRotations(p);
  return p;
}

function get(name) {
  const k = key(name);
  if (!db[k]) db[k] = defaults(String(name).trim());
  save();
  return normalize(db[k]);
}

// ------------------------------------------------------------------ autenticación
function sha(t) { return crypto.createHash('sha256').update(t).digest('hex'); }
function issueToken(p) {
  const token = crypto.randomBytes(32).toString('hex');
  p.tokens = (p.tokens || []).slice(-4);
  p.tokens.push(sha(token));
  save();
  return token;
}

async function register(user, pass) {
  const name = String(user || '').replace(/[^\p{L}\p{N}_\- ]/gu, '').trim().slice(0, 16);
  if (name.length < 3) return { ok: false, msg: 'El usuario debe tener al menos 3 caracteres.' };
  if (String(pass || '').length < 4) return { ok: false, msg: 'La contraseña debe tener al menos 4 caracteres.' };
  const k = key(name);
  // Reserva síncrona: dos registros simultáneos del mismo nombre no pueden pisarse
  if ((db[k] && db[k].auth) || registering.has(k)) return { ok: false, msg: 'Ese usuario ya existe. Inicia sesión.' };
  registering.add(k);
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await scryptAsync(pass, salt);
    const p = db[k] ? normalize(db[k]) : (db[k] = normalize(defaults(name)));
    p.auth = { salt, hash };
    save();
    return { ok: true, profile: p, token: issueToken(p) };
  } finally { registering.delete(k); }
}
const registering = new Set();

async function login(user, pass) {
  const p = db[key(user || '')];
  if (!p || !p.auth) { await scryptAsync(String(pass || ''), 'x'); return { ok: false, msg: 'Usuario o contraseña incorrectos.' }; }
  const h = Buffer.from(await scryptAsync(pass, p.auth.salt), 'hex');
  const ok = crypto.timingSafeEqual(h, Buffer.from(p.auth.hash, 'hex'));
  if (!ok) return { ok: false, msg: 'Usuario o contraseña incorrectos.' };
  normalize(p);
  return { ok: true, profile: p, token: issueToken(p) };
}

function loginToken(token) {
  if (!token || typeof token !== 'string' || token.length > 128) return { ok: false, msg: 'Sesión expirada.' };
  const h = sha(token);
  for (const p of Object.values(db)) if (p.auth && (p.tokens || []).includes(h)) return { ok: true, profile: normalize(p), token };
  return { ok: false, msg: 'Sesión expirada. Inicia sesión de nuevo.' };
}

function logout(p, token) { if (p && token) { p.tokens = (p.tokens || []).filter(t => t !== sha(token)); save(); } }

// ------------------------------------------------------------------ progreso
function addMaterials(p, bag, mul) {
  for (const [k, v] of Object.entries(bag || {})) {
    if (k === 'credits') { p.credits += Math.floor(v * (mul || 1)); continue; }
    if (p.materials[k] === undefined) continue;
    p.materials[k] += Math.floor(v * (mul || 1));
  }
}

// Misiones diarias. Devuelve lista de misiones recién completadas.
function progress(p, kind, amount) {
  ensureRotations(p);
  const done = [];
  for (const id of p.daily.ids) {
    const m = Catalog.missions.find(mm => mm.id === id);
    if (!m || m.kind !== kind || p.daily.claimed[id]) continue;
    const before = p.daily.progress[id] || 0;
    if (before >= m.target) continue;
    const now = m.mode === 'max' ? Math.max(before, amount) : before + amount;
    p.daily.progress[id] = Math.min(m.target, now);
    if (p.daily.progress[id] >= m.target) done.push(m);
  }
  for (const id of p.weekly.ids) {
    const m = Campaign.weekly.find(mm => mm.id === id);
    if (!m || m.kind !== kind || p.weekly.claimed[id]) continue;
    const before = p.weekly.progress[id] || 0;
    if (before >= m.target) continue;
    p.weekly.progress[id] = Math.min(m.target, before + amount);
    if (p.weekly.progress[id] >= m.target) done.push({ text: '[SEMANAL] ' + m.text, reward: m.reward.credits });
  }
  if (done.length) save();
  return done;
}

function claim(p, id) {
  ensureRotations(p);
  const w = Campaign.weekly.find(mm => mm.id === id);
  if (w) {
    if (!p.weekly.ids.includes(id)) return { ok: false, msg: 'Contrato semanal no disponible.' };
    if (p.weekly.claimed[id]) return { ok: false, msg: 'Recompensa ya reclamada.' };
    if ((p.weekly.progress[id] || 0) < w.target) return { ok: false, msg: 'Objetivo aún incompleto.' };
    p.weekly.claimed[id] = true;
    addMaterials(p, w.reward);
    save();
    return { ok: true, msg: 'Contrato semanal cobrado: ' + rewardText(w.reward) };
  }
  const m = Catalog.missions.find(mm => mm.id === id);
  if (!m || !p.daily.ids.includes(id)) return { ok: false, msg: 'Misión no disponible hoy.' };
  if (p.daily.claimed[id]) return { ok: false, msg: 'Recompensa ya reclamada.' };
  if ((p.daily.progress[id] || 0) < m.target) return { ok: false, msg: 'Objetivo aún incompleto.' };
  p.daily.claimed[id] = true;
  p.credits += m.reward;
  let msg = `+${m.reward} biomasa`;
  if (m.unlock && m.unlock.trail && !p.trails.includes(m.unlock.trail)) {
    p.trails.push(m.unlock.trail); msg += ' · Estela "Corona Abisal" desbloqueada';
  }
  if (!p.daily.bonus && p.daily.ids.every(i => p.daily.claimed[i])) {
    p.daily.bonus = true;
    if (!p.skins.includes('operador_diario')) { p.skins.push('operador_diario'); msg += ' · Skin "Operador Constante" desbloqueada'; }
    p.credits += 250; msg += ' · Bono diario +250';
  }
  save();
  return { ok: true, msg };
}

function rewardText(r) {
  return Object.entries(r).map(([k, v]) => k === 'credits' ? `${v} biomasa` : `${v} ${Campaign.materials[k] ? Campaign.materials[k].name : k}`).join(', ');
}

// Paga un coste mixto {credits, material: n}. Devuelve mensaje de error o null.
function payCost(p, cost) {
  for (const [k, v] of Object.entries(cost)) {
    const have = k === 'credits' ? p.credits : (p.materials[k] || 0);
    if (have < v) return `Te falta: ${k === 'credits' ? 'biomasa' : Campaign.materials[k].name} (${have}/${v}).`;
  }
  for (const [k, v] of Object.entries(cost)) { if (k === 'credits') p.credits -= v; else p.materials[k] -= v; }
  save();
  return null;
}

function craft(p, id) {
  const r = Campaign.recipes.find(x => x.id === id);
  if (!r) return { ok: false, msg: 'Receta desconocida.' };
  if (p.mods[id]) return { ok: false, msg: 'Ya forjaste esta modificación.' };
  for (const [k, v] of Object.entries(r.cost)) {
    const have = k === 'credits' ? p.credits : (p.materials[k] || 0);
    if (have < v) return { ok: false, msg: `Te falta: ${k === 'credits' ? 'biomasa' : Campaign.materials[k].name} (${have}/${v}).` };
  }
  for (const [k, v] of Object.entries(r.cost)) { if (k === 'credits') p.credits -= v; else p.materials[k] -= v; }
  p.mods[id] = true;
  save();
  return { ok: true, msg: `${r.name} forjado.` };
}

function publicView(p) {
  ensureRotations(p); adminFill(p);
  return {
    name: p.name, credits: p.credits, upgrades: p.upgrades, skins: p.skins, trails: p.trails,
    skin: p.skin, trail: p.trail, contract: p.contract, rarityBoost: p.rarityBoost,
    extraStims: p.extraStims, stats: p.stats, daily: p.daily, weekly: p.weekly,
    story: p.story, cycle: p.cycle, endings: p.endings, materials: p.materials, mods: p.mods,
    streakSet: p.streakSet, side: p.side, sideOffer: p.sideOffer, seen: p.seen,
    gear: p.gear, arms: p.arms || [], wskins: p.wskins, wskinOwned: p.wskinOwned, fx: p.fx, fxOwned: p.fxOwned, truthChoice: p.truthChoice,
    admin: !!p.admin, gold: !!(p.endings && (p.endings.solo || p.endings.coop)) || (p.cycle && p.cycle.solo >= 1),
    season: Object.assign({ id: Campaign.seasonId() }, Campaign.season()), seasonProg: p.seasonProg
  };
}

load();
ensureAdmin();
process.on('exit', saveNow);

module.exports = { ensureAdmin, leaderboard, addSeasonPoints, claimSeason, payCost, get, save, saveNow, progress, claim, craft, publicView, today, register, login, loginToken, logout, addMaterials, rewardText, DIR };
