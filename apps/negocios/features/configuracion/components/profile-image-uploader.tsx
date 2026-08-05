import { ApiError } from '@tindivo/api-client'
import { Icon } from '@tindivo/ui'
import { useState } from 'react'
import { useDashboard } from '@/components/dashboard/shell'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface ProfileImageUploaderProps {
  currentUrl: string | null
  onUploaded: (url: string) => void
  bucket: string
  pathSuffix: string
  field: 'logoUrl' | 'bannerUrl'
  width: number
  height: number
  placeholderLabel: string
}

export function ProfileImageUploader({
  currentUrl,
  onUploaded,
  bucket,
  pathSuffix,
  field,
  width,
  height,
  placeholderLabel,
}: ProfileImageUploaderProps) {
  const { bizId } = useDashboard()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Formato no permitido. Usa JPG, PNG o WebP.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('La imagen supera el máximo de 5 MB.')
      return
    }
    setBusy(true)
    setError(null)
    const supabase = getSupabaseBrowser()
    const path = `${bizId}/${pathSuffix}`
    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) {
      setError(upErr.message)
      setBusy(false)
      return
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    const versionedUrl = `${data.publicUrl}?v=${Date.now()}`
    try {
      await api.patch('/business/profile', { [field]: versionedUrl })
      onUploaded(versionedUrl)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.problem.detail ?? err.message)
          : 'No se pudo guardar la imagen',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {currentUrl ? (
        <img
          src={currentUrl}
          alt={placeholderLabel}
          className="rounded-xl border border-ink/[0.06] bg-card object-cover"
          style={{ width, height }}
        />
      ) : (
        <div
          className="flex items-center justify-center rounded-xl bg-surface-low"
          style={{ width, height }}
        >
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-ink/40">
            {placeholderLabel}
          </span>
        </div>
      )}
      <label className={`block cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}>
        <span className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-full border border-ink/[0.08] bg-card px-3 text-sm font-bold text-ink transition-all active:scale-[0.97] hover:bg-surface">
          <Icon name="upload" size={16} />
          {busy ? 'Subiendo…' : currentUrl ? 'Reemplazar' : 'Subir'}
        </span>
        <input type="file" accept="image/*" className="sr-only" onChange={onFile} disabled={busy} />
      </label>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  )
}
