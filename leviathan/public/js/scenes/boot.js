/* LEVIATHAN - Arranque: genera todas las texturas procedurales y habilita el login. */
G.BootScene = class extends Phaser.Scene {
  constructor() { super({ key: 'Boot' }); }
  create() {
    G.Tex.generate(this);
    this.scene.launch('UI');
    G.bootReady = true;
    if (G.onBoot) G.onBoot();
  }
};
