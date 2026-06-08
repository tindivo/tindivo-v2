'use client'

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { soles } from '@/lib/format'

interface Point {
  bucket: string
  gmv: number
  commission: number
  orders: number
  cancelled: number
}

/** 'YYYY-MM-DD' → 'DD/MM' · 'YYYY-MM-DDTHH:00' → 'HHh'. */
function fmtBucket(b: string) {
  if (b.includes('T')) return `${b.slice(11, 13)}h`
  const [, mm, dd] = b.split('-')
  return `${dd}/${mm}`
}

/** AreaChart de evolución de GMV + comisión, estilizado a la marca. */
export function SalesChart({ data }: { data: Point[] }) {
  const rows = data.map((d) => ({ ...d, label: fmtBucket(d.bucket) }))
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="t-gmv" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F97316" stopOpacity={0.34} />
              <stop offset="100%" stopColor="#F97316" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="t-com" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C2410C" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#C2410C" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={18}
            tick={{ fontSize: 11, fill: '#a8a29e' }}
          />
          <Tooltip
            cursor={{ stroke: '#eae7e2', strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null
              return (
                <div className="rounded-xl border border-border bg-surface/95 px-3 py-2 shadow-elev-3 backdrop-blur">
                  <p className="mb-1 font-mono text-[11px] text-ink-subtle">{String(label)}</p>
                  {payload.map((p) => (
                    <p
                      key={String(p.dataKey)}
                      className="flex items-center justify-between gap-5 text-[13px]"
                    >
                      <span className="flex items-center gap-1.5 text-ink-muted">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: p.dataKey === 'gmv' ? '#F97316' : '#C2410C' }}
                        />
                        {p.name}
                      </span>
                      <span className="font-mono text-ink tabular-nums">
                        {soles(Number(p.value))}
                      </span>
                    </p>
                  ))}
                </div>
              )
            }}
          />
          <Area
            type="monotone"
            dataKey="gmv"
            name="GMV"
            stroke="#F97316"
            strokeWidth={2.5}
            fill="url(#t-gmv)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="commission"
            name="Comisión"
            stroke="#C2410C"
            strokeWidth={2}
            fill="url(#t-com)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
