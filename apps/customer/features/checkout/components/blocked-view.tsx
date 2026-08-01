'use client'

import { TINDIVO_SUPPORT_WHATSAPP } from '@tindivo/core'
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
      <h1 className="t-display mt-5 text-[26px]">Cuenta en pausa</h1>
      <p className="t-muted mt-2 text-[15px]">
        Tu cuenta está temporalmente pausada por incidentes reiterados en las entregas. Escríbenos
        para regularizar tu situación y reactivarla.
      </p>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="t-btn t-btn-primary t-btn-block mt-6"
        >
          Escribir por WhatsApp
        </a>
      )}
      <Link href="/" className="mt-3 text-[14px] text-brand">
        Volver al inicio
      </Link>
    </main>
  )
}
