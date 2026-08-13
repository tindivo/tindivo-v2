import { Icon } from '@tindivo/ui'
import { DashboardSidebar } from '@/components/dashboard/shell'
import { ConfirmDeleteModal } from './confirm-delete-modal'
import { CustomerPreviewPanel } from './customer-preview-panel'
import type { EditorFormProps } from './editor-form'
import { EditorForm } from './editor-form'
import { UnsavedChangesModal } from './unsaved-changes-modal'
import { UnsavedDot } from './unsaved-dot'

interface DesktopViewProps extends EditorFormProps {
  title: string
  isNew: boolean
  hasUnsaved: boolean
  saving: boolean
  saveError: string | null
  showDeleteModal: boolean
  showUnsavedModal: boolean
  categoryName: string
  bizName: string
  accent: string
  pendingOrders: number
  onShowDeleteModal: (v: boolean) => void
  onShowUnsavedModal: (v: boolean) => void
  /** Ejecuta el borrado. Distinto de `onDeleteItem`, que solo abre el diálogo. */
  onConfirmDelete: () => void
  onSave: () => void
  onBack: () => void
  onSaveAndExit: () => void
  onDiscard: () => void
  onSignOut: () => void
}

export function DesktopView(props: DesktopViewProps) {
  const {
    title,
    isNew,
    hasUnsaved,
    saving,
    saveError,
    showDeleteModal,
    showUnsavedModal,
    categoryName,
    bizName,
    accent,
    pendingOrders,
    onShowDeleteModal,
    onShowUnsavedModal,
    onConfirmDelete,
    onSave,
    onBack,
    onSaveAndExit,
    onDiscard,
    onSignOut,
    formData,
    groups,
    imageSrc,
    ...formProps
  } = props

  return (
    <div className="hidden h-dvh lg:flex">
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

      <DashboardSidebar
        active="menu"
        bizName={bizName}
        accent={accent}
        pedidosBadge={pendingOrders}
        onSignOut={onSignOut}
      />

      <div className="flex min-w-0 flex-1 flex-col bg-surface">
        <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-ink/[0.06] bg-card/80 px-6 py-3.5 backdrop-blur-xl">
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink/[0.06] text-ink"
            aria-label="Volver al menú"
          >
            <Icon name="arrow_back" size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-0 font-display text-[22px] font-bold leading-tight text-ink">
              {title}
              {hasUnsaved && <UnsavedDot />}
            </div>
            <div className="mt-0.5 text-[13px] text-ink-muted">Menú · {categoryName}</div>
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 text-[15px] font-bold text-white transition-all active:scale-[0.97] disabled:opacity-50"
          >
            <Icon name="save" size={18} filled />
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>

        <div className="grid flex-1 grid-cols-[1fr_340px] items-start gap-5 overflow-y-auto p-6">
          <div>
            {saveError && <p className="mb-3 text-[13px] font-semibold text-danger">{saveError}</p>}
            <EditorForm
              formData={formData}
              groups={groups}
              imageSrc={imageSrc}
              isNew={isNew}
              {...formProps}
            />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-2xl border border-ink/[0.06] bg-card p-3.5">
              {hasUnsaved ? (
                <>
                  <Icon name="edit_note" size={18} className="text-warning" />
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold text-warning">
                      Cambios sin guardar
                    </div>
                    <div className="text-[11px] text-ink-muted">
                      Presiona &ldquo;Guardar cambios&rdquo; para confirmar
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <Icon name="cloud_done" size={18} className="text-success" />
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold text-ink">
                      {isNew ? 'Plato nuevo — no guardado' : 'Cambios guardados'}
                    </div>
                    <div className="text-[11px] text-ink-muted">
                      {isNew
                        ? 'Completa el formulario y guarda'
                        : 'Todos los cambios están sincronizados'}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="sticky top-0 h-[600px] overflow-hidden">
              <CustomerPreviewPanel
                formData={formData}
                groups={groups}
                imageSrc={imageSrc}
                className="h-full"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
