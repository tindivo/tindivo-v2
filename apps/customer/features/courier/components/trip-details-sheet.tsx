'use client'

import { COURIER_DRIVER_HINT_MAX, COURIER_ITEM_DESCRIPTION_MAX } from '@tindivo/contracts'
import { BottomSheet, Button, Icon } from '@tindivo/ui'
import { useCallback, useRef, useState } from 'react'
import { useCourierRequest } from '../hooks/use-courier-request'
import { useCourierStatus } from '../hooks/use-courier-status'
import type { CourierContact } from '../lib/contacts'
import { formatCourierPrice, getUtmSource } from '../lib/format'
import {
  formatPePhone,
  isValidPePhone,
  missingPhoneDigits,
  normalizePePhoneInput,
  stripPeCountryCode,
} from '../lib/phone'
import { useCourierStore } from '../lib/store'
import type { CourierEditingPoint, CourierPoint } from '../types'
import { PayerField } from './payer-field'

/**
 * Categorías: solo UI, rellenan `itemDescription` (el contrato no tiene campo
 * de categoría). «Comida» ocupa el sitio que tenía «Paquete» (un paquete
 * cualquiera cabe en «Otro»). Si la persona ya escribió algo, elegir una
 * categoría no lo pisa.
 */
const CATEGORIES = [
  { id: 'documentos', label: 'Documentos', icon: 'description', preset: 'Documentos' },
  { id: 'comida', label: 'Comida', icon: 'lunch_dining', preset: 'Comida' },
  { id: 'medicinas', label: 'Medicinas', icon: 'medication', preset: 'Medicinas' },
  { id: 'ropa', label: 'Ropa', icon: 'apparel', preset: 'Ropa' },
  { id: 'otro', label: 'Otro', icon: 'more_horiz', preset: '' },
] as const

type CategoryId = (typeof CATEGORIES)[number]['id']

/**
 * La única pantalla después de los dos mapas (A → B → aquí → seguimiento).
 * Antes eran tres —contactos, «¿Quién paga?» y «¿Qué llevamos?»— y el pedido
 * se sentía largo. Agrupada por tarea: de quién a quién, qué llevamos, quién
 * paga, y las indicaciones plegadas. Solo el botón queda fijo abajo: una
 * casilla fija también taparía campos con el teclado abierto.
 *
 * El nombre de cada contacto es OPCIONAL: lo que el motorizado usa es el
 * celular (llama antes de salir). Si queda vacío se envía «Quien entrega» /
 * «Quien recibe».
 */
export function TripDetailsSheet() {
  const open = useCourierStore((s) => s.open && s.step === 'trip-details')
  const beginEditPoint = useCourierStore((s) => s.beginEditPoint)
  // Identidad FIJA: `BottomSheet` se lo pasa a `useDialogFocus`, que vuelve a
  // enfocar el diálogo cada vez que cambia `onClose`. Con una flecha nueva por
  // render, cada tecla le quitaba el foco al campo que se estaba escribiendo.
  const goBack = useCallback(() => beginEditPoint('destination'), [beginEditPoint])
  const { draft, updateDraft, updatePoint, identity, submitting, error, submit } =
    useCourierRequest()
  const { status } = useCourierStatus()
  const me: CourierContact | null =
    identity?.userId && (identity.name || identity.phone)
      ? { name: identity.name, phone: stripPeCountryCode(identity.phone) }
      : null

  const [category, setCategory] = useState<CategoryId | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  const itemReady = draft.itemDescription.trim().length > 0
  const originReady = isValidPePhone(draft.origin.contactPhone)
  const destinationReady = isValidPePhone(draft.destination.contactPhone)
  const ready = itemReady && originReady && destinationReady && draft.weightConfirmed

  // Una sola línea, siempre: si el aviso creciera, el pie se movería.
  const missing: { text: string; cta: string; target: string } | null = !itemReady
    ? { text: 'Falta decir qué llevamos', cta: 'Completar: qué llevamos', target: 'item' }
    : !originReady
      ? {
          text: 'Falta el celular de quien entrega',
          cta: 'Completar: celular de quien entrega',
          target: 'origin-phone',
        }
      : !destinationReady
        ? {
            text: 'Falta el celular de quien recibe',
            cta: 'Completar: celular de quien recibe',
            target: 'destination-phone',
          }
        : !draft.weightConfirmed
          ? {
              text: 'Marca que está listo y pagado',
              cta: 'Marcar: listo y pagado',
              target: 'ready',
            }
          : null

  function pickCategory(c: (typeof CATEGORIES)[number]) {
    setCategory(c.id)
    if (!draft.itemDescription.trim() && c.preset) updateDraft({ itemDescription: c.preset })
    if (c.id === 'otro') focusField('item')
  }

  function focusField(target: string) {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-field="${target}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el?.focus({ preventScroll: true })
  }

  return (
    // Detalles es el tercer paso: atrás (flecha, Escape) vuelve al mapa de la
    // entrega sin perder nada, igual que en los pasos del pin. Antes había una
    // X que cerraba el pedido entero.
    <BottomSheet open={open} onClose={goBack} label="Detalles de la entrega" scrim={false}>
      <div className="flex max-h-[85dvh] min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-2 px-4 pb-3">
          <button
            type="button"
            onClick={goBack}
            aria-label="Volver al mapa"
            className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F4F4F2]"
          >
            <Icon name="arrow_back" size={22} className="text-[#2E3236]" />
          </button>
          <div className="text-[24px] font-extrabold tracking-[-0.03em] text-[#2E3236]">
            Detalles de la entrega
          </div>
        </div>

        <div
          ref={scroller}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4"
        >
          {/* ── De quién a quién ───────────────────────────────────────── */}
          <PointCard
            key={`origin-${open}`}
            which="origin"
            title="Recogemos de"
            point={draft.origin}
            namePlaceholder="Nombre de quien entrega (opcional)"
            onChangeLocation={() => beginEditPoint('origin')}
            onChange={(patch) => updatePoint('origin', patch)}
            me={me}
          />
          <PointCard
            key={`destination-${open}`}
            which="destination"
            title="Entregamos a"
            point={draft.destination}
            namePlaceholder="Nombre de quien recibe (opcional)"
            onChangeLocation={() => beginEditPoint('destination')}
            onChange={(patch) => updatePoint('destination', patch)}
            me={me}
          />

          {/* ── ¿Qué llevamos? ─────────────────────────────────────────── */}
          <section className="flex flex-col gap-2.5">
            <h3 className="text-[18px] font-extrabold tracking-[-0.02em] text-[#2E3236]">
              ¿Qué llevamos?
            </h3>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const active = category === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => pickCategory(c)}
                    className={`flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-bold ${
                      active
                        ? 'bg-[#FFEDD5] text-brand-dark shadow-[inset_0_0_0_2px_#F97316]'
                        : 'bg-[#F4F4F2] text-[#2E3236]'
                    }`}
                  >
                    <Icon name={active ? 'check' : c.icon} size={16} filled={active} />
                    {c.label}
                  </button>
                )
              })}
            </div>
            <input
              type="text"
              value={draft.itemDescription}
              maxLength={COURIER_ITEM_DESCRIPTION_MAX}
              onChange={(e) => updateDraft({ itemDescription: e.target.value })}
              placeholder="Ej.: Un sobre con documentos"
              aria-label="Qué llevamos"
              data-field="item"
              className="h-12 w-full rounded-2xl bg-[#F4F4F2] px-3.5 text-[16px] font-semibold text-[#2E3236] outline-none placeholder:text-[#9AA0A6]"
            />
          </section>

          {/* ── ¿Quién paga? ───────────────────────────────────────────── */}
          <PayerField
            payer={draft.payer}
            onChange={(payer) => updateDraft({ payer })}
            price={status.price}
          />

          {/* ── Indicaciones (plegadas) ────────────────────────────────── */}
          {noteOpen || draft.driverNote ? (
            <div className="flex flex-col gap-1 rounded-2xl bg-[#F4F4F2] p-3.5">
              <span className="text-[12px] font-semibold text-[#5C6368]">
                Indicaciones para el motorizado
              </span>
              <textarea
                value={draft.driverNote}
                maxLength={COURIER_DRIVER_HINT_MAX}
                onChange={(e) => updateDraft({ driverNote: e.target.value })}
                placeholder="Ej.: Está a nombre de María. Cuidado, es frágil."
                rows={2}
                // biome-ignore lint/a11y/noAutofocus: se abre por un toque explícito en «Agregar indicaciones»
                autoFocus={noteOpen && !draft.driverNote}
                className="w-full resize-none border-0 bg-transparent text-[15px] font-semibold text-[#2E3236] outline-none placeholder:text-[#9AA0A6]"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className="flex h-12 items-center gap-2 self-start rounded-full px-1 text-[15px] font-bold text-brand-dark"
            >
              <Icon name="add" size={20} />
              Agregar indicaciones (opcional)
            </button>
          )}

          {/* ── Listo y pagado ─────────────────────────────────────────── */}
          <label className="flex items-start gap-3 rounded-[18px] border-[1.5px] border-[#E8E9EB] bg-white p-3.5">
            <input
              type="checkbox"
              checked={draft.weightConfirmed}
              data-field="ready"
              onChange={(e) =>
                updateDraft({
                  weightConfirmed: e.target.checked,
                  prepaidConfirmed: e.target.checked,
                })
              }
              className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
            />
            <span className="text-[14px] font-semibold leading-snug text-[#2E3236]">
              Ya está listo y pagado. Tindivo no compra ni adelanta dinero. Máx. 5 kg.{' '}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  setInfoOpen(true)
                }}
                className="font-bold text-brand-dark underline underline-offset-2"
              >
                Ver qué se puede llevar
              </button>
            </span>
          </label>
        </div>

        {/* Fijo abajo: solo el aviso y el botón. */}
        <div className="shrink-0 border-t border-ink/[0.06] bg-surface px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <p
            aria-live="polite"
            className={`mb-2 min-h-[16px] px-1 text-[12px] font-semibold leading-[16px] ${
              error ? 'text-[#DC2626]' : missing ? 'text-[#B45309]' : 'text-transparent'
            }`}
          >
            {error ?? missing?.text ?? 'Todo listo'}
          </p>
          <button
            type="button"
            // Solo «Enviando…» está deshabilitado de verdad. Gris por falta de
            // datos, el botón SÍ hace algo («Completar: …» lleva al campo), así
            // que no se anuncia como deshabilitado.
            aria-disabled={submitting}
            onClick={() => {
              if (submitting) return
              if (missing) focusField(missing.target)
              else void submit(getUtmSource())
            }}
            className={`flex h-14 w-full items-center justify-center gap-2 rounded-full font-extrabold text-[17px] transition-[transform,box-shadow] active:scale-[0.98] ${
              ready && !submitting
                ? 'bg-[linear-gradient(135deg,#F97316,#FB923C)] text-white shadow-[0_10px_24px_-10px_rgba(234,88,12,.55)]'
                : submitting
                  ? 'bg-[#E8E9EB] text-[#5C6368]'
                  : // «Completar: …» es una acción (lleva al campo), no un botón
                    // apagado: se ve como acción secundaria, no gris.
                    'border-2 border-brand-dark bg-white text-brand-dark'
            }`}
          >
            <Icon name="two_wheeler" size={22} filled={ready} />
            {/* Gris, el botón dice qué falta y lleva hasta ahí (`focusField`):
                tras «Repetir», lo pendiente suele quedar abajo, fuera de vista. */}
            {submitting
              ? 'Enviando…'
              : missing
                ? missing.cta
                : `Pedir entrega · ${formatCourierPrice(status.price)}`}
          </button>
        </div>
      </div>

      <BottomSheet open={infoOpen} onClose={() => setInfoOpen(false)} label="Qué se puede llevar">
        <div className="flex flex-col gap-3 px-4 pb-6">
          <div className="text-[20px] font-extrabold tracking-[-0.02em] text-[#2E3236]">
            Qué se puede llevar
          </div>
          <p className="text-[15px] leading-relaxed text-[#5C6368]">
            Hasta 5 kg, sin foto. Sin alcohol, sin nada que necesite receta especial ni
            refrigeración. El motorizado puede rechazar la entrega si al recoger no cumple esto.
          </p>
          <button
            type="button"
            onClick={() => setInfoOpen(false)}
            className="mt-2 h-14 w-full rounded-full bg-[linear-gradient(135deg,#F97316,#FB923C)] text-[18px] font-extrabold text-white"
          >
            Entendido
          </button>
        </div>
      </BottomSheet>
    </BottomSheet>
  )
}

function PointCard({
  which,
  title,
  point,
  namePlaceholder,
  onChangeLocation,
  onChange,
  me,
}: {
  which: CourierEditingPoint
  title: string
  point: CourierPoint
  namePlaceholder: string
  onChangeLocation: () => void
  onChange: (patch: Partial<CourierPoint>) => void
  /** La persona que está pidiendo: su atajo «Soy yo». `null` si no hay sesión. */
  me: CourierContact | null
}) {
  const missing = missingPhoneDigits(point.contactPhone)
  const dotColor = which === 'origin' ? 'bg-brand' : 'bg-[#2E3236]'
  // Un contacto que YA llega completo al abrir la hoja («Repetir», «Mi
  // dirección», un sitio reciente) se muestra como una línea con «Cambiar»:
  // así lo pendiente («qué llevamos», «listo y pagado») cabe a la vista sin
  // desplazarse. Se decide al montar (la hoja remonta estas tarjetas en cada
  // apertura), nunca mientras se escribe: si el celular se colapsara al
  // completar el noveno dígito, el campo desaparecería bajo los dedos.
  const [compact, setCompact] = useState(() => isValidPePhone(point.contactPhone))

  return (
    <section className="flex flex-col gap-2.5 rounded-[22px] bg-[#F4F4F2] p-3.5">
      <div className="flex min-h-9 items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotColor}`} />
        <h3 className="text-[17px] font-extrabold tracking-[-0.01em] text-[#2E3236]">{title}</h3>
        {me && (
          <SoyYo
            me={me}
            current={point}
            onPick={(c) => {
              setCompact(false)
              onChange({ contactName: c.name, contactPhone: c.phone })
            }}
            onClear={() => {
              // Al vaciarlo se abre la edición: en una sola línea quedaba un
              // contacto vacío y escondido, y «Completar: celular…» no
              // encontraba el campo para llevar hasta él.
              setCompact(false)
              onChange({ contactName: '', contactPhone: '' })
            }}
          />
        )}
      </div>

      {/* Lugar: la referencia escrita en el mapa, editable aquí; «Cambiar» reabre el mapa. */}
      <div className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5">
        <Icon name="location_on" size={18} filled className="shrink-0 text-[#6B7075]" />
        <input
          type="text"
          value={point.referenceText}
          onChange={(e) => onChange({ referenceText: e.target.value })}
          aria-label={`Referencia de ${title.toLowerCase()}`}
          className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-semibold text-[#2E3236] outline-none"
        />
        <button
          type="button"
          onClick={onChangeLocation}
          className="shrink-0 text-[13px] font-bold text-brand-dark"
        >
          Cambiar
        </button>
      </div>

      {compact ? (
        <div className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5">
          <Icon name="call" size={18} className="shrink-0 text-[#6B7075]" />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#2E3236]">
            {formatPePhone(point.contactPhone)}
            {point.contactName.trim() ? ` · ${point.contactName.trim()}` : ''}
          </span>
          <button
            type="button"
            onClick={() => setCompact(false)}
            aria-label={`Cambiar el contacto de ${which === 'origin' ? 'quien entrega' : 'quien recibe'}`}
            className="shrink-0 text-[13px] font-bold text-brand-dark"
          >
            Cambiar
          </button>
        </div>
      ) : (
        <>
          {/* Contacto: celular (obligatorio) y nombre (opcional) en una sola tarjeta. */}
          <div className="flex flex-col rounded-2xl bg-white">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <Icon name="call" size={18} className="shrink-0 text-[#6B7075]" />
              <span className="text-[15px] font-semibold text-[#9AA0A6]">+51</span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={point.contactPhone}
                onChange={(e) => onChange({ contactPhone: normalizePePhoneInput(e.target.value) })}
                placeholder="987 654 321"
                aria-label={`Celular de ${which === 'origin' ? 'quien entrega' : 'quien recibe'}`}
                data-field={`${which}-phone`}
                className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-semibold text-[#2E3236] outline-none"
              />
              {isValidPePhone(point.contactPhone) && (
                <Icon name="check_circle" size={18} filled className="shrink-0 text-success" />
              )}
            </div>
            {point.contactPhone.trim().length > 0 && missing > 0 && (
              <p className="px-3 pb-2 pl-[44px] text-[12px] font-bold text-[#DC2626]">
                Faltan {missing} dígito{missing === 1 ? '' : 's'}
              </p>
            )}
            <div className="mx-3 border-t border-ink/[0.06]" />
            <div className="flex items-center gap-3 px-3 py-2.5">
              <Icon name="person" size={18} className="shrink-0 text-[#6B7075]" />
              <input
                type="text"
                value={point.contactName}
                onChange={(e) => onChange({ contactName: e.target.value })}
                placeholder={namePlaceholder}
                aria-label={namePlaceholder}
                autoComplete="off"
                className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-semibold text-[#2E3236] outline-none placeholder:text-[#9AA0A6]"
              />
            </div>
          </div>
        </>
      )}
    </section>
  )
}

/**
 * «Soy yo», en la esquina de cada tarjeta: llena nombre y celular con los de
 * quien pide; tocarlo otra vez lo apaga y deja los dos vacíos. No se rellena
 * solo: en un pedido puedes ser quien entrega, quien recibe o ninguno de los
 * dos, y suponerlo mandaría al motorizado a llamar a la persona equivocada.
 *
 * Antes compartía una fila de chips con los contactos de entregas anteriores
 * («Rosa», «Botica Central» tres veces, «Quien recibe»…): ruido repetido en las
 * dos tarjetas. Los recientes ya están, con su sitio, en «Ver anteriores» y en
 * la búsqueda del mapa (Jesús, 7-oct; `Docs/Entregas/ux-entrada/08`).
 */
function SoyYo({
  me,
  current,
  onPick,
  onClear,
}: {
  me: CourierContact
  current: CourierPoint
  onPick: (c: CourierContact) => void
  onClear: () => void
}) {
  const active = current.contactPhone === me.phone && current.contactName.trim() === me.name.trim()
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'brand' : 'outline'}
      aria-pressed={active}
      onClick={() => (active ? onClear() : onPick(me))}
      className="ml-auto shrink-0 gap-1.5"
    >
      <Icon name={active ? 'check' : 'person'} size={16} />
      Soy yo
    </Button>
  )
}
