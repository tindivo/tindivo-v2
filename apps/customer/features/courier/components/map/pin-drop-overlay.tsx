'use client'

import { ADDRESS_REFERENCE_MAX, AddressReferenceSchema } from '@tindivo/contracts'
import { Button, Icon, Segmented, Spinner, useDialogFocus } from '@tindivo/ui'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { MapMode } from '@/components/map-picker-inner'
import type { PointOption } from '../../lib/point-search'
import type { CourierRoute } from '../../lib/routes'
import type { CourierEditingPoint } from '../../types'
import { PointSearchSheet } from './point-search-sheet'
import { RepeatRoutes } from './repeat-routes'

const COPY: Record<
  CourierEditingPoint,
  {
    title: string
    confirm: string
    placeholder: string
    hint: string
    pill: string
    icon: string
    dot: string
  }
> = {
  origin: {
    title: '¿Dónde recogemos?',
    confirm: 'Confirmar recojo',
    placeholder: 'Ej: puerta azul, frente al mercado',
    hint: 'Ayuda al motorizado: color de la puerta o algo cercano.',
    pill: 'Mueve el mapa hasta la puerta de recojo',
    icon: 'trip_origin',
    dot: 'bg-brand',
  },
  destination: {
    title: '¿Dónde entregamos?',
    confirm: 'Confirmar entrega',
    placeholder: 'Ej: casa celeste, segundo piso',
    hint: 'Ayuda al motorizado: color de la puerta o algo cercano.',
    pill: 'Mueve el mapa hasta la puerta de entrega',
    icon: 'location_on',
    dot: 'bg-[#2E3236]',
  },
}

/**
 * Fijar un punto en el mapa: los controles sobre el `MapCanvas` que ya vive en
 * `CourierMapHost`. NO monta su propio mapa — es la parte "chrome" de lo que en
 * `location-sheet.tsx` (checkout) es una pantalla autocontenida, aquí separada
 * porque el mapa de Entregas no puede remontarse entre pasos.
 *
 * Con `guided` (camino por defecto) la referencia del punto se escribe en el
 * panel de abajo, en la misma pantalla que el pin: es un solo paso por punto.
 * Sin `guided` (camino de negocio) el panel es solo el pin y la referencia va
 * en un paso aparte.
 *
 * Los atajos viven aquí, dentro del pin, y no en una pantalla previa
 * (`Docs/Entregas/ux-entrada/`): la lupa de arriba (lugares, sitios recientes,
 * «Mi dirección») y, en el paso 1, «Repetir una entrega».
 */
export function PinDropOverlay({
  mode,
  onModeChange,
  point,
  guided,
  stepIndex,
  reference,
  onReferenceChange,
  moving,
  settled,
  inside,
  locating,
  locateError,
  onUseMyLocation,
  onConfirm,
  onCancel,
  onPanelHeight,
  routes,
  onRepeat,
  search,
  onPick,
}: {
  mode: MapMode
  onModeChange: (m: MapMode) => void
  point: CourierEditingPoint
  guided: boolean
  /** 1 o 2 mientras se arma la ruta por primera vez; `null` al corregir un punto. */
  stepIndex: 1 | 2 | null
  reference: string
  onReferenceChange: (v: string) => void
  moving: boolean
  settled: boolean
  inside: boolean
  locating: boolean
  locateError: string | null
  onUseMyLocation: () => void
  onConfirm: (reference: string | undefined) => void
  onCancel: () => void
  onPanelHeight: (px: number) => void
  /** Entregas anteriores que se pueden repetir. Solo se ofrecen en el paso 1. */
  routes: readonly CourierRoute[]
  onRepeat: (route: CourierRoute) => void
  /** Las sugerencias de la lupa para lo escrito (ver `searchPoints`). */
  search: (query: string) => PointOption[]
  /** Lleva el pin a la sugerencia elegida y deja su referencia escrita. */
  onPick: (option: PointOption) => void
}) {
  const caja = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [refError, setRefError] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [searching, setSearching] = useState(false)

  // Salir del paso 1 con algo ya escrito pide confirmación; volver del paso 2 al
  // 1 no (no se pierde nada). La identidad tiene que ser fija: `useDialogFocus`
  // re-enfoca el diálogo cada vez que cambia `onClose`.
  const leaveRef = useRef<() => void>(() => {})
  leaveRef.current = () => {
    // Con la búsqueda abierta, Escape (o atrás) la cierra a ella y nada más.
    if (searching) {
      setSearching(false)
      return
    }
    if (guided && stepIndex === 1 && reference.trim().length > 0) setConfirmLeave(true)
    else onCancel()
  }
  const requestLeave = useCallback(() => leaveRef.current(), [])
  useDialogFocus(caja, { open: true, onClose: requestLeave })

  // El mapa termina donde empieza este panel: así el pin queda en el centro de
  // lo que se ve y no debajo de la tarjeta. `CourierMapHost` recorta el mapa a
  // esta altura.
  useLayoutEffect(() => {
    const el = panel.current
    if (!el) return
    const report = () => onPanelHeight(Math.round(el.getBoundingClientRect().height))
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [onPanelHeight])

  const copy = COPY[point]
  const canConfirm = settled && inside && !moving

  function tryConfirm() {
    if (!canConfirm) return
    if (!guided) {
      onConfirm(undefined)
      return
    }
    const parsed = AddressReferenceSchema.safeParse(reference)
    if (!parsed.success) {
      setRefError(parsed.error.issues[0]?.message ?? 'Escribe una referencia')
      input.current?.focus()
      return
    }
    // Sin esto el teclado se queda abierto para el punto siguiente y tapa el mapa.
    input.current?.blur()
    onConfirm(parsed.data)
  }

  const status = locateError
    ? { tone: 'danger', text: locateError }
    : !inside
      ? { tone: 'danger', text: 'Esta ubicación está fuera de la zona de reparto de San Jacinto' }
      : locating
        ? { tone: 'brand', text: 'Buscando tu ubicación…' }
        : moving
          ? { tone: 'brand', text: 'Ubicando…' }
          : settled
            ? { tone: 'success', text: '✓ Dentro de la zona de reparto' }
            : { tone: 'brand', text: 'Mueve el mapa hasta la puerta' }

  return (
    <div
      ref={caja}
      tabIndex={-1}
      /*
       * `pointer-events-none` EN EL CONTENEDOR ENTERO. A diferencia de
       * `location-sheet.tsx`, el mapa NO vive dentro de este div — vive en
       * `CourierMapHost`, un HERMANO por debajo. Sin esto, este `div`
       * transparente de pantalla completa es el elemento más alto en CADA punto
       * de la pantalla y se queda con el `mousedown`/`touchstart` que el
       * arrastre necesita que llegue al Leaflet de abajo. Cada control real
       * (botones, segmented, el panel inferior) reactiva `pointer-events-auto`.
       */
      role="dialog"
      aria-modal="true"
      aria-label="Fijar el punto en el mapa"
      className="pointer-events-none fixed inset-0 z-70 flex flex-col focus:outline-none"
    >
      <div className="relative min-h-0 flex-1">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-[725] h-32"
          style={{
            background: 'linear-gradient(to bottom, rgb(15 23 42 / 0.22), rgb(15 23 42 / 0))',
          }}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-[730] flex items-start gap-2 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={requestLeave}
            aria-label={stepIndex === 2 ? 'Volver al paso 1' : 'Volver sin fijar el punto'}
            className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-ink shadow-elev-3 border border-ink/[0.06] transition-transform active:scale-95"
          >
            <Icon name="arrow_back" size={22} />
          </button>
          {guided && (
            <button
              type="button"
              onClick={() => setSearching(true)}
              className="pointer-events-auto flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-card px-3.5 text-left text-ink-muted shadow-elev-3 border border-ink/[0.06] transition-transform active:scale-[0.98]"
            >
              <Icon name="search" size={20} className="shrink-0" />
              <span className="truncate text-[14px] font-semibold">Buscar un lugar</span>
            </button>
          )}
          <div className="pointer-events-auto ml-auto shrink-0 rounded-[18px] bg-card p-1 shadow-elev-3 border border-ink/[0.06]">
            <Segmented
              size="sm"
              value={mode}
              onChange={onModeChange}
              options={[
                { value: 'street', label: 'Mapa' },
                { value: 'satellite', label: 'Satélite' },
              ]}
            />
          </div>
        </div>

        <div
          className={`pointer-events-none absolute inset-x-0 top-[calc(4.75rem+env(safe-area-inset-top))] z-[600] flex justify-center px-4 transition-opacity duration-200 ${
            moving || settled || locating ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <span className="rounded-full bg-slate-900/[0.92] px-4 py-1.5 text-center font-medium text-[12px] text-white shadow-elev-3 border border-white/10">
            {guided ? copy.pill : 'Mueve el mapa hasta que el pin quede en tu puerta'}
          </span>
        </div>

        <button
          type="button"
          onClick={onUseMyLocation}
          disabled={locating}
          aria-label="Centrar en mi ubicación"
          className="absolute right-4 bottom-4 z-[600] flex h-12 w-12 items-center justify-center rounded-full bg-card text-brand-dark shadow-elev-3 border border-ink/[0.06] transition-transform active:scale-95 disabled:opacity-70"
        >
          {locating ? (
            <Spinner size="xs" variant="brand" />
          ) : (
            <Icon name="near_me" size={22} filled />
          )}
        </button>
      </div>

      <div
        ref={panel}
        className="pointer-events-auto shrink-0 rounded-t-[24px] bg-card px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-16px_40px_-28px_rgba(0,0,0,0.4)]"
      >
        {guided && stepIndex === 1 && point === 'origin' && routes.length > 0 && (
          <RepeatRoutes routes={routes} onRepeat={onRepeat} />
        )}
        {guided && stepIndex && (
          // Alto fijo en los dos pasos: la flecha solo existe en el 2, y si la
          // fila cambiara de alto el mapa se re-mediría al pasar de A a B.
          <div className="-mt-1 mb-0.5 flex h-9 items-center gap-1">
            {stepIndex === 2 && (
              <button
                type="button"
                onClick={onCancel}
                aria-label="Volver al recojo"
                className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-ink transition-colors active:bg-ink/[0.06]"
              >
                <Icon name="arrow_back" size={20} />
              </button>
            )}
            <p className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              <span aria-hidden className={`h-2 w-2 rounded-full ${copy.dot}`} />
              Paso {stepIndex} de 2
            </p>
          </div>
        )}
        <p className="font-display font-extrabold text-[20px] leading-tight tracking-tight text-ink">
          {guided
            ? copy.title
            : moving
              ? 'Ubicando…'
              : settled
                ? '¿El pin está en tu puerta?'
                : 'Arrastra el mapa'}
        </p>

        <div className="mt-1 flex min-h-[18px] items-center gap-1.5 font-mono text-[11px]">
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
              status.tone === 'danger'
                ? 'bg-danger'
                : status.tone === 'success'
                  ? 'bg-success'
                  : 'bg-brand-dark'
            }`}
          />
          <span
            aria-live="polite"
            className={`truncate font-semibold ${
              status.tone === 'danger'
                ? 'text-danger'
                : status.tone === 'success'
                  ? 'text-success'
                  : 'text-brand-dark'
            }`}
          >
            {status.text}
          </span>
        </div>

        {guided && (
          <div className="mt-3">
            <label
              className={`flex h-12 items-center gap-2.5 rounded-2xl border-2 bg-white px-3.5 transition-colors ${
                refError ? 'border-danger' : 'border-ink/10 focus-within:border-ink/40'
              }`}
            >
              <Icon name={copy.icon} size={20} className="shrink-0 text-ink-muted" />
              <input
                ref={input}
                type="text"
                value={reference}
                maxLength={ADDRESS_REFERENCE_MAX}
                enterKeyHint="done"
                autoComplete="off"
                aria-label="Dirección y referencia"
                aria-invalid={refError ? true : undefined}
                placeholder={copy.placeholder}
                onChange={(e) => {
                  onReferenceChange(e.target.value)
                  if (refError) setRefError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    tryConfirm()
                  }
                }}
                className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-ink-muted/70"
              />
            </label>
            {/* Alto fijo: el aviso reemplaza a la pista sin mover el mapa de arriba. */}
            <p
              role={refError ? 'alert' : undefined}
              className={`mt-1.5 min-h-[16px] px-1 text-[12px] leading-[16px] ${
                refError ? 'font-bold text-danger' : 'font-medium text-ink-muted'
              }`}
            >
              {refError ?? copy.hint}
            </p>
          </div>
        )}

        <Button
          type="button"
          variant="brand"
          className="mt-3 w-full"
          disabled={!canConfirm}
          onClick={tryConfirm}
        >
          {!settled
            ? 'Mueve el mapa para marcar el punto'
            : !inside
              ? 'Muévelo dentro de la zona'
              : guided
                ? copy.confirm
                : 'Confirmar ubicación'}
        </Button>
      </div>

      {searching && (
        <PointSearchSheet
          point={point}
          search={search}
          onPick={(o) => {
            setSearching(false)
            setRefError(null)
            onPick(o)
          }}
          onClose={() => setSearching(false)}
        />
      )}

      {confirmLeave && (
        <LeaveConfirm
          onStay={() => setConfirmLeave(false)}
          onLeave={() => {
            setConfirmLeave(false)
            onCancel()
          }}
        />
      )}
    </div>
  )
}

function LeaveConfirm({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="¿Salir sin pedir?"
      className="pointer-events-auto fixed inset-0 z-[900] flex items-end justify-center bg-ink/40 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-t-[28px] bg-white p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-elev-3">
        <div className="text-[19px] font-extrabold tracking-[-0.02em] text-[#2E3236]">
          ¿Salir sin pedir?
        </div>
        <p className="mt-1.5 text-[14px] leading-snug text-[#5C6368]">
          Perderás lo que ya escribiste.
        </p>
        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={onStay}
            className="h-13 flex-1 rounded-full bg-[#F4F4F2] text-[15px] font-extrabold text-[#2E3236]"
          >
            Seguir aquí
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="h-13 flex-1 rounded-full bg-[linear-gradient(135deg,#F97316,#FB923C)] text-[15px] font-extrabold text-white"
          >
            Salir
          </button>
        </div>
      </div>
    </div>
  )
}
