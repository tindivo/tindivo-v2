import { Icon } from '@tindivo/ui'
import { ConfirmDeleteModal } from './confirm-delete-modal'
import { CustomerPreviewPanel } from './customer-preview-panel'
import type { EditorFormProps } from './editor-form'
import { EditorForm } from './editor-form'
import { UnsavedChangesModal } from './unsaved-changes-modal'
import { UnsavedDot } from './unsaved-dot'

interface MobileViewProps extends EditorFormProps {
  isNew: boolean
  titleName: string
  hasUnsaved: boolean
  saving: boolean
  saveError: string | null
  showDeleteModal: boolean
  showUnsavedModal: boolean
  showPreviewMobile: boolean
  onShowDeleteModal: (v: boolean) => void
  onShowUnsavedModal: (v: boolean) => void
  onShowPreviewMobile: (v: boolean) => void
  /** Ejecuta el borrado. Distinto de `onDeleteItem`, que solo abre el diálogo. */
  onConfirmDelete: () => void
  onSave: () => void
  onBack: () => void
  onSaveAndExit: () => void
  onDiscard: () => void
}

export function MobileView(props: MobileViewProps) {
  const {
    isNew,
    titleName,
    hasUnsaved,
    saving,
    saveError,
    showDeleteModal,
    showUnsavedModal,
    showPreviewMobile,
    onShowDeleteModal,
    onShowUnsavedModal,
    onShowPreviewMobile,
    onConfirmDelete,
    onSave,
    onBack,
    onSaveAndExit,
    onDiscard,
    formData,
    groups,
    imageSrc,
    ...formProps
  } = props

  return (
    <div className="flex h-dvh flex-col lg:hidden">
      {showDeleteModal && (
        <ConfirmDeleteModal
          itemName={formData.name}
          onConfirm={onConfirmDelete}
          onCancel={() => onShowDeleteModal(false)}
        />
      )}
      {showUnsavedModal && (
        <UnsavedChangesModal
          onSaveAndExit={onSaveAndExit}
          onDiscard={onDiscard}
          onCancel={() => onShowUnsavedModal(false)}
        />
      )}
      {showPreviewMobile && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Vista del cliente"
          className="fixed inset-0 z-[200] flex flex-col justify-end bg-ink/45"
        >
          <div className="flex h-[88%] max-h-[88%] flex-col overflow-hidden rounded-t-[24px] bg-card">
            <div className="flex justify-center py-2.5 pb-1">
              <div className="h-1 w-9 rounded-full bg-ink/20" />
            </div>
            <div className="flex items-center justify-between px-4 pb-2.5">
              <div className="text-[13px] font-semibold text-ink-muted">
                Vista previa — así lo ve el cliente
              </div>
              <button
                type="button"
                onClick={() => onShowPreviewMobile(false)}
                className="rounded-lg bg-ink/[0.06] px-2.5 py-1.5 text-[12px] font-bold text-ink"
              >
                Cerrar
              </button>
            </div>
            <CustomerPreviewPanel
              formData={formData}
              groups={groups}
              imageSrc={imageSrc}
              className="flex-1 rounded-none border-none"
            />
          </div>
        </div>
      )}

      <div className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-ink/[0.06] bg-card px-3.5 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink/[0.06] text-ink"
          aria-label="Volver al menú"
        >
          <Icon name="arrow_back" size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center">
            <h1 className="font-display text-[17px] font-bold leading-tight text-ink">
              {isNew ? 'Nuevo plato' : 'Editar plato'}
            </h1>
            {hasUnsaved && <UnsavedDot />}
          </div>
          {formData.name && (
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              {formData.name.toUpperCase()}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onShowPreviewMobile(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink/[0.06] px-3 text-[13px] font-bold text-ink"
        >
          <Icon name="visibility" size={16} />
          Preview
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-surface p-3.5 pb-6">
        {saveError && <p className="mb-3 text-[13px] font-semibold text-danger">{saveError}</p>}
        <EditorForm
          formData={formData}
          groups={groups}
          imageSrc={imageSrc}
          isNew={isNew}
          {...formProps}
        />
      </div>

      <div className="border-t border-ink/[0.06] bg-card p-3.5 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand px-5 text-[16px] font-bold text-white transition-all active:scale-[0.97] disabled:opacity-50"
        >
          <Icon name="save" size={20} filled />
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}
