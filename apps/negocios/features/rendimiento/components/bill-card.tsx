'use client'

import type { PerformanceBill } from '@tindivo/core'
import { Card, Icon } from '@tindivo/ui'
import Link from 'next/link'

function soles(n: number): string {
  return `S/ ${n.toFixed(2)}`
}

/**
 * Lo que el periodo le generó de deuda con Tindivo, DESGLOSADO.
 *
 * Antes esta pantalla mostraba solo la comisión y la llamaba «Inversión en
 * Tindivo». En producción eso era S/ 588 mientras «Mi cuenta» cobraba S/ 1,380:
 * dos pantallas, dos números, los dos rotulados como lo que se le paga a
 * Tindivo. Ahora sale de `business_charges`, la misma tabla que factura, y se
 * enseña entero — incluido el envío, que el negocio cobró al cliente y tiene
 * que entregar.
 */
export function BillCard({ bill }: { bill: PerformanceBill }) {
  const rows = [
    { key: 'commission', label: 'Comisión del servicio', value: bill.commission },
    { key: 'deliveryFee', label: 'Envíos que cobraste y entregas', value: bill.deliveryFee },
    { key: 'refund', label: 'Devoluciones', value: bill.refund },
  ].filter((r) => r.value > 0)

  return (
    <Card className="flex flex-col p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-info-soft text-info">
          <Icon name="account_balance_wallet" size={18} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink">Lo que generó este periodo con Tindivo</h3>
          <p className="text-xs text-ink-muted">Los mismos cargos que ves en Mi cuenta</p>
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-2 border-b border-ink/[0.06] pb-3">
        <span className="font-mono text-[26px] font-bold leading-none tracking-tight text-ink">
          {soles(bill.total)}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-ink-muted">Sin cargos generados en este rango.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5 text-xs">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-2">
              <span className="text-ink-muted">{r.label}</span>
              <span className="font-mono font-bold tabular-nums text-ink">{soles(r.value)}</span>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/deuda"
        className="mt-4 inline-flex items-center gap-1 self-start text-xs font-semibold text-brand no-underline hover:underline"
      >
        Ver mi saldo al día <Icon name="arrow_right_alt" size={15} />
      </Link>
    </Card>
  )
}
