import { Icon } from '@tindivo/ui'

interface Category {
  label: string
  icon: string
  imageUrl?: string | null
}

const CATEGORIES: Category[] = [
  { label: 'Burger', icon: 'lunch_dining' },
  { label: 'Pizza', icon: 'local_pizza' },
  { label: 'Pollo', icon: 'kebab_dining' },
  { label: 'Bebidas', icon: 'local_cafe' },
  { label: 'Postres', icon: 'icecream' },
  { label: 'Anticuchos', icon: 'outdoor_grill' },
]

export function CategoryCircles({ categories = CATEGORIES }: { categories?: Category[] }) {
  return (
    <section className="w-full bg-surface px-4 py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-[18px] font-bold tracking-tight text-ink">Categorías</h2>
        <span className="text-[13px] font-semibold text-brand">Ver todas</span>
      </div>

      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1 scrollbar-hide">
        {categories.map((c) => (
          <button
            key={c.label}
            type="button"
            className="flex shrink-0 flex-col items-center gap-2 text-center"
          >
            <div className="relative h-[72px] w-[72px] overflow-hidden rounded-full bg-surface-low ring-1 ring-ink/[0.06] transition-transform hover:scale-105">
              {c.imageUrl ? (
                // Sin `lazy`: los círculos de categoría abren la home y son de
                // lo primero que se ve. Diferirlos retrasaría el LCP.
                <img
                  src={c.imageUrl}
                  alt={c.label}
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Icon name={c.icon} size={28} className="text-brand" />
                </div>
              )}
            </div>
            <span className="text-[12px] font-medium text-ink">{c.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
