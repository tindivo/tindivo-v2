'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Ico } from './icons'

interface Signal {
  label: string
  count: number
  href: string
}

/** Campana de alertas: agrega señales operativas de los endpoints existentes. */
export function AlertsBell() {
  const [signals, setSignals] = useState<Signal[]>([])
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    const safe = async <T,>(
      p: Promise<ApiEnvelope<T>>,
      pick: (d: T) => number,
    ): Promise<number> => {
      try {
        return pick((await p).data)
      } catch {
        return 0
      }
    }
    const [reports, cash, conting, settle, biz, orders] = await Promise.all([
      safe(api.get<ApiEnvelope<unknown[]>>('/admin/reports?status=open'), (d) => d.length),
      safe(
        api.get<ApiEnvelope<unknown[]>>('/admin/cash-settlements?status=disputed'),
        (d) => d.length,
      ),
      safe(
        api.get<ApiEnvelope<{ advances: { status: string }[] }>>('/admin/contingency'),
        (d) => d.advances.filter((a) => a.status === 'disputado').length,
      ),
      safe(
        api.get<ApiEnvelope<{ status: string }[]>>('/admin/settlements'),
        (d) => d.filter((s) => s.status === 'overdue').length,
      ),
      safe(
        api.get<ApiEnvelope<{ is_blocked: boolean }[]>>('/admin/businesses'),
        (d) => d.filter((b) => b.is_blocked).length,
      ),
      safe(
        api.get<ApiEnvelope<{ status: string }[]>>('/admin/orders'),
        (d) => d.filter((o) => o.status === 'waiting_driver').length,
      ),
    ])
    setSignals([
      { label: 'Reportes abiertos', count: reports, href: '/reportes' },
      { label: 'Disputas de efectivo', count: cash, href: '/efectivo' },
      { label: 'Adelantos en disputa', count: conting, href: '/contingencia' },
      { label: 'Liquidaciones vencidas', count: settle, href: '/cobros' },
      { label: 'Negocios bloqueados', count: biz, href: '/negocios' },
      { label: 'Pedidos sin motorizado', count: orders, href: '/orders' },
    ])
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  const total = signals.reduce((s, x) => s + x.count, 0)
  const active = signals.filter((s) => s.count > 0)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-9 w-9 place-items-center rounded-xl bg-ink/[0.06] text-ink transition-colors hover:bg-ink/[0.1]"
        aria-label="Alertas"
      >
        <Ico.bell className="h-5 w-5" />
        {total > 0 && (
          <span className="-top-1 -right-1 absolute grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 font-mono text-[10px] text-white">
            {total}
          </span>
        )}
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-40 mt-2 w-72 rounded-[18px] border border-border bg-card p-2 shadow-elev-3">
            <p className="t-eyebrow px-2 py-1.5">Alertas</p>
            {active.length === 0 ? (
              <p className="px-2 py-3 text-[13px] text-ink-subtle">Todo en orden. 🎉</p>
            ) : (
              active.map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 text-[14px] transition-colors hover:bg-ink/[0.04]"
                >
                  <span className="text-ink-muted">{s.label}</span>
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-danger/15 px-1 font-mono text-[11px] text-danger">
                    {s.count}
                  </span>
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
