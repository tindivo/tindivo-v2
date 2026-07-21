'use client'

import { Button } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { BottomSheet } from '@/components/ui'

type Props = {
  shortId: string
  onClose: () => void
}

export function PaymentResolutionGateModal({ shortId, onClose }: Props) {
  const router = useRouter()

  return (
    <BottomSheet open onClose={onClose}>
      <div className="flex flex-col items-center px-5 pt-4 pb-8 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <span className="text-2xl">⚠️</span>
        </div>

        <h2 className="text-[18px] font-bold text-ink">Tienes un caso de pago pendiente</h2>

        <p className="mt-2 text-[14px] text-ink-muted">
          No puedes crear nuevos pedidos hasta que se resuelva tu caso de pago del pedido{' '}
          <span className="font-semibold">#{shortId}</span>. Puedes apelar si realizaste el pago
          correctamente.
        </p>

        <div className="mt-6 flex w-full flex-col gap-2">
          <Button
            onClick={() => {
              onClose()
              router.push(`/pedido/${shortId}`)
            }}
            className="w-full"
          >
            Ir al pedido #{shortId}
          </Button>

          <Button variant="ghost" onClick={onClose} className="w-full">
            Cerrar
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
