'use client'

import { BottomSheet, Icon } from '@tindivo/ui'
import { useEffect } from 'react'
import { getCurrentPositionHA } from '@/lib/geolocation'
import { useCourierStore } from '../lib/store'
import type { CourierEditingPoint, CourierPoint } from '../types'

const ROW_STYLE: Record<CourierEditingPoint, { accent: string; ring: string; dot: string }> = {
  origin: {
    accent: 'text-brand-dark',
    ring: 'border-brand shadow-[0_0_0_4px_rgba(249,115,22,.18)]',
    dot: 'bg-brand',
  },
  destination: {
    accent: 'text-[#2E3236]',
    ring: 'border-[#2E3236] shadow-[0_0_0_4px_rgba(46,50,54,.1)]',
    dot: 'bg-[#2E3236]',
  },
}

function isComplete(point: CourierPoint) {
  return point.coordinates != null && point.referenceText.trim().length > 0
}

/**
 * Tu ruta: la tarjeta de entrada del flujo (reemplaza el buscador de negocio
 * como default). Punto A activo desde que se abre — punto B se habilita
 * recién cuando A queda completo (coordenada + texto). Sin geocoding: el
 * ÚNICO textbox de cada fila es "dirección y referencia" a la vez, no hay
 * paso aparte para escribirla (ver `confirmPinDrop` en el store).
 */
export function TripSheet() {
  const open = useCourierStore((s) => s.open && s.step === 'trip')
  const closeSheet = useCourierStore((s) => s.closeSheet)
  const activePoint = useCourierStore((s) => s.activeTripPoint)
  const draft = useCourierStore((s) => s.draft)
  const updatePoint = useCourierStore((s) => s.updatePoint)
  const beginEditPoint = useCourierStore((s) => s.beginEditPoint)
  const advanceTripPoint = useCourierStore((s) => s.advanceTripPoint)
  const focusTripPoint = useCourierStore((s) => s.focusTripPoint)

  const destinationDone = isComplete(draft.destination)
  // B está "bloqueado" (sin abrir todavía) solo mientras A sigue activo y B
  // nunca se completó — si ya se completó una vez, volver a A (para
  // ajustarlo) no debe esconder lo que ya se hizo en B.
  const destinationLocked = activePoint === 'origin' && !destinationDone

  // El punto A parte cargado en la ubicación actual, en cuanto se abre el
  // flujo — sin esperar a que toquen "Escoge en el mapa". Sigue siendo
  // ajustable (el pin se puede arrastrar desde ahí), esto solo evita el tap
  // de más cuando el recojo es, como casi siempre, donde la persona ya está.
  // Se relee `useCourierStore.getState()` al resolver el GPS —no `draft` del
  // closure— porque si mientras tanto ya se fijó el punto a mano (tocando
  // "Escoge en el mapa" antes de que llegue la respuesta), la ubicación
  // automática NO debe pisar la que la persona ya eligió.
  useEffect(() => {
    if (!open || draft.origin.coordinates != null) return
    let cancelado = false
    getCurrentPositionHA()
      .then((fix) => {
        if (cancelado) return
        if (useCourierStore.getState().draft.origin.coordinates != null) return
        updatePoint('origin', {
          coordinates: { lat: fix.lat, lng: fix.lng },
          accuracyM: Math.round(fix.accuracyM),
        })
      })
      .catch(() => {
        // Sin permiso o sin señal: se queda sin punto, a elegirlo a mano con
        // "Escoge en el mapa" — no era un pedido explícito, no hace falta avisar.
      })
    return () => {
      cancelado = true
    }
  }, [open, draft.origin.coordinates, updatePoint])

  return (
    <BottomSheet open={open} onClose={closeSheet} label="Tu ruta" scrim={false}>
      <div className="flex max-h-[80dvh] flex-col overflow-y-auto px-4 pb-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[28px] font-extrabold tracking-[-0.03em] text-[#2E3236]">
            Tu ruta
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

        <div className="flex flex-col gap-3">
          <TripRow
            which="origin"
            label="Recogemos en"
            icon="trip_origin"
            point={draft.origin}
            active={activePoint === 'origin'}
            locked={false}
            onChangeText={(text) => updatePoint('origin', { referenceText: text })}
            onOpenMap={() => beginEditPoint('origin')}
            onReady={advanceTripPoint}
            onFocus={() => focusTripPoint('origin')}
          />

          <TripRow
            which="destination"
            label="Llevamos a"
            icon="location_on"
            point={draft.destination}
            active={activePoint === 'destination'}
            locked={destinationLocked}
            onChangeText={(text) => updatePoint('destination', { referenceText: text })}
            onOpenMap={() => beginEditPoint('destination')}
            onReady={advanceTripPoint}
            onFocus={() => focusTripPoint('destination')}
          />
        </div>
      </div>
    </BottomSheet>
  )
}

function TripRow({
  which,
  label,
  icon,
  point,
  active,
  locked,
  onChangeText,
  onOpenMap,
  onReady,
  onFocus,
}: {
  which: CourierEditingPoint
  label: string
  icon: string
  point: CourierPoint
  active: boolean
  locked: boolean
  onChangeText: (text: string) => void
  onOpenMap: () => void
  onReady: () => void
  onFocus: () => void
}) {
  const style = ROW_STYLE[which]
  const hasPin = point.coordinates != null
  const ready = hasPin && point.referenceText.trim().length > 0

  if (locked) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-[#F4F4F2]/60 px-3.5 py-3.5 opacity-60">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-[#5C6368]">{label}</div>
          <div className="text-[14px] font-medium text-[#5C6368]">Completa el punto A primero</div>
        </div>
        <Icon name={icon} size={20} className="text-[#9AA0A6]" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" onClick={onFocus} className="flex items-center gap-2 px-0.5 text-left">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
        <span className="text-[12px] font-semibold text-[#5C6368]">{label}</span>
      </button>

      {active ? (
        <>
          <div
            className={`flex items-center gap-2.5 rounded-2xl border-2 bg-white px-3.5 py-3 transition-[box-shadow,border-color] ${style.ring}`}
          >
            {/* Circulo hueco, no un pin lleno: es el mismo lenguaje que ya usa
                el pin de origen en el mapa (Google Maps lo hace igual) — un
                punto de partida se lee distinto de un destino marcado. */}
            <Icon name={icon} size={20} className={style.accent} />
            <input
              type="text"
              value={point.referenceText}
              onChange={(e) => onChangeText(e.target.value)}
              placeholder="Escriba dirección y referencia aquí…"
              // biome-ignore lint/a11y/noAutofocus: pedido explícito — que se note que hay que escribir apenas se activa la fila
              autoFocus
              className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-semibold text-[#2E3236] outline-none placeholder:font-semibold placeholder:text-[#6B7075]"
            />
          </div>
          <div className="flex items-center justify-between gap-2 px-0.5">
            <button
              type="button"
              onClick={onOpenMap}
              className={`flex items-center gap-1.5 text-[13px] font-bold ${style.accent}`}
            >
              <Icon name="pin_drop" size={16} className={style.accent} />
              {hasPin ? 'Ajustar en el mapa' : 'Escoge en el mapa'}
            </button>
            {ready && (
              <button
                type="button"
                onClick={onReady}
                className="flex items-center gap-1.5 rounded-full bg-[linear-gradient(135deg,#F97316,#FB923C)] px-4 py-1.5 text-[13px] font-extrabold text-white shadow-[0_6px_16px_-8px_rgba(234,88,12,.6)]"
              >
                <Icon name="check" size={16} />
                Listo
              </button>
            )}
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={onFocus}
          className="flex items-center gap-2.5 rounded-2xl border-2 border-transparent bg-white px-3.5 py-3 text-left shadow-[0_1px_2px_rgba(46,50,54,.06)]"
        >
          <Icon name="check_circle" size={20} filled className="text-success" />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#2E3236]">
            {point.referenceText}
          </span>
          <span className="shrink-0 text-[13px] font-bold text-brand-dark">Editar</span>
        </button>
      )}
    </div>
  )
}
