'use client'

import { useEffect } from 'react'
import type { BoardOrder } from '@/lib/types'
import { orderUrgency } from '@/lib/urgency'
import { useDriverOrders } from './use-driver-orders'
import { useNow } from './use-now'

/**
 * QUÉ PEDIDOS ESTÁN EN ZONA ROJA. Fuente ÚNICA.
 *
 * La condición de SONAR y la de VER salen de aquí, de la misma función. No es
 * estética: en `negocios` esas dos condiciones vivían escritas en dos sitios, se
 * desincronizaron y costó un pedido en producción (ver `lib/orders/attention.ts`
 * allí). Aquí el fallo era el mismo girado —el dato global y el sonido local—,
 * así que la regla se escribe una vez y la leen los dos.
 *
 * Si añades una alarma nueva, sácala de aquí; no de un filtro suelto.
 */
export function overdueIdsOf(available: BoardOrder[], now: number): Set<string> {
  const set = new Set<string>()
  for (const o of available) {
    if (orderUrgency(o, now) === 'overdue') set.add(o.id)
  }
  return set
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTADO DE LA ALARMA, A NIVEL DE MÓDULO
//
// Estaba en dos `useRef` DENTRO del componente, y el componente era `AvailableTab`
// — que solo se monta con la pestaña "En espera" activa. De ahí salían dos fallos
// encadenados:
//
//   1. Con el motorizado en "Míos" (que es donde la propia app lo deposita al
//      arrancar si tiene trabajo), un pedido que entraba en rojo no sonaba.
//   2. Al cambiar a "En espera" tampoco: `primed` arrancaba en `false` y el
//      efecto marcaba como YA VISTOS todos los vencidos que hubiera.
//
//   Neto: la alarma solo existía para pedidos que se ponían rojos mientras ya
//   estabas mirando esa pestaña concreta. Cada cambio de pestaña, además,
//   destruía el estado.
//
// Fuera del componente, el estado sobrevive al cambio de pestaña y de ruta.
// ─────────────────────────────────────────────────────────────────────────────

const seen = new Set<string>()
let primed = false

/** Olvida lo visto. Solo al desmontar la alarma de verdad (cierre de sesión). */
function resetAlarm(): void {
  seen.clear()
  primed = false
}

// ─────────────────────────────────────────────────────────────────────────────
// UN SOLO AudioContext
//
// `playAlertBeep` hacía `new AudioContext()` en CADA pitido y no lo cerraba
// nunca; `osc.stop()` para el oscilador, no libera el contexto. Chrome limita a
// 6 por documento: del séptimo en adelante el constructor lanza, el `try/catch`
// se lo tragaba, y el resto del turno era MUDO sin ningún síntoma. La vibración
// seguía funcionando, así que el motorizado daba por hecho que el sonido estaba
// apagado a propósito.
// ─────────────────────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (ctx !== null) return ctx
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return null
  try {
    ctx = new AudioCtx()
    return ctx
  } catch {
    return null
  }
}

/** Beep doble estilo "alerta" usando Web Audio API sin assets binarios. */
function playAlertBeep(): void {
  const c = getCtx()
  if (c === null) return

  // La política de autoplay deja el contexto en `suspended` hasta que hay un
  // gesto del usuario. Reanudarlo es lo que hace que el primer aviso de la
  // sesión suene en vez de perderse en silencio.
  if (c.state === 'suspended') void c.resume().catch(() => null)

  const now = c.currentTime
  const tono = (freq: number, desde: number, dura: number, vol: number) => {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, now + desde)
    gain.gain.setValueAtTime(vol, now + desde)
    gain.gain.exponentialRampToValueAtTime(0.001, now + desde + dura)
    osc.connect(gain)
    gain.connect(c.destination)
    osc.start(now + desde)
    osc.stop(now + desde + dura)
  }

  tono(880, 0, 0.15, 0.15) // A5
  tono(1174.66, 0.2, 0.2, 0.2) // D6
}

/**
 * Cadencia de la alarma. NO hace falta un segundo: el umbral que vigila son
 * minutos, y a 1s repintaría la shell entera 60 veces por minuto para nada.
 */
const ALARM_TICK_MS = 5_000

/**
 * Beep + vibración cuando aparece un pedido nuevo en zona roja.
 *
 * VIVE EN EL CHROME, no en una pestaña. Se monta con `DriverShell`, así que
 * suena en `/`, `/efectivo`, `/historial` y `/restaurantes` por igual, y
 * sobrevive a los cambios de pestaña del tablero.
 *
 * No devuelve nada y quien lo llama no pinta nada: es un efecto puro.
 */
export function useOverdueFeedback(): void {
  const now = useNow(ALARM_TICK_MS)
  const { available } = useDriverOrders(now)

  useEffect(() => {
    const overdue = overdueIdsOf(available, now)

    // Primera evaluación: lo que YA estaba en rojo al abrir no es novedad. Sin
    // esto, abrir la app con tres vencidos dispararía tres alarmas de golpe por
    // algo que el motorizado no acaba de recibir.
    if (!primed) {
      primed = true
      for (const id of overdue) seen.add(id)
      return
    }

    const nuevos: string[] = []
    for (const id of overdue) {
      if (!seen.has(id)) nuevos.push(id)
    }
    if (nuevos.length === 0) return
    for (const id of nuevos) seen.add(id)

    try {
      navigator.vibrate?.([400, 150, 400, 150, 400])
    } catch {
      // Sin soporte de vibración: el beep sigue.
    }
    try {
      playAlertBeep()
    } catch {
      // Autoplay bloqueado: la vibración ya avisó.
    }
  }, [available, now])

  // Solo se desmonta al cerrar sesión (la shell entera se va y aparece `Login`).
  // Los cambios de pestaña y de ruta dentro de `(driver)` NO pasan por aquí, que
  // es justo lo que estaba roto.
  useEffect(() => resetAlarm, [])
}
