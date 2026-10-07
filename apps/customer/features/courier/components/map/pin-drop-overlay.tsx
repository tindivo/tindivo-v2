'use client'

import { ADDRESS_REFERENCE_MAX, AddressReferenceSchema } from '@tindivo/contracts'
import { Button, Icon, Segmented, Spinner, useDialogFocus } from '@tindivo/ui'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MapMode } from '@/components/map-picker-inner'
import type { PointOption } from '../../lib/point-search'
import type { CourierRoute } from '../../lib/routes'
import type { CourierEditingPoint } from '../../types'
import { MAX_SUGGESTIONS, PointSuggestions } from './point-suggestions'
import { RepeatRoutesSheet } from './repeat-routes'

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
  backLeavesFlow,
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
  searchReady,
  searchFailed,
  home,
  originLabel,
  onPick,
}: {
  mode: MapMode
  onModeChange: (m: MapMode) => void
  point: CourierEditingPoint
  guided: boolean
  /** 1 (recojo) o 2 (entrega) en el camino por defecto; `null` en el camino de negocio. */
  stepIndex: 1 | 2 | null
  /** Atrás desde aquí sale del pedido (A, armando la ruta): pide confirmar si hay algo escrito. */
  backLeavesFlow: boolean
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
  /** `false` mientras se cargan los sitios recientes de quien pide. */
  searchReady: boolean
  searchFailed: boolean
  /**
   * En el paso de la entrega, de dónde se recoge («Recogemos en Botica San
   * José»): B arranca en tu ubicación y A puede quedar fuera de la pantalla.
   */
  originLabel: string | null
  /** «Mi dirección», a la vista en el paso de la entrega. `null` si no tiene. */
  home: PointOption | null
  /** Lleva el pin a la sugerencia elegida y deja su referencia escrita. */
  onPick: (option: PointOption) => void
}) {
  const caja = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [refError, setRefError] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [searching, setSearching] = useState(false)
  const [showRoutes, setShowRoutes] = useState(false)
  // «Ver anteriores» solo en el paso 1, al armar la ruta por primera vez.
  const canRepeat = stepIndex === 1 && point === 'origin' && routes.length > 0
  const lupa = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const suggestions = useMemo(() => search(query).slice(0, MAX_SUGGESTIONS), [search, query])
  // Al pasar de A a B el buscador vuelve a empezar vacío.
  const [queryFor, setQueryFor] = useState(point)
  if (queryFor !== point) {
    setQueryFor(point)
    setQuery('')
  }

  // Cerrar la búsqueda es soltar el campo: el desplegable vive mientras el
  // campo tiene el foco (y en el celular, el teclado se va con él).
  function closeSearch() {
    setQuery('')
    lupa.current?.blur()
  }

  // Salir del paso 1 con algo ya escrito pide confirmación; volver del paso 2 al
  // 1 no (no se pierde nada). La identidad tiene que ser fija: `useDialogFocus`
  // re-enfoca el diálogo cada vez que cambia `onClose`.
  const leaveRef = useRef<() => void>(() => {})
  leaveRef.current = () => {
    // Con «Entregas anteriores» o la búsqueda abiertas, Escape (o atrás) las
    // cierra a ellas y nada más.
    if (showRoutes) {
      setShowRoutes(false)
      return
    }
    if (searching) {
      closeSearch()
      return
    }
    if (backLeavesFlow && reference.trim().length > 0) setConfirmLeave(true)
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
          {/* Exento del guardarraíl del design system (`pnpm check:ds`): es un
              control que FLOTA sobre el mapa, blanco y con sombra para leerse
              sobre cualquier calle, y `IconButton` no tiene esa superficie
              (su `filled` es gris tenue, pensado para fondos lisos). */}
          <button
            type="button"
            onClick={requestLeave}
            aria-label={
              stepIndex === 2
                ? 'Volver al paso 1'
                : backLeavesFlow
                  ? 'Volver sin fijar el punto'
                  : 'Volver a los detalles'
            }
            className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-ink shadow-elev-3 border border-ink/[0.06] transition-transform active:scale-95"
          >
            <Icon name="arrow_back" size={22} />
          </button>
          {guided && (
            <div className="pointer-events-auto relative min-w-0 flex-1">
              <label className="flex h-11 items-center gap-2 rounded-full border border-ink/[0.06] bg-card px-3.5 shadow-elev-3">
                <Icon name="search" size={20} className="shrink-0 text-ink-muted" />
                <input
                  ref={lupa}
                  type="text"
                  role="combobox"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setSearching(true)}
                  onBlur={() => setSearching(false)}
                  enterKeyHint="search"
                  autoComplete="off"
                  aria-label="Buscar un lugar"
                  aria-expanded={searching}
                  aria-controls="sugerencias-del-pin"
                  aria-autocomplete="list"
                  placeholder="Buscar un lugar"
                  className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-semibold text-ink outline-none placeholder:font-semibold placeholder:text-ink-muted"
                />
                {query && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setQuery('')}
                    aria-label="Borrar la búsqueda"
                    className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted"
                  >
                    <Icon name="close" size={18} />
                  </button>
                )}
              </label>
              {searching && (
                <PointSuggestions
                  id="sugerencias-del-pin"
                  options={suggestions}
                  typed={query.trim().length > 0}
                  ready={searchReady}
                  failed={searchFailed}
                  onPick={(o) => {
                    closeSearch()
                    setRefError(null)
                    onPick(o)
                  }}
                />
              )}
            </div>
          )}
          {/* Mientras se busca, el campo se queda con todo el ancho. */}
          <div
            className={`pointer-events-auto ml-auto shrink-0 rounded-[18px] bg-card p-1 shadow-elev-3 border border-ink/[0.06] ${
              searching ? 'hidden' : ''
            }`}
          >
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

        {/* `pointer-events-auto`: la capa entera es `pointer-events-none` (ver
            arriba) y este botón no lo reactivaba, así que el toque lo
            atravesaba y le llegaba al mapa. Nunca funcionó, y ningún e2e lo
            tocaba. Con texto, no solo la flecha: la flecha sola no decía qué
            hacía. */}
        <Button
          type="button"
          variant="outline"
          onClick={onUseMyLocation}
          disabled={locating}
          className="pointer-events-auto absolute right-4 bottom-4 z-[600] gap-1.5 pr-4 pl-3 shadow-elev-3"
        >
          {locating ? (
            <Spinner size="xs" variant="brand" />
          ) : (
            <Icon name="near_me" size={20} filled />
          )}
          {locating ? 'Buscando…' : 'Mi ubicación'}
        </Button>
      </div>

      {/* En el celular, el panel ocupa todo el ancho. En una pantalla ancha, se
          centra con el MISMO ancho máximo que las hojas de la app
          (`BottomSheet`, 768 px): los tres pasos se ven igual. A los costados
          se ve el mapa, que sigue detrás (ver `CourierMapHost`), y el envoltorio
          no captura toques para que ahí se pueda arrastrar. */}
      <div ref={panel} className="shrink-0">
        <div className="pointer-events-auto mx-auto w-full max-w-[768px] rounded-t-[24px] bg-card px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-16px_40px_-28px_rgba(0,0,0,0.4)]">
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
                {/* «Ubicación», no «Paso»: «Paso 2 de 2» hacía creer que ahí
                  terminaba, y después viene «Detalles». */}
                Ubicación {stepIndex} de 2
              </p>
              {/* El atajo de cada paso, en la esquina de la fila (alto fijo): no
                suma alto al panel ni encoge el mapa si no se usa. */}
              {canRepeat && (
                <button
                  type="button"
                  onClick={() => setShowRoutes(true)}
                  aria-haspopup="dialog"
                  className="-mr-2 ml-auto flex h-11 items-center gap-1 px-2 text-[13px] font-bold text-[#1D4ED8]"
                >
                  <Icon name="history" size={18} />
                  Ver anteriores ({routes.length})
                </button>
              )}
              {stepIndex === 2 && home && point === 'destination' && (
                <button
                  type="button"
                  onClick={() => {
                    setRefError(null)
                    onPick(home)
                  }}
                  className="-mr-2 ml-auto flex h-11 items-center gap-1 px-2 text-[13px] font-bold text-[#1D4ED8]"
                >
                  <Icon name="home" size={18} />
                  Usar mi dirección
                </button>
              )}
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

          {guided && point === 'destination' && originLabel && (
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] font-semibold text-ink-muted">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-brand" />
              <span className="truncate">Recojo: {originLabel}</span>
            </p>
          )}

          {/* Una instrucción tranquila, no una alerta: sin monoespaciada ni
            mayúsculas; el rojo queda solo para lo que de verdad falla. */}
          <div className="mt-1 flex min-h-[20px] items-center gap-1.5 text-[13px]">
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
                    : 'text-ink-muted'
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
      </div>

      <RepeatRoutesSheet
        open={showRoutes}
        routes={routes}
        onRepeat={(r) => {
          setShowRoutes(false)
          onRepeat(r)
        }}
        onClose={() => setShowRoutes(false)}
      />

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
