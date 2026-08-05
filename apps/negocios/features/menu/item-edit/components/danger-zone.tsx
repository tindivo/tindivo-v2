import { Icon } from '@tindivo/ui'

interface DangerZoneProps {
  itemName: string
  isNew: boolean
  onDelete: () => void
}

export function DangerZone({ itemName, isNew, onDelete }: DangerZoneProps) {
  if (isNew) return null
  return (
    <div className="rounded-2xl border border-danger/30 bg-danger/[0.04] p-4">
      <div className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-danger">
        Zona de peligro
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="text-[14px] font-semibold text-danger">Eliminar plato</div>
          <div className="mt-0.5 text-[12px] text-danger/80">Esta acción no se puede deshacer.</div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-danger px-4 text-[13px] font-bold text-white transition-colors hover:bg-danger/90"
        >
          <Icon name="delete" size={15} />
          Eliminar &ldquo;{itemName || 'plato'}&rdquo;
        </button>
      </div>
    </div>
  )
}
