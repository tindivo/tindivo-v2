'use client'

import { walletLabel } from '@tindivo/contracts'
import { Card, Icon, Skeleton } from '@tindivo/ui'
import Link from 'next/link'
import { useState } from 'react'
import { RestaurantDetailSheet } from '@/components/restaurants/restaurant-detail-sheet'
import { type DriverBusiness, useDriverBusinesses } from '@/hooks/use-driver-businesses'
import { isValidPePhone, telLink, waLink } from '@/lib/deeplinks'

export default function RestaurantesPage() {
  const { businesses, loading, error } = useDriverBusinesses()
  const [selectedBusiness, setSelectedBusiness] = useState<DriverBusiness | null>(null)

  return (
    <main className="mx-auto max-w-[480px] px-4 pt-20 pb-12">
      {/* Header pegajoso */}
      <div className="sticky top-[calc(44px+env(safe-area-inset-top))] z-30 -mx-4 mb-4 bg-surface/95 px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="Volver a pedidos"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink hover:bg-ink/[0.1] active:scale-95 transition-transform"
          >
            <Icon name="arrow_back" size={22} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[22px] font-bold tracking-tight text-ink">
              Restaurantes
            </h1>
            <p className="text-[12px] font-medium text-ink-muted">
              {loading
                ? 'Cargando locales…'
                : `${businesses.length} ${businesses.length === 1 ? 'restaurante asignado' : 'restaurantes asignados'}`}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <Card className="mb-4 p-4 border border-danger/20 bg-danger-soft text-danger text-[13px]">
          <p>{error}</p>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      ) : businesses.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-8 text-center shadow-xs">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink/[0.06] text-ink-muted">
            <Icon name="storefront" size={32} />
          </div>
          <h2 className="text-[16px] font-bold text-ink">Sin restaurantes asignados</h2>
          <p className="mt-1 text-[13px] text-ink-muted">
            Pide al administrador o al restaurante que te vincule para ver sus pedidos y datos de
            cobro.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {businesses.map((biz) => {
            const phone = biz.phone ?? ''
            const hasPhone = isValidPePhone(phone)
            const whatsapp = hasPhone
              ? waLink(phone, `Hola ${biz.name}, soy motorizado de Tindivo`)
              : null

            return (
              <div
                key={biz.id}
                className="overflow-hidden rounded-2xl border border-ink/[0.08] bg-white shadow-[0_2px_12px_rgba(26,22,20,0.04)] transition-all hover:shadow-[0_4px_20px_rgba(26,22,20,0.08)]"
              >
                <div className="p-4">
                  {/* Cabecera: Avatar + Nombre + Badges de Métodos */}
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-display text-[17px] font-bold text-white shadow-xs"
                      style={{ backgroundColor: biz.accentColor || '#f97316' }}
                    >
                      {biz.name.charAt(0).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="truncate font-display text-[17px] font-bold tracking-tight text-ink">
                          {biz.name}
                        </h2>

                        {/* Badges de métodos de pago */}
                        <div className="flex shrink-0 flex-wrap gap-1">
                          {biz.paymentQrs.length > 0 ? (
                            biz.paymentQrs.map((q) => (
                              <span
                                key={q.slot}
                                className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200/70 px-2 py-0.5 text-[10px] font-bold text-blue-700 shadow-2xs"
                              >
                                <Icon name="qr_code_2" size={12} filled />
                                {walletLabel(q.wallet)}
                              </span>
                            ))
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-ink/[0.05] px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                              Sin QR
                            </span>
                          )}
                        </div>
                      </div>

                      {biz.address ? (
                        <p className="mt-1 flex items-center gap-1 text-[12px] text-ink-muted">
                          <Icon name="location_on" size={14} className="shrink-0 text-brand" />
                          <span className="truncate">{biz.address}</span>
                        </p>
                      ) : (
                        <p className="mt-1 text-[12px] text-ink-muted">San Jacinto · Áncash</p>
                      )}
                    </div>
                  </div>

                  {/* Acciones de la Card */}
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-ink/[0.06] pt-3">
                    {hasPhone ? (
                      <a
                        href={telLink(phone)}
                        className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-surface-low border border-border/70 text-[12px] font-semibold text-ink hover:bg-ink/[0.06] active:scale-95 transition-transform"
                      >
                        <Icon name="call" size={16} className="text-emerald-600" />
                        Llamar
                      </a>
                    ) : (
                      <span className="flex h-10 items-center justify-center rounded-xl bg-surface-low border border-border/40 text-[12px] text-ink-muted opacity-40">
                        Sin fono
                      </span>
                    )}

                    {whatsapp ? (
                      <a
                        href={whatsapp}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-[12px] font-semibold text-emerald-800 hover:bg-emerald-100 active:scale-95 transition-transform"
                      >
                        <Icon name="chat" size={16} className="text-emerald-600" />
                        WhatsApp
                      </a>
                    ) : (
                      <span className="flex h-10 items-center justify-center rounded-xl bg-surface-low border border-border/40 text-[12px] text-ink-muted opacity-40">
                        Sin WA
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setSelectedBusiness(biz)}
                      className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-brand px-2 text-[12px] font-bold text-white shadow-xs hover:bg-brand-dark active:scale-95 transition-transform cursor-pointer"
                    >
                      <Icon name="qr_code_2" size={16} filled />
                      Ver QRs
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Sheet de detalle con QRs ampliados */}
      <RestaurantDetailSheet
        business={selectedBusiness}
        onClose={() => setSelectedBusiness(null)}
      />
    </main>
  )
}
