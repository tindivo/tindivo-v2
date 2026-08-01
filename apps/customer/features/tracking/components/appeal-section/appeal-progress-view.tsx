import { TINDIVO_SUPPORT_WHATSAPP } from '@tindivo/core'
import { useEffect, useState } from 'react'
import { getSupportWhatsapp } from '@/lib/support'
import { AppealStepTracker } from './appeal-step-tracker'
import type { AppealStatus } from './types'

interface AppealProgressViewProps {
  shortId: string
  loading: boolean
  appealData: AppealStatus | null
  total: number
}

export function AppealProgressView({
  shortId,
  loading,
  appealData,
  total,
}: AppealProgressViewProps) {
  const [wa, setWa] = useState(TINDIVO_SUPPORT_WHATSAPP)

  useEffect(() => {
    getSupportWhatsapp().then(setWa)
  }, [])

  const whatsappUrl = `https://wa.me/${wa}?text=${encodeURIComponent(
    `Hola, tengo un problema con mi pedido #TDV-${shortId}. Motivo: `,
  )}`

  if (loading) {
    return <div className="mt-3.5 h-32 animate-pulse rounded-[22px] bg-white" />
  }

  const status = appealData?.appealStatus ?? 'pending'
  const refundStatus = appealData?.refundStatus ?? null
  const refundAmount = appealData?.refundAmount ?? null
  const refundProofUrl = appealData?.refundProofUrl ?? null

  return (
    <div className="mt-3.5 rounded-[22px] border border-[rgba(26,22,20,0.05)] bg-white p-5">
      <div className="font-semibold text-[15px] text-ink">Estado de tu apelación</div>

      <AppealStepTracker
        status={status}
        refundStatus={refundStatus}
        refundAmount={refundAmount}
        refundProofUrl={refundProofUrl}
        total={total}
      />

      <div className="mt-4">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5 text-[12px] text-ink-subtle hover:underline"
        >
          <span>💬</span>
          <span>¿Necesitas ayuda? Escríbenos por WhatsApp</span>
        </a>
      </div>
    </div>
  )
}
