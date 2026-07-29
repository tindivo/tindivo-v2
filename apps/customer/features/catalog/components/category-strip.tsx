import { Icon } from '@tindivo/ui'

const CATEGORIES = [
  { label: 'Pizza', icon: 'local_pizza' },
  { label: 'Hamburguesas', icon: 'lunch_dining' },
  { label: 'Pollo', icon: 'kebab_dining' },
  { label: 'Anticuchos', icon: 'outdoor_grill' },
  { label: 'Bebidas', icon: 'local_cafe' },
  { label: 'Postres', icon: 'icecream' },
]

export function CategoryStrip() {
  return (
    <section className="px-4 pt-1 pb-2">
      <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 scrollbar-hide">
        {CATEGORIES.map((c) => (
          <button
            key={c.label}
            type="button"
            className="t-chip inline-flex shrink-0 items-center gap-1.5"
          >
            <Icon name={c.icon} size={18} />
            {c.label}
          </button>
        ))}
      </div>
    </section>
  )
}
