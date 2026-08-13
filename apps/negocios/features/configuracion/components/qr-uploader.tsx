import { ApiError } from '@tindivo/api-client'
import { Icon } from '@tindivo/ui'
import { useState } from 'react'
import { useDashboard } from '@/components/dashboard/shell'
import { api } from '@/lib/api'
import { compressImage } from '@/lib/images/compress'
import { UPLOAD_CACHE_CONTROL, validateImageInput } from '@/lib/images/upload'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface QrUploaderProps {
  qrUrl: string | null
  onUploaded: (url: string) => void
  size: number
}

export function QrUploader({ qrUrl, onUploaded, size }: QrUploaderProps) {
  const { bizId } = useDashboard()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const invalid = validateImageInput(file)
    if (invalid) {
      setError(invalid)
      return
    }
    setBusy(true)
    setError(null)

    // Perfil 'qr': se reescala pero se guarda SIN pérdida. Un código con
    // artefactos de compresión es un cliente que no puede yapear.
    let optimized: File
    try {
      optimized = await compressImage(file, 'qr')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos procesar el QR.')
      setBusy(false)
      return
    }

    const supabase = getSupabaseBrowser()
    const path = `${bizId}/qr`
    const { error: upErr } = await supabase.storage.from('business-qrs').upload(path, optimized, {
      upsert: true,
      contentType: optimized.type,
      cacheControl: UPLOAD_CACHE_CONTROL,
    })
    if (upErr) {
      setError(upErr.message)
      setBusy(false)
      return
    }
    const { data } = supabase.storage.from('business-qrs').getPublicUrl(path)
    const versionedUrl = `${data.publicUrl}?v=${Date.now()}`
    try {
      await api.patch('/business/profile', { qrUrl: versionedUrl })
      onUploaded(versionedUrl)
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.message) : 'No se pudo guardar el QR',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2" style={{ width: size }}>
      {qrUrl ? (
        <img
          src={qrUrl}
          alt="QR de Yape"
          className="rounded-xl border border-ink/[0.06] bg-card object-contain"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="flex items-center justify-center rounded-xl bg-surface-low"
          style={{ width: size, height: size }}
        >
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-ink/40">
            QR Yape
          </span>
        </div>
      )}
      <label className={`block cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}>
        <span className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-full border border-ink/[0.08] bg-card px-3 text-sm font-bold text-ink transition-all active:scale-[0.97] hover:bg-surface">
          <Icon name="upload" size={16} />
          {busy ? 'Subiendo…' : qrUrl ? 'Reemplazar' : 'Subir'}
        </span>
        <input type="file" accept="image/*" className="sr-only" onChange={onFile} disabled={busy} />
      </label>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  )
}
