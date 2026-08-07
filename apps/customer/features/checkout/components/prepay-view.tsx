'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { ApiError } from '@tindivo/api-client'
import { Button, Icon } from '@tindivo/ui'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { mmss, soles } from '@/features/checkout/lib/format'
import type { OrderResult, PrepayInfo } from '@/features/checkout/types'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export function PrepayView({ result }: { result: OrderResult }) {
  const [info, setInfo] = useState<PrepayInfo | null>(null)
  const [seconds, setSeconds] = useState(600)
  const [sent, setSent] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // El comprobante se previsualiza antes de enviarse (envío explícito).
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<ApiEnvelope<PrepayInfo>>(`/customer/orders/${result.id}/prepay-info`)
      .then((r) => {
        setInfo(r.data)
        if (r.data.hasProof) setSent(true)
      })
      .catch(() => {})
  }, [result.id])

  useEffect(() => {
    if (sent) return
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [sent])

  // Liberar el object URL del preview al desmontar.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setPendingFile(file)
    // Permite re-seleccionar el mismo archivo tras "Cambiar imagen".
    e.target.value = ''
  }

  async function submitProof() {
    if (!pendingFile) return
    setUploading(true)
    setError(null)
    const supabase = getSupabaseBrowser()
    const { data: sess } = await supabase.auth.getSession()
    const userId = sess.session?.user.id
    const path = `${userId}/${result.id}`
    const { error: upErr } = await supabase.storage
      .from('payment-proofs')
      .upload(path, pendingFile, { upsert: true, contentType: pendingFile.type })
    if (upErr) {
      setError(upErr.message)
      setUploading(false)
      return
    }
    try {
      await api.post(`/customer/orders/${result.id}/prepay-proof`, { path })
      setSent(true)
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error')
    } finally {
      setUploading(false)
    }
  }

  const expired = seconds === 0 && !sent
  const danger = seconds <= 60 && !sent

  return (
    <main className="mx-auto min-h-dvh max-w-[480px] px-4 pt-10 pb-12">
      <h1 className="font-display text-[26px] font-bold tracking-tight">
        Paga con billetera digital
      </h1>
      <p className="mt-1 text-[14px] text-ink-muted">Pedido #{result.shortId}</p>

      {sent ? (
        <div className="mt-6 rounded-[18px] border border-ink/5 bg-white p-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success text-white">
            <Icon name="check" size={20} />
          </div>
          <p className="mt-3 font-display text-[18px] font-bold tracking-tight">
            Comprobante enviado
          </p>
          <p className="mt-1 text-[14px] text-ink-muted">
            El restaurante validará tu pago y confirmará el pedido.
          </p>
          <Button as="a" href={`/pedido/${result.shortId}`} variant="brand" className="mt-5 w-full">
            Ver seguimiento
          </Button>
        </div>
      ) : (
        <>
          <div
            className={`mt-4 flex items-center justify-between rounded-[18px] px-4 py-3.5 ${
              danger ? 'bg-danger/10 text-danger' : 'bg-brand/10 text-brand-dark'
            }`}
          >
            <span className="text-[14px]">{expired ? 'Tiempo agotado' : 'Tiempo para pagar'}</span>
            <span className="font-mono text-[22px] font-bold tabular-nums">{mmss(seconds)}</span>
          </div>

          <div className="mt-4 rounded-[18px] border border-ink/5 bg-white p-5">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Paga a {info?.businessName ?? 'el restaurante'}
            </p>
            {info?.qrUrl && (
              <div className="mt-3 flex justify-center">
                <img
                  src={info.qrUrl}
                  alt={`QR de pago de ${info.businessName}`}
                  className="h-[180px] w-[180px] rounded-2xl border border-ink/5 bg-white object-contain"
                />
              </div>
            )}
            <p className="mt-1 font-mono font-semibold text-[24px]">{info?.yapeNumber ?? '…'}</p>
            <p className="mt-1 text-[15px]">
              Monto: <span className="font-semibold">{soles(info?.total ?? result.total)}</span>
            </p>
            <ol className="mt-3 space-y-1.5 text-[13px] text-ink/70">
              <li>
                1. Abre tu billetera digital y {info?.qrUrl ? 'escanea el QR o envía' : 'envía'} el
                monto exacto al número de arriba.
              </li>
              <li>2. Toma captura del comprobante.</li>
              <li>3. Súbela aquí abajo para confirmar tu pedido.</li>
            </ol>
          </div>

          {error && <p className="mt-3 text-danger text-sm">{error}</p>}

          {previewUrl ? (
            <div className="mt-5 rounded-[18px] border border-ink/5 bg-white p-4">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                Tu comprobante
              </p>
              <img
                src={previewUrl}
                alt="Vista previa del comprobante"
                className="mt-2 max-h-[280px] w-full rounded-xl border border-ink/5 bg-ink/5 object-contain"
              />
              <div className="mt-3 flex gap-2.5">
                <label className="flex-1 cursor-pointer rounded-[14px] bg-ink/[0.06] px-4 py-3 text-center font-semibold text-[14px]">
                  Cambiar imagen
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onFile}
                    disabled={uploading || expired}
                  />
                </label>
                <Button
                  type="button"
                  variant="brand"
                  className="flex-1"
                  disabled={uploading || expired}
                  onClick={submitProof}
                >
                  {uploading ? 'Enviando…' : 'Enviar comprobante'}
                </Button>
              </div>
            </div>
          ) : (
            <label className="mt-5 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#ff6b35] to-[#ff8c42] px-6 py-3 font-sans text-base font-bold text-white shadow-[0_8px_24px_rgba(242,98,65,0.22)] transition-all hover:shadow-[0_12px_40px_rgba(255,107,53,0.32)] active:scale-[0.97]">
              Subir comprobante
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFile}
                disabled={uploading || expired}
              />
            </label>
          )}
          <Link
            href={`/pedido/${result.shortId}`}
            className="mt-3 block text-center text-[14px] text-brand"
          >
            Ver seguimiento
          </Link>
        </>
      )}
    </main>
  )
}
