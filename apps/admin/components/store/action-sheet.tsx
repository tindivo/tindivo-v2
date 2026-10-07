'use client'

import {
  buildProductPath,
  buildShareText,
  formatStorePrice,
  STORE_REFS,
  type StoreProductCore,
  type StoreRef,
} from '@tindivo/contracts'
import { BottomSheet } from '@tindivo/ui'
import Link from 'next/link'
import { useState } from 'react'
import { Deco, STATUS_LABEL, StatusChip } from './parts'
import type { StoreItem } from './types'

/** El sitio público donde viven los links que se copian (la tienda del comprador). */
export const CUSTOMER_URL = (
  process.env.NEXT_PUBLIC_CUSTOMER_URL ?? 'https://www.tindivo.com'
).replace(/\/+$/, '')

const REF_LABEL: Record<StoreRef, string> = {
  fb: 'Facebook',
  mp: 'Marketplace',
  wa_estado: 'Estado de WhatsApp',
  grupo: 'Grupo',
  tiktok: 'TikTok',
}

/** Un artículo publicado siempre tiene título, precio y condición; si no, no se puede compartir. */
function toCore(i: StoreItem): StoreProductCore | null {
  if (!i.title || i.price === null || !i.condition) return null
  return {
    code: i.code,
    slug: i.slug,
    title: i.title,
    price: i.price,
    originalPrice: i.originalPrice,
    isClearance: i.isClearance,
    condition: i.condition,
    conditionScore: i.conditionScore,
    sizeLabel: i.sizeLabel,
    status: i.status,
  }
}

export interface SheetHandlers {
  onStatus: (to: 'available' | 'reserved' | 'sold' | 'hidden') => void
  onDuplicate: () => void
  onDeleteDraft: () => void
  onCopied: (what: string) => void
}

/**
 * Hoja de acciones de un artículo (PRD §6.2). El estado de la fila es solo
 * informativo; lo que se puede hacer depende del estado:
 *   disponible → Reservar · reservado → Marcar vendido · vendido → datos ·
 *   oculto → Volver a publicar · borrador → Continuar editando.
 * Lo destructivo o poco frecuente (Ocultar) va al final y discreto.
 */
export function ActionSheet({
  item,
  onClose,
  handlers,
}: {
  item: StoreItem | null
  onClose: () => void
  handlers: SheetHandlers
}) {
  const [ref, setRef] = useState<StoreRef>('fb')
  const [textPreview, setTextPreview] = useState<string | null>(null)
  const label = item ? `Acciones de ${item.title ?? item.code}` : 'Acciones'

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      handlers.onCopied(what)
    } catch {
      // Sin permiso del portapapeles (http, iframe): se muestra para copiar a mano.
      setTextPreview(text)
    }
  }

  const core = item ? toCore(item) : null
  const canShare = !!item?.slug && !!core && item.status !== 'draft'

  return (
    <BottomSheet open={item !== null} onClose={onClose} label={label}>
      {item && (
        <div className="as-sheet">
          <h2>{item.title ?? 'Sin título'}</h2>
          <div className="sb">
            <StatusChip status={item.status} />
            <span>{item.code}</span>
            {item.price !== null && <span>· {formatStorePrice(item.price)}</span>}
          </div>

          {item.status === 'available' && (
            <>
              <button
                type="button"
                className="as-primary"
                onClick={() => handlers.onStatus('reserved')}
              >
                Reservar
              </button>
              <div className="as-acts">
                <button type="button" className="as-act" onClick={() => handlers.onStatus('sold')}>
                  <Deco name="paid" size={22} />
                  Vendido
                </button>
                <Link className="as-act" href={`/store/${item.id}`}>
                  <Deco name="edit" size={22} />
                  Editar
                </Link>
                <button type="button" className="as-act" onClick={handlers.onDuplicate}>
                  <Deco name="content_copy" size={22} />
                  Duplicar
                </button>
              </div>
            </>
          )}

          {item.status === 'reserved' && (
            <>
              <button
                type="button"
                className="as-primary"
                onClick={() => handlers.onStatus('sold')}
              >
                Marcar vendido
              </button>
              <div className="as-acts two">
                <button
                  type="button"
                  className="as-act"
                  onClick={() => handlers.onStatus('available')}
                >
                  <Deco name="undo" size={22} />
                  Volver a disponible
                </button>
                <Link className="as-act" href={`/store/${item.id}`}>
                  <Deco name="edit" size={22} />
                  Editar
                </Link>
              </div>
            </>
          )}

          {item.status === 'sold' && (
            <>
              <div className="as-data">
                <div>
                  <b>{item.views}</b>
                  <span>Vistas</span>
                </div>
                <div>
                  <b>{item.whatsappClicks}</b>
                  <span>Clics WA</span>
                </div>
                <div>
                  <b>
                    {item.soldAt
                      ? new Date(item.soldAt).toLocaleDateString('es-PE', {
                          day: 'numeric',
                          month: 'short',
                        })
                      : '—'}
                  </b>
                  <span>Vendido</span>
                </div>
              </div>
              <div className="as-acts two">
                <button type="button" className="as-act" onClick={handlers.onDuplicate}>
                  <Deco name="content_copy" size={22} />
                  Duplicar
                </button>
                {item.slug && (
                  <a
                    className="as-act"
                    href={`${CUSTOMER_URL}${buildProductPath(item.slug)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Deco name="open_in_new" size={22} />
                    Ver
                  </a>
                )}
              </div>
            </>
          )}

          {item.status === 'hidden' && (
            <>
              <button
                type="button"
                className="as-primary"
                onClick={() => handlers.onStatus('available')}
              >
                Volver a publicar
              </button>
              <div className="as-acts two">
                <Link className="as-act" href={`/store/${item.id}`}>
                  <Deco name="edit" size={22} />
                  Editar
                </Link>
                <button type="button" className="as-act" onClick={handlers.onDuplicate}>
                  <Deco name="content_copy" size={22} />
                  Duplicar
                </button>
              </div>
            </>
          )}

          {item.status === 'draft' && (
            <>
              <Link className="as-primary" href={`/store/${item.id}`}>
                Continuar editando
              </Link>
              <div className="as-quiet">
                <button type="button" onClick={handlers.onDeleteDraft}>
                  <Deco name="delete" size={18} />
                  Eliminar borrador
                </button>
              </div>
            </>
          )}

          {canShare && core && item.slug && (
            <>
              <div className="as-lbl">Compartir · ¿en dónde?</div>
              <div className="as-srcs" role="group" aria-label="Fuente del link">
                {STORE_REFS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="as-src"
                    aria-pressed={ref === r}
                    onClick={() => {
                      setRef(r)
                      setTextPreview(null)
                    }}
                  >
                    {REF_LABEL[r]}
                  </button>
                ))}
              </div>
              <div className="as-rowb">
                <button
                  type="button"
                  onClick={() =>
                    copy(
                      `${CUSTOMER_URL}${buildProductPath(item.slug as string, ref)}`,
                      'Link copiado',
                    )
                  }
                >
                  Copiar link
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const t = buildShareText(core, CUSTOMER_URL, ref)
                    setTextPreview(t)
                    void copy(t, 'Texto copiado')
                  }}
                >
                  Copiar texto
                </button>
              </div>
              {textPreview && <div className="as-copy">{textPreview}</div>}
            </>
          )}

          {(item.status === 'available' || item.status === 'reserved') && (
            <div className="as-quiet">
              <button type="button" onClick={() => handlers.onStatus('hidden')}>
                <Deco name="visibility_off" size={18} />
                Ocultar
              </button>
            </div>
          )}
          {item.status === 'sold' && (
            <div className="as-quiet">
              <button type="button" onClick={() => handlers.onStatus('available')}>
                <Deco name="undo" size={18} />
                Volver a disponible
              </button>
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  )
}

export { STATUS_LABEL }
