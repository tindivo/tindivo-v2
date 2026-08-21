'use client'

import { Icon, IconButton } from '@tindivo/ui'
import { useEffect, useRef } from 'react'

interface MenuSearchFieldProps {
  query: string
  onChange: (value: string) => void
  onClose: () => void
}

export function MenuSearchField({ query, onChange, onClose }: MenuSearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // El campo se monta al abrir la búsqueda: enfocar aquí levanta el teclado sin
  // pedir un segundo toque, que en móvil es la diferencia entre usarlo y no.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="flex w-full items-center gap-1 py-2.5 pr-4 pl-1.5">
      <IconButton
        type="button"
        size="sm"
        onClick={onClose}
        aria-label="Cerrar la búsqueda y volver a la carta"
        className="shrink-0"
      >
        <Icon name="arrow_back" size={20} />
      </IconButton>

      <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-ink/[0.08] bg-card px-3.5 shadow-elev-1 transition-colors focus-within:border-brand/40">
        <span className="text-ink-subtle">
          <Icon name="search" size={18} />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            // Enter no envía nada —el filtro ya es instantáneo—, solo baja el
            // teclado para que se vean los resultados.
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          placeholder="Buscar plato, bebida, ingrediente…"
          aria-label="Buscar en la carta"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[14.5px] font-medium text-ink outline-none placeholder:text-ink-subtle"
        />
        {query.length > 0 && (
          <IconButton
            type="button"
            size="sm"
            onClick={() => {
              onChange('')
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
