import { Card, Icon } from '@tindivo/ui'
import { useState } from 'react'

interface Promo {
  id: string
  title: string
  subtitle: string
  cta: string
  badge?: string
  imageUrl?: string | null
}

const SAMPLE_PROMOS: Promo[] = [
  {
    id: '1',
    title: 'Combo familiar',
    subtitle: '2 hamburguesas + papas + gaseosa. Solo hoy.',
    cta: 'Pedir ahora',
    badge: '-20%',
  },
  {
    id: '2',
    title: 'Pizza 2x1',
    subtitle: 'Todos los martes llevá dos pizzas al precio de una.',
    cta: 'Ver promo',
    badge: '2x1',
  },
  {
    id: '3',
    title: 'Delivery gratis',
    subtitle: 'En tu primer pedido. Válido para todos los restaurantes.',
    cta: 'Aprovechar',
    badge: 'Gratis',
  },
]

export function PromoCarousel({ promos = SAMPLE_PROMOS }: { promos?: Promo[] }) {
  const [active, setActive] = useState(0)

  if (promos.length === 0) return null

  return (
    <section className="w-full bg-surface px-4 py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-[18px] font-bold tracking-tight text-ink">
          Promos del día
        </h2>
        <span className="text-[13px] font-semibold text-brand">Ver todas</span>
      </div>

      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-hide snap-x snap-mandatory">
        {promos.map((promo) => (
          <Card
            key={promo.id}
            className="relative w-[calc(100%-0.75rem)] shrink-0 snap-start overflow-hidden p-0 sm:w-[320px]"
          >
            {promo.badge && (
              <span className="absolute top-3 left-3 z-10 rounded-full bg-brand px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
                {promo.badge}
              </span>
            )}

            {/* Imagen promo */}
            <div className="relative h-[140px] w-full overflow-hidden bg-ink">
              {promo.imageUrl ? (
                // Sin `lazy` a propósito: el carrusel va arriba del todo y su
                // primera lámina es la candidata a LCP de la home.
                <img
                  src={promo.imageUrl}
                  alt={promo.title}
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-ink to-[#2a1205]">
                  <Icon name="local_dining" size={48} className="text-white/25" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
            </div>

            {/* Contenido */}
            <div className="relative -mt-8 px-4 pb-4">
              <div className="rounded-[18px] bg-card p-3.5 shadow-elev-1">
                <h3 className="font-semibold text-[16px] leading-tight text-ink">{promo.title}</h3>
                <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">{promo.subtitle}</p>
                <button
                  type="button"
                  className="mt-2.5 w-full rounded-full bg-brand py-2 text-[13px] font-bold text-white transition-colors hover:bg-brand-dark"
                >
                  {promo.cta}
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Dots */}
      {promos.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {promos.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? 'w-4 bg-brand' : 'w-1.5 bg-ink/15'
              }`}
              aria-label={`Promo ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  )
}
