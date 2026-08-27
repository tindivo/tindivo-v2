'use client'

import { ApiError } from '@tindivo/api-client'
import type { PaymentQrView } from '@tindivo/contracts'
import { compressImage, UPLOAD_CACHE_CONTROL, validateImageInput } from '@tindivo/images'
import { Button } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { CountdownBar, type CountdownBarView } from './countdown-bar'
import { PaymentAccountCard } from './payment-account-card'

interface PrepayInfo {
  businessName: string
  yapeNumber: string | null
  qrUrl: string | null
  /** La cuenta de cobro principal del local (Yape/Plin), la única que ve el cliente (0184). */
  paymentQr: PaymentQrView | null
  total: number
  status: string
  hasProof: boolean
  proofAttempt: number
  comprobantePrepagoUrl: string | null
}

interface Props {
  orderId: string
  proofAttempt: number
  /**
   * El tiempo que le queda al cliente para pagar, ya formateado.
   *
   * Antes se calculaba aqui dentro con `startMs + 15 * 60 * 1000`. El 15 era
   * correcto pero estaba clavado, que es el problema que la migracion 0170 ya
   * habia corregido en el contador hermano: `paymentMinutes` se edita desde
   * /admin/configuracion, y en cuanto alguien lo tocara este contador habria
   * seguido diciendo quince. Ahora el plazo lo decide `activeDeadline` a partir
   * de lo que publica `get_tracking`, y aqui solo se pinta.
   *
   * El tipo es estructural a proposito: este componente vive en `components/` y
   * no debe importar de `features/tracking`. `CountdownBarView` es ese mismo
   * contrato estructural, ya con nombre, mas la fraccion que la barra necesita
   * para representar la ventana.
   */
  countdown: CountdownBarView | null
  onProofUploaded: () => void
}

export function PrepayProofSection({ orderId, proofAttempt, countdown, onProofUploaded }: Props) {
  const [info, setInfo] = useState<PrepayInfo | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Comprimiendo la captura recién elegida, antes de que exista preview. */
  const [preparing, setPreparing] = useState(false)
  /** URL firmada del comprobante ya enviado (el bucket es privado). */
  const [sentProofUrl, setSentProofUrl] = useState<string | null>(null)
  /** URL de imagen para zoom en modal lightbox. */
  const [zoomUrl, setZoomUrl] = useState<string | null>(null)

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
      {proofAttempt === 1 && (
        <div className="mb-2.5 flex justify-end">
          <span className="rounded-full bg-danger-soft px-2.5 py-0.5 font-sans text-[11px] font-bold text-danger">
            Reintento final (1/2)
          </span>
        </div>
      )}

      {/* El reloj, a ancho completo y con la barra. Antes era una pildora de 11
          px en la esquina, mas pequena incluso que la del pill compartido: el
          plazo con consecuencias mas duras del flujo —si vence, el pedido se
          cancela solo— era el dato mas discreto de la pantalla. */}
      {countdown && <CountdownBar view={countdown} titulo="Tiempo para pagar" />}

      <h3 className="mt-3 font-display text-[18px] font-bold tracking-tight">Paga tu pedido</h3>
      <p className="text-[13px] text-ink-muted">
        El restaurante <strong className="text-ink">{info?.businessName ?? 'local'}</strong>{' '}
        confirmó disponibilidad. Paga el monto exacto y sube tu comprobante.
      </p>

      {/* Monto */}
      <div className="mt-3.5 rounded-[16px] border border-ink/[0.06] bg-surface p-3.5">
        <div className="text-[11px] uppercase tracking-wider text-ink-muted">Monto total</div>
        <div className="font-mono text-[22px] font-bold text-ink">
          S/ {info?.total ? info.total.toFixed(2) : '0.00'}
        </div>
      </div>

      {/* A quién se le paga: cuenta, titular y QR. Siempre la principal, que es
          contra la que la cajera concilia; el repuesto es cosa de la puerta. */}
      <PaymentAccountCard
        method={info?.paymentQr ?? null}
        fallbackNumber={info?.yapeNumber ?? null}
        onZoom={setZoomUrl}
      />

      {/* Comprobante ya enviado. Se muestra para que el cliente pueda comprobar
          que mandó la captura correcta mientras la cajera la revisa. */}
      {sentProofUrl && (
        <div className="mt-3.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-center justify-between pb-1.5 text-[12px] font-semibold text-emerald-900">
            <span>Comprobante enviado</span>
            <span className="text-[11px] font-normal text-emerald-700">Toca para agrandar 🔍</span>
          </div>
          <button
            type="button"
            onClick={() => setZoomUrl(sentProofUrl)}
            className="group relative block w-full overflow-hidden rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <img
              src={sentProofUrl}
              alt="Comprobante enviado"
              decoding="async"
              className="max-h-48 w-full object-contain p-1 transition-transform group-hover:scale-[1.02]"
            />
          </button>
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
            <button
              type="button"
              onClick={() => setZoomUrl(previewUrl)}
              className="block w-full cursor-zoom-in"
              aria-label="Agrandar vista previa"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Vista previa" className="max-h-48 w-full object-contain" />
            </button>
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

      {/* Lightbox Zoom Modal */}
      {zoomUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Comprobante ampliado"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            className="fixed inset-0 h-full w-full cursor-default bg-transparent border-0"
            onClick={() => setZoomUrl(null)}
            aria-label="Cerrar modal"
          />
          <div className="relative z-10 flex max-h-[90vh] max-w-[95vw] flex-col items-center justify-center pointer-events-auto">
            <button
              type="button"
              onClick={() => setZoomUrl(null)}
              className="absolute -top-12 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-[18px] font-bold text-white transition-colors hover:bg-white/40 focus:outline-none"
              aria-label="Cerrar"
            >
              ✕
            </button>
            <img
              src={zoomUrl}
              alt="Comprobante ampliado"
              className="max-h-[85vh] max-w-full rounded-2xl bg-white object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  )
}
