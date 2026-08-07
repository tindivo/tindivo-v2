'use client'

import { useEffect } from 'react'

export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string
  alt: string
  onClose: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/85 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border-none bg-white/20 text-lg text-white transition-colors hover:bg-white/30"
        onClick={onClose}
        aria-label="Cerrar"
      >
        ✕
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-elev-4"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
