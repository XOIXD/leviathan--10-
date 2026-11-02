/* LEVIATHAN - Constantes compartidas (cliente + servidor). */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else { root.LV = root.LV || {}; root.LV.C = m; }
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    TILE: 32,
    TICK_RATE: 60,
    DT: 1 / 60,
    SNAP_EVERY: 3,            // 60 Hz simulación -> 20 Hz snapshots por lotes
    MAX_PLAYERS: 10,
    ROOM_W: 32,               // tiles por sala (ancho)
    ROOM_H: 18,               // tiles por sala (alto)
    INTEREST_R: 1700,         // radio de interés para filtrar entidades por jugador

    // Cuerpo del jugador
    PW: 20, PH: 40, PH_CROUCH: 24,

    // Movimiento (inspirado en Dead Cells)
    GRAVITY: 2100,
    MAX_FALL: 950,
    RUN: 270,
    ACC_GROUND: 2600,
    DECEL_GROUND: 3200,
    ACC_AIR: 1700,
    JUMP_V: 730,
    AIR_JUMP_V: 640,
    JUMP_CUT_GRAVITY: 2.2,    // gravedad extra al soltar salto (salto variable)
    COYOTE: 0.1,
    JUMP_BUFFER: 0.13,
    AIR_JUMPS: 1,
    DASH_SPEED: 760,
    DASH_TIME: 0.16,
    DASH_CD: 0.65,
    DROP_TIME: 0.22,

    // Botones (bitmask de input)
    B: { L: 1, R: 2, U: 4, D: 8, JUMP: 16, DASH: 32, FIRE: 64, ALT: 128, INT: 256, RELOAD: 512, STREAK: 1024, GREN: 2048, MELEE: 4096, GTYPE: 8192 },

    // Tipos de tile
    T: { EMPTY: 0, SOLID: 1, PLAT: 2, DOOR: 3 },

    ENEMY_TYPES: ['soldier', 'berserker', 'drone', 'elite', 'warden', 'turret', 'alpha', 'heart'],
    GREN_FUSE: 2.2,
    GREN_SPEED: 640,

    REVIVE_TIME: 2.5,
    BLEED_TIME: 25,
    STIM_TIME: 1.4,
    WIPE_WINDOW: 10
  };
});
