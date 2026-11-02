/* LEVIATHAN - Chat de voz ligero (pulsar para hablar: B).
   Captura → reducción a 8 kHz → μ-law (8 bits) ≈ 8 KB/s por hablante. El servidor sólo reenvía bytes
   (en BR, sólo a tu equipo). Reproducción con búfer de 80 ms por hablante e indicador de quién habla.
   El micrófono exige contexto seguro: http://localhost o HTTPS (en LAN por http el navegador lo bloquea). */
G.Voice = (function () {
  const RATE = 8000;
  let stream = null, proc = null, talking = false, ready = false, busy = false;
  const nextT = new Map(), speaking = new Map();

  // μ-law (G.711): 14 bits → 8 bits
  function enc(s) {
    let x = Math.max(-1, Math.min(1, s)) * 32635;
    const sign = x < 0 ? 0x80 : 0; if (sign) x = -x;
    x += 132;
    let exp = 7; for (let m = 0x4000; (x & m) === 0 && exp > 0; m >>= 1) exp--;
    return ~(sign | (exp << 4) | ((x >> (exp + 3)) & 0x0f)) & 0xff;
  }
  const DEC = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const u = ~i & 0xff, sign = u & 0x80, exp = (u >> 4) & 7, man = u & 0x0f;
    const x = (((man << 3) + 132) << exp) - 132;
    DEC[i] = (sign ? -x : x) / 32768;
  }

  async function init() {
    if (ready || busy) return ready;
    busy = true;
    try {
      if (!navigator.mediaDevices || !window.isSecureContext) throw new Error('insecure');
      G.Sfx.init();
      const ctx = G.Sfx.ctx;
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const src = ctx.createMediaStreamSource(stream);
      proc = ctx.createScriptProcessor(4096, 1, 1);           // ~85 ms por paquete → ~12 paquetes/s
      const mute = ctx.createGain(); mute.gain.value = 0;
      const ratio = ctx.sampleRate / RATE;
      proc.onaudioprocess = (e) => {
        if (!talking || !G.Net.socket || !G.Net.socket.connected) return;
        const inp = e.inputBuffer.getChannelData(0), n = Math.floor(inp.length / ratio), out = new Uint8Array(n);
        for (let i = 0; i < n; i++) {                        // promedio por bloque = filtro paso bajo barato
          let acc = 0; const a = Math.floor(i * ratio), b = Math.floor((i + 1) * ratio);
          for (let j = a; j < b; j++) acc += inp[j];
          out[i] = enc(acc / Math.max(1, b - a) * 1.6);
        }
        G.Net.socket.emit('vc', out.buffer);
      };
      src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
      ready = true;
    } catch (err) {
      if (G.UI) G.UI.addFeed(err.message === 'insecure' ? 'Voz: el micrófono requiere abrir el juego en localhost o HTTPS' : 'Voz: permiso de micrófono denegado', 0xff6b6b);
    }
    busy = false;
    return ready;
  }

  function play(id, buf) {
    const ctx = G.Sfx.ctx;
    if (!ctx || G.Sfx.muted) return;
    const bytes = new Uint8Array(buf), n = bytes.length;
    if (!n) return;
    const ab = ctx.createBuffer(1, n, RATE), ch = ab.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = DEC[bytes[i]];
    const s = ctx.createBufferSource(); s.buffer = ab; s.connect(G.Sfx.master);
    const t = Math.max(ctx.currentTime + 0.08, nextT.get(id) || 0);  // búfer de fluctuación 80 ms
    s.start(t); nextT.set(id, t + ab.duration);
    speaking.set(id, performance.now());
  }

  function bind() {
    const ind = document.getElementById('voiceInd');
    window.addEventListener('keydown', async (e) => {
      if (e.code !== 'KeyB' || e.repeat || G.Net.phase === undefined || !G.Net.room || document.activeElement && document.activeElement.tagName === 'INPUT') return;
      if (await init()) talking = true;
    });
    window.addEventListener('keyup', (e) => { if (e.code === 'KeyB') talking = false; });
    window.addEventListener('blur', () => { talking = false; });
    // Indicador de parlantes (5 Hz, DOM, sin coste en el bucle del juego)
    setInterval(() => {
      if (!ind) return;
      const now = performance.now(), names = [];
      if (talking) names.push('🎙 TÚ');
      for (const [id, t] of speaking) {
        if (now - t > 350) continue;
        const r = G.Net.roster.get(id); names.push('🔊 ' + (r ? r.name : 'Operador'));
      }
      ind.textContent = names.join('   ');
      ind.classList.toggle('hidden', !names.length);
    }, 200);
  }

  return { bind, play, init, isTalking: () => talking };
})();
