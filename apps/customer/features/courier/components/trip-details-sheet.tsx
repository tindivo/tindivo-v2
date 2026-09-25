'use client'

import { BottomSheet, Icon } from '@tindivo/ui'
import { useRef } from 'react'
import { useCourierRequest } from '../hooks/use-courier-request'
import { type CourierContact, suggestContacts } from '../lib/contacts'
import { isValidPePhone, missingPhoneDigits, stripPeCountryCode } from '../lib/phone'
import { useCourierStore } from '../lib/store'
import type { CourierEditingPoint, CourierPoint } from '../types'

/**
 * Dónde recogemos / Dónde entregamos (imagen 6): resumen de los dos puntos ya
 * fijados en el mapa, más el contacto de cada uno. "Cambiar" reabre el mapa
 * sobre ese punto con su referencia ya escrita (se corrige ahí mismo, sin
 * volver a empezar); el texto y el contacto se editan aquí sin pasar por el mapa.
 */
export function TripDetailsSheet() {
  const open = useCourierStore((s) => s.open && s.step === 'trip-details')
  const closeSheet = useCourierStore((s) => s.closeSheet)
  const goTo = useCourierStore((s) => s.goTo)
  const beginEditPoint = useCourierStore((s) => s.beginEditPoint)
  const { draft, updatePoint, identity, recents } = useCourierRequest()
  const me: CourierContact | null =
    identity?.userId && (identity.name || identity.phone)
      ? { name: identity.name, phone: stripPeCountryCode(identity.phone) }
      : null

  const originReady =
    draft.origin.contactName.trim().length > 0 && isValidPePhone(draft.origin.contactPhone)
  const destinationReady =
    draft.destination.contactName.trim().length > 0 &&
    isValidPePhone(draft.destination.contactPhone)
  const ready = originReady && destinationReady
  const scroller = useRef<HTMLDivElement>(null)

  // Una sola línea, siempre: si el aviso creciera, el pie se movería.
  const missingText = ready
    ? null
    : !originReady && !destinationReady
      ? 'Falta el contacto de quien entrega y de quien recibe'
      : originReady
        ? `Falta ${missingOf(draft.destination)} de quien recibe`
        : `Falta ${missingOf(draft.origin)} de quien entrega`

  // Con datos incompletos «Continuar» no se apaga en silencio: lleva al primer
  // campo que falta (y el aviso de abajo dice cuál es).
  function goToFirstMissing() {
    const order: [boolean, string][] = [
      [draft.origin.contactName.trim().length === 0, 'origin-name'],
      [!isValidPePhone(draft.origin.contactPhone), 'origin-phone'],
      [draft.destination.contactName.trim().length === 0, 'destination-name'],
      [!isValidPePhone(draft.destination.contactPhone), 'destination-phone'],
    ]
    const target = order.find(([missing]) => missing)?.[1]
    const el = target
      ? scroller.current?.querySelector<HTMLInputElement>(`[data-contact="${target}"]`)
      : null
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el?.focus({ preventScroll: true })
  }

  return (
    <BottomSheet open={open} onClose={closeSheet} label="Confirma tu pedido" scrim={false}>
      <div className="flex max-h-[85dvh] min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between px-4 pb-3">
          <div className="text-[24px] font-extrabold tracking-[-0.03em] text-[#2E3236]">
            Confirma tu pedido
          </div>
          <button
            type="button"
            onClick={closeSheet}
            aria-label="Cerrar"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F4F4F2]"
          >
            <Icon name="close" size={22} className="text-[#2E3236]" />
          </button>
        </div>

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <PointCard
            which="origin"
            title="Dónde recogemos"
            point={draft.origin}
            contactLabel="Quien entrega"
            onChangeLocation={() => beginEditPoint('origin')}
            onChangeContact={(patch) => updatePoint('origin', patch)}
            me={me}
            recents={recents}
          />

          <div className="mt-3">
            <PointCard
              which="destination"
              title="Dónde entregamos"
              point={draft.destination}
              contactLabel="Recibe"
              onChangeLocation={() => beginEditPoint('destination')}
              onChangeContact={(patch) => updatePoint('destination', patch)}
              me={me}
              recents={recents}
            />
          </div>
        </div>

        {/* Fijo abajo: el botón no se pierde al final de una lista larga. */}
        <div className="shrink-0 border-t border-ink/[0.06] bg-surface px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <p
            aria-live="polite"
            className={`mb-2 min-h-[16px] px-1 text-[12px] font-semibold leading-[16px] ${
              missingText ? 'text-[#B45309]' : 'text-transparent'
            }`}
          >
            {missingText ?? 'Todo listo'}
          </p>
          <button
            type="button"
            aria-disabled={!ready}
            onClick={() => (ready ? goTo('trip-payer') : goToFirstMissing())}
            className={`flex h-14 w-full items-center justify-center gap-2 rounded-full font-extrabold text-[16px] transition-[transform,box-shadow] active:scale-[0.98] ${
              ready
                ? 'bg-[linear-gradient(135deg,#F97316,#FB923C)] text-white shadow-[0_10px_24px_-10px_rgba(234,88,12,.55)]'
                : 'bg-[#E8E9EB] text-[#5C6368]'
            }`}
          >
            Continuar
            <Icon name="arrow_forward" size={20} />
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

/** Qué le falta a un contacto, para el aviso de «Continuar». */
function missingOf(point: CourierPoint): string {
  const noName = point.contactName.trim().length === 0
  const noPhone = !isValidPePhone(point.contactPhone)
  if (noName && noPhone) return 'el nombre y el celular'
  return noName ? 'el nombre' : 'el celular'
}

function PointCard({
  which,
  title,
  point,
  contactLabel,
  onChangeLocation,
  onChangeContact,
  me,
  recents,
}: {
  which: CourierEditingPoint
  title: string
  point: CourierPoint
  contactLabel: string
  onChangeLocation: () => void
  onChangeContact: (patch: Partial<CourierPoint>) => void
  /** La persona que está pidiendo: su atajo «Soy yo». `null` si no hay sesión. */
  me: CourierContact | null
  /** Contactos de entregas anteriores, para autocompletar nombre y celular. */
  recents: readonly CourierContact[]
}) {
  const missing = missingPhoneDigits(point.contactPhone)
  const dotColor = which === 'origin' ? 'bg-brand' : 'bg-[#2E3236]'

  return (
    <div className="flex flex-col gap-2.5 rounded-[22px] bg-[#F4F4F2] p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotColor}`} />
          <span className="text-[17px] font-extrabold tracking-[-0.01em] text-[#2E3236]">
            {title}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5">
        <Icon name="location_on" size={18} filled className="text-[#6B7075]" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-[#5C6368]">Ubicación</div>
          <div className="text-[15px] font-bold text-[#2E3236]">Punto en el mapa</div>
        </div>
        <button
          type="button"
          onClick={onChangeLocation}
          className="text-[13px] font-bold text-brand-dark"
        >
          Cambiar
        </button>
      </div>

      <div className="flex items-start gap-3 rounded-2xl bg-white px-3 py-2.5">
        <Icon name="edit_location_alt" size={18} className="mt-0.5 text-[#6B7075]" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-[#5C6368]">Dirección y referencia</div>
          <input
            type="text"
            value={point.referenceText}
            onChange={(e) => onChangeContact({ referenceText: e.target.value })}
            className="w-full border-0 bg-transparent text-[14px] font-semibold text-[#2E3236] outline-none"
          />
        </div>
        {point.referenceText.trim().length > 0 && (
          <Icon name="check_circle" size={18} filled className="mt-0.5 text-success" />
        )}
      </div>

      <ContactChips
        me={me}
        recents={recents}
        current={point}
        onPick={(c) => onChangeContact({ contactName: c.name, contactPhone: c.phone })}
        onClear={() => onChangeContact({ contactName: '', contactPhone: '' })}
      />

      <div className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5">
        <Icon name="badge" size={18} className="text-[#6B7075]" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-[#5C6368]">{contactLabel}</div>
          <input
            type="text"
            value={point.contactName}
            onChange={(e) => onChangeContact({ contactName: e.target.value })}
            placeholder={contactLabel}
            data-contact={`${which}-name`}
            autoComplete="off"
            className="w-full border-0 bg-transparent text-[14px] font-semibold text-[#2E3236] outline-none"
          />
        </div>
        {point.contactName.trim().length > 0 && (
          <Icon name="check_circle" size={18} filled className="text-success" />
        )}
      </div>

      <div className="flex flex-col gap-1 rounded-2xl bg-white px-3 py-2.5">
        <div className="flex items-center gap-3">
          <Icon name="call" size={18} className="text-[#6B7075]" />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-[#5C6368]">Celular</div>
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-semibold text-[#9AA0A6]">+51</span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={point.contactPhone}
                onChange={(e) =>
                  onChangeContact({ contactPhone: stripPeCountryCode(e.target.value) })
                }
                placeholder="987 654 321"
                data-contact={`${which}-phone`}
                className="w-full border-0 bg-transparent text-[14px] font-semibold text-[#2E3236] outline-none"
              />
            </div>
          </div>
        </div>
        {point.contactPhone.trim().length > 0 && missing > 0 && (
          <p className="pl-8 text-[12px] font-bold text-[#DC2626]">
            Faltan {missing} dígito{missing === 1 ? '' : 's'}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Autocompletar quien entrega / quien recibe: «Soy yo» y los contactos de
 * entregas anteriores, como fichas que se activan y se desactivan. No se rellena
 * nada por su cuenta: en un pedido puedes ser quien entrega, quien recibe o
 * ninguno de los dos, y suponerlo mandaría al motorizado a llamar a la persona
 * equivocada. Tocar una ficha activa completa nombre y celular; volver a tocarla
 * la apaga y deja los dos campos vacíos. Lo que se escribe en «nombre» filtra los
 * recientes.
 */
function ContactChips({
  me,
  recents,
  current,
  onPick,
  onClear,
}: {
  me: CourierContact | null
  recents: readonly CourierContact[]
  current: CourierPoint
  onPick: (c: CourierContact) => void
  onClear: () => void
}) {
  const same = (c: CourierContact) =>
    current.contactPhone === c.phone && current.contactName.trim() === c.name.trim()
  const chips = [
    ...(me ? [{ key: 'me', label: 'Soy yo', icon: 'person', contact: me }] : []),
    ...suggestContacts(recents, current.contactName).map((c) => ({
      key: `${c.phone}|${c.name}`,
      label: c.name,
      icon: null,
      contact: c,
    })),
  ]
  if (chips.length === 0) return null

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
      {chips.map((chip) => {
        const active = same(chip.contact)
        return (
          <button
            key={chip.key}
            type="button"
            aria-pressed={active}
            onClick={() => (active ? onClear() : onPick(chip.contact))}
            className={`flex h-10 max-w-[220px] shrink-0 items-center gap-1.5 rounded-full border-2 px-3.5 text-[14px] font-bold transition-colors ${
              active
                ? 'border-brand bg-brand text-white'
                : 'border-transparent bg-white text-[#2E3236]'
            }`}
          >
            {active ? (
              <Icon name="check" size={16} />
            ) : (
              chip.icon && <Icon name={chip.icon} size={16} className="text-brand-dark" />
            )}
            <span className="truncate">{chip.label}</span>
          </button>
        )
      })}
    </div>
  )
}
