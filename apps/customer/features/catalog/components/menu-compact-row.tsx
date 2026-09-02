import { Icon, IconButton } from '@tindivo/ui'
import { soles } from '@/features/catalog/lib/format'
import { hasOptions } from '@/features/catalog/lib/menu-density'
import type { MenuItem } from '@/features/catalog/types'

interface MenuCompactRowProps {
  item: MenuItem
  disabled?: boolean
  first?: boolean
  /** Abre el detalle. Solo se usa si el plato tiene algo que elegir. */
  onOpen: (item: MenuItem) => void
  /** Añade sin preguntar. Solo si el plato NO tiene opciones. */
  onAdd: (item: MenuItem) => void
}

/**
 * Una fila de la lista compacta: nombre, precio y un «+».
 *
 * 50 px en vez de los 134 de la tarjeta. En Bebidas de La Florencia eso son
 * 1.460 px de scroll que pasan a 550 para elegir una gaseosa.
 *
 * El «+» aquí SÍ añade —es un agua mineral, no hay nada que preguntar—, y por
 * eso es un botón aparte y no un adorno dentro de la fila: prometer «añadir» y
 * abrir un modal vacío es el defecto que esto viene a quitar. Si el plato
 * tuviera opciones, la fila entera abre el detalle como cualquier tarjeta.
 */
export function MenuCompactRow({ item, disabled, first, onOpen, onAdd }: MenuCompactRowProps) {
  const configurable = hasOptions(item)
  const bloqueado = disabled || !item.is_available

  const contenido = (
    <>
      <span className="min-w-0 flex-1 truncate font-semibold text-[14.5px] tracking-[-0.01em]">
        {item.name}
      </span>
      <span className="shrink-0 font-semibold text-[14px] tabular-nums">
        {soles(item.base_price)}
      </span>
    </>
  )

  return (
    <div
      className={`flex items-center gap-3 px-3.5 py-2.5 ${first ? '' : 'border-ink/[0.05] border-t'} ${
        bloqueado ? 'opacity-50' : ''
      }`}
    >
      {configurable ? (
        <button
          type="button"
          disabled={bloqueado}
          onClick={() => onOpen(item)}
          className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left transition-transform active:scale-[0.99] disabled:pointer-events-none"
        >
          {contenido}
        </button>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3 py-1">{contenido}</span>
      )}
      {/* 30 px: la fila compacta cabe seis veces en pantalla y el botón del
          componente (36) le come el alto a la línea del precio. */}
      <IconButton
        type="button"
        disabled={bloqueado}
        onClick={() => (configurable ? onOpen(item) : onAdd(item))}
        aria-label={configurable ? `Elegir opciones de ${item.name}` : `Agregar ${item.name}`}
        className="h-[30px] w-[30px] shrink-0 border-[1.5px] border-brand/35 bg-brand-soft text-brand-dark hover:border-brand/60 hover:bg-brand/[0.12]"
      >
        <Icon name="add" size={17} />
      </IconButton>
    </div>
  )
}
