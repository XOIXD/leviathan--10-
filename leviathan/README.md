# LEVIATHAN · Roguelite 2D cooperativo (Modo Historia 1 jugador · cooperativo hasta 10)

Servidor autoritativo **Node.js + Socket.io** y cliente **Phaser 3.90** sin assets externos
(todas las texturas y sonidos se generan por código).

## Arranque en Windows (Node portable)

1. Descomprime la carpeta `leviathan` donde quieras.
2. Doble clic en `INICIAR.bat`. Si tu Node portable no está en el PATH, edita la línea
   `set "PATH=C:\node-portable;%PATH%"` dentro del `.bat`.
   - La primera vez ejecuta `npm install` (express, socket.io, phaser).
3. Abre `http://localhost:3000` en el navegador. Los demás jugadores de tu red usan la
   dirección **LAN** que imprime la consola (ej. `http://192.168.1.20:3000`).
4. **Crea una cuenta** (usuario + contraseña) o inicia sesión. Todos escriben el **mismo código de
   sala** para jugar juntos; solo en una sala = **Modo Historia**, 2 o más = **Historia cooperativa**.

Alternativa manual: `npm install` y luego `node server.js` (puerto configurable con `PORT`).

## Controles

| Acción | Tecla |
|---|---|
| Moverse | A / D (o flechas) |
| Saltar / doble salto | ESPACIO, W o ↑ (coyote time + jump buffer) |
| Dash con invulnerabilidad | SHIFT |
| Agacharse tras cobertura / bajar de plataforma | S · S + ESPACIO |
| Atacar / disparar | Clic izquierdo |
| Habilidad del arma | Clic derecho o Q |
| Recargar (rifle) | R |
| Hablar con NPC · reanimar · hackear · desactivar · pilón | E (mantener cuando aplica) |
| Silenciar audio | M |

## Bucle de juego

- **Refugio**: NOVA (sastre de exotrajes y estelas de neón, con probador holográfico),
  RIVETS (mejoras permanentes), KAI "Sombra" (contratos de arma, núcleo de rareza,
  estimulantes), COMANDANTE VEX (descensos y marcarse LISTO) y el **Tablero táctico**
  (3 misiones diarias que rotan cada día). El descenso arranca cuando todos están listos.
- **Misión**: nivel procedural con semilla compartida. Compuertas de hackeo simultáneo,
  detonadores (4+ jugadores), coberturas destructibles, trampas de energía, alijos secretos
  y la arena del **Guardián Leviatán** (3 fases, pilones de energía y respiraderos de vapor).
- **Derrota compartida**: si todo el escuadrón cae se abre una ventana táctica de 10 s para
  usar estimulantes; si nadie se levanta, misión fallida y todos vuelven al refugio
  (conservando el 40% de los créditos).

## Escalado dinámico (DDS) según operadores vivos

| Parámetro | Fórmula |
|---|---|
| Vida enemiga | base del descenso × 1.25^(vivos−1) |
| Daño enemigo | base × (1 + 0.10·(vivos−1)) |
| Agresividad (velocidad/cadencia) | 1 + 0.07·(vivos−1) |
| Densidad de hordas | 1 + 0.35·(vivos−1), segundas hordas con 4+ |
| Mapa | más salas, filas y pasillos cruzados con más jugadores; 2 compuertas con 6+ |

## Red y rendimiento

- Simulación fija a 60 Hz con acumulador de alta resolución; snapshots por lotes a 20 Hz
  (volátiles) + eventos fiables agrupados; filtrado por radio de interés por jugador.
- El cliente predice su propio movimiento con **la misma física compartida**
  (`shared/physics.js`) y reconcilia con el servidor, suavizando el error.
- Los demás jugadores y enemigos se interpolan con 100 ms de retraso.
- Las muertes de enemigos se envían a todos sin filtro: desaparecen en todas las pantallas.
- Pools de balas, partículas, destellos, fantasmas de dash y números de daño en el cliente;
  pool de balas en el servidor.
- `LEVIATHAN_STRESS=1 node server.js` activa hordas continuas para pruebas de carga.

## Estructura

```
server.js              Arranque HTTP/Socket.io y bucle fijo 60 Hz
server/room.js         Sala autoritativa: refugio, misión, armas, objetivos, DDS, snapshots
server/enemies.js      IA: soldado, berserker, dron, élite con escudo, Guardián
server/weapons.js      Armas procedurales (katana / rifle con accesorios / hacha transformable)
server/profiles.js     Persistencia en data/profiles.json y misiones diarias
shared/*.js            Constantes, RNG, física, generador de niveles, refugio, catálogo
public/index.html      Login y carga de scripts
public/js/*.js         Red, audio sintetizado, texturas, FX con pools, vistas, escena base
public/js/scenes/*.js  Boot, Refugio, Misión, UI (HUD, minimapa y diálogos)
```

## Parte 2 · Campaña, cuentas y contenido a largo plazo

### Lore y estructura del descenso
Eres un **Núcleo Fantasma**. Si destruyen tu exotraje, tu Núcleo huye por la ventilación a la
**Celda de Despresurización** (el refugio). Cinemáticas: intro, entrada a cada capa y dos finales.

| Capa | Modo Historia (solo) | Cooperativo | Jefe |
|---|---|---|---|
| 1 · La Fundición Ferrosa | 2 descensos | 3 | Capataz Ferroso |
| 2 · Los Laboratorios de Mutación | 3 | 4 | Quimera Prototipo X-9 |
| 3 · Las Cavernas de Biomasa | 3 | 4 | Matriarca Alfa |
| 4 · El Núcleo del Leviathan | 2 | 3 | Corazón del Leviathan (final + protocolo orbital) |

Los descensos sin jefe terminan en el **elevador**: hay que defender la posición y subir a bordo
todos los Núcleos vivos. Tras el final se habilita el **CICLO +1** (campaña más dura, más botín).
El cooperativo tiene un escalado más agresivo (vida ×1.3 por Núcleo vivo, hordas +45%).

### Mapas
Plataformas móviles horizontales y elevadores verticales (deterministas por tiempo, sin coste de
red), terreno orgánico con escalones y estalactitas, más filas y columnas en capas profundas, muros y
tapas **secretas destructibles** que esconden alijos, y cajas negras para contratos.

### Cuentas
Usuario + contraseña (scrypt con sal) y sesión recordada con token. El progreso (biomasa, 40%
retenido al fallar, mejoras de Rivets, materiales, forja, skins, campaña) vive en el **servidor**:
cualquier PC que se conecte a ese servidor carga tu cuenta. Para llevarla entre servidores, define
`LEVIATHAN_DATA` apuntando a una carpeta sincronizada (OneDrive, Dropbox o Google Drive):
`set LEVIATHAN_DATA=C:\Users\tu\OneDrive\leviathan-data` antes de `node server.js`.

### Monster Hunter
Materiales de enemigos y de jefes (con **rupturas de parte** al cambiar de fase), **forja** en Kai
(armas) y Rivets (exotraje), **equilibrio/derribo** con golpes pesados, élites con escudo y Alfas
con frente blindado y espalda vulnerable (flanqueo).

### Call of Duty
Granada universal **G** (mantener = cocinar, con trayectoria en pantalla), **recarga táctica**
(más rápida y +1 en recámara), **apuntado ADS** con clic derecho en rifles, dispersión creciente
con primer disparo preciso, y **rachas de apoyo** (tecla **F**): Pulso UAV, Dron centinela,
Bombardeo orbital, Botiquín y Domo de escudo, en 3 paquetes elegibles con Vex.

### Rejugabilidad
Misiones diarias, **contratos semanales**, **contratos de campo** diarios (cajas negras, ejecutor
marcado, incursión relámpago, intocable, demolición, artificiero), **eventos dinámicos** en
misión (Marea de Flujo, Apagón, Suministros, Cazador Alfa, Enjambre) y una **temporada por mes**
con modificadores distintos durante todo el año.

### Controles nuevos
G granada (mantener) · F racha de apoyo · clic derecho apuntar (rifle) · R recarga táctica.

## Parte 3 · Fase 1: visual, guardarropa, interfaz y bucles narrativos

- **Gráficos**: bloom y viñeta por post-procesado WebGL de Phaser, luces dinámicas que siguen a cada
  operador con el color de su estela, luces de disparo e impacto, explosiones cinemáticas (destello,
  doble onda, brasas) y animación de retroceso de armas. **Tecla P**: calidad ALTA / MEDIA / BAJA.
  Si los FPS bajan de 45 durante 6 s, la calidad baja sola para proteger la fluidez.
- **Icono de aplicación** (`public/icons`) y manifiesto: el juego se puede instalar como app desde
  Chrome/Edge (menú → Instalar LEVIATHAN).
- **Guardarropa holográfico de Nova**: exotrajes, estelas, **acabados de arma** (10, incluidos dos
  forjados con partes de jefes y uno exclusivo del Final Verdadero) por cada arma, y **efectos de
  eliminación**. Todo se sincroniza: el escuadrón ve tus acabados y efectos.
- **Pistola táctica**: nuevo arquetipo semiautomático con ráfaga triple (Q / clic derecho).
- **Interfaz tipo hoja de cálculo**: menús con columnas y filas numeradas, **hoja de operaciones
  (TAB)** ordenable por columna, login con cuadrícula y **botones en forma de J**.
- **Bucles narrativos (solo Modo Historia)**: al terminar la campaña el láser orbital reinicia el
  mundo (bucle nuevo, más difícil) y revela un fragmento de la verdad sobre NOVA y las Cunas. En el
  4.º bucle llega el **Final Verdadero** con una decisión permanente (dos epílogos). Los fragmentos
  se consultan en el "Archivo de la verdad" de Nova. El cooperativo mantiene su propio ciclo.

## Parte 3 · Fase 2: equipo de jefe y combate táctico

- **Equipo de rareza alta (Monster Hunter)**: 6 conjuntos de casco, coraza y grebas forjados en
  Rivets con partes de jefes y élites (Capataz, Quimera, Matriarca, Corazón, Escoltas y Alfas).
  Cada pieza da estadísticas propias y cada conjunto despierta bonificaciones a 2 y 3 piezas
  (p. ej. *Segundo latido*: te levantas solo una vez por descenso; *Muro ferroso*: agachado
  recibes -35% y no te empujan; *Garra matriarcal*: rompes la postura un 60% más).
- **Cuerpo a cuerpo rápido [V]** con cualquier arma: doble daño por la espalda y **ejecución**
  instantánea de soldados, drones y torretas por detrás, o de cualquier enemigo bajo el 20%.
- **Recarga perfecta**: durante la recarga, pulsa R otra vez en la zona dorada de la barra:
  termina al instante y da +10% de daño 4 s. Fallar añade 0,4 s.
- **Granada aturdidora [T]** alterna entre fragmentación y aturdidora (paraliza 2,6 s, jefes 1 s).
- **Retroceso de cámara** al disparar (menor apuntando) y nuevas **rachas**: Torreta centinela,
  Lluvia de artillería (5 impactos en línea) y Enjambre aliado, en dos paquetes nuevos (Táctico y
  Enjambre) elegibles con Vex.

## Parte 3 · Fase 3: Centro de Mando, Batalla de Escuadrones y blindaje de rendimiento

### Centro de Mando (menú principal)
Tras iniciar sesión aparece el menú con tres modos: **Modo Historia** (sala privada de 1 Núcleo),
**Partida de Descenso** (crear sala pública/privada, unirse por código o desde el **buscador** con
las salas activas) y **Batalla de Escuadrones**. Desde el juego, **⏏ MENÚ** vuelve al Centro de Mando.
Reglas de integridad: no se admiten Núcleos nuevos durante un descenso en curso; si te desconectas,
tu exotraje queda en el mundo 25 s **sin inmunidad** y al volver recuperas tu ranura exacta.

### Batalla de Escuadrones (hasta 100 jugadores)
- Equipos de 2, 5 o 10 (máximo 10 equipos). Lobby en la Celda: elige escuadrón con Vex y marca LISTO.
- Mapa procedural de **alcantarillas convergentes** (`shared/brgen.js`): cada equipo empieza en su
  pozo aislado; los colectores se fusionan nivel a nivel hasta la **Cámara Central**.
- La **inundación de Flujo** baja desde arriba a partir del minuto 1 y empuja hacia el centro.
- El **Corazón del Leviathan** despierta a los 3:30 (o cuando alguien entra a la Cámara Central).
- Gana el escuadrón que liquide al Corazón **y** a los rivales. Recompensas por puesto. Sin bucles
  narrativos: el lore aparece directo en cada nivel del descenso.
- Implementado como subclase aislada (`server/br.js`): no toca el cooperativo ni el Modo Historia.

### Rendimiento y estabilidad
- **Reloj de alta precisión** en un hilo aparte (`server/clock.js`, `Atomics.wait`): en Windows los
  temporizadores de Node tienen ~15 ms de resolución y agrupaban ticks (micro-tirones). Con respaldo
  automático si el hilo fallara.
- **Snapshots delta confirmados** (modelo Quake 3): cada cliente confirma la última instantánea y el
  servidor sólo envía lo que cambió. Si se pierde un paquete, el siguiente sigue siendo válido.
- **Interés por proximidad** de enemigos y jugadores rivales; eventos críticos (muertes, finales)
  garantizados aunque la conexión del cliente se congestione.
- **Nada bloquea el bucle**: hash de contraseñas asíncrono (antes congelaba el servidor ~80 ms en
  cada inicio de sesión) y guardado de perfiles asíncrono y atómico.
- **Blindaje**: cada manejador de red y cada sala aíslan sus errores; una sala que falla de forma
  persistente devuelve a todos a la Celda en lugar de caer; validación estricta de inputs; límite de
  25 acciones/s; sesión única por cuenta; telemetría de latencia del bucle y memoria cada 30 s.
- **Cliente**: búfer de interpolación adaptativo a la fluctuación real de la red, reconexión
  automática con recuperación de sala, *culling* de enemigos/jugadores/balas fuera de cámara, pool
  de rayos eléctricos, nodos de audio liberados al terminar y limpieza total al volver al menú.
- Probado: 100 jugadores simultáneos en una Batalla (tick medio ~1 ms, memoria estable 20-28 MB),
  10 en cooperativo con paridad absoluta, reconexión en plena misión y paquetes malformados.

> Para partidas de 100 jugadores por internet hace falta un servidor con buena subida
> (~25 KB/s por jugador, ≈2,5 MB/s con 100). En red local funciona tal cual.

## Auditoría de emergencia · fallos corregidos

Cada corrección se reprodujo primero con una prueba y se verificó después.

| Síntoma | Causa real | Corrección |
|---|---|---|
| Escuadrón atrapado en la compuerta de hackeo | Las terminales necesarias se fijaban con el número de jugadores al generar el nivel; si alguien salía, nunca se completaba | El requisito se recalcula cada tick: `min(terminales, jugadores conectados y en pie)`. El HUD muestra el valor real |
| Extracción bloqueada al desconectarse alguien | El jugador "fantasma" (25 s de reconexión) contaba como necesario en el elevador | Los fantasmas no cuentan para extracción ni compuertas |
| Jugador incrustado en la pared | Sin recuperación si quedaba dentro de un sólido | Tras 0,4 s incrustado se recoloca en la última posición segura |
| Sala bloqueada por un jugador AFK | Hacía falta que todos estuvieran listos | Con ≥60 % listos (3+ jugadores) el descenso arranca solo a los 45 s |
| Micro-tirones en combate | `Text.setColor` de Phaser re-rasteriza y re-sube la textura **aunque el color no cambie**; el HUD lo llamaba cada frame. Los números de daño eran `Text` | Parche global que omite cambios redundantes; números de daño con BitmapText (fuente generada una vez); telemetría a 2 Hz; tope de 260 partículas por emisor |
| Un error congelaba el juego | Una excepción dentro de `update` detenía el bucle de la escena | Cada fotograma y cada evento de red se ejecutan aislados; el error se registra (contador `ERR` en la barra superior) y el juego sigue |
| Menú colgado esperando al servidor | Peticiones sin tiempo límite | Tiempo límite en auth, join, leave, lista de salas y acciones |
| No conecta tras ciertos firewalls/antivirus | Sólo WebSocket | Cae automáticamente a long-polling |
| Dos registros simultáneos del mismo nombre | Carrera durante el hash asíncrono | Reserva síncrona del nombre |
| Socket atado a una sala cerrada | Referencia obsoleta tras un cierre por error | Validación en cada mensaje; vuelve al menú con `roomclosed` sin cerrar sesión |
| Memoria por conexión | Compresión zlib por socket (~300 KB c/u) | Desactivada (los deltas ya son pequeños); tope de 200 salas (`LEVIATHAN_MAX_ROOMS`) |

### Solución de problemas de conexión (Windows)

- **Los amigos de la LAN no conectan:** al primer arranque Windows pregunta por el firewall; marca *Redes privadas*. Si lo rechazaste: Panel de control → Firewall de Windows → Permitir una aplicación → `node.exe` (privada). Usa la dirección `LAN:` que imprime el servidor, no `localhost`.
- **Por Internet:** abre/redirige el puerto TCP 3000 en el router hacia la IP LAN del servidor, o usa una VPN tipo LAN (ZeroTier, Tailscale, Radmin VPN).
- **La barra superior** muestra FPS, ping (`ms`), el búfer de interpolación (`BUF`) y errores capturados (`ERR`). Ping alto con `BUF` > 200 ms indica Wi-Fi inestable: usa cable.
- **El servidor** imprime cada 30 s `tick medio`, `máx`, latencia del bucle p99 y heap. Un tick medio por debajo de 5 ms es holgado (el presupuesto es 16,6 ms).

## Versión 5 · Estabilidad definitiva, interfaz, armas y temporadas

### El congelamiento en jefes (causa raíz encontrada)
El cliente tenía un pool de vistas para **5** tipos de enemigo, pero el servidor define **8**. Al aparecer una torreta, un Cazador Alfa o el **Corazón del Leviathan** (jefe final), el dibujado lanzaba una excepción en cada fotograma. Antes eso detenía el bucle de Phaser (la imagen se congelaba y el audio seguía sonando). Con la red de seguridad de la v4 el juego seguía corriendo, pero cada fotograma quedaba a medias: el HUD, las terminales y el jefe dejaban de actualizarse. Eso es el `ERR 17` de la barra superior.

- El pool se dimensiona con la lista real de tipos y un tipo desconocido nunca rompe el fotograma.
- Se añadió una red de seguridad en el bucle principal de Phaser: ninguna excepción puede volver a detener el dibujado.
- Verificado en el navegador contra el Corazón, la Matriarca y la Quimera: 0 errores.

"TERMINALES 0/1" en solitario es el estado correcto: falta que te pares en la terminal. Ahora una flecha en el borde de la pantalla señala la terminal cuando está fuera de cámara.

### Interfaz "Dead Cells × Call of Duty"
Paneles oscuros con bisel grueso, esquinas astilladas y grano; navegación táctica con columna de operaciones, barra de estado del operador y tarjeta de temporada; tipografía militar condensada (Bahnschrift en Windows); botones J con barrido de luz; tablas de hoja táctica. Al terminar una misión aparece un informe con conteo ascendente.

### Texturas
El muro liso se reemplazó por placas de acero con biseles (relieve simulado con luz cenital), remaches con sombra, juntas, grano, arañazos, chorreones de óxido, piso de chapa antideslizante con sombra de contacto bajo el labio, rejillas y compuertas gastadas. Hay 4 variantes de interior, 3 de superficie y 3 de borde, elegidas por celda para que no se vea la repetición.

### Animación de armas
Retroceso con muelle amortiguado (patada, sobre-oscilación y asentamiento) y un perfil de peso por arma: pistola ágil, cañón pesado que inclina el cuerpo. El arma tiene inercia al apuntar, balanceo al caminar y respiración en reposo. La recarga táctica baja el arma, golpea el cargador y vuelve a la mira. El hacha gira y lanza chispas al transformarse en cañón.

### Camuflajes por arma
Las armas se dibujan a 4× de resolución (biseles, remaches, ópticas, filos). Cada arma tiene su propio catálogo, pintado sólo sobre sus superficies:

| Arma | Camuflajes |
|---|---|
| Pistola | Urbano Gris, Panal Táctico, Acro-Neón Cian, Óxido de Fundición, Grabado de Oficial |
| Rifle | Digital Ciudad, Tigre Ferroso, Fibra Táctica, Acro-Neón Magenta, Óxido Bélico |
| Katana | Hamon de Acero, Damasco de las Cunas, Filo Acro-Neón, Grabado Ritual, Cristal de Flujo |
| Hacha / escopeta-cañón | Óxido de Alcantarilla, Rayas de Peligro, Demolición Urbana, Grabado Forjado, Biomasa Viva |

- Las piezas de maestría (Escamas, Latido del Corazón, Fragmento de la Verdad) sirven para todas las armas.
- Los acabados genéricos antiguos pasan a ser "legado": quien los tenga los conserva, pero ya no se venden.
- El servidor rechaza equipar un camuflaje en un arma que no es la suya.
- Los camuflajes se sincronizan entre jugadores con el resto del estado del operador.

### Temporadas de NOVA (exclusividad real)
Cada mes es una temporada con su efecto, su crónica del refugio y una pieza exclusiva cuyo identificador incluye el año (`S2026-11`). Se gana en el **Pase de temporada** de NOVA:

- Puntos: descenso +1, victoria +2, contrato de campo +1; en Batalla, +1 por partida o +3 si ganas.
- Recompensas: 4 puntos → biomasa, 10 → materiales, 18 → camuflaje exclusivo.
- Al cambiar la temporada el pase se reinicia y la pieza anterior deja de poder obtenerse; el servidor rechaza cualquier intento. Quien la obtuvo la conserva para siempre.
- La misma temporada de otro año genera otra pieza, con otro tono y otro id.

### Herramienta de pruebas
Con `LEVIATHAN_DEV=1` (nunca en producción) el servidor acepta comandos de depuración para elegir arma y descenso, saltar a la arena y curarse. Sin esa variable no hacen nada.

## Versión 6 · Arsenal, exotrajes, economía y mecánicas tácticas
- **Bug de temporada:** el camuflaje se guardaba bien (verificado tras reiniciar el servidor), pero no se equipaba al reclamarlo, por eso el arma seguía mostrando "Estándar". Ahora se equipa al instante, igual que al comprar cualquier camuflaje de arma.
- **Arsenal nuevo:**

  | Arma | Tipo | Detalles |
  |---|---|---|
  | Subfusil | Automática | Ágil, cadencia muy alta |
  | Escopeta táctica | Semiautomática | 8 perdigones, empuja hacia atrás |
  | Rifle de precisión pesado | Semiautomática | Mira [Q], atraviesa 3 objetivos |
  | Plataforma M42 | Automática | 70-90 balas, te hace más lento |
  | Dagas gemelas | Cuerpo a cuerpo | Combo de 4, abanico [Q] |
  | **Cetro del Rey** | Cuerpo a cuerpo | Secreto: derrota al Guardián del Rey en una sala secreta de la capa 2 o más |

  Cada arma tiene su propio retroceso, cadencia, peso y animación, y Kai las ofrece por contrato.
- **Exotrajes con silueta (pesado o ligero) y pasivas:**
  - Bastión: +40 de vida, recibe 10% menos de daño, 8% más lento.
  - Sombra: 10% más rápido, dash más rápido, -15 de vida.
  - Zapador: +2 granadas.
  - Corpsman: regeneración y +1 estimulante.
  - Asaltante: +7% de daño.
  - Centinela y Heraldo: se forjan con partes de jefe.
- **Economía:** camuflajes al triple de precio y exotrajes y estelas al doble. Cada arma nueva trae 3 camuflajes propios, y las 10 armas tienen un camuflaje ★ ÉLITE que cuesta 5000 de biomasa más Núcleos de Flujo y partes de jefe.
- **Mutaciones de sala** (30% de las salas de combate): gravedad reducida (la comparten el servidor y la predicción del cliente), niebla táctica o enemigos blindados (+60% de vida y +50% de biomasa).
- **Baliza de emergencia:** mantén **X** durante 1 s. A los 12 s el escuadrón evacúa con el 100% de los materiales y solo el 20% de la biomasa.
- **Anomalías** (cada 40-75 s): interferencia de radar (sin minimapa 12 s), pulso EMP (aturde a los enemigos cercanos), cápsula sorpresa (+25 de vida y +1 granada) y grieta de biomasa (+40).
- **Icono:** nuevo "Ojo del Leviatán" en `public/icons`.

## Versión 7 · Espectador, linterna, dron de rescate y clasificación
- **Espectador táctico:**
  - Si caes, la cámara salta entre los nodos de seguridad (uno por sala); cambias de cámara con A/D.
  - Con CLIC marcas un contacto: tu escuadrón ve un pulso rojo y un aviso con el sector.
  - Si estás vivo, marcas con CLIC CENTRAL.
- **Apagón con linterna:** durante el evento la pantalla queda casi a oscuras, salvo el haz frontal de la linterna, que sigue tu puntería.
- **Dron de rescate (C):** cuesta 150 de biomasa de la misión. Da 2,5 s de invulnerabilidad, recupera un 35% de vida y despliega un dron de apoyo. Se recarga en 45 s.
- **B-0T, el registro de combate:** un robot junto a Vex muestra el top 10 global (bajas, muertes, K/D y biomasa total) y tu puesto exacto. El ranking se recalcula como máximo cada 30 s. Las muertes y la biomasa total empiezan a contar desde esta versión.

## Versión 9
- **Chat táctico:** ENTER abre el chat y ENTER envía, en el refugio y en misión. Mensajes de hasta 120 caracteres, como máximo uno cada 0,8 s, con el texto saneado en el servidor. El chat de voz no está incluido.
- **Menú:**
  - Sonido ambiente grave sintetizado en el Centro de Mando, que se apaga al entrar en una sala.
  - Sonidos al pasar el ratón y al hacer clic en los botones.
  - Los paneles entran de forma escalonada, el filo dorado hace un barrido continuo y los diálogos de NPC aparecen deslizándose.
- **Medallas en vivo**, calculadas solo en el cliente: doble y triple baja, masacre, rachas de 10 y 25, matajefes, hacker de élite y ejecución sigilosa.
- **Ejecución sigilosa:**
  - Detrás de un enemigo común (soldado, berserker, dron, torreta o élite) aparece el aviso **[V] EJECUCIÓN SIGILOSA**.
  - El remate mata al instante y viene con cámara lenta, anillo, tajo y destello.
  - No ejecuta a los jefes ni al Cazador Alfa.
- **B-0T:** sprite de robot flotante propio, levitación, inclinación según la velocidad, movimiento suavizado sin tirones y patrulla más amplia.

## Versión 10 · Cierre
- **Anuncios de racha con calavera cibernética animada:** DOUBLE KILL, MULTI KILL, MASACRE y ANIQUILACIÓN.
- **Música dinámica sintetizada:**
  - Al explorar suena un pad tranquilo.
  - Con enemigos cerca o la salud crítica, se funde con batería y bajo distorsionado a 140 BPM.
  - No usa archivos de audio.
- **Salud crítica (menos del 30%):** viñeta roja que late más rápido cuanto menos vida queda, y gotas de aceite que caen del exotraje.
- **Pistola de clavos:**
  - Si bajas sin contrato de arma y con menos de 300 de biomasa, el juego te avisa al marcar LISTO y te entrega una pistola estropeada.
  - Hace la mitad de daño que la pistola estándar, no tiene habilidad y no recibe rareza ni perks.
  - No aplica en la Batalla de escuadrones.
- **Cuenta `admin`:**
  - Se crea al arrancar el servidor. La contraseña se guarda solo como hash scrypt y se cambia con la variable `LEVIATHAN_ADMIN_PASS`.
  - Tiene recursos infinitos, todo desbloqueado y acceso a los comandos de depuración.
  - No aparece en las clasificaciones.
- **Clasificaciones separadas:** B-0T muestra tres tablas independientes (bajas, K/D y biomasa), cada una con tu puesto.
- **Toques de cierre:** destello dorado de partículas al completar una misión y medalla de oro 🏅 junto a tu nombre en el Centro de Mando cuando completas la campaña.
