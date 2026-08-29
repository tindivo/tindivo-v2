'use client'

import { walletLabel } from '@tindivo/contracts'
import { BottomSheet, Button, Card, Icon, IconButton } from '@tindivo/ui'
import { useState } from 'react'
import type { DriverBusiness } from '@/hooks/use-driver-businesses'
import { isValidPePhone, mapsDirToCoords, telLink, waLink } from '@/lib/deeplinks'

interface RestaurantDetailSheetProps {
  business: DriverBusiness | null
  onClose: () => void
}

export function RestaurantDetailSheet({ business, onClose }: RestaurantDetailSheetProps) {
  const [selectedSlot, setSelectedSlot] = useState<number>(1)
  const [copied, setCopied] = useState(false)
  const [qrZoomed, setQrZoomed] = useState(false)

  if (!business) return null

  const qrs = business.paymentQrs
  const currentQr = qrs.find((q) => q.slot === selectedSlot) ?? qrs[0] ?? null

  const lat = business.coordinates.lat
  const lng = business.coordinates.lng
  const mapsUrl = lat != null && lng != null ? mapsDirToCoords(lat, lng) : null

  const phone = business.phone ?? ''
  const hasValidPhone = isValidPePhone(phone)
  const whatsappUrl = hasValidPhone
    ? waLink(phone, `Hola ${business.name}, soy motorizado de Tindivo`)
    : null

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  /** Etiqueta de slot legible. */
  const slotLabel = (slot: number) => (slot === 1 ? 'Principal' : 'Respaldo')

  return (
    <>
      <BottomSheet open label={business.name} onClose={onClose}>
        <div className="flex flex-col px-5 pt-2 pb-8">
          {/* Header del modal */}
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-3 min-w-0">
              {business.logoUrl ? (
                <img
                  src={business.logoUrl}
                  alt={business.name}
                  className="h-10 w-10 shrink-0 rounded-xl object-cover shadow-xs"
                />
              ) : (
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold text-white shadow-xs"
                  style={{ backgroundColor: business.accentColor || '#f97316' }}
                >
                  <Icon name="storefront" size={20} />
                </span>
              )}
              <div className="min-w-0">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                  Restaurante Asignado
                </span>
                <h3 className="truncate font-display text-[18px] font-bold text-ink">
                  {business.name}
                </h3>
              </div>
            </div>
            <IconButton
              type="button"
              variant="filled"
              size="sm"
              onClick={onClose}
              aria-label="Cerrar detalle"
              className="h-8 w-8 shrink-0 text-ink-muted cursor-pointer"
            >
              <Icon name="close" size={18} />
            </IconButton>
          </div>

          {/* Sección de QRs para Yape / Plin */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/60">
                Métodos de Cobro / Yapeo
              </p>
              {qrs.length > 1 && (
                <div className="flex rounded-lg bg-ink/[0.06] p-0.5">
                  {qrs.map((q) => (
                    <button
                      key={q.slot}
                      type="button"
                      onClick={() => {
                        setSelectedSlot(q.slot)
                        setCopied(false)
                      }}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                        currentQr?.slot === q.slot
                          ? 'bg-white text-ink shadow-xs'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      {walletLabel(q.wallet)} ({slotLabel(q.slot)})
                    </button>
                  ))}
                </div>
              )}
            </div>

            {currentQr ? (
              <Card className="p-4 bg-surface-low border border-border">
                <div className="flex flex-col items-center text-center">
                  {/* Imagen del QR — tap para ampliar */}
                  {currentQr.qrUrl ? (
                    <button
                      type="button"
                      onClick={() => setQrZoomed(true)}
                      className="relative mb-3 flex h-48 w-48 items-center justify-center rounded-2xl bg-white p-2.5 shadow-sm border border-border cursor-pointer active:scale-[0.97] transition-transform"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={currentQr.qrUrl}
                        alt={`QR ${walletLabel(currentQr.wallet)} ${business.name}`}
                        className="h-full w-full object-contain rounded-lg"
                      />
                      <span className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-white shadow-sm">
                        <Icon name="zoom_in" size={14} />
                      </span>
                    </button>
                  ) : (
                    <div className="mb-3 flex h-28 w-28 items-center justify-center rounded-2xl bg-white text-brand shadow-sm border border-border">
                      <Icon name="qr_code_2" size={48} />
                    </div>
                  )}

                  {/* Titular y Billetera */}
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-light px-2.5 py-0.5 text-xs font-bold text-brand-dark mb-1">
                    <Icon name="account_balance_wallet" size={14} />
                    {walletLabel(currentQr.wallet)} · {slotLabel(currentQr.slot)}
                  </div>
                  <p className="text-[15px] font-bold text-ink">{currentQr.accountName}</p>

                  {/* Número con botón de copiar */}
                  <div className="mt-2.5 flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 border border-border shadow-xs w-full max-w-[280px]">
                    <span className="font-mono text-[17px] font-bold tracking-wider text-ink">
                      {currentQr.accountNumber}
                    </span>
                    {/* Excepción a check:ds — chip de 28px dentro de la píldora del
                        número de cuenta. El tamaño más pequeño de `<Button>` es h-9,
                        que no cabe, y la superficie alterna a verde para confirmar el
                        copiado: es feedback de estado, no una variante del sistema. */}
                    <button
                      type="button"
                      onClick={() => handleCopy(currentQr.accountNumber)}
                      className={`flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold transition-colors active:scale-95 cursor-pointer ${
                        copied
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-ink/[0.06] text-ink hover:bg-ink/[0.12]'
                      }`}
                    >
                      <Icon name={copied ? 'check_circle' : 'content_copy'} size={14} />
                      {copied ? '¡Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="p-4 text-center text-ink-muted">
                <Icon name="qr_code_2" size={32} className="mx-auto mb-1 opacity-50" />
                <p className="text-[13px]">Este restaurante no tiene códigos QR subidos aún.</p>
                {business.phone && (
                  <div className="mt-2 text-xs">
                    Puedes yapear al teléfono registrado:{' '}
                    <strong className="text-ink font-mono">{business.phone}</strong>
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Contacto y Ubicación */}
          <div className="mt-4 space-y-2.5">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/60">
              Contacto y Ubicación
            </p>

            {business.address && (
              <div className="flex items-start gap-2.5 rounded-xl bg-surface-low p-3 border border-border">
                <Icon name="location_on" size={18} className="text-brand shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">
                    Dirección
                  </span>
                  <p className="text-[13px] font-medium text-ink leading-snug">
                    {business.address}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              {hasValidPhone ? (
                <a
                  href={telLink(phone)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-surface-low border border-border px-3 text-[13px] font-semibold text-ink hover:bg-ink/[0.06] active:scale-[0.98] transition-transform"
                >
                  <Icon name="call" size={18} className="text-emerald-600" />
                  Llamar
                </a>
              ) : (
                <Button variant="secondary" size="md" disabled className="w-full">
                  <Icon name="call" size={18} />
                  Sin teléfono
                </Button>
              )}

              {whatsappUrl ? (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 text-[13px] font-semibold text-emerald-800 hover:bg-emerald-100 active:scale-[0.98] transition-transform"
                >
                  <Icon name="chat" size={18} className="text-emerald-600" />
                  WhatsApp
                </a>
              ) : (
                <Button variant="secondary" size="md" disabled className="w-full">
                  <Icon name="chat" size={18} />
                  Sin WhatsApp
                </Button>
              )}
            </div>

            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand text-white text-[13px] font-semibold hover:bg-brand-dark active:scale-[0.98] transition-transform shadow-xs"
              >
                <Icon name="directions" size={18} />
                Cómo llegar (Google Maps)
              </a>
            )}
          </div>
        </div>
      </BottomSheet>

      {/* Lightbox: QR ampliado a pantalla completa */}
      {qrZoomed && currentQr?.qrUrl && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
          role="dialog"
          aria-label="QR ampliado"
        >
          <button
            type="button"
            onClick={() => setQrZoomed(false)}
            className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm hover:bg-white/30 active:scale-95 cursor-pointer"
            aria-label="Cerrar vista ampliada"
          >
            <Icon name="close" size={24} />
          </button>
          <button
            type="button"
            onClick={() => setQrZoomed(false)}
            className="max-h-[80vh] max-w-[90vw] cursor-pointer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentQr.qrUrl}
              alt={`QR ${walletLabel(currentQr.wallet)} ${business.name}`}
              className="max-h-[80vh] max-w-[90vw] rounded-2xl bg-white object-contain p-4 shadow-2xl"
            />
          </button>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
            <span className="rounded-full bg-white/20 px-3 py-1 text-[12px] font-bold text-white backdrop-blur-sm">
              {walletLabel(currentQr.wallet)} · {slotLabel(currentQr.slot)}
            </span>
            <span className="text-[11px] text-white/70">Toca para cerrar</span>
          </div>
        </div>
      )}
    </>
  )
}
