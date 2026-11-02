/* LEVIATHAN - Calidad gráfica y efectos de cámara (post-procesado WebGL de Phaser 3.90).
   ALTA: bloom + viñeta + luces dinámicas · MEDIA: viñeta + luces · BAJA: sin post-proceso.
   Se ajusta solo a la baja si los FPS caen por debajo de 45 de forma sostenida. Tecla P = cambiar. */
G.Gfx = {
  levels: ['alta', 'media', 'baja'],
  level: 'alta',
  lights: true,
  lowT: 0,
  load() {
    try { const v = localStorage.getItem('lv_gfx'); if (this.levels.includes(v)) this.level = v; } catch (e) { /* sin almacenamiento */ }
    this.lights = this.level !== 'baja';
  },
  set(level) {
    this.level = level; this.lights = level !== 'baja';
    try { localStorage.setItem('lv_gfx', level); } catch (e) { /* sin almacenamiento */ }
    for (const k of ['Hub', 'Run']) { const s = G.game.scene.getScene(k); if (s && s.sys.isActive()) this.apply(s.cameras.main); }
  },
  cycle() { const i = this.levels.indexOf(this.level); this.set(this.levels[(i + 1) % 3]); return this.level; },
  apply(cam) {
    if (!cam.postFX || G.game.renderer.type !== Phaser.WEBGL) return;
    cam.postFX.clear();
    if (this.level === 'alta') cam.postFX.addBloom(0xffffff, 1, 1, 1.1, 1.15, 4);
    if (this.level !== 'baja') cam.postFX.addVignette(0.5, 0.5, 0.92, 0.35);
  },
  // Autoajuste: protege los 60 FPS en equipos modestos
  watch(dt) {
    const fps = G.game.loop.actualFps;
    if (this.level !== 'baja' && fps < 45) { this.lowT += dt; if (this.lowT > 6) { this.lowT = 0; const l = this.level === 'alta' ? 'media' : 'baja'; this.set(l); return l; } }
    else this.lowT = Math.max(0, this.lowT - dt);
    return null;
  }
};
G.Gfx.load();
