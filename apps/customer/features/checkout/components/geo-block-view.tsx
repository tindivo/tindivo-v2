import Link from 'next/link'
import type { GeoBlockKind } from '@/features/checkout/types'

const COPY: Record<GeoBlockKind, { title: string; body: string; iconBg: string }> = {
  far: {
    title: 'Este pedido requiere pago anticipado',
    body: 'Detectamos que estás fuera de la zona normal de validación. Puedes continuar pagando por adelantado.',
    iconBg: 'bg-brand-dark',
  },
  unavailable: {
    title: 'No pudimos detectar tu ubicación',
    body: 'Revisa el permiso de ubicación de tu navegador. Si prefieres, puedes continuar con pago anticipado.',
    iconBg: 'bg-brand',
  },
  low_accuracy: {
    title: 'La ubicación no fue precisa',
    body: 'Tu navegador entregó una ubicación imprecisa. Reintenta desde un lugar con mejor señal o paga por adelantado.',
    iconBg: 'bg-warning',
  },
}

export function GeoBlockView({
  kind,
  onRetry,
  onPrepay,
}: {
  kind: GeoBlockKind
  onRetry: () => void
  onPrepay: () => void
}) {
  const copy = COPY[kind]
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center px-6 text-center">
      <div
        className={`flex h-20 w-20 items-center justify-center rounded-full text-white ${copy.iconBg}`}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <title>ubicación</title>
          <path
            d="M12 21s-7-5.5-7-11a7 7 0 1114 0c0 5.5-7 11-7 11z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
      <h1 className="t-display mt-5 text-[26px]">{copy.title}</h1>
      <p className="t-muted mt-2 text-[15px]">{copy.body}</p>
      <button type="button" onClick={onPrepay} className="t-btn t-btn-primary t-btn-block mt-6">
        Pagar por adelantado
      </button>
      <button type="button" onClick={onRetry} className="t-btn t-btn-ghost t-btn-block mt-3">
        Volver a intentar
      </button>
      <Link href="/" className="mt-3 text-[14px] text-brand">
        Volver al inicio
      </Link>
    </main>
  )
}
