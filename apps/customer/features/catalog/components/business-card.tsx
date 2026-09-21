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

/** Pill flotante sobre la foto: fondo blanco translúcido, legible sobre cualquier plato. */
function PhotoBadge({
  tone,
  children,
}: {
  tone: 'closed' | 'brand' | 'neutral'
  children: React.ReactNode
}) {
  const toneClass =
    tone === 'closed'
      ? 'bg-warning-soft/95 text-amber-900'
      : tone === 'brand'
        ? 'bg-brand-soft/95 text-brand-dark'
        : 'bg-card/90 text-ink'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold text-meta shadow-elev-1 backdrop-blur-sm',
        toneClass,
      )}
    >
      {children}
    </span>
  )
}

export function BusinessCard({ business }: BusinessCardProps) {
  const b = business
  const isClosed = b.is_open_now === false
  const isWhatsapp = b.primary_capability === 'catalog_only'
  // El logo y la foto apagados son la señal grande de «hoy no»; el badge la confirma.
  const dimmedTone = isClosed ? 'opacity-45 grayscale' : ''
  // Máximo 2 (`categoria` nunca trae más, `0002`), unidas con el tagline en
  // una sola línea: es el mismo dato que muestra Rappi bajo el nombre
  // («Pollería · Pollos a la brasa»), sin sumar una línea nueva a la card.
  const subtitulo = [...(b.categoria ?? []), b.tagline].filter(Boolean).join(' · ')

  return (
    <Card
      as="a"
      href={businessPath(b)}
      // `transition-[transform,box-shadow]` pisa el `transition-shadow` de
      // `Card` en tailwind-merge, y `duration-150` su `duration-300`: el
      // `active:scale` del dedo tiene que responder al toque, no a la sombra.
      className="overflow-hidden transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.985]"
    >
      {/*
        La misma portada que abre la carta (`BusinessHero`), traída al home: es
        lo que un restaurante sin foto de comida pierde frente a uno que sí la
        tiene. `aspect-[3/2]` es el punto medio entre la 2:1 del carrusel de
        promos (demasiado baja para una foto de plato) y un cuadrado (demasiado
        alta para la grilla de 3 columnas en desktop).
      */}
      <div className="relative aspect-[3/2] w-full overflow-hidden bg-surface-low">
        {b.banner_url ? (
          <Image
            src={b.banner_url}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            loading="lazy"
            decoding="async"
            className={cn('object-cover', dimmedTone)}
          />
        ) : (
          <div
            className={cn('absolute inset-0', dimmedTone)}
            style={{
              background: `linear-gradient(135deg, ${accentCss(b.accent_color)} 0%, #1a1614 130%)`,
            }}
          />
        )}

        {/*
          Un solo badge por card, no dos apilados: «Cerrado» pesa más que
          «WhatsApp», que pesa más que el ETA. Antes (fila horizontal) cabían
          los tres a la vez; flotando sobre la foto, uno solo se lee de un
          vistazo — que es el punto de sacarlo de la fila de texto.
        */}
        <div className="absolute top-2 right-2">
          {isClosed ? (
            <PhotoBadge tone="closed">
              <Icon name="schedule" size={14} /> Cerrado ahora
            </PhotoBadge>
          ) : isWhatsapp ? (
            <PhotoBadge tone="brand">
              <Icon name="chat" size={14} /> WhatsApp
            </PhotoBadge>
          ) : (
            <PhotoBadge tone="neutral">
              <Icon name="schedule" size={14} /> {b.estimated_eta_min}–{b.estimated_eta_max} min
            </PhotoBadge>
          )}
        </div>
      </div>

      {/*
        El logo se monta sobre la costura foto/cuerpo, como Rappi y PedidosYa:
        `-mt-6` (24 px) lo sube la mitad de sus 48 px hacia la foto, e
        `items-end` alinea su base con la del bloque de texto. El anillo
        `ring-card` es lo que lo despega de cualquier foto, clara u oscura.
      */}
      <div className="flex items-end gap-3 px-3 pb-3">
        {b.logo_url ? (
          <Image
            src={b.logo_url}
            // Decorativo a propósito: el nombre está a 12 px a la derecha, así que
            // un `alt` con el nombre lo hace sonar dos veces seguidas.
            alt=""
            width={48}
            height={48}
            sizes="48px"
            loading="lazy"
            decoding="async"
            className={cn(
              '-mt-6 h-12 w-12 shrink-0 rounded-2xl object-cover shadow-elev-2 ring-4 ring-card',
              dimmedTone,
            )}
          />
        ) : (
          <div
            className={cn(
              '-mt-6 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-display font-bold text-[18px] text-white shadow-elev-2 ring-4 ring-card',
              dimmedTone,
            )}
            style={{ backgroundColor: accentCss(b.accent_color) }}
          >
            {b.name ? b.name.trim()[0]?.toUpperCase() : 'T'}
          </div>
        )}

        <div className="min-w-0 flex-1 pb-0.5">
          <div className="truncate font-display font-bold text-lead leading-tight tracking-tight">
            {b.name}
          </div>
          {subtitulo && (
            <div className="mt-0.5 truncate text-ink-muted text-label">{subtitulo}</div>
          )}
        </div>
      </div>
    </Card>
  )
}
