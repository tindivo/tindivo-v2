import { Card, Icon } from '@tindivo/ui'

interface Product {
  id: string
  name: string
  businessName: string
  price: number
  eta: string
  rating: string
  imageUrl?: string | null
}

const SAMPLE_PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'Doble Cheeseburger',
    businessName: 'Al punto',
    price: 24.9,
    eta: '25-35 min',
    rating: '4.8',
  },
  {
    id: '2',
    name: 'Pizza Pepperoni',
    businessName: 'Priamo',
    price: 38.0,
    eta: '30-45 min',
    rating: '4.6',
  },
  {
    id: '3',
    name: 'Pollo Broaster',
    businessName: 'Crispy',
    price: 29.9,
    eta: '20-30 min',
    rating: '4.7',
  },
  {
    id: '4',
    name: 'Tacos de Pollo',
    businessName: 'Sazón',
    price: 18.0,
    eta: '15-25 min',
    rating: '4.5',
  },
]

function soles(n: number) {
  return `S/ ${n.toFixed(n % 1 === 0 ? 0 : 2)}`
}

export function FeaturedProducts({ products = SAMPLE_PRODUCTS }: { products?: Product[] }) {
  return (
    <section className="w-full bg-surface px-4 py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-[18px] font-bold tracking-tight text-ink">
          Lo más pedido
        </h2>
        <span className="text-[13px] font-semibold text-brand">Ver todo</span>
      </div>

      <div className="-mx-4 grid grid-cols-2 gap-3 px-4">
        {products.map((p) => (
          <Card
            key={p.id}
            className="overflow-hidden p-0 transition-all hover:-translate-y-0.5 hover:shadow-elev-3 active:translate-y-0 active:scale-[0.985]"
          >
            {/* Imagen */}
            <div className="relative h-[110px] w-full overflow-hidden bg-surface-low">
              {p.imageUrl ? (
                <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Icon name="restaurant" size={32} className="text-ink/20" />
                </div>
              )}
              <button
                type="button"
                className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-ink-subtle shadow-elev-1 transition-colors hover:text-brand"
                aria-label="Añadir a favoritos"
              >
                <Icon name="favorite" size={16} />
              </button>
            </div>

            {/* Info */}
            <div className="p-3">
              <h3 className="truncate font-semibold text-[14px] leading-tight text-ink">
                {p.name}
              </h3>
              <p className="truncate text-[11px] text-ink-subtle">{p.businessName}</p>

              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-muted">
                <span className="inline-flex items-center gap-0.5">
                  <Icon name="schedule" size={12} /> {p.eta}
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <Icon name="star" size={12} className="text-brand" /> {p.rating}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <span className="font-bold text-[15px] text-ink">{soles(p.price)}</span>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white shadow-glow-brand transition-transform active:scale-95"
                  aria-label="Añadir al pedido"
                >
                  <Icon name="add" size={18} />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  )
}
