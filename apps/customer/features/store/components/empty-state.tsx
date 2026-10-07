import { buildSearchMessage, buildWhatsappUrl } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import type { StoreCard } from '../types'
import { ProductCard } from './product-card'
import { WaIcon } from './wa-icon'

/**
 * Búsqueda sin resultados (PRD §5.1): «No lo tenemos aún», botón a WhatsApp con
 * lo buscado escrito, y debajo «Mientras tanto» con artículos disponibles.
 */
export function EmptyState({
  term,
  whatsappNumber,
  suggestions,
  onContact,
}: {
  term: string
  whatsappNumber: string
  suggestions: StoreCard[]
  onContact: () => void
}) {
  const href = buildWhatsappUrl(whatsappNumber, buildSearchMessage(term))
  return (
    <>
      <div className="st-empty">
        <div className="st-empty-ico">
          <Icon name="search_off" size={28} />
        </div>
        <h2>No lo tenemos aún. Escríbenos y te avisamos si llega</h2>
        <p>Buscaste «{term}»</p>
        <a
          className="st-wab"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onContact}
        >
          <WaIcon />
          Escribir por WhatsApp
        </a>
      </div>
      {suggestions.length > 0 && (
        <>
          <h2 className="st-meanwhile">Mientras tanto</h2>
          <div className="st-grid">
            {suggestions.map((c) => (
              <ProductCard key={c.id} card={c} />
            ))}
          </div>
        </>
      )}
    </>
  )
}
