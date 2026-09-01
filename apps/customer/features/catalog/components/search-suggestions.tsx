'use client'

import type { Category } from '@/features/catalog/types'

interface SearchSuggestionsProps {
  categories: Category[]
  onSelect: (id: string) => void
}

/**
 * Lo que se ve con el buscador enfocado y vacío.
 *
 * Un campo en blanco obliga al usuario a adivinar qué palabras conoce esta
 * carta, y la mayoría no adivina: se sale. Aquí se le enseña, y de paso las
 * secciones aparecen por segunda vez —con el nombre entero y sin arrastrar
 * nada—, que es exactamente el problema que la tira no termina de resolver.
 *
 * Solo secciones, a propósito. Sugerir términos («pollo», «chaufa») ayudaría
 * más, pero hacerlo bien pide una tabla de términos por negocio: escritos a
 * mano envejecen en cuanto la cajera cambie la carta.
 *
 * `onMouseDown` y no `onClick`: el clic llega después del `blur` del campo, y
 * para entonces este panel ya se ha desmontado.
 */
export function SearchSuggestions({ categories, onSelect }: SearchSuggestionsProps) {
  if (categories.length === 0) return null

  return (
    <div className="px-4 pt-5">
      <h2 className="font-bold text-[12px] text-ink-subtle uppercase tracking-[0.1em]">
        Ir a una sección
      </h2>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(c.id)
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink/[0.09] bg-card px-3.5 font-semibold text-[13.5px] tracking-[-0.01em] shadow-elev-1 transition-all select-none active:scale-[0.97] hover:border-ink/20"
          >
            {c.name}
            <span className="font-semibold text-[11.5px] text-ink-subtle tabular-nums">
              {c.items.length}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
