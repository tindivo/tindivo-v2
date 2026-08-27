'use client'

import { ScreenHeader } from '@tindivo/ui'
import Link from 'next/link'
import type { Tracking } from '@/features/tracking/types'

interface TrackingShellProps {
  title: string
  onBack: () => void
  error: string | null
  data: Tracking | null
  /** El interruptor de sonido, a la derecha del título. */
  right?: React.ReactNode
  /**
   * ¿Hay una barra de acción fija abajo? (la de subir el comprobante, en
   * `awaiting_payment`). Si la hay, el final del scroll necesita sitio o la
   * barra tapa la última tarjeta.
   *
   * Lo reserva ESTA capa y no quien pinta la barra, porque la barra se declara
   * a media página —dentro de la tarjeta de prepago, con el detalle del pedido
   * y el motorizado debajo— y un espaciador ahí no abre hueco al final: abre un
   * agujero en mitad del scroll.
   */
  pieFijo?: boolean
  children: React.ReactNode
}

export function TrackingShell({
  title,
  onBack,
  error,
  data,
  right,
  pieFijo = false,
  children,
}: TrackingShellProps) {
  if (error && !data) {
    return (
      <main className="mx-auto max-w-[768px] px-4 pt-16 text-center">
        <p className="text-ink-muted">{error}</p>
        <Link href="/" className="mt-4 inline-block font-semibold text-brand">
          Volver al inicio
        </Link>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-[768px] px-4 pt-12">
        <div className="h-48 animate-pulse rounded-[22px] bg-card" />
      </main>
    )
  }

  return (
    <main
      className={`mx-auto min-h-dvh max-w-[768px] bg-surface lg:max-w-[1040px] ${
        pieFijo ? 'pb-32' : 'pb-16'
      }`}
    >
      <ScreenHeader title={title} onBack={onBack} right={right} />
      {children}
    </main>
  )
}
