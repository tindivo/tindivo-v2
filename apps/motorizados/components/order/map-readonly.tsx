'use client'

import dynamic from 'next/dynamic'

// Leaflet toca `window`: cliente puro.
const Inner = dynamic(() => import('./map-readonly-inner'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-ink/[0.06]" />,
})

/** Mapa de la ubicación de entrega (pedidos online con coordenadas). */
export function MapReadonly({
  lat,
  lng,
  heightPx = 180,
  /**
   * Alto por CSS en vez de por píxeles. Lo usa el sheet, que quiere `55vh`:
   * calcularlo en JS obligaría a leer `window.innerHeight` durante el render y
   * eso no existe en el servidor — la primera pintura saldría con otro alto que
   * la hidratación, y React lo canta.
   */
  heightClass,
}: {
  lat: number
  lng: number
  heightPx?: number
  heightClass?: string
}) {
  return (
    /**
     * `isolate` NO ES DECORACIÓN: sin él, el mapa tapa los bottom sheets.
     *
     * Los panes de Leaflet se posicionan en `z-index: 400` por su propia hoja
     * de estilos. `BottomSheet` (packages/ui) vive en `z-80`. Compartiendo
     * contexto de apilamiento, 400 gana siempre y el sheet de entrega —el que
     * se abre justo encima de este mapa, en `picked_up`— quedaba debajo del
     * mapa. No era un problema de scroll.
     *
     * `isolation: isolate` abre un contexto de apilamiento propio: los 400 de
     * Leaflet siguen ahí pero pasan a ser relativos a ESTE div, que está en el
     * flujo normal. El sheet vuelve a pasar por encima.
     *
     * Se arregla aquí y no subiendo el z-index de `BottomSheet`: ese componente
     * lo consumen las cuatro apps, y subirlo taparía este síntoma a cambio de
     * mover el problema a sitios que nadie está mirando.
     */
    <div
      className={`relative isolate overflow-hidden ${heightClass ?? ''}`}
      style={{ height: heightClass ? undefined : heightPx, zIndex: 0 }}
    >
      <Inner lat={lat} lng={lng} />
    </div>
  )
}
