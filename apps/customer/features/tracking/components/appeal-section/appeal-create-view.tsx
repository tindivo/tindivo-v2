import { TINDIVO_SUPPORT_WHATSAPP } from '@tindivo/core'

interface AppealCreateViewProps {
  shortId: string
  orderId: string | null
  appealing: boolean
  error: string | null
  onAppeal: () => void
}

export function AppealCreateView({
  shortId,
  orderId,
  appealing,
  error,
  onAppeal,
}: AppealCreateViewProps) {
  const whatsappUrl = `https://wa.me/${TINDIVO_SUPPORT_WHATSAPP}?text=${encodeURIComponent(
    `Hola, tengo un problema con mi pedido #TDV-${shortId}. Motivo: `,
  )}`

  return (
    <div className="mt-3.5 rounded-[22px] border border-red-200 bg-red-50 p-5 text-left">
      <div className="font-semibold text-[16px] text-red-900">¿Realizaste el pago?</div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-red-800">
        Tu comprobante no pudo validarse tras 2 intentos. Si realizaste el pago correctamente,
        puedes solicitar una revisión y te contactaremos por WhatsApp en máximo 24 horas.
      </p>
      {error && <p className="mt-2 text-[12px] font-medium text-red-600">{error}</p>}
      {orderId && (
        <button
          type="button"
          onClick={onAppeal}
          disabled={appealing}
          className="mt-4 w-full rounded-[14px] border border-red-300 bg-white py-3 font-semibold text-[14px] text-red-700 shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {appealing ? 'Enviando...' : 'Solicitar revisión de pago'}
        </button>
      )}
      <div className="mt-3">
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
