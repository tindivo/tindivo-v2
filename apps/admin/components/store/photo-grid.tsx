'use client'

import { STORE_MAX_PHOTOS } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import { useRef, useState } from 'react'
import type { StoreImage } from './types'

/**
 * Fotos del artículo (PRD §6.3): Cámara o Galería, hasta 6, reordenables. La
 * PRIMERA es la portada. Reordenar funciona de dos formas: flechas (las que
 * sirven en el celular, con un toque) y arrastrar (cómodo en el escritorio).
 */
export function PhotoGrid({
  images,
  uploading,
  onAdd,
  onReorder,
  onRemove,
}: {
  images: StoreImage[]
  uploading: number
  onAdd: (files: File[]) => void
  onReorder: (ids: string[]) => void
  onRemove: (id: string) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const full = images.length + uploading >= STORE_MAX_PHOTOS

  const move = (index: number, delta: number) => {
    const ids = images.map((i) => i.id)
    const to = index + delta
    if (to < 0 || to >= ids.length) return
    const [id] = ids.splice(index, 1)
    ids.splice(to, 0, id as string)
    onReorder(ids)
  }

  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const ids = images.map((i) => i.id).filter((id) => id !== dragId)
    ids.splice(ids.indexOf(targetId), 0, dragId)
    onReorder(ids)
    setDragId(null)
  }

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // permite elegir el mismo archivo otra vez
    if (files.length > 0) onAdd(files)
  }

  return (
    <div>
      <div className="as-shots">
        {images.map((img, i) => (
          <div
            key={img.id}
            className={`as-shot ${dragId === img.id ? 'drag' : ''}`}
            draggable
            onDragStart={() => setDragId(img.id)}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dropOn(img.id)}
          >
            {/* biome-ignore lint/performance/noImgElement: miniatura de Storage */}
            <img src={img.thumbUrl} alt={`Foto ${i + 1}`} draggable={false} />
            {i === 0 && <span className="tag">Portada</span>}
            <button
              type="button"
              className="x"
              aria-label={`Quitar foto ${i + 1}`}
              onClick={() => onRemove(img.id)}
            >
              <Icon name="close" size={18} />
            </button>
            {i > 0 && (
              <button
                type="button"
                className="mv l"
                aria-label={`Mover foto ${i + 1} a la izquierda`}
                onClick={() => move(i, -1)}
              >
                <Icon name="chevron_left" size={20} />
              </button>
            )}
            {i < images.length - 1 && (
              <button
                type="button"
                className="mv r"
                aria-label={`Mover foto ${i + 1} a la derecha`}
                onClick={() => move(i, 1)}
              >
                <Icon name="chevron_right" size={20} />
              </button>
            )}
          </div>
        ))}
        {Array.from({ length: uploading }, (_, i) => (
          <div key={`up${i + 1}`} className="as-shot up" role="status" aria-label="Subiendo foto">
            <Icon name="sync" size={26} className="as-spin" />
          </div>
        ))}
      </div>

      <div className="as-cap">
        <label aria-disabled={full}>
          <Icon name="photo_camera" size={22} />
          Cámara
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={pick}
            disabled={full}
          />
        </label>
        <label aria-disabled={full}>
          <Icon name="image" size={22} />
          Galería
          <input
            ref={gallery}
            type="file"
            accept="image/*"
            multiple
            onChange={pick}
            disabled={full}
          />
        </label>
      </div>
      <div className="as-help">
        {images.length + uploading}/{STORE_MAX_PHOTOS} fotos · la primera es la portada.
      </div>
    </div>
  )
}

/**
 * Punto central del recorte cuadrado de la portada. La vista previa es
 * CUADRADA, tal como saldrá en la tienda: tocar elige qué parte de la foto
 * queda al centro (PRD §6.3). Lo guarda como 0–1 en `cover_focus_x/y`.
 */
export function CoverPicker({
  src,
  x,
  y,
  onChange,
}: {
  src: string
  x: number
  y: number
  onChange: (x: number, y: number) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const at = (e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return
    const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const ny = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    onChange(Math.round(nx * 1000) / 1000, Math.round(ny * 1000) / 1000)
  }

  return (
    <div
      ref={box}
      className="as-cpick"
      role="application"
      aria-label="Elige el punto que debe quedar al centro de la portada"
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        at(e)
      }}
      onPointerMove={(e) => dragging.current && at(e)}
      onPointerUp={() => {
        dragging.current = false
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: vista previa de la portada */}
      <img src={src} alt="" style={{ objectPosition: `${x * 100}% ${y * 100}%` }} />
      <div className="mk" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />
      <span className="lab">Así se verá en la tienda</span>
    </div>
  )
}
