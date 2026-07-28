'use client'

import { Button } from '@tindivo/ui'
import { useEffect, useMemo, useState } from 'react'
import { api, errMsg } from '@/lib/api'
import { soles } from '@/lib/format'

export interface PendingGroup {
  orderId: string | null
  shortId: string | null
  reportId: string | null
  date: string
  createdAt: string
  charges: Array<{
    id: string
    type: string
    amount: number
    description: string | null
  }>
  subtotal: number
}

interface SettlementOption {
  chargeIds: string[]
  totalAmount: number
  unitCount: number
  label: string
}

interface SettlementModalProps {
  businessId: string
  businessName: string
  balanceDue: number
  onClose: () => void
  onSuccess: () => void
}

export function SettlementModal({
  businessId,
  businessName,
  balanceDue,
  onClose,
  onSuccess,
}: SettlementModalProps) {
  const [groups, setGroups] = useState<PendingGroup[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [targetAmount, setTargetAmount] = useState<string>('')
  const [selectedOption, setSelectedOption] = useState<SettlementOption | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'yape' | 'plin' | 'efectivo' | 'otro'>('yape')
  const [note, setNote] = useState('')

  // Cargar cargos pendientes FIFO
  useEffect(() => {
    api
      .get<{ data: PendingGroup[] }>(`/admin/charges?businessId=${businessId}`)
      .then((r) => {
        setGroups(r.data)
      })
      .catch((e) => setError(errMsg(e)))
  }, [businessId])

  // Total acumulado real de todos los cargos pendientes
  const totalPendingAmount = useMemo(() => {
    return (groups || []).reduce((sum, g) => sum + g.subtotal, 0)
  }, [groups])

  // Todos los IDs de cargos para la opción de pagar todo
  const allChargeIds = useMemo(() => {
    return (groups || []).flatMap((g) => g.charges.map((c) => c.id))
  }, [groups])

  // Cálculo de opciones de redondeo FIFO
  const options = useMemo(() => {
    if (!groups || groups.length === 0) return []

    const numInput = Number.parseFloat(targetAmount.replace(',', '.'))

    // Si no hay input numérico válido o se ingresa 0, ofrecer por defecto la opción completa
    if (Number.isNaN(numInput) || numInput <= 0) {
      return [
        {
          chargeIds: allChargeIds,
          totalAmount: totalPendingAmount,
          unitCount: groups.length,
          label: `Pagar total pendiente → ${soles(totalPendingAmount)} (${groups.length} ítem${groups.length > 1 ? 's' : ''})`,
        },
      ]
    }

    // Si el monto ingresado supera o iguala la deuda total, ofrecer pagar todo
    if (numInput >= totalPendingAmount - 0.005) {
      return [
        {
          chargeIds: allChargeIds,
          totalAmount: totalPendingAmount,
          unitCount: groups.length,
          label: `Pagar total pendiente → ${soles(totalPendingAmount)} (${groups.length} ítem${groups.length > 1 ? 's' : ''})`,
        },
      ]
    }

    let runningSum = 0
    let prevSum = 0
    let lowerGroupIndex = -1
    let upperGroupIndex = -1

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      if (!g) continue
      prevSum = runningSum
      runningSum += g.subtotal

      if (Math.abs(runningSum - numInput) < 0.005) {
        // Coincidencia exacta
        const ids = groups.slice(0, i + 1).flatMap((item) => item.charges.map((c) => c.id))
        return [
          {
            chargeIds: ids,
            totalAmount: runningSum,
            unitCount: i + 1,
            label: `Liquidar ${i + 1} ítem${i > 0 ? 's' : ''} → ${soles(runningSum)}`,
          },
        ]
      }

      if (runningSum > numInput) {
        lowerGroupIndex = i - 1
        upperGroupIndex = i
        break
      }
    }

    const opts: SettlementOption[] = []

    if (lowerGroupIndex >= 0) {
      const lowerGroups = groups.slice(0, lowerGroupIndex + 1)
      const ids = lowerGroups.flatMap((g) => g.charges.map((c) => c.id))
      const sum = lowerGroups.reduce((s, g) => s + g.subtotal, 0)
      opts.push({
        chargeIds: ids,
        totalAmount: sum,
        unitCount: lowerGroupIndex + 1,
        label: `Redondear abajo (${lowerGroupIndex + 1} ítem${lowerGroupIndex > 0 ? 's' : ''}) → ${soles(sum)}`,
      })
    }

    if (upperGroupIndex >= 0) {
      const upperGroups = groups.slice(0, upperGroupIndex + 1)
      const ids = upperGroups.flatMap((g) => g.charges.map((c) => c.id))
      const sum = upperGroups.reduce((s, g) => s + g.subtotal, 0)
      opts.push({
        chargeIds: ids,
        totalAmount: sum,
        unitCount: upperGroupIndex + 1,
        label: `Redondear arriba (${upperGroupIndex + 1} ítem${upperGroupIndex > 0 ? 's' : ''}) → ${soles(sum)}`,
      })
    }

    return opts
  }, [groups, targetAmount, totalPendingAmount, allChargeIds])

  // Seleccionar automáticamente la primera opción calculada si la opción previa deja de ser válida
  useEffect(() => {
    const firstOpt = options[0]
    if (firstOpt) {
      setSelectedOption(firstOpt)
    } else {
      setSelectedOption(null)
    }
  }, [options])

  async function handleSubmit() {
    if (!selectedOption || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.post('/admin/charges/settle', {
        business_id: businessId,
        charge_ids: selectedOption.chargeIds,
        total_amount: selectedOption.totalAmount,
        payment_method: paymentMethod,
        note: note.trim() || undefined,
      })
      onSuccess()
    } catch (e) {
      setError(errMsg(e))
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        role="document"
        className="w-full max-w-lg rounded-[22px] bg-white p-6 shadow-2xl border border-border max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3 mb-4">
          <div>
            <h3 className="text-[16px] font-bold text-ink">Liquidar deuda — {businessName}</h3>
            <p className="text-[12px] text-ink-muted">
              Deuda total acumulada:{' '}
              <span className="font-mono font-bold text-danger">{soles(balanceDue)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[18px] text-ink-subtle hover:text-ink"
          >
            ✕
          </button>
        </div>

        {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}

        {!groups ? (
          <div className="h-40 animate-pulse rounded-xl bg-ink/[0.05]" />
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Lista de cargos pendientes FIFO */}
            <div>
              <p className="mb-2 text-[12px] font-semibold text-ink-muted uppercase tracking-wider">
                Cargos pendientes ({groups.length} unidades — del más antiguo al más reciente):
              </p>
              <div className="max-h-44 overflow-y-auto rounded-xl border border-ink/10 bg-ink/[0.02] p-2 space-y-1.5 text-[12px]">
                {groups.map((g, idx) => (
                  <div
                    key={g.orderId ?? g.reportId ?? idx}
                    className="flex items-center justify-between rounded-lg bg-white p-2 border border-ink/5 shadow-2xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-ink">
                        {g.shortId ? `#${g.shortId}` : g.reportId ? 'Devolución' : 'Cargo'}
                      </span>
                      <span className="ml-2 text-ink-subtle text-[11px]">{g.date}</span>
                      <div className="text-[11px] text-ink-muted">
                        {g.charges
                          .map(
                            (c) =>
                              `${c.type === 'commission' ? 'Comisión' : c.type === 'delivery_fee' ? 'Delivery' : 'Devolución'}: ${soles(c.amount)}`,
                          )
                          .join(' + ')}
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-ink">{soles(g.subtotal)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Input de monto libre y opciones de redondeo */}
            <div className="rounded-xl border border-ink/10 bg-white p-3.5 space-y-3">
              <label className="block text-[12px] font-semibold text-ink">
                Monto que va a pagar el restaurante (S/):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={`Ej: ${totalPendingAmount}`}
                  className="t-field font-mono font-bold text-[15px] flex-1"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => {
                    setTargetAmount(String(totalPendingAmount))
                  }}
                >
                  Pagar todo ({soles(totalPendingAmount)})
                </Button>
              </div>

              {/* Opciones de redondeo calculadas */}
              {options.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
                    Opciones de liquidación (FIFO):
                  </p>
                  {options.map((opt, i) => {
                    const isSelected =
                      selectedOption?.totalAmount === opt.totalAmount &&
                      selectedOption?.unitCount === opt.unitCount
                    return (
                      <label
                        key={i}
                        className={`flex items-center justify-between rounded-lg border p-2.5 cursor-pointer text-[13px] transition-colors ${
                          isSelected
                            ? 'border-brand bg-brand/5 text-ink font-semibold'
                            : 'border-ink/10 hover:border-ink/20 text-ink-muted'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="settlement_option"
                            checked={isSelected}
                            onChange={() => setSelectedOption(opt)}
                            className="accent-brand"
                          />
                          <span>{opt.label}</span>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Método de pago y Nota */}
            <div className="space-y-3">
              <div>
                <label className="block mb-1.5 text-[12px] font-semibold text-ink">
                  Método de pago recibido:
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['yape', 'plin', 'efectivo', 'otro'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`rounded-lg py-2 text-[12px] font-semibold capitalize border transition-colors ${
                        paymentMethod === m
                          ? 'border-brand bg-brand text-white'
                          : 'border-ink/10 bg-white text-ink hover:bg-ink/[0.02]'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block mb-1 text-[12px] font-semibold text-ink">
                  Nota / Referencia de pago (opcional):
                </label>
                <input
                  type="text"
                  placeholder="Ej: Depósito Yape #98765"
                  className="t-field text-[13px] w-full"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="mt-4 border-t pt-3 flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" disabled={!selectedOption || busy} onClick={handleSubmit}>
            {busy ? 'Registrando…' : `Registrar pago — ${soles(selectedOption?.totalAmount ?? 0)}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
