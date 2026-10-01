'use client'

import { Icon } from '@tindivo/ui'
import Image from 'next/image'

/** Ancla de la lista de restaurantes (`BusinessGrid`), destino de la tarjeta. */
export const RESTAURANTS_ANCHOR = 'restaurantes'

/**
 * La tarjeta de Restaurantes en el home, en cuadro junto a la de Tindivo
 * Entregas (`CourierServiceCard`) y con su misma estructura —nombre y bajada
 * y dato arriba; abajo a la izquierda un botón secundario, y a la derecha la
 * ilustración— para que se lean como un sistema. Naranja, el
 * color de la marca y de la comida.
 *
 * Baja a la lista en la misma página en vez de abrir una ruta nueva
 * (`Docs/Home/README.md` §3.2): mientras Restaurantes sea el único servicio
 * con catálogo, una página aparte solo sería un toque más.
 *
 * `openCount` es `null` mientras la lista no ha llegado: mejor no decir nada
 * que decir «0 abiertos» un instante.
 */
export function RestaurantsServiceCard({ openCount }: { openCount: number | null }) {
  const availability =
    openCount === null ? null : openCount > 0 ? (
      <span className="inline-flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4ADE80] opacity-70 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4ADE80]" />
        </span>
        <span>
          {openCount === 1 ? '1 abierto' : `${openCount} abiertos`}
          <span className="hidden sm:inline"> ahora</span>
        </span>
      </span>
    ) : (
      'Cerrados por ahora'
    )

  return (
    <a
      href={`#${RESTAURANTS_ANCHOR}`}
      onClick={(e) => {
        // Desplazamiento suave sin dejar `#restaurantes` en la URL: compartir
        // el enlace del home no tiene que abrir a media página.
        e.preventDefault()
        document
          .getElementById(RESTAURANTS_ANCHOR)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }}
      className="group relative isolate flex h-full min-h-[184px] w-full flex-col overflow-hidden rounded-[24px] bg-[linear-gradient(150deg,#FB8A3C_0%,#F97316_40%,#C2410C_100%)] p-3 text-left text-white shadow-[0_10px_24px_-14px_rgba(194,65,12,.7)] transition-transform duration-200 active:scale-[0.98] sm:min-h-[272px] sm:rounded-[26px] sm:p-5 lg:min-h-[216px] lg:p-7 lg:hover:-translate-y-0.5"
    >
      <span
        aria-hidden
        className="-right-10 -bottom-12 sm:-right-12 sm:-bottom-14 absolute -z-10 h-36 w-36 rounded-full bg-white/[0.16] sm:h-56 sm:w-56 lg:h-60 lg:w-60"
      />
      <span
        aria-hidden
        className="-left-12 -bottom-16 absolute -z-10 h-32 w-32 rounded-full bg-[#9A3412]/30 sm:h-44 sm:w-44"
      />
      {/* Anclada a la esquina inferior derecha, a la altura del botón (ver
          `CourierIllustration`). */}
      <Image
        src="/services/bolsa-restaurantes.webp"
        alt=""
        width={RESTAURANTES_IMG.width}
        height={RESTAURANTES_IMG.height}
        sizes="(min-width: 1024px) 220px, (min-width: 640px) 150px, 100px"
        priority
        draggable={false}
        className="-right-4 -bottom-1.5 pointer-events-none absolute h-[clamp(76px,22vw,86px)] w-auto max-w-none select-none drop-shadow-[0_12px_14px_rgba(124,45,18,.35)] transition-transform duration-300 group-hover:-rotate-2 group-hover:scale-[1.03] sm:-right-3 sm:-bottom-2 sm:h-[136px] lg:right-6 lg:bottom-3 lg:h-[86%]"
      />
      <div className="relative lg:max-w-[55%]">
        {/* Sin antetítulo, pero con su hueco: así los dos títulos quedan a la
            misma altura que «Entregas», que lleva «TINDIVO» encima. */}
        <p
          aria-hidden
          className="invisible text-[10.5px] leading-none sm:text-[11px] lg:text-[12px]"
        >
          ·
        </p>
        {/* «Restaurantes» es el título que limita el tamaño de los dos: a 360 px
            de pantalla quedan 134 px de texto, y mide ~6,4 px por px de fuente.
            El `clamp` lo lleva al máximo que cabe sin partirse. */}
        <h2 className="mt-1 whitespace-nowrap font-display text-[clamp(20px,calc(7.75vw_-_7.5px),23px)] font-extrabold leading-none tracking-[-0.03em] sm:mt-1.5 sm:text-[26px] lg:text-[30px]">
          Restaurantes
        </h2>
        <p className="mt-1.5 text-[12.5px] font-medium leading-[1.3] text-white/95 sm:text-[14px] lg:text-[15px]">
          Pide comida y te la llevamos
        </p>
        {/* Con hueco aunque no haya dato todavía, para que el texto no salte
            ni quede a otra altura que el de Entregas. */}
        <p className="mt-2 text-[11.5px] font-semibold leading-tight text-white/90 sm:text-[12.5px] lg:text-[13px]">
          {availability ?? '\u00A0'}
        </p>
      </div>
      <div className="relative z-10 mt-auto pt-3 sm:pt-4 lg:pt-5">
        <span className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-full border-[1.5px] border-white/70 bg-[#7C2D12]/25 pr-2.5 pl-3.5 text-[13px] font-bold tracking-[-0.01em] text-white transition-colors group-hover:bg-[#7C2D12]/40 group-active:bg-[#7C2D12]/50 sm:h-11 sm:gap-1.5 sm:pr-4 sm:pl-5 sm:text-[14.5px] lg:h-12 lg:text-[15px]">
          {/* Un solo `span`: dentro del `inline-flex` cada trozo de texto sería
              un hijo aparte y el `gap` metería un espacio de más. */}
          <span>
            Ver<span className="hidden lg:inline"> restaurantes</span>
            <span className="lg:hidden"> todos</span>
          </span>
          <Icon
            name="arrow_downward"
            size={18}
            className="transition-transform duration-200 group-hover:translate-y-0.5"
          />
        </span>
      </div>
    </a>
  )
}

const RESTAURANTES_IMG = { width: 410, height: 440 }
