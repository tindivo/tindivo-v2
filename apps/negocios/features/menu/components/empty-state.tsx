import { Icon } from '@tindivo/ui'

interface EmptyStateProps {
  onCreateCategory: () => void
}

export function EmptyState({ onCreateCategory }: EmptyStateProps) {
  const tips = [
    { icon: 'looks_one', text: 'Crea una categoría (ej. "Pizzas")' },
    { icon: 'looks_two', text: 'Agrega platos con precio' },
    { icon: 'looks_3', text: 'Actívalos para que aparezcan online' },
  ] as const

  return (
    <div className="flex flex-col items-center rounded-[24px] border-2 border-dashed border-ink/[0.08] bg-card p-8 text-center">
      <span className="mb-4 flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-brand-soft text-brand">
        <Icon name="restaurant_menu" size={36} />
      </span>
      <h2 className="mb-2 font-display text-[22px] font-bold text-ink">Tu menú está vacío</h2>
      <p className="mb-6 max-w-[300px] text-[14px] leading-relaxed text-ink-muted">
        Agrega tus platos para que los clientes puedan pedirlos. Puedes empezar con bebidas y platos
        simples.
      </p>

      <div className="mb-6 flex w-full max-w-[280px] flex-col gap-2.5">
        {tips.map((tip) => (
          <div
            key={tip.icon}
            className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2 text-left"
          >
            <Icon name={tip.icon} size={18} filled className="shrink-0 text-brand" />
            <span className="text-[13px] font-medium text-ink">{tip.text}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onCreateCategory}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 text-base font-bold text-white shadow-[0_6px_18px_rgba(249,115,22,0.16)] transition-all hover:shadow-[0_10px_30px_rgba(249,115,22,0.24)] active:scale-[0.97]"
      >
        <Icon name="add" size={20} filled />
        Crear categoría
      </button>
    </div>
  )
}
