'use client'

import type { CourierStatus } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import Image from 'next/image'
import { useActiveCourierOrders } from '@/lib/active-courier-orders'
import type { CourierServiceStatus } from '../hooks/use-courier-status'
import { formatCourierHours, formatCourierPrice, formatOpensAt } from '../lib/format'
import { openCourierFlow } from '../lib/open-flow'
import { useCourierStore } from '../lib/store'

function statusLine(status: CourierStatus, originName: string, driverName: string | null): string {
  if (status === 'requested') return 'Buscando un motorizado…'
  if (!driverName) return `Confirmado — recogiendo en ${originName}`
  if (status === 'accepted' || status === 'heading_to_pickup') {
    return `${driverName} va a recoger en ${originName}`
  }
  if (status === 'at_pickup') return `${driverName} está en ${originName}`
  if (status === 'picked_up' || status === 'heading_to_dropoff') {
    return `${driverName} va en camino`
  }
  return 'Entrega en curso'
}

/**
 * «Entrega en curso» en el home: la entrega viva del cliente, por encima de
 * las tarjetas de servicio. Con algo en camino, lo primero que se busca al
 * abrir la app es cómo va, no qué más pedir.
 */
export function CourierActiveBanner() {
  const openTracking = useCourierStore((s) => s.openTracking)
  const active = useActiveCourierOrders()[0]
  if (!active) return null

  return (
    <button
      type="button"
      onClick={() => openTracking(active.shortId)}
      className="flex w-full items-center gap-3 rounded-[20px] bg-white p-2.5 pr-4 shadow-[0_1px_2px_rgba(46,50,54,.05),0_6px_20px_rgba(46,50,54,.06)] transition-transform active:scale-[0.99]"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[linear-gradient(150deg,#3B82F6,#1D4ED8)] shadow-[inset_0_1px_0_rgba(255,255,255,.22)]">
        <Icon name="two_wheeler" size={25} filled className="text-white" />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <div className="text-[16px] font-extrabold tracking-[-0.01em] text-[#2E3236]">
          Entrega en curso
        </div>
        <div className="mt-0.5 truncate text-[13px] font-medium text-[#5C6368]">
          {statusLine(active.status, active.originName, active.driverName)}
        </div>
      </div>
      <Icon name="chevron_right" size={24} className="text-[#1D4ED8]" />
    </button>
  )
}

/**
 * La ilustración, anclada a la esquina inferior derecha de la tarjeta, a la
 * altura del botón y no encima de él: compartir esa franja es lo que deja la
 * tarjeta cuadrada. El botón es transparente, así que donde se tocan la moto
 * se sigue viendo.
 *
 * La moto mira a la izquierda, hacia el texto, y la caja con el isotipo queda
 * a la derecha: por eso casi no se sale por ese borde, para no cortar la caja.
 * No se voltea con CSS: el logo saldría al revés.
 */
function CourierIllustration({ muted = false }: { muted?: boolean }) {
  return (
    <Image
      src="/services/moto-tindivo.webp"
      alt=""
      width={ENTREGAS_IMG.width}
      height={ENTREGAS_IMG.height}
      sizes="(min-width: 1024px) 240px, (min-width: 640px) 170px, 110px"
      priority
      draggable={false}
      className={`${ILLUSTRATION} ${
        muted
          ? 'opacity-45 grayscale-[0.5]'
          : 'drop-shadow-[0_12px_14px_rgba(15,23,62,.35)] transition-transform duration-300 group-hover:-translate-x-0.5'
      }`}
    />
  )
}

const ENTREGAS_IMG = { width: 440, height: 398 }

/** Medidas compartidas por los tres estados de la tarjeta. */
const CARD =
  'relative isolate flex h-full min-h-[184px] w-full flex-col overflow-hidden rounded-[24px] p-3 text-left sm:min-h-[272px] sm:rounded-[26px] sm:p-5 lg:min-h-[216px] lg:p-7'
const TEXT = 'relative lg:max-w-[55%]'
/**
 * El antetítulo «TINDIVO» deja que «Entregas» crezca sin partir en dos líneas
 * en un teléfono de 360 px, donde «Tindivo Entregas» entero no cabe a más de
 * ~17 px. El nombre oficial se sigue leyendo completo.
 */
const EYEBROW =
  'text-[10.5px] font-bold uppercase leading-none tracking-[0.18em] sm:text-[11px] lg:text-[12px]'
/** Mismo tamaño que el de Restaurantes, que es el que limita: ver `restaurants-service-card`. */
const TITLE =
  'mt-1 whitespace-nowrap font-display text-[clamp(20px,calc(7.75vw_-_7.5px),23px)] font-extrabold leading-none tracking-[-0.03em] sm:mt-1.5 sm:text-[26px] lg:text-[30px]'
const SUBTITLE = 'mt-1.5 text-[12.5px] font-medium leading-[1.3] sm:text-[14px] lg:text-[15px]'
/** El dato del momento, como tercera línea del texto. */
const FACTS = 'mt-2 text-[11.5px] font-semibold leading-tight sm:text-[12.5px] lg:text-[13px]'
/**
 * Pie a la izquierda, solo el botón: la moto ocupa la derecha de la misma
 * franja, así que hasta escritorio va en su versión corta («Solicitar»).
 */
const FOOT = 'relative z-10 mt-auto pt-3 sm:pt-4 lg:pt-5'
/**
 * Botón secundario: borde blanco y un vidrio del color de la tarjeta. Transparente
 * para que la moto se vea detrás, pero tintado: sin él, la flecha blanca se
 * pierde donde el frente blanco de la moto pasa por debajo.
 */
const CTA =
  'inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-full border-[1.5px] pr-2.5 pl-3.5 text-[13px] font-bold tracking-[-0.01em] transition-colors sm:h-11 sm:gap-1.5 sm:pr-4 sm:pl-5 sm:text-[14.5px] lg:h-12 lg:text-[15px]'
const ILLUSTRATION =
  '-right-1.5 -bottom-1 pointer-events-none absolute h-[clamp(70px,20.5vw,80px)] w-auto max-w-none select-none sm:-right-1 sm:-bottom-1 sm:h-[128px] lg:right-6 lg:bottom-3 lg:h-[84%]'

/**
 * Los dos círculos de fondo: uno claro que hace de suelo a la moto, y uno
 * oscuro abajo a la izquierda que equilibra el peso del dibujo.
 */
function Circles({ light, dark }: { light: string; dark: string }) {
  return (
    <>
      <span
        aria-hidden
        className={`-right-10 -bottom-12 sm:-right-12 sm:-bottom-14 absolute -z-10 h-36 w-36 rounded-full sm:h-56 sm:w-56 lg:h-60 lg:w-60 ${light}`}
      />
      <span
        aria-hidden
        className={`-left-12 -bottom-16 absolute -z-10 h-32 w-32 rounded-full sm:h-44 sm:w-44 ${dark}`}
      />
    </>
  )
}

/**
 * La tarjeta de Tindivo Entregas en el home, en cuadro junto a la de
 * Restaurantes y con su misma estructura: nombre y bajada arriba (lo primero
 * que se lee) y el dato del momento; abajo, a la izquierda, un botón
 * secundario, y a la derecha la ilustración.
 *
 * Azul, el color propio del servicio (`Docs/Home/README.md` §3.0): el mismo que
 * identifica las entregas en la app del motorizado, para que no se confunda
 * con la comida (naranja).
 *
 * El texto dice TRANSPORTE DE COSAS, no «recoger lo que pagaste»: el servicio
 * lleva cualquier cosa que quepa en la caja de un punto a otro del pueblo
 * (`Docs/Encargos/05`). La bajada y la caja de la ilustración evitan que
 * «Solicitar» se lea como mototaxi.
 *
 * Fuera de horario NO se apaga ni desaparece: el servicio existe y la gente
 * tiene que aprender que existe. Pierde el degradado y el botón, y dice cuándo
 * abre, para que nadie llene el formulario entero y se entere al final.
 */
export function CourierServiceCard({ status }: { status: CourierServiceStatus }) {
  const hours = formatCourierHours(status.hours)
  const price = formatCourierPrice(status.price)
  const openTracking = useCourierStore((s) => s.openTracking)
  // Con una entrega viva el servidor rechaza otra (`maxActivePerPhone`), y lo
  // decía al FINAL del formulario. La tarjeta lleva a la que está en curso.
  const active = useActiveCourierOrders()[0]
  // En el cuadro del móvil solo cabe el precio: el peso y el horario los dice
  // el formulario, y aparecen desde tableta.
  const facts = (
    <>
      Desde {price}
      <span className=""> · Hasta 5 kg</span>
      {hours && <span className="hidden sm:inline"> · {hours}</span>}
    </>
  )

  if (!status.openNow && !active) {
    // Cerrado = fuera de horario (0240: ya no depende de que haya alguien
    // «Disponible»), así que siempre se puede decir a qué hora abre.
    const closedLine = formatOpensAt(status.hours)
    return (
      <div className={`${CARD} bg-[#EEF3FF] ring-1 ring-[#DCE6FE] ring-inset`}>
        <Circles light="bg-white/70" dark="bg-[#DCE6FE]/60" />
        <CourierIllustration muted />
        <div className={TEXT}>
          <p className={`${EYEBROW} text-[#5B6B94]`}>Tindivo</p>
          <h2 className={`${TITLE} text-[#33416B]`}>Entregas</h2>
          <p className={`${SUBTITLE} text-[#5B6B94]`}>Llevamos tus cosas de un lugar a otro</p>
          <p className={`${FACTS} text-[#5B6B94]`}>{facts}</p>
        </div>
        <div className={FOOT}>
          <span className={`${CTA} border-[#B9C8EE] bg-white/60 text-[#33416B]`}>
            <Icon name="schedule" size={16} className="text-[#5B6B94]" />
            {closedLine}
          </span>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => (active ? openTracking(active.shortId) : void openCourierFlow())}
      aria-label={
        active
          ? 'Tindivo Entregas: ver tu entrega en curso'
          : `Tindivo Entregas: solicitar motorizado, ${price}`
      }
      className={`${CARD} group bg-[linear-gradient(150deg,#3B82F6_0%,#2563EB_45%,#1E40AF_100%)] text-white shadow-[0_10px_24px_-14px_rgba(30,64,175,.7)] transition-transform duration-200 active:scale-[0.98] lg:hover:-translate-y-0.5`}
    >
      <Circles light="bg-white/[0.14]" dark="bg-[#1E3A8A]/35" />
      <CourierIllustration />
      <div className={TEXT}>
        <p className={`${EYEBROW} text-white/80`}>Tindivo</p>
        <h2 className={TITLE}>Entregas</h2>
        <p className={`${SUBTITLE} text-white/95`}>Llevamos tus cosas de un lugar a otro</p>
        <p className={`${FACTS} text-white/90`}>
          {active ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white motion-reduce:animate-none" />
              Una en camino
            </span>
          ) : (
            facts
          )}
        </p>
      </div>
      <div className={FOOT}>
        {/* Un `span` y no un `button`: la tarjeta entera ya es el botón. */}
        <span
          className={`${CTA} border-white/70 bg-[#1E3A8A]/35 text-white group-hover:bg-[#1E3A8A]/50 group-active:bg-[#1E3A8A]/60`}
        >
          {active ? (
            // Un solo `span`: dentro del `inline-flex` cada trozo de texto sería
            // un hijo aparte y el `gap` metería un espacio de más.
            <span>
              Ver<span className="hidden lg:inline"> tu entrega</span>
            </span>
          ) : (
            <span>
              Solicitar<span className="hidden lg:inline"> motorizado</span>
            </span>
          )}
          <Icon
            name="arrow_forward"
            size={18}
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </button>
  )
}
