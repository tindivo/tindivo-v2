'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import type { AdminPhoneRestriction } from '@tindivo/contracts'
import { Button } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState, Ico, SectionHeader, StatusBadge } from '@/components/admin'
import { api, errMsg } from '@/lib/api'

const KIND_LABEL: Record<AdminPhoneRestriction['kind'], string> = {
  blocked: 'Bloqueado',
  contraentrega_blocked: 'Solo prepago',
}

const SOURCE_LABEL: Record<AdminPhoneRestriction['source'], string> = {
  transfer: 'Lo trasladó otra cuenta',
  replaced: 'La cuenta cambió de número',
  account_deleted: 'La cuenta se borró',
}

const LIMA = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  dateStyle: 'medium',
  timeStyle: 'short',
})

/** D-63: el riesgo se queda con el número; la excepción la levanta un admin con un motivo. */
export function PhoneRestrictions() {
  const [items, setItems] = useState<AdminPhoneRestriction[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lifting, setLifting] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<AdminPhoneRestriction[]>>('/admin/phone-restrictions')
      .then((r) => setItems(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const lift = async (id: string) => {
    setSaving(true)
    setError(null)
    try {
      await api.post(`/admin/phone-restrictions/${id}/lift`, { reason: reason.trim() })
      setLifting(null)
      setReason('')
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-8">
      <SectionHeader
        eyebrow="Antifraude"
        title="Números con restricción"
        description="Bloqueos y prepago que un número arrastra de otra cuenta. No levanta strikes."
        right={
          <Button size="sm" variant="outline" onClick={load}>
            Refrescar
          </Button>
        }
      />

      {error && <p className="mb-3 text-[14px] text-danger">{error}</p>}

      {!items ? (
        <div className="h-24 animate-pulse rounded-[22px] bg-ink/[0.05]" />
      ) : items.length === 0 ? (
        <div className="t-card">
          <EmptyState
            icon={<Ico.shield className="h-5 w-5" />}
            title="Sin restricciones"
            hint="Ningún número arrastra un bloqueo de otra cuenta."
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="t-card">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-[14px] text-ink">📞 {r.phone}</p>
                  <p className="text-[13px] text-ink-subtle">
                    {SOURCE_LABEL[r.source]} · {LIMA.format(new Date(r.createdAt))}
                    {r.until ? ` · hasta ${LIMA.format(new Date(r.until))}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge
                    label={KIND_LABEL[r.kind]}
                    tone={r.kind === 'blocked' ? 'danger' : 'warning'}
                  />
                  {lifting !== r.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setLifting(r.id)
                        setReason('')
                      }}
                    >
                      Levantar
                    </Button>
                  )}
                </div>
              </div>
              {lifting === r.id && (
                <div className="mt-3 space-y-2">
                  <textarea
                    rows={2}
                    maxLength={300}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Motivo (por ejemplo: número reciclado, confirmado por WhatsApp)"
                    className="w-full resize-none rounded-xl border border-border bg-card p-3 text-ink outline-none focus:border-brand"
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setLifting(null)}>
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      disabled={saving || reason.trim().length < 3}
                      onClick={() => lift(r.id)}
                    >
                      Levantar restricción
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
