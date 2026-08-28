'use client'

import { Badge, Button, Icon, IconButton } from '@tindivo/ui'
import { useState } from 'react'
import { soles } from '@/components/dashboard/primitives'
import { groupRuleLabel } from '../lib/utils'
import type { ModifierGroup } from '../types'

interface AttachLibraryGroupModalProps {
  open: boolean
  libraryGroups: ModifierGroup[]
  activeGroupIds: string[]
  onAttach: (group: ModifierGroup) => void
  onClose: () => void
}

export function AttachLibraryGroupModal({
  open,
  libraryGroups,
  activeGroupIds,
  onAttach,
  onClose,
}: AttachLibraryGroupModalProps) {
  const [search, setSearch] = useState('')

  if (!open) return null

  const activeSet = new Set(activeGroupIds)

  const filtered = libraryGroups.filter((g) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      g.name.toLowerCase().includes(q) || g.options.some((o) => o.name.toLowerCase().includes(q))
    )
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 animate-[t-fade-in_150ms_ease]">
      <div className="flex w-full max-w-[540px] max-h-[85vh] flex-col overflow-hidden rounded-2xl bg-card shadow-elev-3">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink/[0.06] px-4 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-dark">
              <Icon name="link" size={20} />
            </div>
            <div>
              <h2 className="text-[16px] font-bold text-ink">Vincular grupo de Extras</h2>
              <p className="text-[12px] text-ink-muted">
                Reutiliza salsas o modificadores creados en tu biblioteca
              </p>
            </div>
          </div>
          <IconButton size="sm" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </IconButton>
        </div>

        {/* Buscador si hay varios grupos */}
        {libraryGroups.length > 3 && (
          <div className="border-b border-ink/[0.06] px-4 py-2.5 bg-surface-subtle/50">
            <div className="relative flex items-center">
              <Icon
                name="search"
                size={16}
                className="pointer-events-none absolute left-3 text-ink-muted"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar grupo o sabor (ej. salsas, cremas)..."
                className="h-9 w-full rounded-xl border border-ink/[0.08] bg-card pl-9 pr-3 text-[13px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>
          </div>
        )}

        {/* Lista de grupos */}
        <div className="flex-1 overflow-y-auto p-4">
          {libraryGroups.length === 0 ? (
            <div className="my-6 flex flex-col items-center justify-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-low text-ink-muted">
                <Icon name="tune" size={24} />
              </div>
              <h3 className="mt-3 text-[15px] font-bold text-ink">Sin grupos en la biblioteca</h3>
              <p className="mt-1 max-w-xs text-[12px] text-ink-muted">
                Aún no has creado grupos globales de extras. Puedes crear uno exclusivo con el botón
                &ldquo;+ Agregar grupo de opciones&rdquo; o armar la biblioteca desde Menú &gt;
                Extras.
              </p>
              <Button size="sm" variant="outline" onClick={onClose} className="mt-4">
                Entendido
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-ink-muted">
              No se encontraron grupos que coincidan con &ldquo;{search}&rdquo;.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filtered.map((group) => {
                const isAlreadyAttached = activeSet.has(group.id)
                const visibleOpts = group.options.filter((o) => !o.isDeleted)

                return (
                  <div
                    key={group.id}
                    className={`flex flex-col gap-2 rounded-2xl border p-3.5 transition-all ${
                      isAlreadyAttached
                        ? 'border-ink/[0.06] bg-surface-subtle/60 opacity-80'
                        : 'border-ink/[0.08] bg-card hover:border-brand/40 hover:shadow-elev-1'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-[15px] font-bold text-ink">{group.name}</h4>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              group.is_required
                                ? 'bg-info/10 text-info'
                                : 'bg-ink/[0.06] text-ink-muted'
                            }`}
                          >
                            {groupRuleLabel(group)}
                          </span>
                          {(group.sharedWith ?? 0) > 0 && (
                            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
                              En {group.sharedWith} plato{group.sharedWith === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>

                        {/* Opciones preview */}
                        <div className="mt-1.5 flex flex-wrap gap-1 text-[11px] text-ink-muted">
                          {visibleOpts.slice(0, 5).map((opt) => (
                            <span
                              key={opt.id}
                              className="rounded-lg bg-surface px-2 py-0.5 text-ink"
                            >
                              {opt.name}
                              {opt.additional_price > 0 && (
                                <span className="ml-1 font-mono font-semibold text-brand-dark">
                                  +{soles(opt.additional_price)}
                                </span>
                              )}
                            </span>
                          ))}
                          {visibleOpts.length > 5 && (
                            <span className="self-center px-1 text-[10px] text-ink-subtle">
                              +{visibleOpts.length - 5} más
                            </span>
                          )}
                        </div>
                      </div>

                      {isAlreadyAttached ? (
                        <Badge variant="default" size="sm" className="shrink-0 gap-1">
                          <Icon name="check" size={13} />
                          Vinculado
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="brand"
                          className="shrink-0 gap-1"
                          onClick={() => {
                            onAttach(group)
                            onClose()
                          }}
                        >
                          <Icon name="add" size={15} />
                          Vincular
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-ink/[0.06] px-4 py-3 bg-surface">
          <Button variant="secondary" size="sm" className="w-full" onClick={onClose}>
            Listo
          </Button>
        </div>
      </div>
    </div>
  )
}
