'use client'

import { ApiError } from '@tindivo/api-client'
import Image from 'next/image'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface PrepayInfo {
  businessName: string
  yapeNumber: string | null
  qrUrl: string | null
  total: number
  status: string
  hasProof: boolean
  proofAttempt: number
  comprobantePrepagoUrl: string | null
  awaitingPaymentAt?: string | null
}

interface Props {
  orderId: string
  proofAttempt: number
  onProofUploaded: () => void
}

export function PrepayProofSection({ orderId, proofAttempt, onProofUploaded }: Props) {
  const [info, setInfo] = useState<PrepayInfo | null>(null)
  const [seconds, setSeconds] = useState(600)
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadInfo = useCallback(async () => {
    try {
      const res = await api.get<{ data: PrepayInfo }>(`/customer/orders/${orderId}/prepay-info`)
      setInfo(res.data)
    } catch {
      // Ignorar error perezoso si aún no está listo
    }
  }, [orderId])

  useEffect(() => {
    loadInfo()
  }, [loadInfo])

  // Countdown timer de 10 min basado en timestamp real de DB
  useEffect(() => {
    if (!info?.awaitingPaymentAt) return
    const startMs = new Date(info.awaitingPaymentAt).getTime()
    const deadlineMs = startMs + 10 * 60 * 1000

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))
      setSeconds(remaining)
    }

    updateTimer()
    const timer = setInterval(updateTimer, 1000)
    return () => clearInterval(timer)
  }, [info?.awaitingPaymentAt])

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setPendingFile(f)
    setPreviewUrl(URL.createObjectURL(f))
    setError(null)
  }

  function copyYape() {
    if (info?.yapeNumber) {
      navigator.clipboard.writeText(info.yapeNumber)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function submitProof() {
    if (!pendingFile) return
    setUploading(true)
    setError(null)
    try {
      const supabase = getSupabaseBrowser()
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess.session?.user.id
      if (!userId) {
        setError('Debes iniciar sesión para subir el comprobante')
        setUploading(false)
        return
      }
      const attempt = proofAttempt + 1
      const ts = Date.now()
      const ext =
        pendingFile.type === 'image/png'
          ? 'png'
          : pendingFile.type === 'image/jpeg'
            ? 'jpg'
            : pendingFile.type === 'image/webp'
              ? 'webp'
              : 'jpg'
      const path = `${userId}/${orderId}/attempt-${attempt}-${ts}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('payment-proofs')
        .upload(path, pendingFile, { contentType: pendingFile.type })

      if (upErr) throw upErr

      await api.post(`/customer/orders/${orderId}/prepay-proof`, { path })
      onProofUploaded()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.problem.detail ?? err.message)
          : err instanceof Error
            ? err.message
            : 'Error al subir el comprobante',
      )
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className="mt-4 rounded-[22px] bg-white p-5 text-left"
      style={{ border: '1px solid rgba(249,115,22,0.2)', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}
    >
      <div className="flex items-center justify-between">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[11px] font-medium"
          style={{ background: '#FFF7ED', color: '#C2410C' }}
        >
          <span className="h-2 w-2 animate-ping rounded-full bg-orange-500" />
          Tiempo para pagar: {formatTime(seconds)}
        </span>
        {proofAttempt === 1 && (
          <span
            className="rounded-full px-2.5 py-0.5 font-sans font-bold text-[11px]"
            style={{ background: '#FEF2F2', color: '#DC2626' }}
          >
            Reintento final (1/2)
          </span>
        )}
      </div>

      <h3 className="t-display mt-3 text-[18px]">Paga tu pedido</h3>
      <p className="t-muted text-[13px]">
        El restaurante <strong className="text-foreground">{info?.businessName ?? 'local'}</strong>{' '}
        confirmó disponibilidad. Paga el monto exacto y sube tu comprobante.
      </p>

      {/* Monto y Yape */}
      <div
        className="mt-3.5 flex items-center justify-between rounded-[16px] bg-surface p-3.5"
        style={{ border: '1px solid rgba(26,22,20,0.06)' }}
      >
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted">Monto total</div>
          <div className="font-mono font-bold text-[22px] text-foreground">
            S/ {info?.total ? info.total.toFixed(2) : '0.00'}
          </div>
        </div>
        {info?.yapeNumber && (
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-muted">Yape / Plin</div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-[16px] text-brand">{info.yapeNumber}</span>
              <button
                type="button"
                onClick={copyYape}
                className="rounded-md bg-white px-2 py-0.5 font-sans text-[11px] font-medium text-foreground shadow-sm"
              >
                {copied ? '¡Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* QR (si existe) */}
      {info?.qrUrl && (
        <div className="mt-3 flex flex-col items-center rounded-xl bg-surface p-3 text-center">
          <div className="relative h-36 w-36 overflow-hidden rounded-lg">
            <Image src={info.qrUrl} alt="QR Yape/Plin" fill className="object-contain" />
          </div>
          <span className="mt-1 text-[11px] text-muted">Escanea para pagar</span>
        </div>
      )}

      {/* Regla de comprobante visible */}
      <div
        className="mt-3.5 rounded-xl p-3 text-[12px] leading-relaxed"
        style={{ background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE' }}
      >
        📌 <strong>Regla de validación:</strong> Tu comprobante debe ser posterior a la hora del
        pedido y debe mostrar tu nombre visible.
      </div>

      {/* Selector y Previsualización de Imagen */}
      <div className="mt-4">
        {previewUrl ? (
          <div className="relative overflow-hidden rounded-xl bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Vista previa" className="max-h-48 w-full object-contain" />
            <button
              type="button"
              onClick={() => {
                setPendingFile(null)
                setPreviewUrl(null)
              }}
              className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-1 text-[11px] text-white backdrop-blur-sm"
            >
              Cambiar captura
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/50 p-4 transition-colors hover:bg-orange-50">
            <svg
              className="h-8 w-8 text-orange-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="mt-2 text-[13px] font-semibold text-orange-700">
              Adjuntar comprobante de pago
            </span>
            <span className="text-[11px] text-muted">Formatos JPG, PNG (Captura de pantalla)</span>
            <input type="file" accept="image/*" className="sr-only" onChange={handleFileChange} />
          </label>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-[12px] text-red-600">{error}</div>
      )}

      {/* Botón enviar */}
      <button
        type="button"
        disabled={!pendingFile || uploading}
        onClick={submitProof}
        className="t-btn t-btn-primary t-btn-block mt-4"
      >
        {uploading ? 'Enviando comprobante...' : 'Enviar comprobante'}
      </button>
    </div>
  )
}
