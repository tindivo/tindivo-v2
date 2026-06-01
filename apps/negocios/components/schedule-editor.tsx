'use client'

import { Button, Card, CardBody } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'

// day_of_week 0..6 = Lunes..Domingo (convención del editor).
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

interface Row {
  day_of_week: number
  is_open: boolean
  shift1_start: string
  shift1_end: string
  shift2_start: string | null
  shift2_end: string | null
  crosses_midnight: boolean
}

const blank = (d: number): Row => ({
  day_of_week: d,
  is_open: false,
  shift1_start: '18:00',
  shift1_end: '23:00',
  shift2_start: null,
  shift2_end: null,
  crosses_midnight: false,
})

const timeCls =
  'h-9 rounded-lg border border-border bg-surface px-2 text-[13px] outline-none focus:border-brand'

export function ScheduleEditor() {
  const [bizId, setBizId] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowser()
    const { data: biz } = await supabase.from('businesses').select('id').maybeSingle()
    if (!biz) return
    setBizId(biz.id)
    const { data } = await supabase
      .from('business_schedule')
      .select(
        'day_of_week,is_open,shift1_start,shift1_end,shift2_start,shift2_end,crosses_midnight',
      )
      .eq('business_id', biz.id)
    const map = new Map((data ?? []).map((r) => [r.day_of_week as number, r as Row]))
    setRows(Array.from({ length: 7 }, (_, d) => map.get(d) ?? blank(d)))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  function update(d: number, patch: Partial<Row>) {
    setRows((cur) => cur.map((r) => (r.day_of_week === d ? { ...r, ...patch } : r)))
  }

  async function save() {
    if (!bizId) return
    setSaving(true)
    setMsg(null)
    const payload = rows.map((r) => ({
      business_id: bizId,
      day_of_week: r.day_of_week,
      is_open: r.is_open,
      shift1_start: r.shift1_start,
      shift1_end: r.shift1_end,
      shift2_start: r.shift2_start || null,
      shift2_end: r.shift2_end || null,
      crosses_midnight: r.shift1_end <= r.shift1_start,
    }))
    const { error } = await getSupabaseBrowser()
      .from('business_schedule')
      .upsert(payload, { onConflict: 'business_id,day_of_week' })
    setMsg(error ? error.message : 'Horario guardado')
    setSaving(false)
  }

  if (!bizId) return null

  return (
    <Card className="mt-3">
      <CardBody>
        <p className="mb-1 font-display font-semibold text-[16px] text-ink">Horario de atención</p>
        <p className="mb-2 text-[13px] text-ink-muted">
          Hasta 2 turnos por día. Si el cierre es ≤ apertura, se asume que cruza medianoche.
        </p>
        <div className="space-y-1">
          {rows.map((r) => (
            <div
              key={r.day_of_week}
              className="flex flex-wrap items-center gap-2 border-border border-t py-2"
            >
              <label className="flex w-28 items-center gap-2 text-[14px]">
                <input
                  type="checkbox"
                  checked={r.is_open}
                  onChange={(e) => update(r.day_of_week, { is_open: e.target.checked })}
                />
                {DAYS[r.day_of_week]}
              </label>
              {r.is_open ? (
                <>
                  <input
                    type="time"
                    className={timeCls}
                    value={r.shift1_start}
                    onChange={(e) => update(r.day_of_week, { shift1_start: e.target.value })}
                  />
                  <span className="text-ink-subtle">–</span>
                  <input
                    type="time"
                    className={timeCls}
                    value={r.shift1_end}
                    onChange={(e) => update(r.day_of_week, { shift1_end: e.target.value })}
                  />
                  {r.shift1_end <= r.shift1_start && (
                    <span className="text-[11px] text-ink-subtle">cruza medianoche</span>
                  )}
                  {r.shift2_start == null ? (
                    <button
                      type="button"
                      onClick={() =>
                        update(r.day_of_week, { shift2_start: '12:00', shift2_end: '15:00' })
                      }
                      className="text-[12px] text-brand"
                    >
                      + 2º turno
                    </button>
                  ) : (
                    <>
                      <input
                        type="time"
                        className={timeCls}
                        value={r.shift2_start ?? ''}
                        onChange={(e) => update(r.day_of_week, { shift2_start: e.target.value })}
                      />
                      <span className="text-ink-subtle">–</span>
                      <input
                        type="time"
                        className={timeCls}
                        value={r.shift2_end ?? ''}
                        onChange={(e) => update(r.day_of_week, { shift2_end: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          update(r.day_of_week, { shift2_start: null, shift2_end: null })
                        }
                        className="text-[12px] text-danger"
                      >
                        quitar
                      </button>
                    </>
                  )}
                </>
              ) : (
                <span className="text-[13px] text-ink-subtle">Cerrado</span>
              )}
            </div>
          ))}
        </div>
        <Button size="sm" className="mt-3" disabled={saving} onClick={save}>
          {saving ? 'Guardando…' : 'Guardar horario'}
        </Button>
        {msg && <p className="mt-2 text-[13px] text-ink-muted">{msg}</p>}
      </CardBody>
    </Card>
  )
}
