'use client'

import { Icon } from '@/components/ui'

interface SearchBarProps {
  query: string
  onChange: (value: string) => void
}

export function SearchBar({ query, onChange }: SearchBarProps) {
  return (
    <div className="px-4 pb-2">
      <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-white px-4 py-3.5">
        <span className="text-black/40">
          <Icon.Search />
        </span>
        <input
          type="text"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none"
          placeholder="Buscar pizza, hamburguesa, bebida…"
          aria-label="Buscar negocios y platos"
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Limpiar búsqueda"
            className="-m-2.5 flex h-11 w-11 shrink-0 items-center justify-center text-black/45"
          >
            <Icon.Close />
          </button>
        )}
      </div>
    </div>
  )
}
