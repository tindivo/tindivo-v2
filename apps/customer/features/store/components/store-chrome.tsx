import { formatStorePrice } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import type { PublicStoreSettings } from '../types'

/** «Tindivo · Store». Sin perfil ni otros botones (PRD §5.1). */
export function StoreHeader() {
  return (
    <header className="st-hdr">
      <Link href="/" className="st-logo" aria-label="Tindivo, ir al inicio">
        Tindivo
      </Link>
      <span className="st-hdr-sep" aria-hidden="true">
        ·
      </span>
      <span className="st-hdr-name">Store</span>
    </header>
  )
}

/**
 * Hero estático y compacto (120 px): promesa de valor y entrega, sin carrusel,
 * sin gradientes, sin modelos. El arte son tres círculos con iconos de lo que
 * se vende; los recortes de producto real entran cuando Jesús tenga fotos
 * propias (PRD §5.2: nunca fotos de internet).
 */
export function StoreHero({ settings }: { settings: PublicStoreSettings }) {
  return (
    <section className="st-hero" aria-label="Tindivo Store">
      <div className="st-hero-tx">
        <div>
          <h2>Encuentra oportunidades cerca de ti</h2>
          <div className="st-hero-sub">Nuevo y de segunda en San Jacinto</div>
        </div>
        <span className="st-hero-pill">
          <Icon name="local_shipping" size={15} />
          Desde {formatStorePrice(settings.deliveryMin)} · Pagas al recibir
        </span>
      </div>
      <div className="st-hero-art" aria-hidden="true">
        <i className="a3">
          <Icon name="water_drop" size={20} />
        </i>
        <i className="a1">
          <Icon name="checkroom" size={30} />
        </i>
        <i className="a2">
          <Icon name="steps" size={24} />
        </i>
      </div>
    </section>
  )
}

export function HowItWorks() {
  return (
    <>
      <section className="st-how" aria-labelledby="st-how-t">
        <h2 id="st-how-t">Cómo funciona</h2>
        <ol>
          <li>
            <span className="n">1</span>Eliges lo que te gusta
          </li>
          <li>
            <span className="n">2</span>Nos escribes por WhatsApp
          </li>
          <li>
            <span className="n">3</span>Te lo llevamos y pagas al recibir
          </li>
        </ol>
        <p>Revísalo antes de pagar. Si no es como en las fotos, no pagas nada.</p>
      </section>
    </>
  )
}
