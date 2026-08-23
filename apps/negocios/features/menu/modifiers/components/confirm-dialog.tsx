import { Button } from '@tindivo/ui'

interface ConfirmDialogProps {
  title: string
  body: string
  confirmLabel: string
  tone?: 'danger' | 'warning'
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  tone = 'danger',
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4">
      <div className="w-full max-w-[380px] rounded-2xl bg-card p-5">
        <h3 className="mb-2 text-[15px] font-bold text-ink">{title}</h3>
        <p className="mb-4 text-[13px] text-ink-muted">{body}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'secondary'} size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
