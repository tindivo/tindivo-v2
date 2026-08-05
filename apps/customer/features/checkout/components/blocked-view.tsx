'use client'

import { TINDIVO_SUPPORT_WHATSAPP } from '@tindivo/core'
import { Button } from '@tindivo/ui'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getSupportWhatsapp } from '@/lib/support'

export function BlockedView() {
  const [wa, setWa] = useState(TINDIVO_SUPPORT_WHATSAPP)

  useEffect(() => {
    getSupportWhatsapp().then(setWa)
  }, [])

  const href = `https://wa.me/${wa}?text=${encodeURIComponent('Hola, mi cuenta aparece pausada y quiero regularizarla.')}`

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-danger text-white">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <title>pausa</title>
          <path
            d="M6 10V8a6 6 0 0112 0v2m-9 0h6a3 3 0 013 3v4a3 3 0 01-3 3H9a3 3 0 01-3-3v-4a3 3 0 013-3z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h1 className="mt-5 font-display text-[26px] font-bold tracking-tight">Cuenta en pausa</h1>
      <p className="mt-2 text-[15px] text-ink-muted">
        Tu cuenta está temporalmente pausada por incidentes reiterados en las entregas. Escríbenos
        para regularizar tu situación y reactivarla.
      </p>
      {href && (
        <Button
          as="a"
          href={href}
          target="_blank"
          rel="noreferrer"
          variant="brand"
          className="mt-6 w-full"
        >
          Escribir por WhatsApp
        </Button>
      )}
      <Link href="/" className="mt-3 text-[14px] text-brand">
        Volver al inicio
      </Link>
    </main>
  )
}
