'use client'

import { getOpenStatus, type ScheduleDayRow } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import Image from 'next/image'
import { useState } from 'react'
import { ScheduleWeek } from '@/features/catalog/components/schedule-week'
import type { BusinessDetail } from '@/features/catalog/types'

interface BusinessIdentityProps {
  business: BusinessDetail['business']
  schedule: ScheduleDayRow[]
  now: Date
  openingConfirmed?: boolean | null
}

/**
 * Quién es este negocio y si está abierto, en tinta sobre el lienzo.
 *
 * Sustituye a lo que antes iba escrito sobre la foto MÁS la tarjeta de horario
 * que venía debajo. Las dos decían «Abierto» —el punto verde del hero y la
 * pastilla verde de la tarjeta, a 60 px de distancia—, así que se dice una vez
 * y en el sitio donde de noche importa: pegado al nombre.
 *
 * El logo estaba descargado desde siempre (`logo_url` viaja en el payload de
 * `/public/businesses/:id`) y solo lo usaba la tarjeta de la portada. Verlo
 * aquí es lo que confirma al usuario que entró donde quería, sobre todo en un
 * pueblo donde el local se reconoce por su letrero antes que por su nombre
 * escrito. Círculo y no cuadrado, que es como se lee un avatar de local.
 *
 * Tres líneas y ni una más: nombre, eslogan, y una fila con el estado y el
 * tiempo. Una versión anterior metía cuatro cosas en la fila de datos y con el
 * logo al lado envolvía a dos líneas — el bloque se apelmazaba contra el borde
 * y no había forma de leerlo de un vistazo.
 */
export function BusinessIdentity({
  business,
  schedule,
  now,
  openingConfirmed,
}: BusinessIdentityProps) {
  const [horarioAbierto, setHorarioAbierto] = useState(false)
  const status = getOpenStatus(schedule, now, openingConfirmed)
  const isCatalogOnly = !business.accepts_web_delivery && !business.accepts_web_pickup
  const abierto = status.kind === 'open'

  function etiquetaEstado(): string {
    if (status.kind === 'open') return `Abierto · cierra ${status.closesAt}`
    if (status.kind === 'closed' && status.opensAt) {
      return `Cerrado · abre ${status.opensToday ? '' : 'mañana '}${status.opensAt}`
    }
    return 'Cerrado'
  }
  const estado = etiquetaEstado()

  return (
    <div className="px-[18px] pt-4">
      <div className="flex items-center gap-3">
        {business.logo_url ? (
          <Image
            src={business.logo_url}
            // Decorativo: el nombre está a 12 px a la derecha, así que un `alt`
            // con el nombre lo hace sonar dos veces seguidas.
            alt=""
            width={54}
            height={54}
            sizes="54px"
            priority
            draggable={false}
            className="h-[54px] w-[54px] shrink-0 rounded-full border border-border bg-card object-cover shadow-elev-1"
          />
        ) : (
          <div
            className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full font-display font-bold text-[20px] text-white shadow-elev-1"
            style={{ backgroundColor: `#${business.accent_color}` }}
          >
            {business.name.trim()[0]?.toUpperCase() ?? 'T'}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display font-extrabold text-[24px] leading-[1.1] tracking-[-0.03em]">
            {business.name}
          </h1>
          {/*
            El eslogan va aquí y NO condicionado al horario. Estuvo un rato
            colgando solo de la rama `no_schedule`, así que en los cuatro
            negocios —que sí tienen horario— desapareció de la ficha sin que
            nadie lo decidiera.
          */}
          {business.tagline && (
            <p className="mt-1 truncate text-[12.5px] text-ink-muted">{business.tagline}</p>
          )}
        </div>
      </div>

      {/*
        Estado y logística comparten fila, y a ancho COMPLETO — no en la columna
        del nombre, que con el logo al lado se queda en 288 px y obliga a
        envolver. El estado va primero y en color porque de noche es el dato que
        decide; el resto es apoyo.

        Aquí NO va «Delivery»: en esta app todo es delivery, lo dice el nombre
        del producto. El único negocio que necesita decir otra cosa es el de
        catálogo, y tiene su propia rama. Quitarlo es lo que deja la fila por
        debajo de los 360 px del Android más estrecho del piloto, incluso con el
        estado largo («Cerrado · abre mañana 17:00»).
      */}
      <div className="flex items-center gap-2.5 pt-2.5 text-[12.5px] text-ink-muted">
        {status.kind !== 'no_schedule' && (
          <>
            <button
              type="button"
              onClick={() => setHorarioAbierto((v) => !v)}
              aria-expanded={horarioAbierto}
              data-expanded={horarioAbierto}
              className={`group inline-flex min-h-[24px] shrink-0 items-center gap-1.5 font-semibold ${
                abierto ? 'text-success' : 'text-danger'
              }`}
            >
              <span
                aria-hidden
                className={`h-[7px] w-[7px] rounded-full ${abierto ? 'bg-success' : 'bg-danger'}`}
              />
              {estado}
              {/*
                `group-data-*` y no `data-*` a secas: el atributo vive en el
                botón y el icono es su hijo, así que la variante sin prefijo
                buscaba `data-expanded` en un elemento que no lo tiene y la
                flecha no giraba nunca. Y `aria-hidden` porque el botón ya se
                anuncia con su texto y su `aria-expanded`; etiquetar también la
                flecha lo hacía sonar dos veces.
              */}
              <Icon
                name="expand_more"
                size={15}
                aria-hidden
                className="opacity-70 transition-transform duration-160 ease-out group-data-[expanded=true]:rotate-180"
              />
            </button>
            <span aria-hidden className="h-3 w-px shrink-0 bg-ink/15" />
          </>
        )}
        {isCatalogOnly ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Icon name="chat" size={15} className="shrink-0" />
            <span className="truncate">Pedidos por WhatsApp</span>
          </span>
        ) : (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Icon name="schedule" size={15} className="shrink-0" />
            <span className="truncate">
              Llega en{' '}
              <strong className="font-bold text-ink">
                {business.estimated_eta_min}–{business.estimated_eta_max} min
              </strong>
            </span>
          </span>
        )}
      </div>

      {horarioAbierto && (
        <div className="mt-3 rounded-[16px] border border-border bg-card px-4 py-3">
          <ScheduleWeek schedule={schedule} now={now} />
        </div>
      )}

      <div className="pb-3.5" />
    </div>
  )
}
