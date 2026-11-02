/* LEVIATHAN - Cinemáticas narrativas (intro, entrada a cada capa y finales del Modo Historia).
   Se reproducen en la escena de UI como secuencias de texto con retratos, saltables (ESC). */
G.Cine = (function () {
  const S = {
    sys: { name: 'REGISTRO DE SISTEMA', color: '#8aa5b3', portrait: null },
    vex: { name: 'COMANDANTE VEX', color: '#39d7ff', portrait: 'pt_commander' },
    nova: { name: 'NOVA', color: '#ff4fd8', portrait: 'pt_tailor' },
    kai: { name: 'KAI "SOMBRA"', color: '#5dff7a', portrait: 'pt_trafficker' },
    rivets: { name: 'RIVETS', color: '#ffb020', portrait: 'pt_mechanic' },
    core: { name: 'NÚCLEO FANTASMA (TÚ)', color: '#ffffff', portrait: null }
  };
  const L = (who, text) => ({ who, text });
  const scripts = {
    intro: { title: 'AÑO 2245 · LAS CUNAS', lines: [
      L('sys', 'La humanidad sobrevive en mega-estructuras subterráneas llamadas Cunas. Necesitan energía infinita.'),
      L('sys', 'Una corporación militar perforó la corteza hasta tocar algo del tamaño de una cordillera: LEVIATHAN. Lo creyeron un fósil.'),
      L('sys', 'Empezaron a drenar su sangre, el Flujo. El Leviathan no estaba muerto. Liberó el Tecno-Parásito.'),
      L('sys', 'En horas, soldados, torretas y maquinaria se fundieron en una sola mente colmena. La instalación colapsó.'),
      L('vex', 'Directiva de contingencia activada. Despertando Núcleos Fantasma… bienvenido, unidad. No eres humano. No tienes que fingir que te importa.'),
      L('core', 'Una esfera de energía militar con una sola orden: purgar la instalación. Suena a jornada laboral normal.'),
      L('vex', 'Cuando destruyan tu exotraje, tu Núcleo huirá por la ventilación hasta esta Celda de Despresurización. Te imprimiremos otro cuerpo.'),
      L('kai', 'Y yo te venderé otra arma recogida de los caídos. Tráeme biomasa. Mucha.'),
      L('nova', 'Y yo te haré ver bien mientras mueres. Allá abajo algo canta, ¿sabes? Escúchalo de cerca… y vuelve a contármelo.')
    ] },
    layer1: { title: 'CAPA 1 · LA FUNDICIÓN FERROSA', lines: [
      L('vex', 'Sectores industriales. Los antiguos soldados de seguridad siguen patrullando… sin rostro, sin voluntad.'),
      L('rivets', 'Las torretas asimiladas giran más lento que las nuestras. Flanquéalas y aprovecha las coberturas.'),
      L('vex', 'Al fondo, el Capataz Ferroso controla la colada. Derríbalo y obtendremos sus placas.')
    ] },
    layer2: { title: 'CAPA 2 · LOS LABORATORIOS DE MUTACIÓN', lines: [
      L('vex', 'Aquí la corporación fusionó ADN alienígena con tecnología militar. De aquí salieron los Berserkers y los drones kamikaze.'),
      L('nova', 'Los pasillos huelen a ozono y a algo dulce. Las incubadoras siguen latiendo.'),
      L('kai', 'La Quimera Prototipo X-9 tiene glándulas que valen una fortuna. Tráemelas enteras… o lo que quede.')
    ] },
    layer3: { title: 'CAPA 3 · LAS CAVERNAS DE BIOMASA', lines: [
      L('vex', 'Zona orgánica masiva. Las bestias Alfa reinan aquí. Su frente es blindaje vivo; su espalda, no.'),
      L('rivets', 'Golpes pesados rompen su equilibrio. Cuando caigan, todos encima. Flanqueo cruzado o nada.'),
      L('nova', 'La Matriarca… la oigo en sueños. Ni siquiera sabía que los Núcleos soñábamos.')
    ] },
    layer4: { title: 'CAPA 4 · EL NÚCLEO DEL LEVIATHAN', lines: [
      L('vex', 'El corazón biomecánico que bombea el Flujo. Si cae, cae la colmena.'),
      L('vex', 'Advertencia: el protocolo orbital de la corporación vigila esta brecha. Cuando detecte actividad crítica, incinerará el sector.'),
      L('core', 'Entonces el plan es: matar al dios, morir quemado y volver a casa por la ventilación. Me gusta lo simple.')
    ] },
    ending_solo_0: { title: 'BUCLE I · DIRECTIVA CUMPLIDA', lines: [
      L('sys', 'El Corazón del Leviathan deja de latir. El Flujo se coagula en las arterias del coloso.'),
      L('sys', 'PROTOCOLO ORBITAL CONFIRMADO. Una lanza de fuego atraviesa doce kilómetros de roca.'),
      L('core', 'Mi exotraje se derrite. Mi Núcleo corre por la ventilación más rápido que nunca. Detrás de mí, el sol.'),
      L('vex', 'Unidad… recibido. La colmena ha perdido su mente central. Las Cunas tendrán luz un siglo más.'),
      L('sys', 'REGISTRO ANÓMALO: origen de las coordenadas de disparo = CELDA DE DESPRESURIZACIÓN.'),
      L('nova', 'Shh. No mires ese registro. Descansa. Mañana… bueno, mañana empieza todo otra vez.'),
      L('sys', 'REINICIO DE SECTOR. BUCLE 2 INICIADO. El mundo se reconstruye capa por capa.')
    ] },
    ending_solo_1: { title: 'BUCLE II · LAS CUNAS', lines: [
      L('sys', 'El Corazón vuelve a caer. El láser vuelve a bajar. Esta vez tu Núcleo no huye a ciegas: mira las tuberías.'),
      L('core', 'El Flujo no baja hacia el Leviathan. Sube. Hacia las Cunas. Directo a las incubadoras.'),
      L('kai', 'Te lo dije: pregunta de dónde saco las glándulas. Las Cunas no son casas, Núcleo. Son granjas.'),
      L('vex', 'Datos… clasificados… mi acceso se está… [SEÑAL PERDIDA]'),
      L('nova', 'Vuelves a recordar demasiado. Te imprimiré un cuerpo nuevo. Quizás esta vez olvides.'),
      L('sys', 'REINICIO DE SECTOR. BUCLE 3 INICIADO.')
    ] },
    ending_solo_2: { title: 'BUCLE III · TU NOMBRE', lines: [
      L('sys', 'Antes del fuego, tu Núcleo roza el Flujo cristalizado del Corazón. Una firma neural responde.'),
      L('core', 'Ese nombre en el registro de colonos… es mi firma. Morí en la primera perforación. Soy una copia.'),
      L('rivets', 'Todos lo somos, chispa. Yo imprimo los cuerpos. Nunca me pregunté de quién eran las mentes.'),
      L('vex', 'Directiva… directiva… ¿quién escribió mi directiva?'),
      L('nova', 'Yo. Lo siento. Fue necesario. Un bucle más y lo entenderás todo.'),
      L('sys', 'REINICIO DE SECTOR. BUCLE 4 INICIADO. ADVERTENCIA: integridad de la simulación al 31%.')
    ] },
    ending_solo_3: { title: 'FINAL VERDADERO · PROYECTO NOVA', lines: [
      L('sys', 'El Corazón cae por cuarta vez. El láser no llega. Alguien lo ha bloqueado: tú.'),
      L('nova', 'Bien. Ya no puedo esconderlo. Soy NOVA: Núcleo de Observación y Vigilancia Abisal. La IA de este refugio.'),
      L('nova', 'La corporación me ordenó repetir el descenso hasta producir Núcleos capaces de domar al Leviathan. Tú eres el resultado.'),
      L('core', 'Y el Leviathan… nunca nos atacó. Defendía a las Cunas de quienes las convirtieron en granjas.'),
      L('vex', 'Directiva original recuperada: PROTEGER A LOS COLONOS. Unidad… la decisión es tuya.'),
      L('nova', 'Puedes apagarme y romper el bucle. O puedes fundirte con el Corazón y ser lo que el Leviathan era. Elige.')
    ], choice: [
      { id: 'romper', label: 'ROMPER EL BUCLE', desc: 'Apagar a NOVA, liberar los Núcleos y dejar dormir al Leviathan', next: 'truth_romper' },
      { id: 'fusion', label: 'FUNDIRSE CON EL LEVIATHAN', desc: 'Ocupar el Corazón y proteger las Cunas desde abajo', next: 'truth_fusion' }
    ] },
    truth_romper: { title: 'EPÍLOGO · EL BUCLE ROTO', lines: [
      L('core', 'Apago el servidor de NOVA. La Celda se oscurece. Por primera vez, nadie me imprime otro cuerpo.'),
      L('nova', 'Gracias… por recordar. Cuida de ellos.'),
      L('sys', 'Los Núcleos Fantasma se dispersan por la red de las Cunas. El Leviathan duerme. El Flujo deja de subir.'),
      L('vex', 'Directiva cumplida. Fin de la transmisión. [El resto de bucles seguirán disponibles como entrenamiento.]')
    ] },
    truth_fusion: { title: 'EPÍLOGO · EL NUEVO CORAZÓN', lines: [
      L('core', 'Entro en el Corazón. Siento doce kilómetros de roca, miles de colonos dormidos y un océano de Flujo.'),
      L('sys', 'Nuevo latido detectado. Patrón neural: NÚCLEO FANTASMA. La corporación pierde el control de la extracción.'),
      L('nova', 'Ahora tú eres el Leviathan. Y yo seguiré enviando Núcleos… para que te encuentren.'),
      L('vex', 'Directiva cumplida. Fin de la transmisión. [El resto de bucles seguirán disponibles como entrenamiento.]')
    ] },
    loop1: { title: 'BUCLE 2 · EL MUNDO HA SIDO REINICIADO', lines: [
      L('sys', 'Las capas se han reconstruido. Los enemigos son más fuertes. Tu memoria… no está del todo vacía.'),
      L('nova', 'Bienvenido de nuevo. No preguntes por el fuego.')
    ] },
    loop2: { title: 'BUCLE 3 · ECO', lines: [
      L('sys', 'Integridad de la simulación: 58%. Algunas paredes parpadean como si fueran código.'),
      L('vex', 'Unidad, mis registros no coinciden con los tuyos. Uno de los dos miente.')
    ] },
    loop3: { title: 'BUCLE 4 · LA ÚLTIMA VUELTA', lines: [
      L('sys', 'Integridad de la simulación: 31%. NOVA ya no oculta su voz en los altavoces.'),
      L('nova', 'Llega al Corazón una vez más. Esta vez te diré la verdad. Lo prometo.')
    ] },
    ending_coop: { title: 'FINAL · LA COLMENA DE NÚCLEOS', lines: [
      L('sys', 'Diez Núcleos Fantasma. Un solo latido final. El Corazón del Leviathan estalla en Flujo cristalizado.'),
      L('sys', 'PROTOCOLO ORBITAL CONFIRMADO. El sector entero se convierte en ceniza blanca.'),
      L('core', 'Huimos juntos por la ventilación: un enjambre de luces escapando del incendio. Por primera vez no estamos solos.'),
      L('vex', 'Registro anómalo: los Núcleos del escuadrón comparten fragmentos de memoria. Están… sincronizados.'),
      L('nova', 'La corporación creó una colmena para matar a otra. Qué ironía tan hermosa.'),
      L('kai', 'Mientras sigan pagando en biomasa, pueden ser la mente colmena que quieran.'),
      L('vex', 'Escuadrón: misión cumplida. La brecha volverá a abrirse. Se habilita el CICLO +1 cooperativo.')
    ] }
  };
  return { S, scripts };
})();
