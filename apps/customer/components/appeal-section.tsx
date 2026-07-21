'use client'

import { ApiError } from '@tindivo/api-client'
import { TINDIVO_SUPPORT_WHATSAPP } from '@tindivo/core'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface AppealStatus {
  appealStatus: string
  refundStatus: string | null
  refundAmount: number | null
  appealDeadline: string | null
  refundProofUrl: string | null
}

interface AppealSectionProps {
  orderId: string | null
  shortId: string
  hasAppeal: boolean
  total: number
  onAppealCreated: () => void
}

const APPEAL_STEPS = [
  {
    key: 'pending',
    label: 'Recibido',
    description: 'Tu apelación fue recibida. Revisaremos tu pago en máximo 24h.',
  },
  {
    key: 'in_review',
    label: 'En revisión',
    description: 'Estamos verificando tu pago con el restaurante.',
  },
  { key: 'resolved', label: 'Resuelto', description: '' },
]

function soles(n: number) {
  return `S/ ${n.toFixed(2)}`
}

export function AppealSection({
  orderId,
  shortId,
  hasAppeal,
  total,
  onAppealCreated,
}: AppealSectionProps) {
  const [appealData, setAppealData] = useState<AppealStatus | null>(null)
  const [loadingAppeal, setLoadingAppeal] = useState(false)
  const [appealing, setAppealing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadAppealStatus = useCallback(async () => {
    if (!orderId || !hasAppeal) return
    setLoadingAppeal(true)
    try {
      const res = await api.get<{ data: AppealStatus }>(`/customer/orders/${orderId}/appeal`)
      setAppealData(res.data)
    } catch {
      // Si no encuentra la apelación, no pasa nada
    } finally {
      setLoadingAppeal(false)
    }
  }, [orderId, hasAppeal])

  useEffect(() => {
    loadAppealStatus()
  }, [loadAppealStatus])

  async function doAppeal() {
    if (!orderId) return
    setAppealing(true)
    setError(null)
    try {
      await api.post(`/customer/orders/${orderId}/appeal`, {})
      onAppealCreated()
      await loadAppealStatus()
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.problem.detail ?? e.message)
      } else {
        setError('Error al enviar la apelación')
      }
    } finally {
      setAppealing(false)
    }
  }

  const whatsappUrl = `https://wa.me/${TINDIVO_SUPPORT_WHATSAPP}?text=${encodeURIComponent(
    `Hola, tengo un problema con mi pedido #TDV-${shortId}. Motivo: `,
  )}`

  // ── Sin apelación: mostrar botón de apelar ──────────────────────────
  if (!hasAppeal) {
    return (
      <div
        className="mt-3.5 rounded-[22px] bg-red-50 p-5 text-left"
        style={{ border: '1px solid #FECDD3' }}
      >
        <div className="font-semibold text-[16px] text-red-900">¿Realizaste el pago?</div>
        <p className="mt-1.5 text-[13px] text-red-800 leading-relaxed">
          Tu comprobante no pudo validarse tras 2 intentos. Si realizaste el pago
          correctamente, puedes solicitar una revisión y te contactaremos por WhatsApp
          en máximo 24 horas.
        </p>
        {error && <p className="mt-2 text-[12px] font-medium text-red-600">{error}</p>}
        {orderId && (
          <button
            type="button"
            onClick={doAppeal}
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

  // ── Con apelación: mostrar progreso ─────────────────────────────────
  if (loadingAppeal) {
    return <div className="mt-3.5 h-32 animate-pulse rounded-[22px] bg-white" />
  }

  const status = appealData?.appealStatus ?? 'pending'
  const refundStatus = appealData?.refundStatus
  const refundAmount = appealData?.refundAmount
  const refundProofUrl = appealData?.refundProofUrl ?? null

  let currentStepIndex = 0
  if (status === 'in_review') currentStepIndex = 1
  if (status === 'approved' || status === 'rejected') currentStepIndex = 2

  let resolvedDescription = ''
  if (status === 'approved' && refundStatus === 'pending') {
    resolvedDescription = 'Aprobado. Tu devolución está en proceso.'
  } else if (status === 'rejected') {
    resolvedDescription = 'Caso cerrado: el pago no fue verificado por el restaurante'
  }

  const isRefundCompleted = status === 'approved' && refundStatus === 'completed'

  return (
    <div
      className="mt-3.5 rounded-[22px] bg-white p-5"
      style={{ border: '1px solid rgba(26,22,20,0.05)' }}
    >
      <div className="font-semibold text-[15px] text-ink">Estado de tu apelación</div>

      <div className="mt-4">
        {APPEAL_STEPS.map((step, i) => {
          const done = i < currentStepIndex
          const active = i === currentStepIndex
          const isResolved = step.key === 'resolved'
          const last = i === APPEAL_STEPS.length - 1

          if (isResolved && currentStepIndex < 2) return null

          const description = isResolved ? resolvedDescription : step.description

          const dotColor = done
            ? '#1A8050'
            : active
              ? status === 'rejected' ? '#DC2626' : isRefundCompleted ? '#1A8050' : '#F97316'
              : 'rgba(26,22,20,0.15)'

          const hideConnector = last || (isResolved && active)

          return (
            <div key={step.key} className="relative flex gap-3.5" style={{ paddingBottom: hideConnector ? 0 : 18 }}>
              {!hideConnector && (
                <div
                  className="absolute w-0.5"
                  style={{ left: 11, top: 24, bottom: -6, background: done ? '#1A8050' : 'rgba(26,22,20,0.1)' }}
                />
              )}
              <div
                className="z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: dotColor,
                  boxShadow: active ? `0 0 0 4px ${status === 'rejected' ? 'rgba(220,38,38,0.15)' : isRefundCompleted ? 'rgba(26,128,80,0.15)' : 'rgba(249,115,22,0.15)'}` : 'none',
                }}
              >
                {done || isRefundCompleted ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12l5 5L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span className={active ? 'animate-pulse' : ''} style={{ width: 6, height: 6, borderRadius: 999, background: '#fff' }} />
                )}
              </div>
              <div className="flex-1 pt-0">
                <div className="text-[14px]" style={{ fontWeight: active ? 600 : 500, color: done || active ? '#1A1614' : 'rgba(26,22,20,0.4)' }}>
                  {step.label}
                </div>
                {/* ── Estado: devolución completada ── */}
                {isResolved && isRefundCompleted ? (
                  <div
                    className="mt-2 overflow-hidden rounded-[16px]"
                    style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', border: '1px solid #bbf7d0' }}
                  >
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                        style={{ background: '#16a34a' }}
                      >
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                          <path d="M4 10l4.5 4.5L16 6" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div>
                        <p className="font-bold text-[14px]" style={{ color: '#14532d' }}>
                          ¡Devolución realizada!
                        </p>
                        <p className="text-[12px] mt-0.5" style={{ color: '#166534' }}>
                          Te devolvimos{' '}
                          <span className="font-bold">{soles(refundAmount ?? total)}</span>{' '}
                          por Yape
                        </p>
                      </div>
                    </div>
                    {refundProofUrl && (
                      <a
                        href={refundProofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block border-t"
                        style={{ borderColor: '#bbf7d0' }}
                      >
                        <img
                          src={refundProofUrl}
                          alt="Captura del Yape de devolución"
                          className="w-full object-cover"
                          style={{ maxHeight: 200 }}
                        />
                        <p
                          className="py-2 text-center text-[11px] font-semibold"
                          style={{ color: '#166534', background: 'rgba(255,255,255,0.5)' }}
                        >
                          Toca para ampliar la captura
                        </p>
                      </a>
                    )}
                    <div
                      className="px-4 py-2.5 text-[11px] leading-relaxed"
                      style={{ background: 'rgba(255,255,255,0.5)', color: '#166534', borderTop: '1px solid #bbf7d0' }}
                    >
                      Si no lo recibiste, escríbenos por WhatsApp y lo revisamos.
                    </div>
                  </div>
                ) : (active || done) && description ? (
                  <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: active ? (status === 'rejected' ? '#DC2626' : '#F97316') : 'rgba(26,22,20,0.5)' }}>
                    {description}
                  </p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4">
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