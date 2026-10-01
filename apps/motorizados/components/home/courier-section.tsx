'use client'

import { ApiError } from '@tindivo/api-client'
import type { CourierStatus, DriverCourierOrderView } from '@tindivo/contracts'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createDriverAudioTrigger } from '@/lib/sound'
import { CourierCard, isPicked } from './courier-card'
import { errorText, needsPayment, PaymentSheet, ProblemSheet, sendStep } from './courier-steps'
import { type LeftAction, type RightAction, SwipeCard } from './swipe-card'

/**
 * Tindivo Entregas en el tablero del motorizado (MVP, Docs/Entregas/mvp-entregas-v1.md §4).
 *
 * MISMA MANO QUE LA COMIDA: la tarjeta se arrastra a la derecha para avanzar
 * (Aceptar → Ya recogí → Entregado) y a la izquierda para «No se pudo», y
 * tocándola se abre su ficha, `/entrega/[id]`, con los mismos pasos en
 * botones. Cada paso es UNA transacción en la base (`driver_courier_step`,
 * 0235) e idempotente: si la conexión se corta, volver a intentarlo es seguro.
 *
 * La comida manda por REGLA DE OPERACIÓN, no por software: si hay comida
 * lista para recoger, va primero; una entrega ya recogida se termina antes.
 */

// ── En espera ───────────────────────────────────────────────────────────────

/**
 * Una entrega por aceptar. Va SUELTA, no en una lista propia: la bandeja la
 * intercala con la comida por su reloj (`interleaveByTime`).
 */
export function CourierAvailableItem({
  order,
  blockedReason,
  hint = false,
  onChanged,
}: {
  order: DriverCourierOrderView
  /** Ya tiene el máximo de entregas: la tarjeta no cede y dice por qué. */
  blockedReason?: string
  hint?: boolean
  onChanged: () => void
}) {
  const router = useRouter()
  const card = (
    <CourierCard
      order={order}
      variant="available"
      blockedReason={blockedReason}
      onOpen={() => router.push(`/entrega/${order.id}`)}
    />
  )

  // Bloqueada no cede ni un píxel: ya dice por qué con el candado.
  if (blockedReason) return <div>{card}</div>

  return (
    <SwipeCard
      hint={hint}
      right={{
        mode: 'confirm',
        verb: 'Aceptar',
        doing: 'Aceptando…',
        done: 'Es tuya',
        icon: 'check_circle',
        tone: 'green',
        armSound: () => createDriverAudioTrigger('orderTaken'),
        commit: () => sendStep(order.id, { step: 'accept' }),
        onDone: onChanged,
        failure: (err) => {
          if (!(err instanceof ApiError)) return null
          // Si se la llevó otro, la tarjeta sobra en esta bandeja.
          const after = err.status === 409 ? onChanged : undefined
          return { text: errorText(err, 'No se pudo aceptar'), tone: 'danger', after }
        },
      }}
    >
      {card}
    </SwipeCard>
  )
}

/** El motivo del candado, o nada si aún cabe otra entrega. */
export function courierBlockedReason(mineCount: number, maxActive: number): string | undefined {
  return mineCount >= maxActive ? `Ya tienes ${mineCount} entregas · termina una` : undefined
}

// ── Míos ────────────────────────────────────────────────────────────────────

type Sheet = 'problem' | { payment: 'pick_up' | 'deliver' } | null

/** Una entrega mía, intercalada con la comida en «Míos». */
export function CourierMineItem({
  order: fromBoard,
  hint = false,
  onChanged,
}: {
  order: DriverCourierOrderView
  hint?: boolean
  onChanged: () => Promise<void> | void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  /**
   * El paso ya dado, pintado ANTES de que el servidor conteste: «Ya recogí»
   * cambia la tarjeta al soltar, como en la comida. Se borra cuando el
   * tablero recargado ya lo trae, o se deshace si el servidor lo rechaza.
   */
  const [patched, setPatched] = useState<CourierStatus | null>(null)
  const order = patched ? { ...fromBoard, status: patched } : fromBoard
  const picked = isPicked(order)

  /** Recogido sin cobro: se pinta ya y el POST corre detrás. Lanza si falla. */
  async function pickUpNow() {
    setPatched('picked_up')
    try {
      await sendStep(order.id, { step: 'pick_up' })
      await onChanged()
    } finally {
      setPatched(null)
    }
  }

  /** Un paso desde una hoja: el error se queda en la hoja. */
  async function run(body: Parameters<typeof sendStep>[1]): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      await sendStep(order.id, body)
      return true
    } catch (err) {
      setError(errorText(err, 'No se pudo guardar. Intenta de nuevo.'))
      return false
    } finally {
      setBusy(false)
      await onChanged()
    }
  }

  function open(next: Sheet) {
    setError(null)
    setSheet(next)
  }

  const left: LeftAction = {
    verb: 'No se pudo',
    icon: 'block',
    tone: 'danger',
    onCommit: () => open('problem'),
  }

  const right: RightAction = !picked
    ? needsPayment(order, 'pick_up')
      ? {
          mode: 'open',
          verb: 'Ya recogí',
          icon: 'shopping_bag',
          tone: 'orange',
          commit: () => open({ payment: 'pick_up' }),
        }
      : {
          mode: 'optimistic',
          verb: 'Ya recogí',
          icon: 'shopping_bag',
          tone: 'orange',
          commit: pickUpNow,
        }
    : needsPayment(order, 'deliver')
      ? {
          mode: 'open',
          verb: 'Entregado',
          icon: 'check_circle',
          tone: 'green',
          commit: () => open({ payment: 'deliver' }),
        }
      : {
          // Entregada sale de «Míos»: la tarjeta se va, como al tomar.
          mode: 'confirm',
          verb: 'Entregado',
          doing: 'Guardando…',
          done: 'Entregada',
          icon: 'check_circle',
          tone: 'green',
          commit: () => sendStep(order.id, { step: 'deliver' }),
          onDone: () => void onChanged(),
        }

  return (
    <>
      <SwipeCard right={right} left={left} hint={hint} hintKey="tindivo.drv.swipehint.mine.v1">
        <CourierCard
          order={order}
          variant="mine"
          onOpen={() => router.push(`/entrega/${order.id}`)}
        />
      </SwipeCard>

      {sheet !== null && typeof sheet === 'object' && (
        <PaymentSheet
          fee={order.feeAmount}
          error={error}
          busy={busy}
          onClose={() => setSheet(null)}
          onPick={async (method) => {
            if (await run({ step: sheet.payment, paymentMethod: method })) setSheet(null)
          }}
        />
      )}
      {sheet === 'problem' && (
        <ProblemSheet
          order={order}
          error={error}
          busy={busy}
          onClose={() => setSheet(null)}
          onRelease={async () => {
            if (await run({ step: 'release' })) setSheet(null)
          }}
          onFail={async (reason) => {
            if (await run({ step: 'fail', failReason: reason })) setSheet(null)
          }}
        />
      )}
    </>
  )
}
