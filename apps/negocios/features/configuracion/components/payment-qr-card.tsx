'use client'

import { PAYMENT_WALLETS, type PaymentQrView, walletLabel } from '@tindivo/contracts'
import { compressImage, UPLOAD_CACHE_CONTROL, validateImageInput } from '@tindivo/images'
import { Icon } from '@tindivo/ui'
import { useState } from 'react'
import { useDashboard } from '@/components/dashboard/shell'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import type { PaymentQrDraft } from '../hooks/use-payment-qrs'

interface Props {
  slot: number
  existing: PaymentQrView | null
  isDefault: boolean
  busy: boolean
  /** `null` cuando esta cuenta es la única: no hay a quién ceder el puesto. */
  onMakeDefault: (() => void) | null
  onSave: (draft: PaymentQrDraft) => Promise<boolean>
  onRemove: (() => void) | null
}

const inputCls =
  'w-full rounded-xl border border-ink/[0.06] bg-card px-3 py-2.5 text-[15px] font-medium text-ink outline-none transition-all placeholder:text-ink/40 focus:border-ink focus:ring-4 focus:ring-ink/[0.08]'

/**
 * Una cuenta de cobro del negocio: billetera, número, titular y QR (0184).
 *
 * Los cuatro campos van juntos y se guardan juntos porque juntos son lo que el
 * cliente necesita para pagar: la billetera le dice qué app abrir, el número es
 * el camino cuando el QR no escanea, y el titular es contra lo que compara
 * antes de confirmar la transferencia.
 *
 * La imagen sí sube sola al elegirla —así el negocio ve al instante si el QR
 * quedó legible— pero no queda registrada hasta que se guarda la cuenta.
 */
export function PaymentQrCard({
  slot,
  existing,
  isDefault,
  busy,
  onMakeDefault,
  onSave,
  onRemove,
}: Props) {
  const { bizId } = useDashboard()
  const [wallet, setWallet] = useState<'yape' | 'plin'>(existing?.wallet ?? 'yape')
  const [accountNumber, setAccountNumber] = useState(existing?.accountNumber ?? '')
  const [accountName, setAccountName] = useState(existing?.accountName ?? '')
  const [qrUrl, setQrUrl] = useState<string | null>(existing?.qrUrl ?? null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty =
    wallet !== (existing?.wallet ?? 'yape') ||
    accountNumber !== (existing?.accountNumber ?? '') ||
    accountName !== (existing?.accountName ?? '') ||
    qrUrl !== (existing?.qrUrl ?? null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const invalid = validateImageInput(file)
    if (invalid) {
      setError(invalid)
      return
    }
    setUploading(true)
    setError(null)

    // Perfil 'qr': se reescala pero se guarda SIN pérdida. Un código con
    // artefactos de compresión es un cliente que no puede yapear.
    let optimized: File
    try {
      optimized = await compressImage(file, 'qr')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos procesar el QR.')
      setUploading(false)
      return
    }

    // Un archivo por slot: reemplazar el QR de una cuenta no puede pisar el de
    // la otra, que es justo la que va a usarse cuando esta falle.
    const supabase = getSupabaseBrowser()
    const path = `${bizId}/qr-${slot}`
    const { error: upErr } = await supabase.storage.from('business-qrs').upload(path, optimized, {
      upsert: true,
      contentType: optimized.type,
      cacheControl: UPLOAD_CACHE_CONTROL,
    })
    if (upErr) {
      setError(upErr.message)
      setUploading(false)
      return
    }
    const { data } = supabase.storage.from('business-qrs').getPublicUrl(path)
    setQrUrl(`${data.publicUrl}?v=${Date.now()}`)
    setUploading(false)
  }

  async function submit() {
    setError(null)
    const digits = accountNumber.replace(/\D/g, '').slice(-9)
    if (!/^9\d{8}$/.test(digits)) {
      setError('El número debe ser un celular peruano de 9 dígitos que empieza con 9.')
      return
    }
    if (accountName.trim().length < 2) {
      setError('Escribe el nombre del titular tal como aparece en la app.')
      return
    }
    await onSave({ slot, wallet, accountNumber: digits, accountName: accountName.trim(), qrUrl })
  }

  return (
    <div
      data-testid="payment-qr-card"
      data-slot={slot}
      className={`rounded-2xl border p-4 ${
        isDefault ? 'border-brand/40 bg-brand/[0.04]' : 'border-ink/[0.08] bg-card'
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink/55">
          {existing
            ? `${walletLabel(existing.wallet)} · ${existing.accountNumber}`
            : 'Nueva cuenta'}
        </span>
        {isDefault ? (
          <span className="rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-bold text-white">
            Principal
          </span>
        ) : (
          onMakeDefault && (
            <button
              type="button"
              onClick={onMakeDefault}
              disabled={busy}
              className="rounded-full border border-ink/[0.12] px-2.5 py-0.5 text-[11px] font-bold text-ink transition-colors hover:bg-surface disabled:opacity-50"
            >
              Hacer principal
            </button>
          )
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex flex-1 flex-col gap-2.5">
          <div className="flex gap-1 rounded-xl bg-ink/[0.05] p-1">
            {PAYMENT_WALLETS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWallet(w)}
                aria-pressed={wallet === w}
                className={`flex-1 rounded-lg py-1.5 text-[13px] font-bold transition-colors ${
                  wallet === w ? 'bg-white text-brand shadow-sm' : 'text-ink-muted'
                }`}
              >
                {walletLabel(w)}
              </button>
            ))}
          </div>
          <input
            className={`${inputCls} font-mono`}
            inputMode="numeric"
            placeholder="Número (9 dígitos)"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
          />
          <input
            className={inputCls}
            placeholder="Nombre del titular"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
          />
        </div>

        <div className="flex w-[128px] shrink-0 flex-col gap-2">
          {qrUrl ? (
            <img
              src={qrUrl}
              alt={`QR de ${walletLabel(wallet)}`}
              className="h-[128px] w-[128px] rounded-xl border border-ink/[0.06] bg-card object-contain"
            />
          ) : (
            <div className="flex h-[128px] w-[128px] items-center justify-center rounded-xl bg-surface-low">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-ink/40">
                Sin QR
              </span>
            </div>
          )}
          <label
            className={`block cursor-pointer ${uploading ? 'pointer-events-none opacity-50' : ''}`}
          >
            <span className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-full border border-ink/[0.08] bg-card px-3 text-[13px] font-bold text-ink transition-all active:scale-[0.97] hover:bg-surface">
              <Icon name="upload" size={16} />
              {uploading ? 'Subiendo…' : qrUrl ? 'Reemplazar' : 'Subir QR'}
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={onFile}
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || uploading || !dirty}
          className="inline-flex h-9 items-center justify-center rounded-full bg-ink px-4 text-[13px] font-bold text-card transition-all active:scale-[0.97] disabled:opacity-40"
        >
          {busy ? 'Guardando…' : existing ? 'Guardar cambios' : 'Guardar cuenta'}
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="inline-flex h-9 items-center justify-center rounded-full px-3 text-[13px] font-bold text-danger transition-colors hover:bg-danger-soft disabled:opacity-40"
          >
            Quitar
          </button>
        )}
      </div>
    </div>
  )
}
