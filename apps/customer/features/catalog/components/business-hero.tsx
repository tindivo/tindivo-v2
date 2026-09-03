import { Icon } from '@tindivo/ui'
import Image from 'next/image'
import Link from 'next/link'
import { CartButton } from '@/components/cart-sheet'
import type { BusinessDetail } from '@/features/catalog/types'

interface BusinessHeroProps {
  business: BusinessDetail['business']
}

/**
 * La portada: foto y nada más.
 *
 * Antes llevaba encima el nombre, el eslogan y cuatro datos en blanco,
 * sostenidos por un velo negro que ocupaba el 65% del alto. Ese velo es el
 * precio de escribir sobre una imagen, y se paga dos veces: la foto del local
 * se ve a medias y el texto tampoco queda limpio. Los datos bajaron al lienzo,
 * en tinta, donde se leen sin pelearse con nada (`BusinessIdentity`).
 *
 * De paso la portada baja de 280 a 140 px. Con el horario fundido abajo, la
 * cabecera pasa de 396 a ~354 px antes del primer plato.
 *
 * Los botones son círculos BLANCOS: el redondel oscuro translúcido de antes
 * desaparecía sobre una foto nocturna, que es cuando opera el piloto.
 */
export function BusinessHero({ business }: BusinessHeroProps) {
  return (
    <div className="relative h-[140px] overflow-hidden lg:h-[200px] lg:rounded-[28px]">
      {business.banner_url ? (
        <Image
          src={business.banner_url}
          alt=""
          fill
          sizes="100vw"
          priority
          draggable={false}
          className="object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, #${business.accent_color} 0%, #1a1614 130%)`,
          }}
        />
      )}
      {/* Sombra corta arriba, solo para que los botones despeguen de la foto. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/40 via-black/10 to-transparent" />

      <div className="relative flex items-center justify-between px-4 pt-11">
        <Link
          href="/"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-ink shadow-elev-2 transition-transform active:scale-95"
          aria-label="Volver"
        >
          <Icon name="arrow_back" size={20} />
        </Link>
        <CartButton tone="on_photo" businessId={business.id} />
      </div>
    </div>
  )
}
