'use client'

import { ApiError } from '@tindivo/api-client'
import { compressImage, UPLOAD_CACHE_CONTROL, validateImageInput } from '@tindivo/images'
import { Button } from '@tindivo/ui'
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
  /** Comprimiendo la captura recién elegida, antes de que exista preview. */
  const [preparing, setPreparing] = useState(false)
  /** URL firmada del comprobante ya enviado (el bucket es privado). */
  const [sentProofUrl, setSentProofUrl] = useState<string | null>(null)

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

  // Comprobante ya enviado: `comprobante_prepago_url` guarda la RUTA dentro de
  // `payment-proofs`, que es un bucket privado. Sin firmar esa ruta no hay nada
  // que pintar, y el cliente se quedaba sin ver lo que había mandado —ni para
  // comprobar que subió la captura correcta, ni mientras la cajera la revisa.
  // La RLS de storage deja al usuario leer su propia carpeta, así que la firma
  // se puede pedir desde el navegador con su sesión.
  useEffect(() => {
    const path = info?.comprobantePrepagoUrl
    if (!path) {
      setSentProofUrl(null)
      return
    }
    let cancelled = false
    getSupabaseBrowser()
      .storage.from('payment-proofs')
      .createSignedUrl(path, 600)
      .then(({ data }) => {
        if (!cancelled) setSentProofUrl(data?.signedUrl ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [info?.comprobantePrepagoUrl])

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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const invalid = validateImageInput(f)
    if (invalid) {
      setError(invalid)
      return
    }
    setError(null)
    setPreparing(true)
    try {
      // El cliente sube desde datos móviles: una captura de Yape sin comprimir
      // sale del celular pesando megas.
      const optimized = await compressImage(f, 'proof')
      setPendingFile(optimized)
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(optimized)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos procesar la imagen.')
    } finally {
      setPreparing(false)
    }
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
        .upload(path, pendingFile, {
          contentType: pendingFile.type,
          cacheControl: UPLOAD_CACHE_CONTROL,
        })

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
    <div className="mt-4 rounded-[22px] border border-brand/20 bg-white p-5 text-left shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 font-mono text-[11px] font-medium text-brand-dark">
          <span className="h-2 w-2 animate-ping rounded-full bg-orange-500" />
          Tiempo para pagar: {formatTime(seconds)}
        </span>
        {proofAttempt === 1 && (
          <span className="rounded-full bg-danger-soft px-2.5 py-0.5 font-sans text-[11px] font-bold text-danger">
            Reintento final (1/2)
          </span>
        )}
      </div>

      <h3 className="mt-3 font-display text-[18px] font-bold tracking-tight">Paga tu pedido</h3>
      <p className="text-[13px] text-ink-muted">
        El restaurante <strong className="text-ink">{info?.businessName ?? 'local'}</strong>{' '}
        confirmó disponibilidad. Paga el monto exacto y sube tu comprobante.
      </p>

      {/* Monto y Yape */}
      <div className="mt-3.5 flex items-center justify-between rounded-[16px] border border-ink/[0.06] bg-surface p-3.5">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-muted">Monto total</div>
          <div className="font-mono text-[22px] font-bold text-ink">
            S/ {info?.total ? info.total.toFixed(2) : '0.00'}
          </div>
        </div>
        {info?.yapeNumber && (
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-ink-muted">Yape / Plin</div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[16px] font-bold text-brand">{info.yapeNumber}</span>
              <button
                type="button"
                onClick={copyYape}
                className="rounded-md bg-white px-2 py-0.5 font-sans text-[11px] font-medium text-ink shadow-sm"
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
            {/*
              `next/image` NO sirve aquí, por dos motivos:

              1. El QR vive en Supabase Storage, un host externo, y ningún
                 next.config declara `images.remotePatterns`. Sin eso el
                 optimizador rechaza la URL y la imagen no llega a pintarse:
                 el cliente se queda sin QR que escanear para pagar.
              2. Aunque se declarase, el optimizador reencoda a WebP con
                 pérdida. Es justo lo que el compresor del dashboard evita al
                 subirlo (perfil 'qr', sin pérdida): un código con artefactos
                 es un cliente que no puede yapear.

              El QR ya sale optimizado de origen, así que no hay nada que
              optimizar aquí. Y `<img>` es lo que usa el resto del catálogo.
            */}
            <img
              src={info.qrUrl}
              alt="QR Yape/Plin"
              className="h-full w-full object-contain"
              decoding="async"
            />
          </div>
          <span className="mt-1 text-[11px] text-ink-muted">Escanea para pagar</span>
        </div>
      )}

      {/* Comprobante ya enviado. Se muestra para que el cliente pueda comprobar
          que mandó la captura correcta mientras la cajera la revisa. */}
      {sentProofUrl && (
        <div className="mt-3.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <span className="mb-2 block text-[12px] font-semibold text-emerald-900">
            Comprobante enviado
          </span>
          <img
            src={sentProofUrl}
            alt="Comprobante enviado"
            decoding="async"
            className="max-h-48 w-full rounded-lg bg-white object-contain"
          />
        </div>
      )}

      {/* Regla de comprobante visible */}
      <div className="mt-3.5 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[12px] leading-relaxed text-sky-800">
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
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-light bg-brand-soft p-4 transition-colors hover:bg-brand-soft/80">
            <svg
              className="h-8 w-8 text-brand"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-label="Adjuntar comprobante"
              role="img"
            >
              <title>Adjuntar comprobante</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="mt-2 text-[13px] font-semibold text-brand-dark">
              Adjuntar comprobante de pago
            </span>
            <span className="text-[11px] text-ink-subtle">
              {preparing ? 'Preparando imagen…' : 'Formatos JPG, PNG (Captura de pantalla)'}
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={preparing}
              onChange={handleFileChange}
            />
          </label>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-danger-soft p-2.5 text-[12px] text-danger">{error}</div>
      )}

      {/* Botón enviar */}
      <Button
        type="button"
        variant="brand"
        disabled={!pendingFile || uploading}
        onClick={submitProof}
        className="mt-4 w-full"
      >
        {uploading ? 'Enviando comprobante...' : 'Enviar comprobante'}
      </Button>
    </div>
  )
}
