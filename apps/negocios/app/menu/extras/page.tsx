'use client'

import { Button, Icon, LoadingState } from '@tindivo/ui'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { DashboardShell } from '@/components/dashboard/shell'
import { useMenu } from '@/features/menu/hooks/use-menu'
import { ConfirmDialog } from '@/features/menu/modifiers/components/confirm-dialog'
import { LibraryGroupCard } from '@/features/menu/modifiers/components/library-group-card'
import { LinkItemsSheet } from '@/features/menu/modifiers/components/link-items-sheet'
import { useModifierLibrary } from '@/features/menu/modifiers/hooks/use-modifier-library'
import { isLastAvailable } from '@/features/menu/modifiers/lib/utils'
import type { LibraryGroup, LibraryOption } from '@/features/menu/modifiers/types'

/**
 * Extras y salsas — la biblioteca del negocio.
 *
 * ERA UN MODAL SOBRE EL MENÚ. Se mudó a ruta propia por tres motivos, y el
 * primero es funcional, no estético:
 *
 *   1. La regla del producto es «lo que se comparte se edita en Extras». La
 *      card de un grupo compartido, en el editor del plato, le dice eso al
 *      dueño — y con un modal esa frase era un callejón sin salida: no había
 *      a dónde enviarle. Con ruta propia se convierte en un enlace, y con
 *      `?g=<id>` se abre además el grupo concreto.
 *   2. El panel abre a su vez otros dos overlays (vincular platos, confirmar).
 *      Siendo modal quedaban en un tercer nivel y su z-index se llevaba a mano
 *      (`z-[60]` sobre `z-50`). Como página pasan a ser el primer nivel.
 *   3. Esto es una PWA que se usa en el móvil. El botón atrás de Android en un
 *      modal con edición en vivo y sin guardado explícito es exactamente el
 *      gesto que no estaba cubierto; en una página devuelve al menú, que es lo
 *      que la cajera espera.
 */
export default function ExtrasPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { bizId, ready, reload: reloadMenu } = useMenu()

  // `reload` del menú pide el businessId; el hook de la biblioteca avisa sin
  // argumentos, así que se cierra sobre el que ya tenemos.
  const lib = useModifierLibrary(bizId, ready, () => {
    if (bizId) void reloadMenu(bizId)
  })
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [linkTarget, setLinkTarget] = useState<LibraryGroup | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LibraryGroup | null>(null)
  const [deleteOptionTarget, setDeleteOptionTarget] = useState<LibraryOption | null>(null)
  const [lastOffTarget, setLastOffTarget] = useState<{
    group: LibraryGroup
    option: LibraryOption
  } | null>(null)

  /**
   * `?g=<id>` abre ese grupo desplegado. Es lo que hace utilizable el enlace
   * «edítalo en Extras» del editor de platos: sin esto el dueño aterriza en una
   * lista y tiene que volver a buscar el grupo que acaba de mirar.
   *
   * Solo la primera vez que aparece el grupo: si se reaplicara en cada render,
   * plegarlo a mano no serviría de nada mientras la query siguiera en la URL.
   */
  const grupoPedido = searchParams.get('g')
  useEffect(() => {
    if (!grupoPedido) return
    if (!lib.groups.some((g) => g.id === grupoPedido)) return
    setExpanded((prev) => (prev.has(grupoPedido) ? prev : new Set(prev).add(grupoPedido)))
  }, [grupoPedido, lib.groups])

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

  const subtitulo =
    lib.groups.length === 0
      ? 'Grupos reutilizables entre platos'
      : `${lib.groups.length} grupo${lib.groups.length !== 1 ? 's' : ''}${
          soldOutTotal > 0
            ? ` · ${soldOutTotal} opción${soldOutTotal !== 1 ? 'es' : ''} agotada${soldOutTotal !== 1 ? 's' : ''}`
            : ''
        }`

  return (
    <DashboardShell
      title="Extras y salsas"
      subtitle={subtitulo}
      headerRight={
        <Button variant="soft" size="sm" onClick={() => router.push('/menu')}>
          <Icon name="arrow_back" size={16} />
          Volver al menú
        </Button>
      }
    >
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-2.5">
        {lib.error && <p className="text-[12px] font-semibold text-danger">{lib.error}</p>}

        {lib.loading ? (
          <LoadingState variant="inline" label="Cargando extras…" />
        ) : lib.groups.length === 0 ? (
          <div className="rounded-2xl border border-ink/[0.06] bg-card p-6 text-center">
            <Icon name="library_books" size={28} className="mx-auto text-ink-subtle" />
            <div className="mt-2 text-[15px] font-bold text-ink">Todavía no hay extras</div>
            <p className="mx-auto mt-1 max-w-[420px] text-[13px] text-ink-muted">
              Aquí van los grupos que se repiten entre platos, como «Cremas» o «Término». Se arman
              una vez y se vinculan desde cada plato; al agotar una opción se agota en todos a la
              vez.
            </p>
            <p className="mx-auto mt-2 max-w-[420px] text-[12px] text-ink-muted">
              Si un grupo es solo de un plato, créalo desde el plato: no necesita estar aquí.
            </p>
          </div>
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

        <Button
          variant="brand"
          size="sm"
          className="w-full"
          onClick={() => void lib.addGroup()}
          disabled={lib.busy || !ready}
        >
          <Icon name="add" size={16} />
          Crear grupo
        </Button>
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
    </DashboardShell>
  )
}
