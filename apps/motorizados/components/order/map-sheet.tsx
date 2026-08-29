'use client'

import { BottomSheet, Button, Icon } from '@tindivo/ui'
import { mapsDirToCoords } from '@/lib/deeplinks'
import { MapReadonly } from './map-readonly'

/**
 * El mapa, a pantalla casi completa y por encima de todo.
 *
 * POR QUÉ NO VA EMBEBIDO EN LA FICHA.
 * Un Leaflet dentro del scroll de la página se queda con el gesto: al arrastrar
 * el dedo sobre él, el mapa hace pan y la página NO baja. Con la tarjeta de
 * cobro justo debajo, el motorizado se topaba con una franja de 180px que
 * bloqueaba el recorrido de la pantalla — y lo hace con una mano, sobre la moto.
 * Además, a 180px el mapa no servía para orientarse de verdad: había que salir
 * a Google Maps igual.
 *
 * Al abrirse aquí, el gesto ya no compite con nada: dentro del sheet el pan es
 * lo único que se espera, y hay sitio para que el mapa sea útil.
 *
 * `Abrir en Google Maps` vive DENTRO. Es el paso siguiente natural —miro dónde
 * cae y decido si necesito navegación paso a paso—, y ponerlo aquí evita que la
 * ficha tenga dos botones de mapa compitiendo por el mismo gesto.
 */
export function MapSheet({
  lat,
  lng,
  title,
  subtitle,
  onClose,
}: {
  lat: number
  lng: number
  title: string | null
  subtitle?: string | null
  onClose: () => void
}) {
  const destino = title ?? 'Ubicación del cliente'

  return (
    <BottomSheet open label={`Entregar en ${destino}`} onClose={onClose}>
      <div className="flex min-h-0 flex-col">
        <div className="flex items-start justify-between gap-3 px-5 pt-2 pb-3">
          <div className="min-w-0">
            <span className="font-mono text-meta font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Entregar en
            </span>
            <p className="mt-0.5 text-body-lg font-semibold leading-snug text-ink">{destino}</p>
            {subtitle && <p className="mt-0.5 text-caption text-ink-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar mapa"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink-muted"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* 55vh: suficiente para leer las calles de alrededor sin comerse el
            botón, que es lo que se viene a tocar después de mirar. */}
        <div className="min-h-0 flex-1 px-5">
          <div className="overflow-hidden rounded-[18px]">
            <MapReadonly lat={lat} lng={lng} heightClass="h-[55vh]" />
          </div>
        </div>

        <div className="px-5 pt-3.5 pb-6">
          <Button
            className="w-full"
            as="a"
            href={mapsDirToCoords(lat, lng)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="near_me" size={20} />
            Ir a la ubicación en Google Maps
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
