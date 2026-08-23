import { Button, Icon, IconButton, LoadingState } from '@tindivo/ui'
import { useState } from 'react'
import { useModifierLibrary } from '../hooks/use-modifier-library'
import { isLastAvailable } from '../lib/utils'
import type { LibraryGroup, LibraryOption } from '../types'
import { ConfirmDialog } from './confirm-dialog'
import { LibraryGroupCard } from './library-group-card'
import { LinkItemsSheet } from './link-items-sheet'

interface ModifierLibraryModalProps {
  open: boolean
  bizId: string | null
  onClose: () => void
  onChanged: () => void
}

export function ModifierLibraryModal({
  open,
  bizId,
  onClose,
  onChanged,
}: ModifierLibraryModalProps) {
  const lib = useModifierLibrary(bizId, open, onChanged)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [linkTarget, setLinkTarget] = useState<LibraryGroup | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LibraryGroup | null>(null)
  const [deleteOptionTarget, setDeleteOptionTarget] = useState<LibraryOption | null>(null)
  const [lastOffTarget, setLastOffTarget] = useState<{
    group: LibraryGroup
    option: LibraryOption
  } | null>(null)

  if (!open) return null

  const soldOutTotal = lib.groups.reduce(
    (n, g) => n + g.options.filter((o) => !o.is_available).length,
    0,
  )

  function toggleExpanded(groupId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  function handleToggleOption(group: LibraryGroup, option: LibraryOption, next: boolean) {
    // Apagar la última disponible de un grupo obligatorio deja sus platos
    // imposibles de pedir sin que nada lo anuncie en la carta. Se avisa antes,
    // no después.
    if (!next && isLastAvailable(group, option.id)) {
      setLastOffTarget({ group, option })
      return
    }
    void lib.toggleOption(group.id, option.id, next)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4">
      <div className="flex w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-card max-h-[85vh]">
        <div className="flex items-center justify-between border-b border-ink/[0.06] px-4 py-3.5">
          <div>
            <h2 className="text-[16px] font-bold text-ink">Extras y salsas</h2>
            <p className="text-[12px] text-ink-muted">
              {lib.groups.length} grupo{lib.groups.length !== 1 ? 's' : ''}
              {soldOutTotal > 0 &&
                ` · ${soldOutTotal} opción${soldOutTotal !== 1 ? 'es' : ''} agotada${soldOutTotal !== 1 ? 's' : ''}`}
            </p>
          </div>
          <IconButton size="sm" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </IconButton>
        </div>

        <div className="flex flex-col gap-2.5 overflow-y-auto p-3.5">
          {lib.error && <p className="text-[12px] font-semibold text-danger">{lib.error}</p>}
          {lib.loading ? (
            <LoadingState variant="inline" label="Cargando extras…" />
          ) : lib.groups.length === 0 ? (
            <p className="text-[14px] text-ink-muted">
              Todavía no hay grupos de extras. Crea uno aquí y elige en qué platos va: al agotar una
              opción se agota en todos a la vez.
            </p>
          ) : (
            lib.groups.map((group) => (
              <LibraryGroupCard
                key={group.id}
                group={group}
                expanded={expanded.has(group.id)}
                busy={lib.busy}
                onToggleExpanded={() => toggleExpanded(group.id)}
                onRename={(name) => void lib.saveGroupName(group, name)}
                onChangeRule={(mode) => void lib.saveGroupRule(group, mode)}
                onOpenLinks={() => setLinkTarget(group)}
                onDelete={() => setDeleteTarget(group)}
                onAddOption={() => void lib.addOption(group)}
                onSaveOption={(option, patch) => void lib.saveOption(option, patch)}
                onDeleteOption={(option) => setDeleteOptionTarget(option)}
                onToggleOption={(option, next) => handleToggleOption(group, option, next)}
              />
            ))
          )}
        </div>

        <div className="border-t border-ink/[0.06] p-3.5">
          <Button
            variant="brand"
            size="sm"
            className="w-full"
            onClick={() => void lib.addGroup()}
            disabled={lib.busy}
          >
            <Icon name="add" size={16} />
            Crear grupo
          </Button>
        </div>
      </div>

      {linkTarget && (
        <LinkItemsSheet
          group={linkTarget}
          items={lib.items}
          busy={lib.busy}
          onCancel={() => setLinkTarget(null)}
          onSave={(itemIds) => {
            const target = linkTarget
            setLinkTarget(null)
            void lib.setGroupItems(target, itemIds)
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={`Eliminar “${deleteTarget.name}”`}
          body={
            deleteTarget.itemIds.length > 0
              ? `Se quitará de ${deleteTarget.itemIds.length} plato${deleteTarget.itemIds.length !== 1 ? 's' : ''} junto con sus ${deleteTarget.options.length} opción${deleteTarget.options.length !== 1 ? 'es' : ''}. Los pedidos ya hechos no cambian. Esta acción no se puede deshacer.`
              : 'Se eliminarán también sus opciones. Esta acción no se puede deshacer.'
          }
          confirmLabel="Eliminar"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const target = deleteTarget
            setDeleteTarget(null)
            void lib.deleteGroup(target)
          }}
        />
      )}

      {deleteOptionTarget && (
        <ConfirmDialog
          title={`Eliminar “${deleteOptionTarget.name}”`}
          body="Desaparece de todos los platos que usan este grupo. Si solo se acabó por hoy, mejor márcala como agotada."
          confirmLabel="Eliminar"
          onCancel={() => setDeleteOptionTarget(null)}
          onConfirm={() => {
            const target = deleteOptionTarget
            setDeleteOptionTarget(null)
            void lib.deleteOption(target.id)
          }}
        />
      )}

      {lastOffTarget && (
        <ConfirmDialog
          title={`Agotar “${lastOffTarget.option.name}”`}
          body={`Es la última opción disponible de “${lastOffTarget.group.name}”, que es obligatorio. Los ${lastOffTarget.group.itemIds.length} plato${lastOffTarget.group.itemIds.length !== 1 ? 's' : ''} que lo usan seguirán en la carta, pero el cliente no va a poder agregarlos al carrito.`}
          confirmLabel="Agotar igual"
          tone="warning"
          onCancel={() => setLastOffTarget(null)}
          onConfirm={() => {
            const target = lastOffTarget
            setLastOffTarget(null)
            void lib.toggleOption(target.group.id, target.option.id, false)
          }}
        />
      )}
    </div>
  )
}
