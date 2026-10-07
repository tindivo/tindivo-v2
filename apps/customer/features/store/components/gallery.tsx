'use client'

import type { StoreBadge } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StoreImage } from '../types'
import { BadgeView } from './product-card'

const DOUBLE_TAP_MS = 300

/** Índice de la diapositiva visible en un carrusel con scroll-snap. */
function slideIndex(el: HTMLElement): number {
  return el.clientWidth === 0 ? 0 : Math.round(el.scrollLeft / el.clientWidth)
}

/**
 * Galería del detalle: deslizable, con «1/N» (sin puntos: no se duplican, PRD
 * §5.3) y la foto COMPLETA sin recorte sobre fondo neutro. Tocar cualquier
 * parte de la foto abre el visor a pantalla completa.
 */
export function Gallery({
  images,
  alt,
  status,
  badge,
}: {
  images: StoreImage[]
  alt: string
  status: 'available' | 'reserved' | 'sold'
  badge: StoreBadge | null
}) {
  const [index, setIndex] = useState(0)
  const [viewer, setViewer] = useState<number | null>(null)
  const track = useRef<HTMLDivElement>(null)

  return (
    <div
      className={`st-gal ${status === 'reserved' ? 'res' : ''} ${status === 'sold' ? 'sold' : ''}`}
    >
      <div
        ref={track}
        className="st-gal-track"
        onScroll={(e) => setIndex(slideIndex(e.currentTarget))}
      >
        {images.map((img, i) => (
          <button
            key={img.id}
            type="button"
            className="st-gal-slide"
            aria-label={`Ampliar foto ${i + 1} de ${images.length}`}
            onClick={() => setViewer(i)}
          >
            {/* biome-ignore lint/performance/noImgElement: foto del artículo servida por Storage */}
            <img
              src={img.url}
              alt={i === 0 ? alt : `${alt}, foto ${i + 1}`}
              loading={i === 0 ? 'eager' : 'lazy'}
              fetchPriority={i === 0 ? 'high' : 'auto'}
              decoding="async"
              draggable={false}
            />
          </button>
        ))}
      </div>
      {badge && <BadgeView badge={badge} />}
      {images.length > 1 && (
        <span className="st-cnt" aria-live="polite">
          {index + 1}/{images.length}
        </span>
      )}
      {viewer !== null && (
        <Viewer images={images} start={viewer} alt={alt} onClose={() => setViewer(null)} />
      )}
    </div>
  )
}

/**
 * Visor a pantalla completa: deslizar para cambiar, contador, miniaturas y zoom
 * (doble toque; el pellizco lo hace el navegador). Importa para segunda mano:
 * es donde el comprador revisa los detalles y se decide a confiar.
 */
function Viewer({
  images,
  start,
  alt,
  onClose,
}: {
  images: StoreImage[]
  start: number
  alt: string
  onClose: () => void
}) {
  const [index, setIndex] = useState(start)
  const [zoomed, setZoomed] = useState<number | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const lastTap = useRef(0)

  const go = useCallback((i: number, smooth = true) => {
    const el = stage.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? 'smooth' : 'instant' })
  }, [])

  // Abrir en la foto tocada y bloquear el scroll del fondo. Solo al montar: si
  // dependiera de `index`, cada deslizamiento devolvería el visor a la inicial.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `start` solo importa al abrir
  useEffect(() => {
    go(start, false)
    closeBtn.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(Math.min(index + 1, images.length - 1))
      if (e.key === 'ArrowLeft') go(Math.max(index - 1, 0))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [go, onClose, index, images.length])

  return (
    <div className="st-viewer" role="dialog" aria-modal="true" aria-label="Fotos del artículo">
      <div className="st-vt">
        <button
          ref={closeBtn}
          type="button"
          className="st-rb"
          aria-label="Cerrar"
          onClick={onClose}
        >
          <Icon name="close" size={24} />
        </button>
        <span className="n" aria-live="polite">
          {index + 1}/{images.length}
        </span>
        <span style={{ width: 44 }} aria-hidden="true" />
      </div>

      <div
        ref={stage}
        className="st-stage"
        onScroll={(e) => {
          setIndex(slideIndex(e.currentTarget))
          setZoomed(null)
        }}
      >
        {images.map((img, i) => (
          <div key={img.id} className={`st-stage-slide ${zoomed === i ? 'zoomed' : ''}`}>
            {/* biome-ignore lint/performance/noImgElement: foto del artículo servida por Storage */}
            <img
              src={img.url}
              alt={i === 0 ? alt : `${alt}, foto ${i + 1}`}
              draggable={false}
              onClick={() => {
                const now = Date.now()
                if (now - lastTap.current < DOUBLE_TAP_MS) setZoomed((z) => (z === i ? null : i))
                lastTap.current = now
              }}
            />
          </div>
        ))}
      </div>

      <div className="st-vb">
        {images.length > 1 && (
          <div className="st-thumbs">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                aria-label={`Ir a la foto ${i + 1}`}
                aria-current={i === index}
                onClick={() => go(i)}
              >
                {/* biome-ignore lint/performance/noImgElement: miniatura del artículo */}
                <img src={img.thumbUrl} alt="" />
              </button>
            ))}
          </div>
        )}
        <div className="st-vhint">
          <Icon name="zoom_in" size={18} />
          Toca dos veces para acercar
        </div>
      </div>
    </div>
  )
}
