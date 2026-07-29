import Link from 'next/link'
import type { OrderResult } from '@/features/checkout/types'

export function ConfirmedView({ result }: { result: OrderResult }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success text-white">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <title>ok</title>
          <path
            d="M5 12.5l4.5 4.5L19 7"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h1 className="t-display mt-5 text-[28px]">¡Pedido recibido!</h1>
      <p className="t-muted mt-2 text-[15px]">Esperando que el restaurante confirme tu pedido.</p>
      <div className="mt-5 rounded-[18px] border border-ink/5 bg-white px-6 py-4">
        <div className="t-eyebrow">Código del pedido</div>
        <div className="mt-1 font-mono font-semibold text-[24px]">#{result.shortId}</div>
      </div>
      <Link href={`/pedido/${result.shortId}`} className="t-btn t-btn-primary t-btn-block mt-6">
        Ver seguimiento
      </Link>
      <Link href="/" className="mt-3 text-[14px] text-brand">
        Volver al inicio
      </Link>
    </main>
  )
}
