/* LEVIATHAN - Reloj de alta precisión en un hilo aparte (worker_threads).
   En Windows, setTimeout tiene ~15 ms de resolución: los ticks se agrupan y los snapshots salen a
   ráfagas (micro-tirones en los clientes). Este hilo duerme con Atomics.wait (precisión sub-ms) y
   avisa al hilo principal en cada tick; el bucle de juego nunca depende del temporizador del SO. */
const { parentPort, workerData } = require('worker_threads');
const { performance } = require('perf_hooks');
const period = workerData.periodMs;
const ia = new Int32Array(new SharedArrayBuffer(4));
let next = performance.now();
for (;;) {
  next += period;
  const wait = next - performance.now();
  if (wait > 0) Atomics.wait(ia, 0, 0, wait);
  else if (wait < -250) next = performance.now(); // el proceso estuvo suspendido: no recuperar ticks perdidos
  parentPort.postMessage(0);
}
