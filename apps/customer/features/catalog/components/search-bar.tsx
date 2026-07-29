import { Icon } from '@/components/ui'

interface SearchBarProps {
  query: string
  onChange: (value: string) => void
}

export function SearchBar({ query, onChange }: SearchBarProps) {
  return (
    <div className="px-4 pb-2">
      <div className="t-glass flex items-center gap-2.5 rounded-full px-4 py-3">
        <span className="text-ink-subtle">
          <Icon name="search" size={20} />
        </span>
        <input
          type="text"
          className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-ink outline-none placeholder:text-ink-subtle"
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
            className="-m-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-ink/[0.06]"
          >
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
    </div>
  )
}
