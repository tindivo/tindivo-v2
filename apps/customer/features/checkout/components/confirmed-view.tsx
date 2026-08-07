import { Button } from '@tindivo/ui'
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
      <h1 className="mt-5 font-display text-[28px] font-bold tracking-tight">¡Pedido recibido!</h1>
      <p className="mt-2 text-[15px] text-ink-muted">
        Esperando que el restaurante confirme tu pedido.
      </p>
      <div className="mt-5 rounded-[18px] border border-ink/5 bg-white px-6 py-4">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Código del pedido
        </div>
        <div className="mt-1 font-mono font-semibold text-[24px]">#{result.shortId}</div>
      </div>
      <Button as="a" href={`/pedido/${result.shortId}`} variant="brand" className="mt-6 w-full">
        Ver seguimiento
      </Button>
      <Link href="/" className="mt-3 text-[14px] text-brand">
        Volver al inicio
      </Link>
    </main>
  )
}
