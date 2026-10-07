'use client'

import {
  buildReservedMessage,
  buildWhatsappMessage,
  buildWhatsappUrl,
  conditionScoreLabel,
  formatStorePrice,
  primaryBadge,
  type StoreAudience,
  type StoreCondition,
} from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { absoluteUrl } from '@/lib/seo'
import { cardHref, toCore } from '../lib/present'
import { captureRef, consumeFromList, peekFromList, trackStore } from '../lib/tracking'
import type { PublicStoreSettings, StoreCard, StoreProduct } from '../types'
import { Gallery } from './gallery'
import { ProductCard } from './product-card'
import { WaIcon } from './wa-icon'

const CONDITION_LABEL: Record<StoreCondition, string> = {
  new_with_tag: 'Nuevo con etiqueta',
  new_unused: 'Nuevo sin uso',
  used: 'Usado',
}
const AUDIENCE_LABEL: Record<StoreAudience, string> = {
  women: 'Dama',
  men: 'Caballero',
  kids: 'Niños',
  unisex: 'Unisex',
}
/** «Talla M» solo tiene sentido en ropa y calzado; «100 ml» o «2 m» van tal cual. */
const SIZED_CATEGORIES = new Set(['ropa', 'calzado'])
const TOAST_MS = 2200

const fmt2 = (n: number) => n.toFixed(2)

/**
 * /store/[slug]: galería, título y precio como protagonistas, ficha compacta,
 * estado, descripción, entrega, relacionados y pie fijo según el estado
 * (PRD §5.3). Disponible → WhatsApp verde; reservado → «Avísame si se libera»;
 * vendido → «Ver parecidos».
 */
export function DetailShell({
  product,
  related,
  settings,
}: {
  product: StoreProduct
  related: StoreCard[]
  settings: PublicStoreSettings
}) {
  const router = useRouter()
  const [toast, setToast] = useState<string | null>(null)
  const core = toCore(product)
  const status =
    product.status === 'sold' || product.status === 'reserved' ? product.status : 'available'

  useEffect(() => {
    captureRef()
    trackStore('view_product', { productId: product.id })
  }, [product.id])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(t)
  }, [toast])

  /**
   * Volver (PRD §5.4): desde /store, al historial —así vuelven los filtros de la
   * URL—; desde un link externo, a /store, que es la puerta al resto del
   * catálogo. No depende solo de `history.back()`: un link de WhatsApp no tiene
   * historial de Tindivo al que volver.
   */
  const goBack = useCallback(() => {
    if (peekFromList() && window.history.length > 1) {
      consumeFromList()
      router.back()
    } else {
      router.push('/store')
    }
  }, [router])

  const share = useCallback(async () => {
    const url = absoluteUrl(cardHref(product) ?? '/store')
    trackStore('share', { productId: product.id })
    try {
      if (navigator.share) {
        await navigator.share({ title: product.title ?? 'Tindivo Store', url })
        return
      }
      await navigator.clipboard.writeText(url)
      setToast('Link copiado')
    } catch (e) {
      // Cerrar el menú nativo sin elegir lanza AbortError: no es un error.
      if ((e as Error).name !== 'AbortError') setToast('No se pudo compartir')
    }
  }, [product])

  if (!core || !product.slug) return null

  const badge = primaryBadge(core)
  const productUrl = absoluteUrl(`/store/${product.slug}`)
  const whatsapp = buildWhatsappUrl(settings.whatsappNumber, buildWhatsappMessage(core, productUrl))
  const notify = buildWhatsappUrl(settings.whatsappNumber, buildReservedMessage(core))
  const hasPrev = core.originalPrice !== null && core.originalPrice > core.price

  const sized = product.categorySlug !== null && SIZED_CATEGORIES.has(product.categorySlug)
  const ficha = [
    CONDITION_LABEL[core.condition],
    core.sizeLabel ? (sized ? `Talla ${core.sizeLabel}` : core.sizeLabel) : null,
    product.audience ? AUDIENCE_LABEL[product.audience] : null,
  ].filter((x): x is string => !!x)

  return (
    <>
      <div className="st-dtop">
        <button
          type="button"
          className="st-rb"
          style={{ left: 12 }}
          aria-label="Volver"
          onClick={goBack}
        >
          <Icon name="arrow_back" size={24} />
        </button>
        <button
          type="button"
          className="st-rb"
          style={{ right: 12 }}
          aria-label="Compartir"
          onClick={share}
        >
          <Icon name="share" size={22} />
        </button>
      </div>

      <Gallery images={product.images} alt={core.title} status={status} badge={badge} />

      <article className="st-dbody">
        <header>
          <h1 className="st-dtitle">{core.title}</h1>
          <div className={`st-dprice ${status === 'sold' ? 'mute' : ''}`}>
            <b>{formatStorePrice(core.price)}</b>
            {hasPrev && core.originalPrice !== null && (
              <s>{formatStorePrice(core.originalPrice)}</s>
            )}
          </div>
          <div className="st-meta">
            <span className="st-tg">
              <Icon name="sell" size={17} />
              Pieza única
            </span>
            {product.negotiable && (
              <span className="st-tg">
                <Icon name="chat" size={17} />
                Acepta ofertas
              </span>
            )}
          </div>
        </header>

        {status === 'reserved' && (
          <div className="st-note">
            <Icon name="lock" size={20} />
            <span>
              <b>Otra persona lo pidió.</b> Si no se concreta, vuelve a estar disponible.
            </span>
          </div>
        )}
        {status === 'sold' && (
          <div className="st-note">
            <Icon name="check_circle" size={20} />
            <span>
              <b>Ya encontró dueño.</b> Mira artículos parecidos.
            </span>
          </div>
        )}

        <div className="st-ficha">
          {ficha.map((f, i) => (
            <span key={f}>
              {i > 0 && <i aria-hidden="true">· </i>}
              {f}
            </span>
          ))}
        </div>

        {core.condition === 'used' && core.conditionScore !== null && (
          <div>
            <div className="st-est-l">
              Estado {core.conditionScore}/10 · {conditionScoreLabel(core.conditionScore)}
            </div>
            <div className="st-meter" aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => (
                <i key={`m${i + 1}`} className={i < (core.conditionScore ?? 0) ? 'on' : ''} />
              ))}
            </div>
          </div>
        )}

        {product.description && (
          <div className="st-desc">
            <p>{product.description}</p>
          </div>
        )}

        <div className="st-deliv">
          <Icon name="delivery_dining" size={22} />
          <div>
            <b>Te lo llevamos en San Jacinto desde {formatStorePrice(settings.deliveryMin)}</b>
            <span className="s">
              {settings.deliveryText ??
                `S/${fmt2(settings.deliveryMin)}–${fmt2(settings.deliveryMax)} según distancia · Pagas al recibir: efectivo o Yape`}
            </span>
          </div>
        </div>

        {related.length > 0 && (
          <section className="st-sim" aria-labelledby="st-sim-t">
            <h2 id="st-sim-t">También te puede gustar</h2>
            <div className="st-feat">
              {related.map((c) => (
                <ProductCard key={c.id} card={c} />
              ))}
            </div>
          </section>
        )}

        <div className="st-ref">Ref. {core.code}</div>
      </article>

      <div className="st-buy">
        {status === 'available' && (
          <>
            <a
              className="st-wab"
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackStore('click_whatsapp', { productId: product.id })}
            >
              <WaIcon />
              Lo quiero — pedir por WhatsApp
            </a>
            <div className="st-hint">
              <Icon name="verified" size={16} filled /> <b>Revísalo antes de pagar</b> · Si no es
              como en las fotos, no pagas nada
            </div>
          </>
        )}
        {status === 'reserved' && (
          <div className="st-two">
            <span className="st-lab">RESERVADO</span>
            <a
              className="st-obtn"
              href={notify}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackStore('click_notify', { productId: product.id })}
            >
              <Icon name="notifications" size={22} />
              Avísame si se libera
            </a>
          </div>
        )}
        {status === 'sold' && (
          <div className="st-two">
            <span className="st-lab soldl">VENDIDO</span>
            <a
              className="st-obtn solid"
              href={product.categorySlug ? `/store?categoria=${product.categorySlug}` : '/store'}
            >
              Ver parecidos
            </a>
          </div>
        )}
      </div>

      {toast && (
        <div className="st-toast" role="status">
          {toast}
        </div>
      )}
    </>
  )
}
