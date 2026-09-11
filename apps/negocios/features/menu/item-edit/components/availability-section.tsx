import {
  type DaypartPreset,
  deriveDayparts,
  describeWindow,
  type ScheduleDayRow,
  windowFitsSchedule,
} from '@tindivo/contracts'
import { Button, Icon } from '@tindivo/ui'
import type { FormData } from '../types'

/**
 * «¿CUÁNDO SE SIRVE ESTE PLATO?»
 *
 * La Florencia sirve dos cartas: mediodía los sábados y domingos (11:00–15:00) y
 * noche el resto. Hasta ahora el menú no sabía decirlo, y el resultado está en
 * prod: sus 13 platos de mariscos y de recomendación del chef llevaban meses
 * apagados a mano las 24 horas de los 7 días, porque encenderlos el sábado a
 * las 11:00 y apagarlos a las 15:00 son 26 toques de switch por fin de semana.
 *
 * LOS ATAJOS SON LA PIEZA QUE HACE QUE ESTO SE USE. Marcar una veintena de
 * platos de la carta de noche a mano significa teclear «18:00» y «23:30» veinte
 * veces, y a la tercera sale una errata que no da la cara hasta que un cliente
 * no ve un plato. Los atajos salen del horario que el negocio ya tiene puesto,
 * así que son un toque y no hay nada que teclear.
 */

const DAY_INITIALS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const
const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

/** Icono de cada atajo. Los dos están en el subset de `icons.txt` (invariante 9). */
const PRESET_ICON: Record<DaypartPreset['kind'], string> = {
  midday: 'soup_kitchen',
  night: 'fastfood',
}
const PRESET_TITLE: Record<DaypartPreset['kind'], string> = {
  midday: 'Solo al mediodía',
  night: 'Solo de noche',
}

export interface AvailabilitySectionProps {
  formData: FormData
  /** Horario semanal del negocio. Vacío = sin horario configurado. */
  schedule: ScheduleDayRow[]
  onFormChange: (patch: Partial<FormData>) => void
  /** Nombre y número de platos de la categoría, para el botón de aplicar en bloque. */
  categoryName: string
  categoryItemCount: number
  onApplyToCategory?: () => void
  applyingToCategory?: boolean
}

const labelCls =
  'mb-2 block font-mono text-[11px] font-semibold uppercase tracking-wide text-ink/55'
const timeInputCls =
  'rounded-xl border border-ink/[0.06] bg-card px-3 py-2 font-mono text-[15px] font-semibold text-ink outline-none transition-all focus:border-ink focus:ring-4 focus:ring-ink/[0.08]'

export function AvailabilitySection({
  formData,
  schedule,
  onFormChange,
  categoryName,
  categoryItemCount,
  onApplyToCategory,
  applyingToCategory = false,
}: AvailabilitySectionProps) {
  const window = {
    days: formData.available_days,
    from: formData.available_from,
    to: formData.available_to,
  }
  // «Restringido» es tener CUALQUIERA de las tres cosas puestas. Se deriva del
  // formulario en vez de guardarse aparte: un booleano de más podría discrepar
  // de los datos, y entonces la pantalla diría una cosa y la DB otra.
  const restringido =
    formData.available_days.length > 0 ||
    formData.available_from !== null ||
    formData.available_to !== null

  const presets = deriveDayparts(schedule)
  const fueraDeHorario = restringido ? windowFitsSchedule(window, schedule) : []
  const resumen = describeWindow(window)

  function aplicarPreset(preset: DaypartPreset) {
    onFormChange({
      available_days: preset.window.days ?? [],
      available_from: preset.window.from,
      available_to: preset.window.to,
    })
  }

  function quitarRestriccion() {
    onFormChange({ available_days: [], available_from: null, available_to: null })
  }

  function alternarDia(day: number) {
    const next = formData.available_days.includes(day)
      ? formData.available_days.filter((d) => d !== day)
      : [...formData.available_days, day].sort((a, b) => a - b)
    onFormChange({ available_days: next })
  }

  function cambiarHora(campo: 'available_from' | 'available_to', valor: string) {
    // Vaciar el campo vuelve a «sin hora», que significa «todo el horario de
    // esos días» y no «00:00»: son cosas distintas y la segunda escondería el
    // plato entero.
    onFormChange({ [campo]: valor === '' ? null : valor })
  }

  return (
    <div className="rounded-2xl border border-ink/[0.06] bg-card p-4">
      <div className="mb-3.5 flex items-center gap-2.5">
        <div className="flex-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
          B · Disponibilidad
        </div>
        {restringido && (
          <span className="rounded-full bg-info/10 px-2.5 py-1 text-[11px] font-bold text-info">
            Por turno
          </span>
        )}
      </div>

      {/* Las dos opciones de fondo. Un plato sin restricción es el caso normal y
          va primero.

          Excepción a check:ds — esto es una OPCIÓN, no un botón: lo que se pulsa
          es «mi plato es de este tipo», y la superficie es la que dice cuál está
          elegido. Un <Button> traería su propio degradado de marca y las dos
          opciones se leerían como dos acciones distintas en vez de como una
          elección entre dos. Mismo criterio que el riel de categorías de
          app/menu/page.tsx y que los switches de editor-form.tsx. */}
      <div className="mb-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={quitarRestriccion}
          className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition-all ${
            restringido ? 'border-ink/[0.06] bg-surface' : 'border-brand bg-brand/[0.06]'
          }`}
          aria-pressed={!restringido}
        >
          <Icon
            name="restaurant"
            size={18}
            filled
            className={restringido ? 'text-ink-subtle' : 'text-brand'}
          />
          <div className="flex-1">
            <div className="text-[14px] font-semibold text-ink">
              Siempre que el local esté abierto
            </div>
            <div className="text-[11px] text-ink-muted">
              Se sirve en todos los turnos del horario
            </div>
          </div>
        </button>
      </div>

      {/* Atajos. Solo aparecen si el horario del negocio los da: un negocio que
          solo abre de noche no tiene atajo de mediodía que ofrecer.

          Excepción a check:ds — misma razón que arriba: son las opciones de una
          elección y la superficie marca la activa. */}
      {presets.length > 0 && (
        <div className="mb-3">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: rótulo de un grupo de botones */}
          <label className={labelCls}>Atajos de tu horario</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {presets.map((preset) => {
              const activo =
                formData.available_from === preset.window.from &&
                formData.available_to === preset.window.to &&
                formData.available_days.join(',') === (preset.window.days ?? []).join(',')
              return (
                <button
                  key={preset.kind}
                  type="button"
                  onClick={() => aplicarPreset(preset)}
                  aria-pressed={activo}
                  className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                    activo ? 'border-brand bg-brand/[0.06]' : 'border-ink/[0.06] bg-surface'
                  }`}
                >
                  <Icon
                    name={PRESET_ICON[preset.kind]}
                    size={18}
                    filled
                    className={activo ? 'text-brand' : 'text-ink-subtle'}
                  />
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-ink">
                      {PRESET_TITLE[preset.kind]}
                    </div>
                    <div className="truncate font-mono text-[11px] text-ink-muted">
                      {describeWindow(preset.window)?.replace(/^Solo /, '')}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Ajuste fino. Siempre visible: el atajo rellena esto mismo, así que se
          ve qué hizo y se puede corregir sin deshacerlo. */}
      <div className="rounded-xl bg-surface p-3">
        {/* biome-ignore lint/a11y/noLabelWithoutControl: rótulo de un grupo de botones */}
        <label className={labelCls}>Días</label>
        <div className="mb-3 flex gap-1.5">
          {/* El índice ES el día: 0=lunes..6=domingo, la convención de
              `business_schedule`. No es `Date.getDay()`, que empieza en domingo.

              Excepción a check:ds — chips de día en una fila, el mismo patrón
              exacto que el riel de categorías de app/menu/page.tsx: la
              superficie `bg-ink` marca cuáles están puestos, y siete <Button>
              seguidos dejarían de leerse como una sola cosa. */}
          {DAY_INITIALS.map((inicial, day) => {
            const on = formData.available_days.includes(day)
            return (
              <button
                key={inicial}
                type="button"
                onClick={() => alternarDia(day)}
                aria-pressed={on}
                aria-label={DAY_NAMES[day]}
                className={`h-9 w-9 shrink-0 rounded-full text-[13px] font-bold transition-all ${
                  on
                    ? 'bg-ink text-white shadow-sm'
                    : 'border border-ink/[0.08] bg-card text-ink-subtle'
                }`}
              >
                {inicial}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className={labelCls} htmlFor="available_from">
              Desde
            </label>
            <input
              id="available_from"
              type="time"
              value={formData.available_from?.slice(0, 5) ?? ''}
              onChange={(e) => cambiarHora('available_from', e.target.value)}
              className={timeInputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="available_to">
              Hasta
            </label>
            <input
              id="available_to"
              type="time"
              value={formData.available_to?.slice(0, 5) ?? ''}
              onChange={(e) => cambiarHora('available_to', e.target.value)}
              className={timeInputCls}
            />
          </div>
          {restringido && (
            <button
              type="button"
              onClick={quitarRestriccion}
              className="py-2 text-[12px] font-semibold text-danger"
            >
              Quitar la franja
            </button>
          )}
        </div>
      </div>

      {/* Lo que el cliente va a leer, literal: es la misma función que pinta la
          card del catálogo, así que aquí no se puede prometer otra cosa. */}
      {resumen && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-info/[0.08] p-2.5">
          <Icon name="schedule" size={16} className="mt-0.5 shrink-0 text-info" />
          <div className="text-[12px] text-ink">
            El cliente leerá <span className="font-semibold">«{resumen}»</span> y no podrá pedirlo
            fuera de esa franja.
          </div>
        </div>
      )}

      {/* Aviso, NO bloqueo: configurar la franja antes de cambiar el horario es
          una secuencia legítima y prohibirla dejaría a la cajera sin salida. */}
      {fueraDeHorario.length > 0 && (
        <div className="mt-2 flex items-start gap-2 rounded-xl bg-warning/[0.1] p-2.5">
          <Icon name="warning" size={16} className="mt-0.5 shrink-0 text-warning" />
          <div className="text-[12px] text-ink">
            {fueraDeHorario.length === 1
              ? `El ${DAY_NAMES[fueraDeHorario[0] ?? 0]} tu horario no cubre esa franja: el plato no se verá ese día.`
              : `Tu horario no cubre esa franja ${fueraDeHorario.length} días (${fueraDeHorario
                  .map((d) => DAY_NAMES[d])
                  .join(', ')}): el plato no se verá esos días.`}
          </div>
        </div>
      )}

      {/* EL BOTÓN QUE AHORRA 12 VIAJES. Los 13 platos de mediodía de La Florencia
          viven en dos categorías enteras; sin esto, configurarlos es entrar y
          salir del editor trece veces, y eso no se hace. */}
      {onApplyToCategory && restringido && categoryItemCount > 1 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onApplyToCategory}
          disabled={applyingToCategory}
          className="mt-3 w-full gap-2 text-[13px]"
        >
          <Icon name="library_add" size={16} />
          {applyingToCategory
            ? 'Aplicando…'
            : `Aplicar esta franja a los ${categoryItemCount} platos de ${categoryName}`}
        </Button>
      )}
    </div>
  )
}
