'use client'

import { BottomSheet, Button, Icon, Spinner } from '@tindivo/ui'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { distanceMeters, isInsideCoverage, SAN_JACINTO_CENTER } from '@/lib/geo'

const MapPicker = dynamic(() => import('./map-picker-inner'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-ink/[0.06]" />,
})

export interface CapturedAddress {
  lat: number
  lng: number
  /** Metros del sensor, o `null` si el pin lo movió una persona. */
  accuracyM: number | null
  /** Solo si el motorizado la mejoró. */
  reference?: string
}

type Coords = { lat: number; lng: number }

/**
 * El motorizado apunta dónde está la casa (spec del motorizado, `PENDIENTES.md`).
 *
 * SOLO PARA PEDIDOS MANUALES. Un pedido B2C trae la dirección de la libreta del
 * cliente, que es otra tabla y no es del negocio; el RPC lo rechaza igualmente.
 *
 * LOS TRES DEFECTOS DEL LEGACY QUE NO SE PORTAN (medidos):
 *
 *   1. GPS FALLA → EL PIN NO SE GUARDA SOLO. El legacy plantaba el pin en el
 *      centro del pueblo y dejaba "Confirmar" habilitado: 18 direcciones falsas,
 *      una con 9 entregas. Aquí, si el sensor falla, el mapa se centra en el
 *      pueblo para orientar PERO el botón queda bloqueado hasta que la persona
 *      toque el mapa. Centrar es "mirá por aquí"; guardar exige un gesto.
 *   2. `accuracy: 0` HARDCODEADO. Destruyó la precisión de 49 filas. Aquí la
 *      precisión es la del sensor, y si el pin se mueve pasa a `null` — porque
 *      deja de ser una medición y pasa a ser una decisión.
 *   3. EL CENTINELA 999. El legacy mandaba 999 cuando no había medida. Aquí eso
 *      es `null`, y el RPC rechaza tanto el 0 como el 999.
 *
 * NUNCA BLOQUEA LA ENTREGA. Siempre se puede omitir: el pedido se entrega igual
 * y la dirección se queda sin GPS, que es lo que ya pasa hoy.
 */
export function AddressCaptureSheet({
  initialLat,
  initialLng,
  initialReference,
  /** El pedido apunta a una fila del directorio. Sin ella solo se corrige este
   *  pedido, y conviene decirlo antes de que el motorizado se moleste. */
  hasDirectoryRow,
  busy,
  onConfirm,
  onSkip,
}: {
  initialLat: number | null
  initialLng: number | null
  initialReference: string | null
  hasDirectoryRow: boolean
  busy: boolean
  onConfirm: (captured: CapturedAddress) => void
  onSkip: () => void
}) {
  const hasInitial = initialLat != null && initialLng != null

  /** Punto que se va a guardar. `null` = todavía no hay ninguno válido. */
  const [coords, setCoords] = useState<Coords | null>(
    hasInitial ? { lat: initialLat as number, lng: initialLng as number } : null,
  )
  /** Lo que dijo el sensor, para saber si el pin se movió después. */
  const [sensor, setSensor] = useState<{ coords: Coords; accuracyM: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [reference, setReference] = useState(initialReference ?? '')
  const [outOfZone, setOutOfZone] = useState(false)

  const askedOnce = useRef(false)

  const applySensor = useCallback((lat: number, lng: number, accuracyM: number) => {
    setSensor({ coords: { lat, lng }, accuracyM })
    setCoords({ lat, lng })
    setOutOfZone(!isInsideCoverage(lat, lng))
  }, [])

  const locate = useCallback(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setGpsError('Este teléfono no comparte ubicación.')
      return
    }
    setLocating(true)
    setGpsError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        applySensor(pos.coords.latitude, pos.coords.longitude, Math.round(pos.coords.accuracy))
      },
      () => {
        setLocating(false)
        // NO se planta un pin. El mapa se centrará en el pueblo para orientar,
        // pero `coords` sigue en null y el botón de guardar sigue bloqueado.
        setGpsError('No se pudo leer el GPS. Movés el pin a mano y listo.')
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    )
  }, [applySensor])

  // Al abrir: si el pedido ya trae coordenada, se respeta y NO se pide GPS —
  // esto es un ajuste, no una captura. Si no trae, se pide una vez.
  useEffect(() => {
    if (askedOnce.current) return
    askedOnce.current = true
    if (!hasInitial) locate()
  }, [hasInitial, locate])

  /** Mover el pin convierte la medición en una decisión: la precisión del
   *  sensor deja de describir este punto. Umbral de 10 m para no castigar el
   *  temblor de un dedo sobre el propio pin. */
  const movedByHand =
    sensor !== null && coords !== null && distanceMeters(sensor.coords, coords) > 10

  const accuracyToSave = sensor === null || movedByHand ? null : sensor.accuracyM

  const refTrimmed = reference.trim()
  const refChanged = refTrimmed !== (initialReference ?? '').trim()
  const refValid = refTrimmed.length === 0 || refTrimmed.length >= 5

  const canSave = coords !== null && !outOfZone && refValid && !busy

  return (
    <BottomSheet open onClose={onSkip}>
      <div className="flex items-center gap-2 px-1 pb-2">
        <Icon name="my_location" size={20} filled className="text-brand" />
        <h2 className="flex-1 font-display text-lg font-bold text-ink">
          {hasInitial ? 'Ajustar la ubicación' : '¿Dónde queda la casa?'}
        </h2>
      </div>

      <p className="px-1 pb-3 text-[13px] text-ink-muted">
        {hasInitial
          ? 'Movés el pin si el que está guardado no es exacto.'
          : 'Esta dirección no tiene ubicación guardada. Si la marcás ahora, la próxima vez sale sola.'}
      </p>

      {/* MAPA. Se centra en el pueblo cuando no hay punto, solo para orientar:
          mientras `coords` sea null el botón de guardar está bloqueado. */}
      <div className="relative h-[260px] overflow-hidden rounded-2xl border border-border">
        <MapPicker
          lat={coords?.lat ?? SAN_JACINTO_CENTER.lat}
          lng={coords?.lng ?? SAN_JACINTO_CENTER.lng}
          onPick={(lat, lng) => {
            setCoords({ lat, lng })
            setOutOfZone(!isInsideCoverage(lat, lng))
          }}
        />
        {coords === null && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-ink/75 px-3 py-2 text-center text-[12px] font-semibold text-white">
            Tocá el mapa donde estás parado
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={locate}
        disabled={locating || busy}
        className="mt-2.5 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand/10 text-[14px] font-bold text-brand transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {locating ? <Spinner size="sm" variant="brand" /> : <Icon name="my_location" size={18} />}
        {locating ? 'Buscando señal…' : 'Usar mi ubicación actual'}
      </button>

      {/* Estado de la precisión. Se dice la verdad en los tres casos, porque de
          esto depende que alguien confíe o no en el pin la próxima vez. */}
      <div className="mt-2 px-1 text-[12px]">
        {gpsError && (
          <p className="flex items-start gap-1 text-warning">
            <Icon name="gps_off" size={14} filled className="mt-px shrink-0" />
            <span>{gpsError}</span>
          </p>
        )}
        {!gpsError && sensor !== null && !movedByHand && (
          <p className="flex items-center gap-1 text-ink-muted">
            <Icon name="radar" size={14} />
            Precisión del GPS: ~{sensor.accuracyM} m
            {sensor.accuracyM > 50 && ' · si el pin no está en la puerta, movelo'}
          </p>
        )}
        {movedByHand && (
          <p className="flex items-center gap-1 text-ink-muted">
            <Icon name="pan_tool" size={14} />
            Pin movido a mano — se guarda sin precisión de GPS.
          </p>
        )}
      </div>

      {outOfZone && (
        <p className="mt-2 flex items-start gap-1 rounded-xl bg-danger-soft px-3 py-2 text-[12px] font-semibold text-danger">
          <Icon name="error" size={14} filled className="mt-px shrink-0" />
          <span>Ese punto está fuera de San Jacinto. Movelo dentro del pueblo.</span>
        </p>
      )}

      {/* Mejorar la referencia. La que escribió la cajera la dictó el cliente por
          teléfono; el que está en la puerta ve lo que de verdad orienta. */}
      <div className="mt-3">
        <label
          htmlFor="mejor-referencia"
          className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted"
        >
          Mejorar la referencia (opcional)
        </label>
        <textarea
          id="mejor-referencia"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Portón verde, frente al parque"
          className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-[14px] text-ink outline-none focus:border-brand"
        />
        {!refValid && (
          <p className="mt-1 text-[11px] text-danger">
            Si la cambiás, que tenga al menos 5 caracteres.
          </p>
        )}
      </div>

      {!hasDirectoryRow && (
        <p className="mt-2 flex items-start gap-1 px-1 text-[11px] text-ink-muted">
          <Icon name="info" size={13} className="mt-px shrink-0" />
          <span>
            Este pedido no está ligado a una dirección guardada (se creó sin teléfono), así que esto
            corrige solo este pedido.
          </span>
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          className="h-12 flex-1 cursor-pointer rounded-full border border-ink/[0.12] bg-card text-[15px] font-semibold text-ink transition-colors hover:bg-ink/[0.04] disabled:opacity-60"
        >
          Omitir
        </button>
        <Button
          className="h-12 flex-[2]"
          disabled={!canSave}
          onClick={() => {
            if (!coords) return
            onConfirm({
              lat: coords.lat,
              lng: coords.lng,
              accuracyM: accuracyToSave,
              reference: refChanged && refTrimmed.length >= 5 ? refTrimmed : undefined,
            })
          }}
        >
          {busy ? 'Guardando…' : 'Guardar ubicación'}
        </Button>
      </div>
    </BottomSheet>
  )
}
