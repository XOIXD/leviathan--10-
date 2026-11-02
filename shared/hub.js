/* LEVIATHAN - Distribución del Refugio (zona segura). Compartido para que cliente y servidor
   tengan exactamente la misma geometría (los NPCs se simulan con física real en el servidor). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./constants'));
  else { root.LV = root.LV || {}; root.LV.Hub = factory(root.LV.C); }
})(typeof self !== 'undefined' ? self : this, function (C) {
  const TS = C.TILE;
  function build() {
    const tw = 76, th = 22;
    const tiles = new Uint8Array(tw * th).fill(0);
    const set = (x, y, v) => { tiles[y * tw + x] = v; };
    for (let x = 0; x < tw; x++) { set(x, 0, 1); set(x, 1, 1); for (let y = 19; y < th; y++) set(x, y, 1); }
    for (let y = 0; y < th; y++) { set(0, y, 1); set(1, y, 1); set(tw - 1, y, 1); set(tw - 2, y, 1); }
    // Entrepiso del traficante (plataforma atravesable)
    for (let x = 22; x <= 34; x++) set(x, 14, 2);
    // Pasarela alta
    for (let x = 40; x <= 47; x++) set(x, 10, 2);
    // Escalón metálico decorativo
    for (let x = 60; x <= 63; x++) set(x, 18, 1);
    const floorTop = 19 * TS;
    const npcs = [
      { id: 0, key: 'tailor', role: 'tailor', name: 'NOVA', title: 'Sastre de exotrajes', x: 9 * TS, y: floorTop - 52, patrol: [6 * TS, 13 * TS], color: 0xff4fd8 },
      { id: 1, key: 'mechanic', role: 'mechanic', name: 'RIVETS', title: 'Mecánica jefe', x: 18 * TS, y: floorTop - 52, patrol: [15 * TS, 21 * TS], color: 0xffb020 },
      { id: 2, key: 'trafficker', role: 'trafficker', name: 'KAI "SOMBRA"', title: 'Traficante de armas', x: 28 * TS, y: 14 * TS - 52, patrol: [24 * TS, 32 * TS], color: 0x5dff7a },
      { id: 3, key: 'commander', role: 'commander', name: 'COMANDANTE VEX', title: 'Mando de descensos', x: 66 * TS, y: floorTop - 52, patrol: [65 * TS, 70 * TS], color: 0x39d7ff },
      { id: 4, key: 'ranker', role: 'ranker', name: 'B-0T', title: 'Registro de combate', x: 61 * TS, y: floorTop - 52, patrol: [57 * TS, 63 * TS], color: 0x7dff4f }
    ];
    return {
      tw, th, tiles, covers: [], npcs,
      board: { x: 52 * TS, y: floorTop, w: 72, h: 84 },
      elevator: { x: 71 * TS, y: floorTop, w: 96 },
      spawn: { x: 40 * TS, y: floorTop - C.PH },
      floorTop
    };
  }
  return { build };
});
