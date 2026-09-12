'use client'

import { useEffect, useRef } from 'react'
import { nextBeepDelay, VOICE_EVERY_MS } from './orders/attention'
import { notifyPaymentChanged } from './payment-change-bus'

let sharedCtx: AudioContext | null = null
let audioBusyUntil = 0
let autoUnlocked = false
const chimeBuffers = new Map<string, Promise<AudioBuffer | null>>()

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  if (!sharedCtx) {
    sharedCtx = new Ctx()
  }
  return sharedCtx
}

/**
 * Los timbres reales (tipo 1 y tipo 5) que `preloadChimes` calienta aquí. Vive
 * junto a `unlockAudio` y no junto a cada `play*Chime` porque el problema que
 * resuelve es de MOMENTO, no de cuál archivo es: sin esto, el primer pedido de
 * la noche paga descarga + decodificación (red variable, a veces cientos de
 * ms) antes de que suene el timbre — justo el pedido donde más importa que
 * timbre y bip caigan juntos, no uno detrás del otro.
 */
const CHIME_URLS = ['/sound/notication-tindivo-2.mp3', '/sounds/notication-tindivo-5.mp3'] as const

function preloadChimes(ctx: AudioContext): void {
  for (const url of CHIME_URLS) {
    void loadChimeBuffer(ctx, url)
  }
}

/**
 * Desbloquea el audio dentro de un gesto del usuario (toggle o primer toque
 * PWA) Y precalienta los timbres reales — ver `preloadChimes`. Se llama en
 * cada uno de los momentos en que este panel ya se ocupa de que el sonido
 * esté listo (primer gesto, `enableSound`, volver de segundo plano), así que
 * no hace falta un sitio nuevo para esto.
 */
export function unlockAudio(): void {
  const ctx = getCtx()
  if (!ctx) return
  preloadChimes(ctx)
  if (ctx.state === 'suspended') {
    void ctx.resume()
  }
}

/**
 * EL AUDIO ESTÁ BLOQUEADO Y NADIE LO SABE.
 *
 * Un `AudioContext` en `suspended` no falla, no avisa y no suena: el navegador
 * se limita a no reproducir nada hasta que haya un gesto del usuario. En una
 * tablet que se queda encendida toda la noche eso significa que las alertas
 * pueden estar muertas mientras el panel se ve perfectamente normal — y la
 * cajera contesta, con toda la razón, que tiene el parlante prendido.
 *
 * `true` = ahora mismo no sonaría nada aunque hubiera un pedido. Es lo único
 * que el panel puede saber del audio sin hacer ruido para comprobarlo.
 */
export function audioIsBlocked(): boolean {
  const ctx = getCtx()
  return ctx !== null && ctx.state !== 'running'
}

/**
 * Toca EL MISMO tono que anuncia un pedido nuevo (tipo 1), para la prueba de
 * sonido de la apertura.
 *
 * Que sea el mismo y no uno de demostración no es un detalle: lo que se está
 * comprobando es que ESE sonido, a ESE volumen, se oye desde la cocina. Un bip
 * de prueba más suave o más agudo prueba otra cosa.
 */
export function playNewOrderTone(): void {
  playToneSequence([880, 1175], 0.18, 0.55, false)
}

/**
 * Descarga y decodifica un timbre UNA sola vez por sesión (cacheado por URL), y
 * comparte la promesa: si el mismo evento se repite, no vuelve a pedir el
 * archivo por red.
 */
function loadChimeBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  let promise = chimeBuffers.get(url)
  if (!promise) {
    promise = fetch(url)
      .then((res) => res.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => null)
    chimeBuffers.set(url, promise)
  }
  return promise
}

/**
 * REPRODUCE UN ARCHIVO DE AUDIO REAL, NO UN BIP SINTÉTICO.
 *
 * Va por el mismo `AudioContext` compartido — y no por un `<audio>` aparte —
 * para heredar gratis todo lo que ya se resolvió ahí: el desbloqueo en el
 * primer gesto, la reanudación al volver de segundo plano y la detección de
 * `suspended` (`audioIsBlocked`). Un `<audio>` propio abriría una segunda
 * superficie de autoplay sin ninguna de esas garantías.
 *
 * Si el archivo no carga —red caída, formato no soportado— esto no hace nada:
 * quien lo llama para un evento que además tiene bip sintético (el pedido
 * nuevo) no se queda en silencio total por esto.
 */
function playChime(url: string, gainValue = 0.85): void {
  const ctx = getCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()
  void loadChimeBuffer(ctx, url).then((buffer) => {
    if (!buffer) return
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    source.buffer = buffer
    gain.gain.value = gainValue
    source.connect(gain)
    gain.connect(ctx.destination)
    source.start()
  })
}

/**
 * EL TIMBRE DE «ENTRÓ UN PEDIDO».
 *
 * Suena UNA vez por pedido que entra (el flanco de `pendingCount`), antes del
 * anuncio de voz.
 */
export function playNewOrderChime(): void {
  playChime('/sound/notication-tindivo-2.mp3')
}

/**
 * EL TIMBRE DE «SE ENTREGÓ», tipo 5. Suena UNA vez por pedido que pasa a
 * `delivered`, seguido de la voz «Pedido entregado» — ver
 * `useOrderDeliveredAlerts`.
 */
export function playOrderDeliveredChime(): void {
  playChime('/sounds/notication-tindivo-5.mp3')
}

/**
 * El tono de «se escapó un pedido»: tres notas DESCENDENTES y largas.
 *
 * Todo lo demás en este panel sube o repite —el pedido nuevo sube (880→1175),
 * la llegada del motorizado va y vuelve—, así que bajar es lo único que no se
 * confunde con nada. No hace falta saber solfeo para que una caída suene a mal
 * asunto; es la misma razón por la que las alarmas de error bajan en todas
 * partes.
 *
 * Suena más fuerte que ningún otro aviso (0.6) porque llega tarde por
 * definición: si se ha llegado aquí es que los avisos discretos ya fallaron.
 */
export function playLostSaleTone(): void {
  playToneSequence([660, 520, 390], 0.32, 0.6, false)
}

/**
 * El tono de «el motorizado cambió el método de pago»: dos notas cortas y
 * limpias (C5→G5), sin parecido con ninguna de las otras tres — el pedido
 * nuevo sube en semitono corto (880→1175), la llegada va y vuelve
 * (660-880-660) y el escapado baja en tres (660-520-390). Esta sube en un
 * salto más amplio y se para ahí: es un aviso de una sola vez, como la
 * llegada, no una alarma que se repite.
 */
export function playPaymentChangedTone(): void {
  playToneSequence([523, 784], 0.16, 0.4, false)
}

/**
 * Registra listeners globales para auto-desbloquear audio en PWA al primer gesto
 * y mantener activo el AudioContext cuando la PWA se minimiza/restaura.
 */

if (typeof window !== 'undefined' && !autoUnlocked) {
  autoUnlocked = true
  const handleGesture = () => {
    unlockAudio()
    window.removeEventListener('pointerdown', handleGesture)
    window.removeEventListener('keydown', handleGesture)
  }
  window.addEventListener('pointerdown', handleGesture, { passive: true })
  window.addEventListener('keydown', handleGesture, { passive: true })

  // Re-activar AudioContext cuando la PWA sale de segundo plano / se minimiza
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      unlockAudio()
    }
  })
}

/**
 * UN AVISO SE COMÍA AL OTRO A MEDIA FRASE.
 *
 * `speak()` hacía `speechSynthesis.cancel()` antes de cada frase, así que si
 * "llegó el motorizado" caía mientras sonaba "tienes 2 pedidos en espera", la
 * primera moría a medias y la cajera se quedaba sin enterarse de ninguna de
 * las dos completas. Con cuatro tipos de aviso hablando cada uno por su
 * cuenta, esto no era un caso raro: bastaba con que dos cayeran cerca.
 *
 * Ahora las frases se ENCOLAN y se hablan una detrás de otra, nunca una
 * encima de otra. El límite (`MAX_QUEUE`) evita que una noche ruidosa deje a
 * la cajera escuchando, con dos minutos de atraso, avisos que ya no describen
 * lo que está pasando: si se acumulan más de las que caben, se descartan las
 * más viejas y se conserva la más reciente.
 */
const MAX_QUEUE = 3
let speechQueue: string[] = []
let speaking = false

function speakNext(): void {
  const text = speechQueue.shift()
  if (text === undefined) {
    speaking = false
    return
  }
  speaking = true

  // `advanced` evita avanzar dos veces: `onend` y el colchón de abajo pueden
  // llegar los dos si el navegador dispara `onend` tarde.
  let advanced = false
  const advance = () => {
    if (advanced) return
    advanced = true
    speakNext()
  }

  try {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'es-PE'
    utterance.rate = 1.1
    utterance.pitch = 1.0
    utterance.volume = 1.0
    utterance.onend = advance
    utterance.onerror = advance
    window.speechSynthesis.speak(utterance)
    // COLCHÓN DE SEGURIDAD: algunos Android nunca disparan `onend` si la PWA
    // pierde el foco a media frase. Sin esto, la cola se queda atascada con
    // `speaking = true` para siempre y ningún aviso vuelve a hablar.
    setTimeout(advance, 8_000)
  } catch {
    // Ignorar fallos de speech en entornos donde la voz no está disponible
    advance()
  }
}

/**
 * Anuncia verbalmente el estado de pedidos pendientes u otros avisos.
 * Usa la API de Web Speech (SpeechSynthesis). Se desfasa suavemente tras el bip
 * para evitar que la voz hable sobre los tonos de audio.
 */
export function speak(text: string, delayMs = 350): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

  setTimeout(() => {
    try {
      speechQueue.push(text)
      if (speechQueue.length > MAX_QUEUE) speechQueue = speechQueue.slice(-MAX_QUEUE)
      if (!speaking) speakNext()
    } catch {
      // Ignorar fallos de speech en entornos donde la voz no está disponible
    }
  }, delayMs)
}

/**
 * Corta la voz DE VERDAD y vacía la cola. Es distinto de dejar que `speak`
 * siga su curso: lo usa quien cierra un diálogo (la prueba de sonido) y no
 * quiere que una frase vieja aparezca después, fuera de contexto.
 */
export function cancelSpeech(): void {
  speechQueue = []
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

/** Genera el texto de anuncio según la cantidad de pedidos pendientes. */
function pendingAnnouncement(count: number): string {
  if (count === 1) return 'Tienes un pedido nuevo'
  return `Tienes ${count} pedidos en espera`
}

/**
 * Reproduce una secuencia de tonos con prevención de solapamiento. Si
 * `isInterval` es verdadero y el canal está ocupado, el tick del intervalo se
 * salta para evitar acumulación de sonidos cuando la PWA está minimizada.
 *
 * CADA NOTA LLEVA DOS OSCILADORES, NO UNO. Una senoidal pura es la onda con
 * menos armónicos que existe, y por eso es la que peor se abre paso en un
 * parlante pequeño con ruido de local alrededor: sonaba "hay un bip" y a veces
 * ni eso. La segunda capa —una onda triangular una octava arriba, más floja—
 * le mete brillo sin cambiar la nota que se oye ni la melodía de cada tipo de
 * aviso (el semitono que sube, el que baja, el que va y vuelve).
 */
function playToneSequence(
  freqs: number[],
  durEach: number,
  peak = 0.3,
  isInterval = false,
): boolean {
  const ctx = getCtx()
  if (!ctx) return false
  if (ctx.state === 'suspended') {
    void ctx.resume()
  }

  const now = ctx.currentTime

  // Si es un intervalo repetitivo y el canal de audio está ocupado, omitir para no acumular bips
  if (isInterval && now < audioBusyUntil) {
    return false
  }

  const startAt = Math.max(now, audioBusyUntil)
  let at = startAt

  const capa = (freq: number, type: OscillatorType, gainPeak: number) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = type
    osc.frequency.value = freq

    // Envolvente de ganancia suave para evitar clics eléctricos
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(Math.max(gainPeak, 0.0001), at + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + durEach - 0.015)

    osc.start(at)
    osc.stop(at + durEach)
  }

  for (const f of freqs) {
    capa(f, 'sine', peak)
    capa(f * 2, 'triangle', peak * 0.35)
    at += durEach + 0.04
  }

  audioBusyUntil = at + 0.06
  return true
}

/**
 * LOS QUE ACABAN DE LLEGAR: LOS QUE ESPERAN AHORA Y NO ESPERABAN ANTES.
 *
 * Esto era un booleano —"¿hay alguno esperando?"— y el aviso salía en su flanco
 * de `false` a `true`. Con eso, la SEGUNDA llegada al mismo local no sonaba
 * jamás: el booleano ya estaba en `true` por la primera, no había flanco, y la
 * cajera no se enteraba de que había otro motorizado en la puerta. No sonaba
 * tarde: no sonaba.
 *
 * Y no es un caso de laboratorio. En `tindivo-prod`, de 233 llegadas en 14 días
 * (14-ago a 31-ago), 27 —el 11.6%— cayeron encima de otra que seguía esperando
 * en el mismo negocio. Dos son de la noche del 30-ago en Pizza Priamo:
 * `59FRVDYV` (20:34:14, con `CFNUT3CR` esperando desde las 20:31:50) y
 * `P49NRWD8` (19:16:15, con `JNXLGNQ9` esperando desde las 19:10:23).
 *
 * La lección es la de siempre en este tablero: un aviso que habla de PEDIDOS no
 * se puede representar con un booleano del negocio entero, porque colapsa
 * varios hechos distintos en uno solo y pierde todos menos el primero.
 */
export function newArrivals(prev: readonly string[], curr: readonly string[]): string[] {
  const antes = new Set(prev)
  return curr.filter((id) => !antes.has(id))
}

/**
 * Alertas de audio del dashboard de negocios (PROPUESTAS_UX_PEDIDOS §7):
 *  · Tipo 1 — pedido nuevo: el timbre `playNewOrderChime` (una vez, al entrar)
 *    seguido de la voz, y luego el bip 880Hz + 1175Hz con cadencia escalonada
 *    (ver `nextBeepDelay`) mientras queden pedidos SIN ACUSAR.
 *  · Tipo 2 — motorizado llegó: 660-880-660Hz, triple bip suave, una vez POR
 *    PEDIDO que entra en `waiting` (ver `newArrivals`).
 *  · Tipo 3 — buffer fase 3 (5m+ sin moto): 440Hz, bip largo, cada 8s.
 *
 * QUÉ SUENA Y QUÉ NO LO DECIDE `attentionState`, no este hook. Aquí solo entra
 * el recuento de lo que sigue reclamando a la cajera sin que ella lo haya
 * abierto: el acuse de recibo se resuelve antes, y por eso este fichero no sabe
 * nada de acuses. Lo único que decide aquí es el RITMO — y, con `readingDetail`,
 * si la voz habla o se calla. El bip nunca se apaga por leer.
 */
export function useDashboardSounds({
  hasPending,
  pendingCount,
  urgent,
  waitingIds,
  hasBufferP3,
  soundOn,
  readingDetail = false,
}: {
  /** Hay algo sin acusar. Es `attentionState(...).alarm.hasPending`. */
  hasPending: boolean
  /** Cuántos sin acusar. Es lo que anuncia la voz. */
  pendingCount: number
  /** Alguno en su último minuto: aprieta la cadencia y no admite acuse. */
  urgent: boolean
  /**
   * Los pedidos que AHORA MISMO tienen al motorizado esperando en el local.
   * Son ids, no un booleano: ver `newArrivals`.
   */
  waitingIds: readonly string[]
  hasBufferP3: boolean
  soundOn: boolean
  /**
   * Hay una ficha de pedido abierta en pantalla, sea cual sea. NO apaga nada
   * —eso es justo lo que se quitó tras `JMAXL98Z`, ver `attention.ts`—: solo
   * fuerza el ritmo espaciado (`reading` en `nextBeepDelay`) y calla la VOZ,
   * que es la que de verdad estorba leyendo. El bip sigue, más espaciado, y el
   * último minuto lo salta lo mismo que siempre.
   */
  readingDetail?: boolean
}) {
  const t1 = useRef<ReturnType<typeof setTimeout> | null>(null)
  const t3 = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevPendingCount = useRef(0)
  const prevWaitingIds = useRef<readonly string[]>([])
  const prevUrgent = useRef(false)
  /** Cuándo empezó ESTA tanda: de ahí sale si toca ritmo de enganche o el lento. */
  const startedAt = useRef(0)
  const lastVoiceAt = useRef(0)
  /** Leídos por el bucle, que vive fuera del render y no puede depender de props. */
  const countRef = useRef(pendingCount)
  const urgentRef = useRef(urgent)
  const readingRef = useRef(readingDetail)
  useEffect(() => {
    countRef.current = pendingCount
    urgentRef.current = urgent
    readingRef.current = readingDetail
  })

  // Tipo 1 — pedido nuevo. Un bucle que se reprograma solo, en vez de un
  // `setInterval` fijo: la cadencia cambia con el tiempo y con la urgencia, y un
  // intervalo no se puede reajustar sin volver a montarlo entero.
  useEffect(() => {
    const stop = () => {
      if (t1.current) clearTimeout(t1.current)
      t1.current = null
    }
    if (!soundOn || !hasPending) {
      stop()
      startedAt.current = 0
      lastVoiceAt.current = 0
      prevPendingCount.current = 0
      return stop
    }

    // La voz de arranque la da el efecto del flanco (la cuenta acaba de subir de
    // cero), así que el bucle no habla en su primer bip: si hablaran los dos, el
    // segundo cancelaría al primero a media frase.
    startedAt.current = Date.now()
    lastVoiceAt.current = Date.now()
    const tick = () => {
      playToneSequence([880, 1175], 0.18, 0.55, true)
      const ahora = Date.now()
      // La voz de recordatorio ("sigues teniendo N") es la que más estorba
      // leyendo, y no lleva noticia nueva: el bip de abajo ya sigue sonando.
      if (!readingRef.current && ahora - lastVoiceAt.current >= VOICE_EVERY_MS) {
        lastVoiceAt.current = ahora
        speak(pendingAnnouncement(countRef.current), 450)
      }
      t1.current = setTimeout(
        tick,
        nextBeepDelay({
          elapsedMs: ahora - startedAt.current,
          urgent: urgentRef.current,
          reading: readingRef.current,
        }),
      )
    }
    tick()
    return stop
    // `pendingCount` y `urgent` NO van en las dependencias a propósito: el bucle
    // los lee por ref. Si fueran dependencias, cada pedido acusado remontaría el
    // temporizador y dispararía un bip inmediato — castigando justo el gesto que
    // queremos premiar.
  }, [soundOn, hasPending])

  // EL FLANCO: cuando la cuenta SUBE hay noticia, y esa no espera al siguiente
  // bip del bucle (que puede estar a hasta 12s). Además reinicia la tanda de
  // enganche, porque un pedido nuevo merece el ritmo rápido aunque el anterior
  // ya estuviera en el lento.
  //
  // EL TIMBRE SUENA SIEMPRE, LEYENDO O NO — es el "entró un pedido", no el
  // recordatorio, y es corto y de un timbre distinto al bip: no compite con la
  // lectura como sí lo hace una frase hablada. Lo único que calla leyendo es
  // la VOZ.
  useEffect(() => {
    if (!soundOn || !hasPending) return
    if (pendingCount > prevPendingCount.current) {
      startedAt.current = Date.now()
      lastVoiceAt.current = Date.now()
      playNewOrderChime()
      if (!readingRef.current) speak(pendingAnnouncement(pendingCount), 700)
    }
    prevPendingCount.current = pendingCount
  }, [soundOn, hasPending, pendingCount])

  // El último minuto no espera al siguiente bip del ritmo lento: si acaba de
  // entrar en zona roja, suena YA. Es el aviso que la cajera no puede callar.
  useEffect(() => {
    if (soundOn && hasPending && urgent && !prevUrgent.current) {
      // `isInterval: true` no es un descuido. Cuando un pedido ACUSADO entra en
      // su último minuto pasan dos cosas a la vez: la alarma se enciende (y el
      // bucle da su primer bip) y este flanco quiere sonar. Sin respetar el
      // canal ocupado sonaban los dos, encadenados, y el aviso más importante
      // del turno se oía como un tropezón.
      playToneSequence([880, 1175], 0.18, 0.55, true)
      startedAt.current = Date.now()
    }
    prevUrgent.current = urgent
  }, [soundOn, hasPending, urgent])

  // Tipo 3 — buffer fase 3
  useEffect(() => {
    const stop = () => {
      if (t3.current) clearInterval(t3.current)
      t3.current = null
    }
    if (!soundOn || !hasBufferP3) {
      stop()
      return stop
    }
    const play = () => playToneSequence([440], 0.8, 0.25, true)
    play()
    t3.current = setInterval(play, 8000)
    return stop
  }, [soundOn, hasBufferP3])

  // Tipo 2 — motorizado llegó (evento único de alta prioridad, UNO POR PEDIDO).
  //
  // La clave va por ids y no por el array: `vms` se reconstruye cada segundo con
  // el tick del reloj, así que el array es nuevo en cada render aunque no haya
  // cambiado nada. Con el array en las dependencias, el efecto correría sesenta
  // veces por minuto para no hacer nada.
  const waitingKey = waitingIds.join('|')
  useEffect(() => {
    // El único de los tres tipos que no miraba `soundOn`: sonaba con el sonido
    // apagado, que es justo el ajuste que la cajera no puede desandar sola.
    if (!soundOn) {
      prevWaitingIds.current = waitingIds
      return
    }
    if (newArrivals(prevWaitingIds.current, waitingIds).length > 0) {
      playToneSequence([660, 880, 660], 0.3, 0.22, false)
      speak('El motorizado llegó al local', 650)
    }
    prevWaitingIds.current = waitingIds
  }, [soundOn, waitingKey])
}

/**
 * Tipo 4 — el motorizado cambió el método de pago pactado (ver
 * `paymentChangeAlert` en `lib/orders/view-model.ts`, que decide CUÁNDO
 * aplica). Un evento único por pedido, como la llegada: el mismo patrón
 * `newArrivals` por ids.
 *
 * LA PRIMERA CARGA SOLO FIJA LA BASE, Y NO SUENA NADA. A diferencia de
 * `waitingIds` —que es un estado transitorio, imposible de encontrar ya
 * puesto salvo coincidencia exacta con el montaje—, "cambió el método" es
 * permanente desde que `advance_order` lo escribe: un pedido entregado a las
 * 8pm sigue "cambiado" a medianoche. Sin esta base iniciaría con el array de
 * seguimiento vacío y trataría CADA pedido cambiado de la jornada como si
 * acabara de pasar, disparando un pitido y un aviso por cada uno en cuanto la
 * cajera abriera o recargara el panel.
 *
 * EL AVISO VISUAL NO DEPENDE DE `soundOn`; EL PITIDO SÍ. Es dinero que va a
 * entrar distinto de lo pactado — apagar el sonido no es motivo para
 * ocultarlo, solo para no pitar.
 */
export function usePaymentChangeAlerts(
  alerts: readonly { id: string; message: string }[],
  soundOn: boolean,
): void {
  const seenRef = useRef<Set<string> | null>(null)
  const idsKey = alerts.map((a) => a.id).join('|')

  useEffect(() => {
    const seen = seenRef.current
    if (seen === null) {
      seenRef.current = new Set(alerts.map((a) => a.id))
      return
    }
    for (const a of alerts) {
      if (seen.has(a.id)) continue
      seen.add(a.id)
      notifyPaymentChanged(a.message)
      if (soundOn) playPaymentChangedTone()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `alerts` se lee del cierre; `idsKey` ya representa su identidad relevante.
  }, [idsKey, soundOn])
}

/**
 * Tipo 5 — el pedido se entregó: timbre (`notication-tindivo-5`) + voz «Pedido
 * entregado», una vez por pedido que pasa a `delivered`. Mismo patrón por ids
 * que la llegada y el cambio de pago (`newArrivals` / diff contra lo visto).
 *
 * LA PRIMERA CARGA SOLO FIJA LA BASE, mismo motivo que `usePaymentChangeAlerts`
 * y no el de `waitingIds`: `delivered` es TERMINAL (invariante 8 de
 * `CLAUDE.md`), así que un pedido entregado a las 8pm lo sigue estando a
 * medianoche. Sin esta base, reabrir el panel a mitad de turno narraría de
 * nuevo cada entrega de la noche.
 *
 * ES SOLO SONIDO, sin banner: no reclama nada de la cajera —lo contrario de
 * `attentionState`—, así que respeta `soundOn` entero (timbre y voz), sin la
 * excepción visual que sí tiene el cambio de pago.
 */
export function useOrderDeliveredAlerts(deliveredIds: readonly string[], soundOn: boolean): void {
  const seenRef = useRef<Set<string> | null>(null)
  const idsKey = deliveredIds.join('|')

  useEffect(() => {
    const seen = seenRef.current
    if (seen === null) {
      seenRef.current = new Set(deliveredIds)
      return
    }
    for (const id of deliveredIds) {
      if (seen.has(id)) continue
      seen.add(id)
      if (!soundOn) continue
      playOrderDeliveredChime()
      speak('Pedido entregado', 500)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deliveredIds` se lee del cierre; `idsKey` ya representa su identidad relevante.
  }, [idsKey, soundOn])
}
