'use client'

import { formatStorePrice, type StoreStatus } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import type { ComponentProps } from 'react'
import { useEffect, useRef } from 'react'
import type { Goal, StoreItem, StoreListData } from './types'

/**
 * Icono DECORATIVO. `Icon` escribe el nombre del glifo como texto (es una
 * ligadura de fuente) y los lectores de pantalla lo leen: un botón «Vendido»
 * con icono se anunciaba «paid Vendido». Envuelto en `aria-hidden` desaparece
 * del nombre accesible.
 */
export function Deco(props: ComponentProps<typeof Icon>) {
  return (
    <span aria-hidden="true" className="inline-flex">
      <Icon {...props} />
    </span>
  )
}

export const STATUS_LABEL: Record<StoreStatus, string> = {
  draft: 'Borrador',
  available: 'Disponible',
  reserved: 'Reservado',
  sold: 'Vendido',
  hidden: 'Oculto',
}

/** «hace 2 h», «hace 3 días»: lo justo para saber si un borrador está fresco. */
export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (mins < 1) return 'hace un momento'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.round(hours / 24)
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`
}

/** Chip de estado de la fila: SOLO informativo, no es un control (PRD §6.1). */
export function StatusChip({ status }: { status: StoreStatus }) {
  return <span className={`as-st ${status}`}>{STATUS_LABEL[status]}</span>
}

function Kpi({
  value,
  label,
  goal,
  money = false,
}: {
  value: number
  label: string
  goal: Goal
  money?: boolean
}) {
  const fmt = (n: number) => (money ? `S/${n}` : String(n))
  const pct = Math.min(100, Math.round((value / goal.target) * 100))
  return (
    <div className="as-kpi">
      <div className="n">{fmt(value)}</div>
      <div className="l">{label}</div>
      <div className="m">
        mín {fmt(goal.min)} · meta {fmt(goal.target)}
      </div>
      <div className="bar" aria-hidden="true">
        <i className={value >= goal.min ? 'ok' : ''} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const REF_LABEL: Record<string, string> = {
  fb: 'Facebook',
  mp: 'Marketplace',
  wa_estado: 'Estado de WhatsApp',
  grupo: 'Grupo',
  tiktok: 'TikTok',
  directo: 'Directo',
}

/** «Día 6 de 14» con visitas, clics a WhatsApp, ventas y monto contra su mínimo y su meta. */
export function ExperimentSummary({ data }: { data: StoreListData }) {
  const m = data.metrics
  if (m.day === 0) {
    return (
      <section className="as-exp" aria-label="Experimento">
        <div className="as-exp-hd">
          <b>Experimento de 14 días</b>
          <span>Empieza al publicar el primer artículo</span>
        </div>
      </section>
    )
  }
  return (
    <section className="as-exp" aria-label="Experimento">
      <div className="as-exp-hd">
        <b>
          Día {m.day} de {m.totalDays}
        </b>
        <span>{m.published} publicados</span>
      </div>
      <div className="as-prog" aria-hidden="true">
        <i style={{ width: `${Math.round((m.day / m.totalDays) * 100)}%` }} />
      </div>
      <div className="as-kpis">
        <Kpi value={m.visits} label="Visitas" goal={data.goals.visits} />
        <Kpi value={m.whatsappClicks} label="Clics WA" goal={data.goals.whatsappClicks} />
        <Kpi value={m.sales} label="Ventas" goal={data.goals.sales} />
        <Kpi value={m.amountSold} label="Vendido" goal={data.goals.amountSold} money />
      </div>
      {m.byRef.length > 0 && (
        <div className="as-refs">
          {m.byRef.map((r) => (
            <span key={r.ref}>
              {REF_LABEL[r.ref] ?? r.ref}: {r.visits} visitas · {r.whatsappClicks} clics
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

/** Fila de la lista. Tocarla abre la hoja de acciones (el chip no es un control). */
export function ProductRow({ item, onOpen }: { item: StoreItem; onOpen: () => void }) {
  return (
    <button type="button" className="as-item" onClick={onOpen}>
      <div className={`th ${item.status === 'sold' ? 'sold' : ''}`}>
        {item.thumbUrl && (
          // biome-ignore lint/performance/noImgElement: miniatura de Storage
          <img src={item.thumbUrl} alt="" loading="lazy" />
        )}
      </div>
      <div className="mid">
        <div className="t1">
          <span className="code">{item.code}</span>
          <StatusChip status={item.status} />
        </div>
        <h2>{item.title ?? 'Sin título'}</h2>
        <div className="t3">
          <span>
            <Icon name="visibility" size={16} />
            {item.views}
          </span>
          <span>
            <Icon name="chat" size={16} />
            {item.whatsappClicks}
          </span>
          <span className="pr">{item.price === null ? '—' : formatStorePrice(item.price)}</span>
        </div>
      </div>
    </button>
  )
}

/**
 * Aviso inferior de 5 segundos con «Deshacer» (PRD §6.2): cada cambio de estado
 * se puede revertir sin ventanas de confirmación. La barra se vacía en 5 s.
 */
export function UndoToast({
  message,
  onUndo,
  onDone,
}: {
  message: string
  onUndo?: () => void
  onDone: () => void
}) {
  // El temporizador arranca UNA vez por aviso (el padre lo monta con `key`): si
  // dependiera de `onDone`, cualquier re-render del padre lo reiniciaría y el
  // aviso no desaparecería nunca. `done` guarda siempre la última versión.
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    const t = setTimeout(() => done.current(), 5000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="as-toast" role="status">
      <span>{message}</span>
      {onUndo && (
        <button type="button" onClick={onUndo}>
          Deshacer
        </button>
      )}
      <i className="cd" aria-hidden="true" />
    </div>
  )
}
