import { Card, cn, Icon } from '@tindivo/ui'
import Image from 'next/image'
import type { PublicBusiness } from '@/features/catalog/types'
import { businessPath } from '@/lib/business-path'

interface BusinessCardProps {
  business: PublicBusiness
}

/**
 * `businesses.accent_color` viaja SIN `#` (CHECK `accent_color_format`, 0002)
 * y el endpoint público lo pasa tal cual.
 *
 * Sin el prefijo, `backgroundColor` recibe `f97316`: CSS inválido, que el
 * navegador descarta en silencio. El cuadro se queda transparente y la inicial,
 * que va en blanco, desaparece sobre la card blanca. El fallback entero llevaba
 * así desde que se escribió, tapado porque los negocios del piloto tienen logo.
 */
function accentCss(hex: string | null | undefined): string {
  const clean = hex?.trim().replace(/^#/, '')
  return clean ? `#${clean}` : 'var(--color-brand)'
}

export function BusinessCard({ business }: BusinessCardProps) {
  const b = business
  const isClosed = b.is_open_now === false
  const isWhatsapp = b.primary_capability === 'catalog_only'
  // El logo apagado es la señal grande de «hoy no»; el chip la confirma.
  const logoTone = isClosed ? 'opacity-45 grayscale' : ''

  return (
    <Card
      as="a"
      href={businessPath(b)}
      // `transition-[transform,box-shadow]` pisa el `transition-shadow` de
      // `Card` en tailwind-merge, y `duration-150` su `duration-300`: el
      // `active:scale` del dedo tiene que responder al toque, no a la sombra.
      className="flex items-center gap-3 p-3 transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.985]"
    >
      {b.logo_url ? (
        <Image
          src={b.logo_url}
          // Decorativo a propósito: el nombre está a 12 px a la derecha, así que
          // un `alt` con el nombre lo hace sonar dos veces seguidas.
          alt=""
          width={72}
          height={72}
          sizes="72px"
          loading="lazy"
          decoding="async"
          className={cn('h-[72px] w-[72px] shrink-0 rounded-2xl object-cover', logoTone)}
        />
      ) : (
        <div
          className={cn(
            'flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-2xl font-display font-bold text-[26px] text-white shadow-sm',
            logoTone,
          )}
          style={{ backgroundColor: accentCss(b.accent_color) }}
        >
          {b.name ? b.name.trim()[0]?.toUpperCase() : 'T'}
        </div>
      )}
      {/*
        `min-h-[72px]` y no `h-[72px]`: la altura la manda el logo, así que la
        card mide 96 px siempre. Antes la mandaba el tagline — el de Pizza
        Priamo tiene 108 caracteres y estiraba su card a 132 px, y con ella la
        fila entera de la grilla en md/lg.
      */}
      <div className="flex min-h-[72px] min-w-0 flex-1 flex-col justify-center">
        <div className="truncate font-display font-bold text-lead leading-tight tracking-tight">
          {b.name}
        </div>
        {b.tagline && <div className="mt-0.5 truncate text-ink-muted text-label">{b.tagline}</div>}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-caption text-ink-muted">
          {isClosed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-0.5 font-semibold text-amber-900 text-meta">
              <Icon name="schedule" size={14} /> Cerrado ahora
            </span>
          )}
          {isWhatsapp ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 font-semibold text-brand-dark text-meta">
              <Icon name="chat" size={14} /> Pedidos por WhatsApp
            </span>
          ) : (
            /*
              El tiempo estimado solo cuando se puede cumplir. Un negocio cerrado
              enseñaba el chip «Cerrado» y, a su lado, «20–40 min»: la card
              decía que no atiende y acto seguido cuánto tarda en llegar.

              «Delivery» se cayó de la fila: lo hacían todos los negocios con
              ETA, así que no separaba a ninguno, y la única excepción ya se
              marca sola con el chip de WhatsApp.
            */
            !isClosed && (
              <span className="inline-flex items-center gap-1">
                <Icon name="schedule" size={16} /> {b.estimated_eta_min}–{b.estimated_eta_max} min
              </span>
            )
          )}
        </div>
      </div>
    </Card>
  )
}
