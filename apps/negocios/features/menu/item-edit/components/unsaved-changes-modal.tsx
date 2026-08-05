import { Icon } from '@tindivo/ui'

interface UnsavedChangesModalProps {
  onSaveAndExit: () => void
  onDiscard: () => void
  onCancel: () => void
}

export function UnsavedChangesModal({
  onSaveAndExit,
  onDiscard,
  onCancel,
}: UnsavedChangesModalProps) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-ink/45 p-5">
      <div className="w-full max-w-[360px] rounded-[20px] bg-card p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
        <span className="mx-auto mb-3.5 flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-warning/10 text-warning">
          <Icon name="edit_note" size={26} filled />
        </span>
        <h3 className="mb-2 text-[17px] font-bold text-ink">Tienes cambios sin guardar</h3>
        <p className="mb-5 text-[14px] leading-relaxed text-ink-muted">
          ¿Qué quieres hacer antes de salir?
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onSaveAndExit}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand px-5 text-[15px] font-bold text-white shadow-[0_6px_18px_rgba(249,115,22,0.16)] transition-all active:scale-[0.97]"
          >
            <Icon name="save" size={18} filled />
            Guardar y salir
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-11 items-center justify-center rounded-full bg-ink/[0.06] px-4 text-[15px] font-bold text-ink transition-colors hover:bg-ink/[0.1]"
            >
              Seguir editando
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="inline-flex h-11 items-center justify-center rounded-full bg-ink/[0.06] px-4 text-[15px] font-bold text-danger transition-colors hover:bg-danger/10"
            >
              Descartar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
