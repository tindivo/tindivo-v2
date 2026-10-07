'use client'

import type { StoreStatus } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActionSheet } from '@/components/store/action-sheet'
import { ExperimentSummary, ProductRow, timeAgo, UndoToast } from '@/components/store/parts'
import { storeApi } from '@/components/store/store-api'
import type { StoreItem, StoreListData } from '@/components/store/types'
import { errMsg } from '@/lib/api'

type Tab = Extract<StoreStatus, 'available' | 'reserved' | 'sold' | 'hidden'>

const TABS: { id: Tab; label: string }[] = [
  { id: 'available', label: 'Disponibles' },
  { id: 'reserved', label: 'Reservados' },
  { id: 'sold', label: 'Vendidos' },
  { id: 'hidden', label: 'Más' },
]

const EMPTY: Record<Tab, string> = {
  available: 'No tienes artículos disponibles. Toca «Nuevo artículo» para publicar el primero.',
  reserved: 'Nada reservado por ahora.',
  sold: 'Aún no hay ventas.',
  hidden: 'No hay artículos ocultos.',
}

interface Toast {
  id: number
  message: string
  undo?: () => void
}

/**
 * Lista del admin de Tindivo Store (PRD §6.1): resumen del experimento, aviso de
 * borradores, pestañas, filas informativas y «Nuevo artículo» flotante. Tocar
 * una fila abre las acciones de SU estado; cada cambio avisa 5 s con «Deshacer».
 */
export default function StoreAdminPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('available')
  const [data, setData] = useState<StoreListData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<StoreItem | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)
  // Cada carga lleva un número: si el comprador cambia de pestaña antes de que
  // llegue la respuesta anterior, esa respuesta tardía se descarta en vez de
  // pintar los artículos de OTRA pestaña bajo el chip de ésta.
  const loadSeq = useRef(0)

  const say = useCallback((message: string, undo?: () => void) => {
    setToast({ id: Date.now(), message, undo })
  }, [])

  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    try {
      const d = await storeApi.list(tab)
      const drafts = d.drafts.count > 0 ? await storeApi.list('draft') : null
      if (seq !== loadSeq.current) return
      setData(d)
      setDraftId(drafts?.items[0]?.id ?? null)
      setError(null)
    } catch (e) {
      if (seq === loadSeq.current) setError(errMsg(e))
    }
  }, [tab])

  useEffect(() => {
    void load()
  }, [load])

  async function change(item: StoreItem, to: 'available' | 'reserved' | 'sold' | 'hidden') {
    try {
      const r = await storeApi.setStatus(item.id, to)
      setSelected(null)
      const prev = r.previous.status
      const message =
        to === 'sold'
          ? 'Marcado como vendido'
          : to === 'reserved'
            ? 'Marcado como reservado'
            : to === 'hidden'
              ? 'Artículo oculto'
              : prev === 'hidden'
                ? 'Publicado de nuevo'
                : 'Vuelve a estar disponible'
      say(message, async () => {
        // Deshacer = otro cambio de estado hacia el anterior; el trigger de la
        // base limpia `sold_at` solo. Un borrador no es destino válido.
        if (prev === 'draft') return
        try {
          await storeApi.setStatus(item.id, prev)
          say('Cambio deshecho')
          await load()
        } catch (e) {
          say(errMsg(e))
        }
      })
      await load()
    } catch (e) {
      setSelected(null)
      say(errMsg(e))
    }
  }

  async function duplicate(item: StoreItem) {
    try {
      const copy = await storeApi.duplicate(item.id)
      router.push(`/store/${copy.id}`)
    } catch (e) {
      say(errMsg(e))
    }
  }

  async function deleteDraft(item: StoreItem) {
    try {
      await storeApi.deleteDraft(item.id)
      setSelected(null)
      say('Borrador eliminado')
      await load()
    } catch (e) {
      say(errMsg(e))
    }
  }

  return (
    <>
      <div className="as-top">
        <h1>
          Tienda
          <span className="sub">Artículos nuevos y de segunda</span>
        </h1>
        <Link href="/store/ajustes" className="as-iconbtn" aria-label="Ajustes de la tienda">
          <Icon name="settings" size={22} />
        </Link>
      </div>

      {error && <div className="as-err">{error}</div>}

      {data && <ExperimentSummary data={data} />}

      {data && data.drafts.count > 0 && draftId && (
        <div className="as-draftnote">
          <div className="tx">
            Tienes {data.drafts.count}{' '}
            {data.drafts.count === 1 ? 'borrador pendiente' : 'borradores pendientes'}
            <span>Actualizado {timeAgo(data.drafts.lastUpdatedAt)}</span>
          </div>
          <Link href={`/store/${draftId}`} className="as-go">
            Continuar
            <Icon name="chevron_right" size={20} />
          </Link>
        </div>
      )}

      <div className="as-tabs" role="tablist" aria-label="Estado">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className="as-tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {data && <em>{data.counts[t.id]}</em>}
          </button>
        ))}
      </div>

      <div className="as-list">
        {data?.items.map((item) => (
          <ProductRow key={item.id} item={item} onOpen={() => setSelected(item)} />
        ))}
        {data && data.items.length === 0 && <div className="as-empty">{EMPTY[tab]}</div>}
        {!data && !error && <div className="as-empty">Cargando…</div>}
      </div>

      <Link href="/store/nuevo" className="as-fab">
        <Icon name="add" size={24} />
        Nuevo artículo
      </Link>

      <ActionSheet
        item={selected}
        onClose={() => setSelected(null)}
        handlers={{
          onStatus: (to) => selected && void change(selected, to),
          onDuplicate: () => selected && void duplicate(selected),
          onDeleteDraft: () => selected && void deleteDraft(selected),
          onCopied: (what) => say(what),
        }}
      />

      {toast && (
        <UndoToast
          key={toast.id}
          message={toast.message}
          onUndo={toast.undo}
          onDone={() => setToast(null)}
        />
      )}
    </>
  )
}
