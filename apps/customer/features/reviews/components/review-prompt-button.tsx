'use client'

import { Button } from '@tindivo/ui'
import { useState } from 'react'
import { ReviewSheet } from '@/features/reviews/components/review-sheet'
import type { PendingReviewState } from '@/features/reviews/hooks/use-pending-review'

interface ReviewPromptButtonProps {
  estado: PendingReviewState
  /** El pedido de ESTA fila. Solo se pinta si es el que está pendiente. */
  orderId: string
}

/**
 * «Calificar», en la fila del pedido que toca, dentro del historial.
 *
 * Es la segunda puerta, para quien no pasó por la espera —o le dijo «ahora no» y
 * luego se acordó—. Aquí no hacen falta estrellas en línea como en la tarjeta:
 * la fila ya dice de qué pedido habla, así que un botón junto a «Volver a pedir»
 * dice lo mismo con menos.
 *
 * No aparece en todas las filas. `get_pending_review` devuelve UNO —el más
 * reciente sin calificar— y solo esa fila lo lleva: un botón repetido en cada
 * pedido entregado sería pedir cinco reseñas de golpe, que es la forma más
 * rápida de no conseguir ninguna.
 */
export function ReviewPromptButton({ estado, orderId }: ReviewPromptButtonProps) {
  const [abierta, setAbierta] = useState(false)

  if (!estado.pendiente || estado.pendiente.orderId !== orderId) return null
  const { pendiente } = estado

  return (
    <>
      <Button variant="soft" size="sm" className="flex-1" onClick={() => setAbierta(true)}>
        Calificar
      </Button>
      <ReviewSheet
        open={abierta}
        pendiente={pendiente}
        notaInicial={5}
        enviando={estado.enviando}
        error={estado.error}
        onClose={() => setAbierta(false)}
        onSubmit={estado.enviar}
      />
    </>
  )
}
