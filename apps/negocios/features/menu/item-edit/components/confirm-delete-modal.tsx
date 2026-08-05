import { Icon } from '@tindivo/ui'

interface ConfirmDeleteModalProps {
  itemName: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDeleteModal({ itemName, onConfirm, onCancel }: ConfirmDeleteModalProps) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-ink/45 p-5">
      <div className="w-full max-w-[360px] rounded-[20px] bg-card p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
        <span className="mx-auto mb-3.5 flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-danger/10 text-danger">
          <Icon name="delete" size={26} filled />
        </span>
        <h3 className="mb-2 text-[17px] font-bold text-ink">¿Eliminar &ldquo;{itemName}&rdquo;?</h3>
        <p className="mb-5 text-[14px] leading-relaxed text-ink-muted">
          Esta acción no se puede deshacer. El plato desaparecerá del menú y del historial de
          pedidos futuros.
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 items-center justify-center rounded-full bg-ink/[0.06] px-4 text-[15px] font-bold text-ink transition-colors hover:bg-ink/[0.1]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-danger px-4 text-[15px] font-bold text-white transition-colors hover:bg-danger/90"
          >
            <Icon name="delete" size={16} />
            Sí, eliminar
          </button>
        </div>
      </div>
    </div>
  )
}
