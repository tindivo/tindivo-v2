'use client'

import { useState } from 'react'
import { ImageLightbox } from './image-lightbox'

export function ProofThumbnail({ url, label }: { url: string; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface p-2 text-left transition-colors hover:bg-surface-low"
      >
        <img
          src={url}
          alt={label}
          className="h-16 w-16 rounded-lg border border-border object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-ink">{label}</div>
          <div className="mt-0.5 text-[11px] text-brand underline">Toca para ampliar →</div>
        </div>
      </button>
      {open && <ImageLightbox src={url} alt={label} onClose={() => setOpen(false)} />}
    </>
  )
}
