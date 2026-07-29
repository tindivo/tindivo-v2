import { soles } from '@/lib/format'

interface AppealCompletedCardProps {
  refundAmount: number | null
  total: number
  refundProofUrl: string | null
}

export function AppealCompletedCard({
  refundAmount,
  total,
  refundProofUrl,
}: AppealCompletedCardProps) {
  return (
    <div className="mt-2 overflow-hidden rounded-[16px] border border-green-200 bg-gradient-to-br from-green-50 to-green-100">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-600">
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            role="img"
            aria-label="Completado"
          >
            <title>Completado</title>
            <path
              d="M4 10l4.5 4.5L16 6"
              stroke="white"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div>
          <p className="text-[14px] font-bold text-green-900">¡Devolución realizada!</p>
          <p className="mt-0.5 text-[12px] text-green-800">
            Te devolvimos <span className="font-bold">{soles(refundAmount ?? total)}</span> por Yape
          </p>
        </div>
      </div>
      {refundProofUrl && (
        <a
          href={refundProofUrl}
          target="_blank"
          rel="noreferrer"
          className="block border-t border-green-200"
        >
          <img
            src={refundProofUrl}
            alt="Captura del Yape de devolución"
            className="max-h-[200px] w-full object-cover"
          />
          <p className="bg-white/50 py-2 text-center text-[11px] font-semibold text-green-800">
            Toca para ampliar la captura
          </p>
        </a>
      )}
      <div className="border-t border-green-200 bg-white/50 px-4 py-2.5 text-[11px] leading-relaxed text-green-800">
        Si no lo recibiste, escríbenos por WhatsApp y lo revisamos.
      </div>
    </div>
  )
}
