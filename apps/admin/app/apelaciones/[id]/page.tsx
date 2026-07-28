'use client'

import { type AdminAppealDto, extractStoragePaths } from '@tindivo/contracts'
import { Button } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { use, useCallback, useEffect, useRef, useState } from 'react'
import { SectionHeader, StatusBadge } from '@/components/admin'
import { api, errMsg } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

// ── Helpers ──────────────────────────────────────────────────────────────────

const soles = (n: number | null) => (n != null ? `S/ ${n.toFixed(2)}` : '—')

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        onClick={onClose}
      >
        ✕
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-[90vw] rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

// ── ProofThumbnail ────────────────────────────────────────────────────────────

function ProofThumbnail({ url, label }: { url: string; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex items-center gap-3 rounded-[14px] border border-border bg-ink/[0.02] p-2.5 text-left transition-all hover:border-brand/30 hover:bg-brand/[0.03]"
      >
        <img
          src={url}
          alt={label}
          className="h-16 w-16 shrink-0 rounded-[10px] border border-border object-cover"
          loading="lazy"
        />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink">{label}</p>
          <p className="mt-0.5 text-[12px] text-brand underline-offset-2 group-hover:underline">
            Toca para ampliar →
          </p>
        </div>
      </button>
      {open && <Lightbox src={url} alt={label} onClose={() => setOpen(false)} />}
    </>
  )
}

// ── InfoRow ──────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-subtle">{label}</p>
      <p className="mt-0.5 text-[14px] font-medium text-ink">{value || '—'}</p>
    </div>
  )
}

const REJECTION_CODE_LABELS: Record<string, string> = {
  invalid_proof: 'Comprobante de pago inválido',
  out_of_stock: 'Sin stock / Productos no disponibles',
  closed: 'Local/Restaurante cerrado',
  out_of_zone: 'Dirección fuera de zona de entrega',
  no_answer: 'Cliente no responde al contacto',
  other: 'Otro motivo de rechazo',
}

// ── CollapsibleTimeline ───────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  'order.created': 'Pedido creado',
  'order.status_changed': 'Estado cambiado',
  'order.prepay_proof_uploaded': 'Comprobante subido por cliente',
  'order.proof_uploaded': 'Comprobante subido por cliente',
  'order.proof_rejected': 'Restaurante rechazó el comprobante',
  'order.validation_failed_retry': 'Restaurante rechazó el comprobante',
  'order.validation_failed': 'Rechazo definitivo — pedido cancelado',
  'order.validation_passed': 'Comprobante confirmado',
  'order.proof_confirmed': 'Comprobante confirmado',
  'order.cancelled': 'Pedido cancelado',
  'order.appeal_created': 'Cliente inició apelación',
  'order.appeal_in_review': 'Admin marcó en revisión',
  'order.appeal_resolved': 'Apelación resuelta',
  'order.refund_registered': 'Devolución registrada',
  'order.fallback_review_created': 'Revisión automática (sin apelación 24h)',
}

interface TimelineEvent {
  event_type: string
  actor_role: string | null
  created_at: string
  data: Record<string, unknown>
  proofUrls?: { url: string; label: string }[]
}

function CollapsibleTimeline({ events }: { events: TimelineEvent[] }) {
  const [open, setOpen] = useState(false)
  if (events.length === 0) return null
  return (
    <div className="t-card mb-3">
      <button
        type="button"
        className="flex w-full items-center justify-between"
        onClick={() => setOpen((v) => !v)}
      >
        <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-subtle">
          Historial del pedido
        </p>
        <span className="text-[13px] text-ink-muted transition-transform">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {events.map((ev, i) => {
            let label = EVENT_LABELS[ev.event_type] ?? ev.event_type.replace('order.', '')
            // Enriquecer label con número de intento si está disponible en data
            const attempt = ev.data?.attempt as number | undefined
            if (attempt != null && ev.event_type === 'order.prepay_proof_uploaded') {
              label = `Comprobante subido (intento ${attempt})`
            }
            const resolution = ev.data?.resolution as string | undefined
            const isLast = i === events.length - 1
            return (
              <div key={`${ev.created_at}-${i}`} className="flex items-start gap-3">
                <div className="mt-1.5 shrink-0">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ background: isLast ? '#F97316' : 'rgba(26,22,20,0.2)' }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-ink">{label}</span>
                    {resolution && (
                      <span
                        className={`text-[11px] font-semibold ${
                          resolution === 'favor_cliente' ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {resolution === 'favor_cliente' ? '✓ cliente' : '✗ restaurante'}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-ink-subtle">
                    {formatDate(ev.created_at)}
                    {ev.actor_role ? ` · ${ev.actor_role}` : ''}
                  </span>
                  {/* Thumbnails de evidencias desde data (solo en eventos que introducen el archivo) */}
                  {[
                    'order.prepay_proof_uploaded',
                    'order.proof_uploaded',
                    'order.refund_registered',
                  ].includes(ev.event_type) &&
                    ev.proofUrls &&
                    ev.proofUrls.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {ev.proofUrls.map((p, j) => (
                          <ProofThumbnail key={j} url={p.url} label={p.label} />
                        ))}
                      </div>
                    )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── RefundForm ────────────────────────────────────────────────────────────────

interface RefundFormProps {
  refundAmount: number
  setRefundAmount: (v: number) => void
  refundFile: File | null
  setRefundFile: (f: File | null) => void
  refundUploading: boolean
  onSubmit: () => void
  onCancel: () => void
}

function RefundForm({
  refundAmount,
  setRefundAmount,
  refundFile,
  setRefundFile,
  refundUploading,
  onSubmit,
  onCancel,
}: RefundFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const previewUrl = refundFile ? URL.createObjectURL(refundFile) : null

  function handleFiles(files: FileList | null) {
    const file = files?.[0] ?? null
    if (file?.type.startsWith('image/')) setRefundFile(file)
  }

  return (
    <div className="t-card space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-subtle">
        Registrar devolución
      </p>

      {/* Monto */}
      <div>
        <label className="mb-1.5 block text-[12px] font-semibold text-ink-muted">
          Monto devuelto
        </label>
        <div className="flex items-center rounded-[12px] border border-border bg-white ring-offset-1 focus-within:ring-2 focus-within:ring-brand/40">
          <span className="pl-3 text-[14px] font-semibold text-ink-subtle">S/</span>
          <input
            type="number"
            step="0.01"
            value={refundAmount}
            onChange={(e) => setRefundAmount(Number(e.target.value))}
            className="flex-1 bg-transparent px-2 py-2.5 text-[14px] font-medium text-ink outline-none"
          />
        </div>
      </div>

      {/* Dropzone / preview */}
      <div>
        <label className="mb-1.5 block text-[12px] font-semibold text-ink-muted">
          Captura del Yape de devolución
        </label>

        {refundFile && previewUrl ? (
          /* ── Preview state ── */
          <div className="relative overflow-hidden rounded-[16px] border border-border bg-ink/[0.02]">
            <img src={previewUrl} alt="Vista previa" className="max-h-64 w-full object-contain" />
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-black/60 px-3 py-2 backdrop-blur-sm">
              <span className="max-w-[200px] truncate text-[12px] text-white/90">
                {refundFile.name}
              </span>
              <button
                type="button"
                onClick={() => {
                  setRefundFile(null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                className="ml-2 rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] text-white transition-colors hover:bg-white/30"
              >
                Cambiar
              </button>
            </div>
          </div>
        ) : (
          /* ── Drop zone state ── */
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              handleFiles(e.dataTransfer.files)
            }}
            className={`flex w-full flex-col items-center gap-3 rounded-[16px] border-2 border-dashed px-4 py-8 text-center transition-all ${
              dragOver
                ? 'border-brand bg-brand/[0.06]'
                : 'border-border bg-ink/[0.02] hover:border-brand/50 hover:bg-brand/[0.03]'
            }`}
          >
            {/* Upload icon */}
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-2xl">
              📷
            </span>
            <div>
              <p className="text-[14px] font-semibold text-ink">Sube la captura del Yape</p>
              <p className="mt-0.5 text-[12px] text-ink-subtle">
                Arrastra aquí o{' '}
                <span className="text-brand underline underline-offset-2">elige un archivo</span>
              </p>
            </div>
            <p className="text-[11px] text-ink-subtle/60">PNG, JPG, HEIC · máx. 10 MB</p>
          </button>
        )}

        {/* Hidden real file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button className="flex-1" disabled={!refundFile || refundUploading} onClick={onSubmit}>
          {refundUploading ? (
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Subiendo…
            </span>
          ) : (
            'Confirmar devolución'
          )}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ApelacionDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [appeal, setAppeal] = useState<AdminAppealDto | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [evidenceProofUrl, setEvidenceProofUrl] = useState<string | null>(null)
  const [refundProofUrl, setRefundProofUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  // Refund form
  const [showRefundForm, setShowRefundForm] = useState(false)
  const [refundFile, setRefundFile] = useState<File | null>(null)
  const [refundAmount, setRefundAmount] = useState(0)
  const [refundUploading, setRefundUploading] = useState(false)

  const getSignedUrl = useCallback(async (pathOrUrl: string | null) => {
    if (!pathOrUrl) return null
    if (pathOrUrl.startsWith('https://')) return pathOrUrl
    try {
      const supabase = getSupabaseBrowser()
      const { data } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(pathOrUrl, 3600)
      return data?.signedUrl ?? null
    } catch {
      return null
    }
  }, [])

  const loadAppeal = useCallback(async () => {
    try {
      const supabase = getSupabaseBrowser()

      // Query 1: el reporte
      const { data: report, error: dbErr } = await supabase
        .from('reports')
        .select(`
          id, type, status, order_id, business_id, customer_user_id,
          customer_phone, description, evidence_url, appeal_status,
          refund_status, refund_proof_path, refund_amount, refund_completed_at,
          appeal_deadline, resolved_by, resolved_at, resolution_note,
          created_by, created_at, updated_at
        `)
        .eq('id', id)
        .eq('type', 'rejected_proof_disputed')
        .maybeSingle()

      if (dbErr || !report) {
        setError('Apelación no encontrada')
        return
      }

      // Query 2: datos del pedido (enriquecidos)
      let orderShortId: string | null = null
      let orderCreatedAt: string | null = null
      let orderAmount = 0
      let businessName: string | null = null
      let yapeNumber: string | null = null
      let rejectionReasonCode: string | null = null
      let rejectionReasonText: string | null = null
      let proofAttempt: number | null = null
      let customerName: string | null = null

      if (report.order_id) {
        const { data: order } = await supabase
          .from('orders')
          .select(
            'short_id, order_amount, delivery_fee, business_id, comprobante_prepago_url, customer_name, created_at, rejection_reason_code, rejection_reason_text, proof_attempt',
          )
          .eq('id', report.order_id)
          .maybeSingle()

        if (order) {
          orderShortId = order.short_id
          orderCreatedAt = order.created_at
          orderAmount = Number(order.order_amount ?? 0) + Number(order.delivery_fee ?? 0)
          rejectionReasonCode = order.rejection_reason_code ?? null
          rejectionReasonText = order.rejection_reason_text ?? null
          proofAttempt = order.proof_attempt ?? null
          customerName = order.customer_name ?? null

          // Query 3: negocio con número de Yape/Plin
          const { data: biz } = await supabase
            .from('businesses')
            .select('name, yape_number, plin_number')
            .eq('id', order.business_id)
            .maybeSingle()

          businessName = biz?.name ?? null
          yapeNumber = (biz as any)?.yape_number ?? (biz as any)?.plin_number ?? null
        }
      }

      setAppeal({
        id: report.id,
        orderId: report.order_id!,
        orderShortId,
        businessId: report.business_id!,
        customerUserId: report.customer_user_id!,
        customerPhone: report.customer_phone ?? null,
        customerName,
        description: report.description ?? null,
        evidenceUrl: report.evidence_url ?? null,
        appealStatus: report.appeal_status as any,
        refundStatus: (report.refund_status as any) ?? null,
        refundProofPath: report.refund_proof_path ?? null,
        refundAmount: report.refund_amount ? Number(report.refund_amount) : orderAmount || null,
        refundCompletedAt: report.refund_completed_at ?? null,
        appealDeadline: report.appeal_deadline ?? null,
        resolvedBy: report.resolved_by ?? null,
        resolvedAt: report.resolved_at ?? null,
        resolutionNote: report.resolution_note ?? null,
        createdBy: report.created_by ?? null,
        type: report.type,
        status: report.status,
        createdAt: report.created_at,
        updatedAt: report.updated_at,
        orderCreatedAt,
        businessName,
        yapeNumber,
        rejectionReasonCode,
        rejectionReasonText,
        proofAttempt,
      } as AdminAppealDto)

      setRefundAmount(orderAmount)

      if (report.evidence_url) {
        const url = await getSignedUrl(report.evidence_url)
        setEvidenceProofUrl(url)
      }

      if (report.refund_proof_path) {
        const url = await getSignedUrl(report.refund_proof_path)
        setRefundProofUrl(url)
      }

      if (report.order_id) {
        const { data: events } = await supabase
          .from('order_event_log')
          .select('event_type, actor_role, created_at, data')
          .eq('order_id', report.order_id)
          .order('created_at', { ascending: true })

        // Generar signed URLs para paths de Storage en el data de cada evento
        const enriched: TimelineEvent[] = await Promise.all(
          (events ?? []).map(async (ev) => {
            const paths = extractStoragePaths(ev.data as Record<string, unknown>)
            const proofUrls = (
              await Promise.all(
                paths.map(async (p) => {
                  const url = await getSignedUrl(p)
                  return url ? { url, label: 'Ver captura' } : null
                }),
              )
            ).filter((x): x is { url: string; label: string } => x !== null)
            return { ...ev, proofUrls } as TimelineEvent
          }),
        )
        setTimeline(enriched)
      }
    } catch (e) {
      setError(errMsg(e))
    }
  }, [id, getSignedUrl])

  useEffect(() => {
    loadAppeal()
  }, [loadAppeal])

  async function markInReview() {
    setBusyAction('review')
    try {
      await api.post(`/admin/appeals/${id}/review`, {})
      await loadAppeal()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusyAction(null)
    }
  }

  async function resolve(resolution: 'favor_cliente' | 'favor_restaurante') {
    setBusyAction(resolution)
    try {
      await api.post(`/admin/appeals/${id}/resolve`, { resolution })
      await loadAppeal()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusyAction(null)
    }
  }

  async function submitRefund() {
    if (!refundFile) return
    setRefundUploading(true)
    try {
      const supabase = getSupabaseBrowser()
      const ts = Date.now()
      const ext =
        refundFile.type === 'image/png'
          ? 'png'
          : refundFile.type === 'image/jpeg'
            ? 'jpg'
            : refundFile.type === 'image/webp'
              ? 'webp'
              : 'jpg'
      const path = `refunds/${id}_${ts}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('payment-proofs')
        .upload(path, refundFile)
      if (upErr) throw new Error(upErr.message)
      await api.post(`/admin/appeals/${id}/refund`, {
        refundProofPath: path,
        amount: refundAmount,
      })
      setShowRefundForm(false)
      setRefundFile(null)
      await loadAppeal()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setRefundUploading(false)
    }
  }

  // ── Loading / Error ──

  if (error && !appeal) {
    return (
      <div className="mx-auto max-w-3xl">
        <SectionHeader title="Apelación" eyebrow="Antifraude" />
        <p className="text-danger">{error}</p>
        <Button variant="ghost" onClick={() => router.push('/apelaciones')} className="mt-3">
          ← Volver a apelaciones
        </Button>
      </div>
    )
  }

  if (!appeal) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <div className="h-10 animate-pulse rounded-[14px] bg-ink/[0.05]" />
        <div className="h-40 animate-pulse rounded-[22px] bg-ink/[0.05]" />
        <div className="h-56 animate-pulse rounded-[22px] bg-ink/[0.05]" />
      </div>
    )
  }

  const isPending = appeal.appealStatus === 'pending'
  const isInReview = appeal.appealStatus === 'in_review'
  const isApprovedPending = appeal.appealStatus === 'approved' && appeal.refundStatus === 'pending'
  const isResolved =
    appeal.appealStatus === 'rejected' ||
    (appeal.appealStatus === 'approved' && appeal.refundStatus === 'completed')

  const statusLabel = isPending
    ? 'Pendiente'
    : isInReview
      ? 'En revisión'
      : isApprovedPending
        ? 'Devolución pendiente'
        : appeal.appealStatus === 'rejected'
          ? 'Rechazado'
          : 'Devuelto'

  const statusTone =
    appeal.appealStatus === 'rejected'
      ? 'danger'
      : isResolved && appeal.appealStatus === 'approved'
        ? 'success'
        : 'warning'

  return (
    <div className="mx-auto max-w-3xl">
      {/* ── NIVEL 1: HEADER ─────────────────────────────────────────── */}
      <div className="mb-5 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/apelaciones')}>
          ← Volver
        </Button>
        <div className="flex-1" />
        <StatusBadge label={statusLabel} tone={statusTone} />
      </div>

      {error && <p className="mb-3 text-[14px] text-danger">{error}</p>}

      {/* ── NIVEL 2: CONTEXTO DEL CASO ──────────────────────────────── */}
      <div className="t-card mb-3">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-ink-subtle">
          Contexto del caso
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <InfoRow label="Restaurante" value={appeal.businessName} />
          <InfoRow
            label="Yape / Plin destino"
            value={
              appeal.yapeNumber ? <span className="font-mono">{appeal.yapeNumber}</span> : null
            }
          />
          <InfoRow
            label="Monto del pedido"
            value={<span className="font-mono font-bold">{soles(appeal.refundAmount)}</span>}
          />
          <InfoRow
            label="Pedido"
            value={<span className="font-mono">#{appeal.orderShortId}</span>}
          />
          <InfoRow
            label="Creado"
            value={appeal.orderCreatedAt ? formatDate(appeal.orderCreatedAt) : null}
          />
          <InfoRow label="Apelación" value={formatDate(appeal.createdAt)} />
          <InfoRow label="Cliente" value={appeal.customerName} />
          <InfoRow
            label="Teléfono"
            value={appeal.customerPhone ? `📞 ${appeal.customerPhone}` : null}
          />
        </div>
      </div>

      {/* ── NIVEL 3: EL CONFLICTO ────────────────────────────────────── */}
      <div className="t-card mb-3 space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-subtle">
          El conflicto
        </p>

        {/* Motivo de rechazo del restaurante */}
        <div className="rounded-[14px] border border-red-200 bg-red-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-red-600">
            Motivo de rechazo del restaurante
          </p>
          <p className="mt-1.5 text-[14px] font-semibold text-red-800">
            {appeal.rejectionReasonText ?? 'Sin detalle registrado'}
          </p>
          {appeal.rejectionReasonCode &&
            REJECTION_CODE_LABELS[appeal.rejectionReasonCode] !== appeal.rejectionReasonText && (
              <p className="mt-0.5 text-[11px] text-red-400">
                Código:{' '}
                {REJECTION_CODE_LABELS[appeal.rejectionReasonCode] ?? appeal.rejectionReasonCode}
              </p>
            )}
        </div>

        {/* Argumento del cliente */}
        {appeal.description && (
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-ink-muted">
              Argumento del cliente al apelar
            </p>
            <p className="text-[14px] italic text-ink">"{appeal.description}"</p>
          </div>
        )}

        {/* Comprobante en disputa */}
        {evidenceProofUrl && (
          <div>
            <p className="mb-2 text-[12px] font-semibold text-ink-muted">
              Comprobante en disputa (último intento)
            </p>
            <ProofThumbnail url={evidenceProofUrl} label="Comprobante en disputa" />
          </div>
        )}

        {/* Intento actual de comprobante (referencia rápida) */}
        {appeal.proofAttempt != null && (
          <p className="text-[12px] text-ink-subtle/80 italic leading-relaxed">
            El cliente realizó {appeal.proofAttempt} intento{appeal.proofAttempt > 1 ? 's' : ''} de
            comprobante. El historial completo se muestra al final de la página.
          </p>
        )}
      </div>

      {/* ── Devolución completada ─────────────────────────────────────── */}
      {appeal.appealStatus === 'approved' && appeal.refundStatus === 'completed' && (
        <div className="mb-3 overflow-hidden rounded-[22px] border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50">
          {/* Banner superior */}
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500 text-white shadow-sm">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M4 10l4.5 4.5L16 6"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-bold text-green-800">¡Devolución completada!</p>
              <p className="text-[13px] text-green-600">
                Se devolvió <span className="font-bold">{soles(appeal.refundAmount)}</span>
                {appeal.refundCompletedAt && <> · {formatDate(appeal.refundCompletedAt)}</>}
              </p>
            </div>
          </div>

          {/* Comprobante integrado */}
          {refundProofUrl && (
            <div className="border-t border-green-200 px-5 pb-4 pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-green-700">
                Captura del Yape enviado
              </p>
              <ProofThumbnail url={refundProofUrl} label="Yape de devolución al cliente" />
            </div>
          )}
        </div>
      )}

      {/* ── NIVEL 4: HISTORIAL (colapsable) ─────────────────────────── */}
      <CollapsibleTimeline events={timeline} />

      {/* Nota de resolución */}
      {appeal.resolutionNote && isResolved && (
        <div className="t-card mb-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-ink-subtle">
            Nota de resolución
          </p>
          <p className="text-[14px] text-ink">{appeal.resolutionNote}</p>
        </div>
      )}

      {/* ── NIVEL 5: DECISIÓN ───────────────────────────────────────── */}

      {isPending && (
        <div className="t-card space-y-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-ink-subtle">
            Acción requerida
          </p>
          <Button
            variant="outline"
            className="w-full"
            disabled={busyAction !== null}
            onClick={markInReview}
          >
            {busyAction === 'review' ? 'Procesando...' : 'Marcar en revisión'}
          </Button>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={busyAction !== null}
              onClick={() => resolve('favor_cliente')}
            >
              {busyAction === 'favor_cliente' ? 'Procesando...' : 'A favor del cliente'}
            </Button>
            <Button
              variant="ghost"
              className="flex-1"
              disabled={busyAction !== null}
              onClick={() => resolve('favor_restaurante')}
            >
              {busyAction === 'favor_restaurante' ? 'Procesando...' : 'A favor del restaurante'}
            </Button>
          </div>
        </div>
      )}

      {isInReview && (
        <div className="t-card space-y-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-ink-subtle">
            Acción requerida
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={busyAction !== null}
              onClick={() => resolve('favor_cliente')}
            >
              {busyAction === 'favor_cliente' ? 'Procesando...' : 'A favor del cliente'}
            </Button>
            <Button
              variant="ghost"
              className="flex-1"
              disabled={busyAction !== null}
              onClick={() => resolve('favor_restaurante')}
            >
              {busyAction === 'favor_restaurante' ? 'Procesando...' : 'A favor del restaurante'}
            </Button>
          </div>
        </div>
      )}

      {isApprovedPending && !showRefundForm && (
        <div className="t-card">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-ink-subtle">
            Devolución pendiente
          </p>
          <p className="mb-3 text-[13px] text-ink-muted">
            Yapea de vuelta al cliente ({appeal.customerPhone}) y sube la captura aquí.
          </p>
          <Button className="w-full" onClick={() => setShowRefundForm(true)}>
            Registrar devolución
          </Button>
        </div>
      )}

      {isApprovedPending && showRefundForm && (
        <RefundForm
          refundAmount={refundAmount}
          setRefundAmount={setRefundAmount}
          refundFile={refundFile}
          setRefundFile={setRefundFile}
          refundUploading={refundUploading}
          onSubmit={submitRefund}
          onCancel={() => {
            setShowRefundForm(false)
            setRefundFile(null)
          }}
        />
      )}
    </div>
  )
}
