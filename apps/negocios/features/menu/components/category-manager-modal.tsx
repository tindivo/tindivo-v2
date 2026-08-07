import { Icon, IconButton, LoadingState } from '@tindivo/ui'
import { useCategoryManager } from '../hooks/use-category-manager'
import type { CatRow } from '../types'

interface CategoryManagerModalProps {
  open: boolean
  bizId: string | null
  onClose: () => void
  onChanged: () => void
}

export function CategoryManagerModal({
  open,
  bizId,
  onClose,
  onChanged,
}: CategoryManagerModalProps) {
  const {
    rows,
    loading,
    busy,
    error,
    confirmDelete,
    setConfirmDelete,
    addCategory,
    saveName,
    saveBlurb,
    toggleActive,
    move,
    doDelete,
  } = useCategoryManager(bizId, open, onChanged)

  if (!open) return null

  const inputCls =
    'w-full rounded-xl border border-ink/[0.06] bg-card px-3 py-2 text-[15px] font-medium text-ink outline-none transition-all placeholder:text-ink/45 focus:border-ink focus:ring-4 focus:ring-ink/[0.08]'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4">
      <div className="flex w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-card max-h-[85vh]">
        <div className="flex items-center justify-between border-b border-ink/[0.06] px-4 py-3.5">
          <h2 className="text-[16px] font-bold text-ink">Gestionar categorías</h2>
          <IconButton size="sm" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </IconButton>
        </div>

        <div className="flex flex-col gap-2.5 overflow-y-auto p-3.5">
          {error && <p className="text-[12px] font-semibold text-danger">{error}</p>}
          {loading ? (
            <LoadingState variant="inline" label="Cargando categorías…" />
          ) : rows.length === 0 ? (
            <p className="text-[14px] text-ink-muted">
              Aún no tenés categorías. Agregá la primera para empezar tu menú.
            </p>
          ) : (
            rows.map((row, index) => (
              <div
                key={row.id}
                className={`flex flex-col gap-2 rounded-xl border border-ink/[0.06] p-2.5 ${
                  row.is_active ? '' : 'opacity-60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={busy || index === 0}
                      aria-label="Subir"
                      className="inline-flex items-center justify-center p-0 text-ink-subtle disabled:opacity-40"
                    >
                      <Icon name="keyboard_arrow_up" size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={busy || index === rows.length - 1}
                      aria-label="Bajar"
                      className="inline-flex items-center justify-center p-0 text-ink-subtle disabled:opacity-40"
                    >
                      <Icon name="keyboard_arrow_down" size={18} />
                    </button>
                  </div>
                  <input
                    className={`${inputCls} flex-1 text-[14px] font-bold`}
                    defaultValue={row.name}
                    onBlur={(e) => saveName(row, e.target.value)}
                    placeholder="Nombre de la categoría"
                  />
                  <IconButton
                    size="sm"
                    onClick={() => toggleActive(row)}
                    disabled={busy}
                    title={row.is_active ? 'Ocultar del menú' : 'Mostrar en el menú'}
                  >
                    <Icon name={row.is_active ? 'visibility' : 'visibility_off'} size={18} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    onClick={() => setConfirmDelete(row)}
                    disabled={busy}
                    className="text-danger hover:bg-danger/10"
                    aria-label="Eliminar categoría"
                  >
                    <Icon name="delete" size={18} />
                  </IconButton>
                </div>
                <input
                  className={`${inputCls} text-[13px]`}
                  defaultValue={row.blurb}
                  onBlur={(e) => saveBlurb(row, e.target.value)}
                  placeholder="Descripción corta (opcional)"
                />
                <p className="text-[11px] text-ink-muted">
                  {row.itemCount} plato{row.itemCount !== 1 ? 's' : ''}
                  {!row.is_active && ' · oculta'}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-ink/[0.06] p-3.5">
          <button
            type="button"
            onClick={addCategory}
            disabled={busy}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-brand px-4 text-sm font-bold text-white transition-all active:scale-[0.97] disabled:opacity-50"
          >
            <Icon name="add" size={16} />
            Agregar categoría
          </button>
        </div>
      </div>

      {confirmDelete && (
        <DeleteConfirm
          row={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => doDelete(confirmDelete)}
        />
      )}
    </div>
  )
}

function DeleteConfirm({
  row,
  onCancel,
  onConfirm,
}: {
  row: CatRow
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4">
      <div className="w-full max-w-[380px] rounded-2xl bg-card p-5">
        <h3 className="mb-2 text-[15px] font-bold text-ink">Eliminar “{row.name}”</h3>
        <p className="mb-4 text-[13px] text-ink-muted">
          {row.itemCount > 0
            ? `Se eliminarán también ${row.itemCount} plato${row.itemCount !== 1 ? 's' : ''} de esta categoría. Esta acción no se puede deshacer.`
            : 'Esta acción no se puede deshacer.'}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center justify-center rounded-full px-4 text-[13px] font-bold text-ink transition-colors hover:bg-ink/[0.06]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-9 items-center justify-center rounded-full bg-danger px-4 text-[13px] font-bold text-white transition-colors hover:bg-danger/90"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}
