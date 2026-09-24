'use client'

import { Button, Icon, Segmented, Spinner, useDialogFocus } from '@tindivo/ui'
import { useRef } from 'react'
import type { MapMode } from '@/components/map-picker-inner'

/**
 * Pedir-2 · Fijar en el mapa: los controles sobre el `MapCanvas` que ya vive
 * en `CourierMapHost`. NO monta su propio mapa — es la parte "chrome" de lo
 * que en `location-sheet.tsx` (checkout) es una pantalla autocontenida, aquí
 * separada porque el mapa de Entregas no puede remontarse entre pasos.
 */
export function PinDropOverlay({
  mode,
  onModeChange,
  coach,
  onDismissCoach,
  moving,
  settled,
  inside,
  locating,
  locateError,
  onUseMyLocation,
  onConfirm,
  onCancel,
}: {
  mode: MapMode
  onModeChange: (m: MapMode) => void
  coach: boolean
  onDismissCoach: () => void
  moving: boolean
  settled: boolean
  inside: boolean
  locating: boolean
  locateError: string | null
  onUseMyLocation: () => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const caja = useRef<HTMLDivElement>(null)
  useDialogFocus(caja, { open: true, onClose: onCancel })

  return (
    <div
      ref={caja}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Fijar el punto en el mapa"
      /*
       * `pointer-events-none` EN EL CONTENEDOR ENTERO. A diferencia de
       * `location-sheet.tsx`, el mapa NO vive dentro de este div — vive en
       * `CourierMapHost`, un HERMANO por debajo (z-0). Sin esto, este `div`
       * transparente de pantalla completa (z-70) es el elemento más alto en
       * CADA punto de la pantalla y se queda con el `mousedown`/`touchstart`
       * que el arrastre necesita que llegue al Leaflet de abajo — verificado
       * con `document.elementFromPoint`. Cada control real (botones,
       * segmented, la tarjeta inferior) reactiva `pointer-events-auto` por su
       * cuenta.
       */
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
            onClick={onCancel}
            aria-label="Volver sin fijar el punto"
            className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-ink shadow-elev-3 border border-ink/[0.06] transition-transform active:scale-95"
          >
            <Icon name="arrow_back" size={22} />
          </button>
          <div className="pointer-events-auto ml-auto rounded-[18px] bg-card p-1 shadow-elev-3 border border-ink/[0.06]">
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
            moving || coach ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <span className="rounded-full bg-slate-900/[0.92] px-4 py-1.5 text-center font-medium text-[12px] text-white shadow-elev-3 border border-white/10">
            Mueve el mapa hasta que el pin quede en tu puerta
          </span>
        </div>

        <button
          type="button"
          onClick={onUseMyLocation}
          disabled={locating}
          aria-label="Centrar en mi ubicación"
          className="absolute right-4 bottom-4 z-[600] flex h-12 w-12 items-center justify-center rounded-full bg-card text-brand-dark shadow-elev-3 border border-ink/[0.06] transition-transform active:scale-95 disabled:opacity-70"
        >
          {locating ? <Spinner size="xs" variant="brand" /> : <Icon name="my_location" size={22} />}
        </button>

        {coach && (
          <div className="pointer-events-none absolute inset-0 z-[720] flex select-none flex-col items-center justify-center gap-3.5 bg-ink/[0.66] px-8 text-center">
            <svg width="112" height="74" viewBox="0 0 112 74" fill="none" aria-hidden="true">
              <title>El mapa se mueve, el pin se queda</title>
              <g
                stroke="rgba(255,255,255,.85)"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 37H2" />
                <path d="M7 31l-5 6 5 6" />
                <path d="M98 37h12" />
                <path d="M105 31l5 6-5 6" />
              </g>
              <rect
                x="26"
                y="7"
                width="60"
                height="60"
                rx="10"
                fill="rgba(255,255,255,.14)"
                stroke="rgba(255,255,255,.85)"
                strokeWidth="2.4"
              />
              <g stroke="rgba(255,255,255,.42)" strokeWidth="2">
                <path d="M26 27h60" />
                <path d="M26 49h60" />
                <path d="M46 7v60" />
                <path d="M68 7v60" />
              </g>
              <g transform="translate(43 12) scale(0.76)">
                <path
                  d="M17 2C9.3 2 3 8.2 3 15.9 3 26 17 42 17 42s14-16.1 14-26.1C31 8.2 24.7 2 17 2z"
                  fill="#f97316"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                />
                <circle cx="17" cy="16" r="5" fill="#ffffff" />
              </g>
            </svg>

            <h2 className="font-display font-extrabold text-[22px] text-white leading-[1.2] tracking-tight text-balance">
              Arrastra el mapa hasta que el pin quede en tu puerta
            </h2>
            <p className="text-[14px] text-white/75 leading-snug text-pretty">
              El pin no se mueve: se mueve el mapa por debajo. Pellizca para acercar.
            </p>

            <button
              type="button"
              onClick={onDismissCoach}
              className="pointer-events-auto mt-1 inline-flex h-[46px] items-center justify-center rounded-full bg-white px-8 font-extrabold text-[15px] text-ink transition-transform active:scale-[0.97]"
            >
              Entendido
            </button>
          </div>
        )}
      </div>

      <div className="pointer-events-auto shrink-0 rounded-t-[24px] bg-card px-4 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-16px_40px_-28px_rgba(0,0,0,0.4)]">
        <p className="font-display font-bold text-[17px] leading-tight text-ink">
          {moving ? 'Ubicando…' : settled ? '¿El pin está en tu puerta?' : 'Arrastra el mapa'}
        </p>

        <div className="mt-1 flex min-h-[18px] items-center gap-1.5 font-mono text-[11px]">
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
              locateError || !inside ? 'bg-danger' : settled ? 'bg-success' : 'bg-brand-dark'
            }`}
          />
          <span
            className={`truncate ${
              locateError || !inside
                ? 'text-danger'
                : settled
                  ? 'font-semibold text-success'
                  : 'font-semibold text-brand-dark'
            }`}
          >
            {locateError
              ? locateError
              : !inside
                ? 'Esta ubicación está fuera de la zona de reparto de San Jacinto'
                : !settled
                  ? 'Aún no marcas el punto'
                  : '✓ Dentro de la zona de reparto'}
          </span>
        </div>

        <Button
          type="button"
          variant="brand"
          className="mt-3 w-full"
          disabled={!inside || moving || !settled}
          onClick={onConfirm}
        >
          {!settled
            ? 'Arrastra el mapa para marcar el punto'
            : inside
              ? 'Confirmar ubicación'
              : 'Muévelo dentro de la zona'}
        </Button>
      </div>
    </div>
  )
}
