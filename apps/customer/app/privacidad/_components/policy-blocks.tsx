import type { ReactNode } from 'react'

// Bloques de la política de privacidad. Viven junto a la página (carpeta privada
// `_components`, que Next no enruta) porque solo los usa ella.

export type TocEntry = { readonly id: string; readonly title: string }

export function Section({ entry, children }: { entry: TocEntry; children: ReactNode }) {
  const titleId = `${entry.id}-titulo`
  return (
    <section id={entry.id} aria-labelledby={titleId} className="scroll-mt-6">
      <h2 id={titleId} className="font-display text-[19px] font-bold tracking-tight text-ink">
        {entry.title}
      </h2>
      <div className="mt-2 space-y-3 text-[14px] leading-[1.6] text-ink/75">{children}</div>
    </section>
  )
}

export function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pt-2">
      <h3 className="font-display text-[15px] font-bold tracking-tight text-ink">{title}</h3>
      <div className="mt-1.5 space-y-3">{children}</div>
    </div>
  )
}

export function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-ink">{children}</strong>
}

export function Bullets({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>
}

export type TableRow = { key: string; cells: readonly ReactNode[] }

/**
 * Tabla legible en móvil: en pantallas estrechas cada fila es una tarjeta (la
 * primera celda hace de título y las demás llevan su encabezado encima); desde
 * `sm` es una tabla, con scroll horizontal dentro de su propio contenedor si no
 * cabe. La página nunca se desplaza en horizontal.
 *
 * Los encabezados deben ser distintos entre sí: sirven de `key`.
 */
export function DataTable({ headers, rows }: { headers: readonly string[]; rows: TableRow[] }) {
  return (
    <>
      <ul className="space-y-2 sm:hidden">
        {rows.map((row) => (
          <li key={row.key} className="rounded-xl border border-border bg-card p-3">
            <p className="text-[14px] font-semibold leading-[1.45] text-ink">{row.cells[0]}</p>
            <dl className="mt-2 space-y-2">
              {headers.slice(1).map((header, i) => (
                <div key={header}>
                  <dt className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                    {header}
                  </dt>
                  <dd className="mt-0.5 text-[13px] leading-[1.5] text-ink/75">
                    {row.cells[i + 1]}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl border border-border sm:block">
        <table className="w-full min-w-[560px] border-collapse text-left text-[13px] leading-[1.5]">
          <thead className="bg-surface-low">
            <tr>
              {headers.map((header) => (
                <th key={header} scope="col" className="px-3 py-2 font-semibold text-ink">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-border align-top">
                {headers.map((header, i) =>
                  i === 0 ? (
                    <th key={header} scope="row" className="px-3 py-2 font-semibold text-ink">
                      {row.cells[i]}
                    </th>
                  ) : (
                    <td key={header} className="px-3 py-2 text-ink/75">
                      {row.cells[i]}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
