'use client'

import { PrepayProofSection } from '@/components/prepay-proof-section'
import type { Tracking } from '@/features/tracking/types'

interface TrackingPrepayProps {
  data: Tracking
  ownedId: string | null
  onProofUploaded: () => void
}

export function TrackingPrepay({ data, ownedId, onProofUploaded }: TrackingPrepayProps) {
  if (data.paymentIntent !== 'prepaid') return null

  return (
    <>
      {/* 1. pending_acceptance o validando SIN comprobante: Esperando confirmación */}
      {(data.status === 'pending_acceptance' ||
        (data.status === 'validando' && !data.proofUrl)) && (
        <div className="mt-3.5 rounded-[22px] border border-orange-100 bg-orange-50/80 p-4 text-left text-orange-950">
          <div className="flex items-center gap-2 text-[14px] font-semibold">
            <span className="h-2 w-2 animate-pulse rounded-full bg-orange-500" />
            Esperando confirmación del restaurante
          </div>
          <p className="mt-1 text-[13px] text-orange-800">
            El restaurante está verificando disponibilidad de tu pedido. Te avisaremos aquí para
            realizar el pago.
          </p>
        </div>
      )}

      {/* 2 & 4. awaiting_payment: Subida de captura (intento 0 o 1) */}
      {data.status === 'awaiting_payment' && (
        <div>
          {data.proofAttempt === 1 && (
            <div className="mt-3.5 rounded-[18px] border border-red-300 bg-red-50 p-3.5 text-left text-[13px] text-red-700">
              <strong>Tu comprobante no fue válido.</strong> Revisa e intenta de nuevo. Te queda 1
              intento.
            </div>
          )}
          <PrepayProofSection
            orderId={ownedId ?? data.shortId}
            proofAttempt={data.proofAttempt ?? 0}
            onProofUploaded={onProofUploaded}
          />
        </div>
      )}

      {/* 3. validando CON comprobante subido: En revisión */}
      {data.status === 'validando' && Boolean(data.proofUrl) && (
        <div className="mt-3.5 rounded-[22px] border border-blue-200 bg-blue-50/80 p-4 text-left text-blue-950">
          <div className="flex items-center gap-2 text-[14px] font-semibold">
            <span className="h-2 w-2 animate-ping rounded-full bg-blue-500" />
            Verificando tu pago...
          </div>
          <p className="mt-1 text-[13px] text-blue-800">
            El restaurante está revisando tu comprobante de pago. Te notificaremos apenas sea
            verificado.
          </p>
        </div>
      )}
    </>
  )
}
