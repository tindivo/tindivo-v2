'use client'

import { Icon, IconButton } from '@tindivo/ui'
import { useRef } from 'react'

interface MenuSearchFieldProps {
  query: string
  businessName: string
  onChange: (value: string) => void
  onFocus: () => void
  onBlur: () => void
  onClear: () => void
}

/**
 * El buscador de la carta, siempre a la vista.
 *
 * Antes era una lupa de 36 px sin etiqueta, metida en la misma fila que los
 * chips de categoría: hubo que ponerle un separador vertical al lado porque
 * «sin él la lupa parece una categoría más». Ese parche describía el problema,
 * no la solución. Ahora es un campo con su texto dentro, del ancho de la
 * pantalla y con la misma forma que el de la portada — que es donde el usuario
 * ya aprendió a buscar.
 */
export function MenuSearchField({
  query,
  businessName,
  onChange,
  onFocus,
  onBlur,
  onClear,
}: MenuSearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="px-4 pt-2.5">
      <div className="flex h-11 items-center gap-2.5 rounded-full border border-ink/10 bg-card px-4 shadow-elev-1 transition-colors focus-within:border-brand/50">
        <span className="shrink-0 text-ink-subtle">
          <Icon name="search" size={19} />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onClear()
              e.currentTarget.blur()
            }
            // Enter no envía nada —el filtro ya es instantáneo—, solo baja el
            // teclado para que se vean los resultados.
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          placeholder={`Buscar en ${businessName}`}
          aria-label="Buscar en la carta"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent font-medium text-[14.5px] text-ink outline-none placeholder:text-ink-subtle"
        />
        {query.length > 0 && (
          <IconButton
            type="button"
            size="sm"
            // `onMouseDown` y no `onClick`: el clic llega DESPUÉS del blur del
            // campo, y para entonces este botón ya se ha desmontado.
            onMouseDown={(e) => {
              e.preventDefault()
              onClear()
              inputRef.current?.focus()
            }}
            aria-label="Limpiar búsqueda"
            className="-mr-2 h-7 w-7 shrink-0 text-ink-muted"
          >
            <Icon name="close" size={16} />
          </IconButton>
        )}
      </div>
    </div>
  )
}
