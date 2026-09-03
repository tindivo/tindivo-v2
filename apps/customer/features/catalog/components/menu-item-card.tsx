import { Icon } from '@tindivo/ui'
import { ProductImage } from '@/components/product-image'
import { HighlightedText } from '@/features/catalog/components/highlighted-text'
import { soles } from '@/features/catalog/lib/format'
import { hasOptions as tieneOpciones } from '@/features/catalog/lib/menu-density'
import type { MatchRange } from '@/features/catalog/lib/menu-search'
import type { MenuItem } from '@/features/catalog/types'

interface MenuItemCardProps {
  item: MenuItem
  disabled?: boolean
  onClick: (item: MenuItem) => void
  /** Añade sin abrir el detalle. Solo se usa si el plato no tiene opciones. */
  onQuickAdd: (item: MenuItem) => void
  /**
   * Los tres de abajo solo los manda la búsqueda. En la carta normal la
   * categoría ya la dice el encabezado de la sección y no hay nada que
   * resaltar, así que la tarjeta se pinta igual que siempre.
   */
  categoryLabel?: string
  nameRanges?: MatchRange[]
  descriptionRanges?: MatchRange[]
}

/**
 * Posición del «+» respecto a la TARJETA, no a la imagen.
 *
 * Es lo que permite que la tarjeta entera siga siendo un solo botón: el «+» es
 * hermano suyo, no hijo, porque un `<button>` no puede contener otro. Los
 * números salen de la geometría de siempre —16 px de padding, imagen de 92 px,
 * el botón desbordando 6 px por abajo y por la derecha— así que no dependen de
 * lo alta que quede la tarjeta y se ve exactamente donde se veía.
 */
const MAS_TOP = 16 + 92 - 32 + 6
const MAS_RIGHT = 16 - 6

export function MenuItemCard({
  item,
  disabled,
  onClick,
  onQuickAdd,
  categoryLabel,
  nameRanges,
  descriptionRanges,
}: MenuItemCardProps) {
  const groups = item.modifier_groups ?? []
  const configurable = tieneOpciones(item)
  const hasPaidOptions = groups.some((g) => g.options.some((o) => Number(o.additional_price) > 0))
  const bloqueado = disabled || !item.is_available

  return (
    <div
      className={`relative rounded-[20px] border border-ink/[0.04] bg-card p-4 shadow-elev-1 transition-all ${
        bloqueado ? 'opacity-50' : 'hover:-translate-y-0.5 hover:shadow-elev-3'
      }`}
    >
      <button
        type="button"
        disabled={bloqueado}
        onClick={() => onClick(item)}
        className="flex w-full items-stretch gap-3.5 text-left transition-transform active:scale-[0.985] disabled:pointer-events-none"
      >
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div>
            {(categoryLabel || item.is_compact || item.badges?.[0]) && (
              <span className="mb-1.5 flex flex-wrap gap-1.5">
                {categoryLabel && (
                  <span className="inline-block rounded-md bg-ink/[0.05] px-2 py-[3px] font-bold text-[10px] text-ink-muted uppercase tracking-[0.08em]">
                    {categoryLabel}
                  </span>
                )}
                {item.is_compact && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-brand/8 px-2 py-[3px] font-bold text-[10px] text-brand uppercase tracking-[0.08em]">
                    <Icon name="star" size={12} filled /> Destacado
                  </span>
                )}
                {item.badges?.[0] && (
                  <span className="inline-block rounded-md bg-brand/8 px-2 py-[3px] font-bold text-[10px] text-brand uppercase tracking-[0.08em]">
                    {item.badges[0]}
                  </span>
                )}
              </span>
            )}
            <div className="mb-1 font-display font-bold text-[16px] tracking-tight">
              <HighlightedText text={item.name} ranges={nameRanges} />
            </div>
            {item.description && (
              <div className="line-clamp-2 text-[12px] text-ink-muted leading-[1.4]">
                <HighlightedText text={item.description} ranges={descriptionRanges} />
              </div>
            )}
          </div>
          <div className="mt-2 font-semibold text-[15px] tabular-nums">
            {hasPaidOptions ? `Desde ${soles(item.base_price)}` : soles(item.base_price)}
            {/* `whitespace-nowrap`: en un Android de 360 px la columna se
                estrecha lo justo para que el navegador rompa entre el «·» y la
                palabra, y el separador se queda colgando al final de la línea
                anterior. Así el trozo entero baja junto o no baja. */}
            {configurable && (
              <span className="ml-1.5 whitespace-nowrap font-normal text-[11px] text-ink-subtle">
                · Personalizable
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0">
          <ProductImage
            label={item.name}
            hue={item.image_hue ?? 14}
            size={92}
            src={item.image_url}
          />
        </div>
      </button>

      {/*
        El «+» sobre la foto es una convención aprendida en Rappi, UberEats y
        DoorDash, donde AÑADE. Aquí abría el mismo modal que la tarjeta, así
        que para un plato sin ninguna opción eran dos toques de más y una
        pantalla en la que lo único posible era volver a pulsar «Agregar».
        Ahora añade cuando no hay nada que preguntar — el mismo criterio que la
        fila compacta, para que el signo no signifique dos cosas en la misma
        carta.
      */}
      <button
        type="button"
        disabled={bloqueado}
        onClick={() => (configurable ? onClick(item) : onQuickAdd(item))}
        aria-label={configurable ? `Elegir opciones de ${item.name}` : `Agregar ${item.name}`}
        style={{ top: MAS_TOP, right: MAS_RIGHT }}
        className="absolute flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#ff6b35] to-[#ff8c42] text-white shadow-glow-brand transition-transform active:scale-90 disabled:pointer-events-none"
      >
        <Icon name="add" size={20} />
      </button>
    </div>
  )
}
