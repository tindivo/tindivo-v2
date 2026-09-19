'use client'

import { ApiError } from '@tindivo/api-client'
import type { ReactNode } from 'react'
import { createDriverAudioTrigger } from '@/lib/sound'
import { postTransition } from '@/lib/transitions'
import { SwipeCard } from './swipe-card'

/**
 * Arrastrar la tarjeta a la derecha para tomar el pedido (Disponibles).
 *
 * Tomar costaba tres toques y una carga de página; el gesto lo deja en uno. El
 * motor del arrastre vive en `SwipeCard`; aquí solo se dice qué hace: `take`, en
 * modo `confirm` porque es la ÚNICA transición que compite con otros
 * motorizados y no se pinta hasta que el servidor confirma (ver `NEVER_QUEUED`
 * en `lib/transitions`).
 */
export function SwipeToTake({
  orderId,
  onTaken,
  hint = false,
  children,
}: {
  orderId: string
  /** Refresca el board: el pedido ya no pertenece a esta bandeja. */
  onTaken: () => void
  hint?: boolean
  children: ReactNode
}) {
  return (
    <SwipeCard
      hint={hint}
      right={{
        mode: 'confirm',
        verb: 'Tomar',
        doing: 'Tomando…',
        done: 'Es tuyo',
        icon: 'check_circle',
        tone: 'green',
        armSound: () => createDriverAudioTrigger('orderTaken'),
        commit: async () => {
          await postTransition(orderId, 'take')
        },
        onDone: onTaken,
        failure: (err) => {
          if (!(err instanceof ApiError)) {
            return { text: 'Sin conexión · vuelve a intentar', tone: 'warning' }
          }
          if (err.status === 409) {
            // Si se lo llevó otro, la tarjeta sobra en esta bandeja.
            return { text: 'Lo tomó otro motorizado', tone: 'danger', after: onTaken }
          }
          return { text: err.problem.detail ?? 'No se pudo tomar', tone: 'danger' }
        },
      }}
    >
      {children}
    </SwipeCard>
  )
}
