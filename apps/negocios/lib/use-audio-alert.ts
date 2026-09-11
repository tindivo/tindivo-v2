'use client'

import { useEffect, useRef } from 'react'
import { nextBeepDelay, VOICE_EVERY_MS } from './orders/attention'
import { notifyPaymentChanged } from './payment-change-bus'

let sharedCtx: AudioContext | null = null
let audioBusyUntil = 0
let autoUnlocked = false

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

/** Desbloquea el audio dentro de un gesto del usuario (toggle o primer toque PWA). */
export function unlockAudio(): void {
  const ctx = getCtx()
  if (ctx && ctx.state === 'suspended') {
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
 * Anuncia verbalmente el estado de pedidos pendientes u otros avisos.
 * Usa la API de Web Speech (SpeechSynthesis). Se desfasa suavemente tras el bip
 * para evitar que la voz hable sobre los tonos de audio.
 */
export function speak(text: string, delayMs = 350): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

  setTimeout(() => {
    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'es-PE'
      utterance.rate = 1.1
      utterance.pitch = 1.0
      utterance.volume = 1.0
      window.speechSynthesis.speak(utterance)
    } catch {
      // Ignorar fallos de speech en entornos donde la voz no está disponible
    }
  }, delayMs)
}

/** Genera el texto de anuncio según la cantidad de pedidos pendientes. */
function pendingAnnouncement(count: number): string {
  if (count === 1) return 'Tienes un pedido nuevo'
  return `Tienes ${count} pedidos en espera`
}

/**
 * Reproduce una secuencia de tonos senoidales con prevención de solapamiento.
 * Si `isInterval` es verdadero y el canal está ocupado, el tick del intervalo se salta
 * para evitar acumulación de sonidos cuando la PWA está minimizada.
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

  for (const f of freqs) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = f

    // Envolvente de ganancia suave para evitar clics eléctricos
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.001), at + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + durEach - 0.015)

    osc.start(at)
    osc.stop(at + durEach)
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
 *  · Tipo 1 — pedido nuevo: 880Hz + 1175Hz, doble bip, con cadencia escalonada
 *    (ver `nextBeepDelay`) mientras queden pedidos SIN ACUSAR.
 *  · Tipo 2 — motorizado llegó: 660-880-660Hz, triple bip suave, una vez POR
 *    PEDIDO que entra en `waiting` (ver `newArrivals`).
 *  · Tipo 3 — buffer fase 3 (5m+ sin moto): 440Hz, bip largo, cada 8s.
 *
 * QUÉ SUENA Y QUÉ NO LO DECIDE `attentionState`, no este hook. Aquí solo entra
 * el recuento de lo que sigue reclamando a la cajera sin que ella lo haya
 * abierto: el acuse de recibo se resuelve antes, y por eso este fichero no sabe
 * nada de acuses. Lo único que decide aquí es el RITMO.
 */
export function useDashboardSounds({
  hasPending,
  pendingCount,
  urgent,
  waitingIds,
  hasBufferP3,
  soundOn,
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
  useEffect(() => {
    countRef.current = pendingCount
    urgentRef.current = urgent
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
      if (ahora - lastVoiceAt.current >= VOICE_EVERY_MS) {
        lastVoiceAt.current = ahora
        speak(pendingAnnouncement(countRef.current), 450)
      }
      t1.current = setTimeout(
        tick,
        nextBeepDelay({ elapsedMs: ahora - startedAt.current, urgent: urgentRef.current }),
      )
    }
    tick()
    return stop
    // `pendingCount` y `urgent` NO van en las dependencias a propósito: el bucle
    // los lee por ref. Si fueran dependencias, cada pedido acusado remontaría el
    // temporizador y dispararía un bip inmediato — castigando justo el gesto que
    // queremos premiar.
  }, [soundOn, hasPending])

  // La voz sí va en el flanco: cuando la cuenta SUBE hay noticia, y esa no
  // espera al siguiente bip. Además reinicia la tanda de enganche, porque un
  // pedido nuevo merece el ritmo rápido aunque el anterior ya estuviera en el
  // lento.
  useEffect(() => {
    if (!soundOn || !hasPending) return
    if (pendingCount > prevPendingCount.current) {
      startedAt.current = Date.now()
      lastVoiceAt.current = Date.now()
      speak(pendingAnnouncement(pendingCount), 450)
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
