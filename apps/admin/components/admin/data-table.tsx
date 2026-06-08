import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: string
  align?: 'left' | 'right'
  mono?: boolean
  render: (row: T) => ReactNode
}

/** Tabla estilizada a la marca (cabecera eyebrow, filas con borde sutil, montos mono a la derecha). */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  empty,
}: {
  columns: Column<T>[]
  rows: T[]
  getRowKey: (row: T, index: number) => string
  empty?: ReactNode
}) {
  if (rows.length === 0) return <>{empty}</>
  return (
    <div className="t-scroll overflow-x-auto">
      <table className="w-full text-left text-[14px]">
        <thead>
          <tr className="border-ink/5 border-b">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`pb-2 font-mono font-semibold text-[10px] text-ink-subtle uppercase tracking-[0.12em] ${
                  c.align === 'right' ? 'text-right' : ''
                }`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={getRowKey(row, index)} className="border-ink/5 border-t">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`py-2.5 align-middle ${c.align === 'right' ? 'text-right' : ''} ${
                    c.mono ? 'font-mono tabular-nums' : ''
                  }`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
