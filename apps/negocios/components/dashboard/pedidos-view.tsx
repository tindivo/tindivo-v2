'use client'

import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import { useState } from 'react'
import type { MobileTab, OrderVM } from '@/lib/orders/view-model'
import { resolveMobileTab, sortCooking } from '@/lib/orders/view-model'
import { CocinaCard, NuevoCard, RepartoCard } from './cards'
import { type DetailActions, type DetailItem, DetailScreen, PausarModal } from './pedido-detail'
import { SourceBadgeMini, soles } from './primitives'

export interface PedidosViewProps {
  bizName: string
  accent: string
  paused: boolean
  pauseMinLeft: number | null
  soundOn: boolean
  onToggleSound: () => void
  onOpenPause: () => void
  onResume: () => void
  counts: { new: number; cooking: number; route: number; delivered: number; cancelled: number }
  newOrders: OrderVM[]
  cookingOrders: OrderVM[]
  routeOrders: OrderVM[]
  history: OrderVM[]
  onOpen: (o: OrderVM) => void
  /** Dígitos internacionales del soporte, o `null` si no hay número usable. */
  supportPhone: string | null
  /** Escalar a Tindivo desde la tarjeta (buffer_p2/p3) y desde el detalle. */
  onCallDriver?: (o: OrderVM) => void
  selected: OrderVM | null
  detailItems: DetailItem[] | null
  detailProofUrl: string | null
  qrUrl: string | null
  detailBusy: boolean
  detailLoadingActions?: boolean
  actions: DetailActions
  showPauseModal: boolean
  onClosePause: () => void
  onConfirmPause: (min: number | null) => void
}

const ACCENT = 'var(--color-brand)'

// El sidebar (desktop) y el bottom-nav (mobile) viven ahora en el chrome compartido
// (components/dashboard/chrome.tsx) y persisten entre secciones; esta vista solo
// renderiza el contenido de la pantalla "Pedidos" (banners + header + kanban + detalle).

// ── Banner de alertas desactivadas ────────────────────────────────────────────
function SoundOffWarning() {
  return (
    <div className="flex items-center gap-2.5 bg-danger px-4 py-2.5 text-[13px] font-semibold text-white">
      <Icon name="warning" size={18} weight={500} filled />
      <span className="flex-1">
        Alertas desactivadas — podrías perder pedidos. Los pedidos se cancelan automáticamente en 5
        minutos si no los atiendes.
      </span>
    </div>
  )
}

// ── Empty states ──────────────────────────────────────────────────────────────
function ColEmpty({ tab }: { tab: 'new' | 'cooking' | 'route' | 'today' }) {
  const msgs = {
    new: {
      icon: 'notifications',
      title: 'Sin pedidos nuevos',
      sub: 'Te avisaremos al instante cuando lleguen.',
    },
    cooking: {
      icon: 'soup_kitchen',
      title: 'Nada en preparación',
      sub: 'Los pedidos aceptados aparecerán aquí.',
    },
    route: {
      icon: 'delivery_dining',
      title: 'Sin pedidos en camino',
      sub: 'Aquí aparecen cuando el motorizado recoge.',
    },
    today: {
      icon: 'check_circle',
      title: 'Sin pedidos cerrados',
      sub: 'El historial del turno aparece aquí.',
    },
  }
  const m = msgs[tab]
  return (
    <div className="flex flex-col items-center rounded-2xl border border-border bg-white px-5 py-8 text-center">
      <Icon name={m.icon} size={32} weight={500} className="mb-2.5 text-ink-subtle" />
      <div className="text-[15px] font-bold">{m.title}</div>
      <div className="mt-1 text-[13px] text-ink-muted">{m.sub}</div>
    </div>
  )
}

function HistoryList({ history }: { history: OrderVM[] }) {
  if (history.length === 0) return <ColEmpty tab="today" />
  // Los dos números se DERIVAN de la misma lista que se pinta debajo, no de
  // `counts`. El chip de la pestaña cuenta solo entregados —se llama
  // "Entregados", contar cancelados ahí sería mentir— y la lista enseña las dos
  // cosas; esa diferencia no estaba explicada en ningún sitio y se leía como un
  // descuadre. Derivarla aquí garantiza que no pueda contradecir a las filas.
  const cancelados = history.filter((h) => h.status === 'cancelled').length
  const entregados = history.length - cancelados
  return (
    <div className="flex flex-col gap-2">
      <p className="px-0.5 text-[12px] text-ink-muted">
        {entregados} {entregados === 1 ? 'entregado' : 'entregados'}
        {cancelados > 0 && ` · ${cancelados} ${cancelados === 1 ? 'cancelado' : 'cancelados'}`}
      </p>
      {history.map((h) => {
        const cancelled = h.status === 'cancelled'
        return (
          <div
            key={h.rowId}
            className={`flex items-center gap-2.5 rounded-xl border border-border bg-white px-3 py-2.5 ${cancelled ? 'opacity-65' : ''}`}
          >
            <Icon
              name={cancelled ? 'cancel' : 'check_circle'}
              size={18}
              weight={500}
              filled
              className={`shrink-0 ${cancelled ? 'text-ink-subtle' : 'text-success'}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-[5px] text-[13px] font-semibold">
                {h.customer ?? 'Cliente'}
                <SourceBadgeMini source={h.source} />
              </div>
              <div className="font-mono text-[11px] text-ink-muted">
                #{h.id}
                {h.closedAt ? ` · ${h.closedAt}` : ''}
                {cancelled && h.cancelReason && (
                  <span className="text-danger"> · {h.cancelReason}</span>
                )}
              </div>
            </div>
            <div
              className={`shrink-0 font-mono text-[14px] font-bold ${cancelled ? 'text-ink-subtle line-through' : 'text-ink'}`}
            >
              {soles(h.total)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── MOBILE ────────────────────────────────────────────────────────────────────
export function PedidosMobile(p: PedidosViewProps) {
  // La guardada y la que se pinta son distintas cuando "Nuevos" está vacía.
  // Ver `resolveMobileTab`.
  const [selectedTab, setTab] = useState<MobileTab>('new')
  const tab = resolveMobileTab(selectedTab, p.counts.new)
  const cooking = [...p.cookingOrders].sort(sortCooking)
  const hasWaiting = p.cookingOrders.some((o) => o.state === 'waiting')

  const tabs = [
    { id: 'new' as const, label: 'Nuevos', count: p.counts.new, alert: p.counts.new > 0 },
    { id: 'cooking' as const, label: 'En cocina', count: p.counts.cooking, alert: false },
    { id: 'route' as const, label: 'Reparto', count: p.counts.route, alert: false },
    { id: 'today' as const, label: 'Entregados', count: p.counts.delivered, alert: false },
  ]

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-surface">
      {p.showPauseModal && (
        <PausarModal busy={p.detailBusy} onClose={p.onClosePause} onConfirm={p.onConfirmPause} />
      )}
      {p.selected && (
        <DetailScreen
          order={p.selected}
          items={p.detailItems}
          proofUrl={p.detailProofUrl}
          qrUrl={p.qrUrl}
          busy={p.detailBusy}
          isLoadingActions={p.detailLoadingActions}
          mobile
          actions={p.actions}
        />
      )}

      {/* Banners */}
      {p.paused && (
        <div className="flex items-center gap-2.5 bg-warning-soft px-3.5 py-2 text-[13px] font-bold text-amber-800">
          <Icon name="pause_circle" size={18} weight={500} filled />
          <span className="flex-1">PAUSADO{p.pauseMinLeft ? ` · ${p.pauseMinLeft}m` : ''}</span>
          <button
            type="button"
            onClick={p.onResume}
            className="rounded-lg bg-ink px-2.5 py-1 text-[12px] font-bold text-white"
          >
            Reanudar
          </button>
        </div>
      )}
      {!p.soundOn && <SoundOffWarning />}
      {hasWaiting && !p.paused && (
        <div className="flex items-center gap-2.5 bg-success px-3.5 py-2 text-[13px] font-bold text-white">
          <Icon name="two_wheeler" size={18} weight={500} filled />
          Motorizado en el local · entrégale el pedido
        </div>
      )}

      {/* Header */}
      <div className="border-b border-ink/[0.06] bg-white/82 px-3.5 pt-2.5 backdrop-blur-md">
        <div className="mb-2 flex items-center gap-2.5">
          <div
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] text-[15px] font-bold text-white"
            style={{ background: p.accent || ACCENT }}
          >
            {p.bizName[0] ?? 'T'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-base font-bold leading-tight tracking-tight">
              {p.bizName}
            </div>
            <div className="mt-0.5 text-[11px] text-ink-muted">
              {p.counts.new + p.counts.cooking + p.counts.route} activos · {p.counts.delivered}{' '}
              entregados hoy
            </div>
          </div>
          <button
            type="button"
            onClick={p.onToggleSound}
            className={`shrink-0 rounded-xl px-2.5 py-1.5 text-[13px] font-semibold transition-transform active:scale-[0.98] ${
              p.soundOn ? 'bg-brand text-white' : 'bg-ink/[0.06] text-ink'
            } ${p.counts.new > 0 && p.soundOn ? 'animate-pulse' : ''}`}
          >
            <Icon
              name={p.soundOn ? 'notifications_active' : 'notifications_off'}
              size={17}
              weight={500}
              filled={p.soundOn}
            />
          </button>
          <button
            type="button"
            onClick={p.paused ? p.onResume : p.onOpenPause}
            className={`flex shrink-0 items-center rounded-xl p-1.5 ${p.paused ? 'bg-warning-soft text-amber-800' : 'bg-ink/[0.08] text-ink'}`}
          >
            <Icon name={p.paused ? 'play_circle' : 'pause_circle'} size={17} weight={500} />
          </button>
        </div>
        <div className="flex gap-1.5 pb-2.5">
          <button
            type="button"
            onClick={() => setTab('today')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink/[0.06] px-3 py-2 text-[13px] font-semibold text-ink transition-transform active:scale-[0.98]"
          >
            <Icon name="history" size={14} weight={500} /> Historial
          </button>
          <Link
            href="/nuevo"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-[13px] font-semibold text-white transition-transform active:scale-[0.98]"
          >
            <Icon name="add" size={14} weight={500} /> Pedido directo
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-[5px] overflow-x-auto border-b border-border bg-surface/95 px-3.5 py-2 backdrop-blur-sm scrollbar-hide">
        {tabs.map(
          (t) =>
            (t.id !== 'new' || t.count > 0) && (
              <button
                type="button"
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex shrink-0 items-center gap-[5px] rounded-full px-2.5 py-2 text-[13px] font-semibold transition-colors ${
                  tab === t.id ? 'bg-ink text-white' : 'border border-border bg-white text-ink'
                }`}
              >
                {t.label}
                {t.count > 0 && (
                  <span
                    className={`inline-flex min-h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-black ${
                      t.alert
                        ? 'bg-danger text-white'
                        : tab === t.id
                          ? 'bg-white/20 text-white'
                          : 'bg-ink/[0.08] text-ink'
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            ),
        )}
      </div>

      {/* List */}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3.5 py-3">
        {tab === 'new' &&
          (p.newOrders.length > 0 ? (
            p.newOrders.map((o) => <NuevoCard key={o.rowId} order={o} onOpen={p.onOpen} />)
          ) : (
            <ColEmpty tab="new" />
          ))}
        {tab === 'cooking' &&
          (cooking.length > 0 ? (
            cooking.map((o) => (
              <CocinaCard
                key={o.rowId}
                order={o}
                onOpen={p.onOpen}
                supportPhone={p.supportPhone}
                onCallDriver={p.onCallDriver}
              />
            ))
          ) : (
            <ColEmpty tab="cooking" />
          ))}
        {tab === 'route' &&
          (p.routeOrders.length > 0 ? (
            p.routeOrders.map((o) => <RepartoCard key={o.rowId} order={o} onOpen={p.onOpen} />)
          ) : (
            <ColEmpty tab="route" />
          ))}
        {tab === 'today' && <HistoryList history={p.history} />}
      </div>
    </div>
  )
}

// ── DESKTOP ───────────────────────────────────────────────────────────────────
function KanbanCol({
  title,
  count,
  dotClass,
  subtitle,
  children,
}: {
  title: string
  count: number
  dotClass: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 shrink-0 bg-white">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold">{title}</div>
          <div className="mt-px text-[10px] text-ink-muted">{subtitle}</div>
        </div>
        <span
          className={`inline-flex min-h-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
            count > 0 ? 'bg-danger text-white' : 'bg-ink/[0.08] text-ink'
          }`}
        >
          {count}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5 pb-4">
        {children}
      </div>
    </div>
  )
}

export function PedidosDesktop(p: PedidosViewProps) {
  const cooking = [...p.cookingOrders].sort(sortCooking)
  const hasWaiting = p.cookingOrders.some((o) => o.state === 'waiting')

  return (
    <div className="relative flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden bg-surface h-full">
      {p.showPauseModal && (
        <PausarModal busy={p.detailBusy} onClose={p.onClosePause} onConfirm={p.onConfirmPause} />
      )}

      {/* Banners */}
      {p.paused && (
        <div className="flex items-center gap-3.5 bg-warning-soft px-6 py-2 text-amber-800">
          <Icon name="pause_circle" size={20} weight={500} filled />
          <div className="flex-1 text-[14px] font-bold">
            PEDIDOS PAUSADOS{p.pauseMinLeft ? ` · Reactiva en ${p.pauseMinLeft}m` : ''}
          </div>
          <button
            type="button"
            onClick={p.onResume}
            className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-3 py-1.5 text-[13px] font-semibold text-white transition-transform active:scale-[0.98]"
          >
            <Icon name="play_circle" size={16} weight={500} filled /> Reanudar ahora
          </button>
        </div>
      )}
      {!p.soundOn && <SoundOffWarning />}
      {hasWaiting && (
        <div className="flex items-center gap-3.5 bg-success px-6 py-2 text-[14px] font-bold text-white">
          <Icon name="two_wheeler" size={20} weight={500} filled />
          <div className="flex-1">Motorizado en el local — entrégale el pedido</div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center gap-4 border-b border-ink/[0.06] bg-white/82 px-6 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-[10px] text-base font-bold text-white"
            style={{ background: p.accent || ACCENT }}
          >
            {p.bizName[0] ?? 'T'}
          </div>
          <div>
            <div className="font-display text-[17px] font-bold leading-tight tracking-tight">
              {p.bizName}
            </div>
            <div className="mt-0.5 text-[11px] text-ink-muted">
              <span className={`font-bold ${p.paused ? 'text-amber-700' : 'text-success'}`}>
                {p.paused ? '⏸ Pausado' : '● Abierto'}
              </span>
              {' · '}
              {p.counts.new} nuevos · {p.counts.cooking} cocina · {p.counts.route} reparto ·{' '}
              {p.counts.delivered} hoy
            </div>
          </div>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Link
            href="/nuevo"
            className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-[13px] font-semibold text-white transition-transform active:scale-[0.98]"
          >
            <Icon name="add" size={15} weight={500} /> Pedido directo
          </Link>
          <button
            type="button"
            onClick={p.paused ? p.onResume : p.onOpenPause}
            className={`inline-flex items-center gap-1.5 rounded-xl border-0 px-3 py-2 text-[13px] font-semibold transition-transform active:scale-[0.98] ${
              p.paused ? 'bg-warning-soft text-amber-800' : 'bg-ink/[0.08] text-ink'
            }`}
          >
            <Icon name={p.paused ? 'play_circle' : 'pause_circle'} size={16} weight={500} filled />
            {p.paused ? 'Reanudar' : 'Pausar pedidos'}
          </button>
          <button
            type="button"
            onClick={p.onToggleSound}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition-transform active:scale-[0.98] ${
              p.soundOn ? 'bg-brand text-white' : 'bg-ink/[0.06] text-ink'
            } ${p.counts.new > 0 && p.soundOn ? 'animate-pulse' : ''}`}
          >
            <Icon
              name={p.soundOn ? 'notifications_active' : 'notifications_off'}
              size={15}
              weight={500}
              filled={p.soundOn}
            />
            Alertas {p.soundOn ? 'ON' : 'OFF'}
          </button>
        </div>
      </header>

      {/* Urgent bar */}
      {p.counts.new > 0 && (
        <div className="mx-5 mt-2.5 flex items-center gap-3 rounded-xl border border-danger/30 bg-white px-4 py-2">
          <Icon
            name="notifications_active"
            size={20}
            weight={500}
            filled
            className="shrink-0 text-danger"
          />
          <div className="flex-1">
            <div className="text-[14px] font-bold">
              {p.counts.new}{' '}
              {p.counts.new === 1 ? 'pedido nuevo requiere' : 'pedidos nuevos requieren'} revisión
            </div>
            <div className="text-[12px] text-ink-muted">
              Toca cada card para ver el detalle y aceptar o rechazar. Se cancelan automáticamente
              en 5 min.
            </div>
          </div>
        </div>
      )}

      {/* Kanban 3 columnas */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_1.4fr_0.9fr] grid-rows-[1fr] gap-3 overflow-hidden p-5">
        <KanbanCol
          title="Nuevos"
          count={p.counts.new}
          dotClass="bg-danger"
          subtitle="Revisar antes de aceptar"
        >
          {p.newOrders.length > 0 ? (
            p.newOrders.map((o) => <NuevoCard key={o.rowId} order={o} compact onOpen={p.onOpen} />)
          ) : (
            <div className="px-2 py-5 text-center text-[12px] text-ink-subtle">
              Sin pedidos nuevos · te avisaremos cuando lleguen
            </div>
          )}
        </KanbanCol>

        <KanbanCol
          title="En cocina"
          count={p.counts.cooking}
          dotClass="bg-brand-dark"
          subtitle="Cocinando + esperando moto"
        >
          {cooking.length > 0 ? (
            cooking.map((o) => (
              <CocinaCard
                key={o.rowId}
                order={o}
                compact
                onOpen={p.onOpen}
                supportPhone={p.supportPhone}
                onCallDriver={p.onCallDriver}
              />
            ))
          ) : (
            <div className="px-2 py-5 text-center text-[12px] text-ink-subtle">
              Nada en preparación
            </div>
          )}
        </KanbanCol>

        <KanbanCol
          title="En reparto"
          count={p.counts.route}
          dotClass="bg-purple-700"
          subtitle="Solo monitoreo · timer desde recogida"
        >
          {p.routeOrders.length > 0 ? (
            p.routeOrders.map((o) => (
              <RepartoCard key={o.rowId} order={o} compact onOpen={p.onOpen} />
            ))
          ) : (
            <div className="px-2 py-5 text-center text-[12px] text-ink-subtle">
              Sin pedidos en camino
            </div>
          )}
        </KanbanCol>
      </div>

      {/* Detail side panel */}
      {p.selected && (
        <DetailScreen
          order={p.selected}
          items={p.detailItems}
          proofUrl={p.detailProofUrl}
          qrUrl={p.qrUrl}
          busy={p.detailBusy}
          isLoadingActions={p.detailLoadingActions}
          actions={p.actions}
        />
      )}
    </div>
  )
}
