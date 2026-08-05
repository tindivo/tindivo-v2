import { Icon } from '@tindivo/ui'

interface AddGroupButtonProps {
  onClick: () => void
}

export function AddGroupButton({ onClick }: AddGroupButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2.5 rounded-2xl border-2 border-brand bg-brand-soft px-4 py-3.5 text-[15px] font-bold text-brand-dark transition-colors hover:bg-brand/[0.08]"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white">
        <Icon name="add" size={18} />
      </span>
      Agregar grupo de opciones
    </button>
  )
}
