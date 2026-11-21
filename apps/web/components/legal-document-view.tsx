import type { LegalDocument } from '@tindivo/legal'

/** Renderiza un documento legal tal como viene del markdown: título, versión, fecha y secciones. */
export function LegalDocumentView({ doc }: { doc: LegalDocument }) {
  return (
    <article>
      <h1 className="text-3xl font-bold tracking-tight text-ink">{doc.title}</h1>
      <p className="mt-1 text-sm text-ink-3">
        {`Versión ${doc.version} · Actualizado el `}
        <time dateTime={doc.date}>{formatDate(doc.date)}</time>
        {doc.subtitle ? ` · ${doc.subtitle}` : ''}
      </p>
      <div className="mt-6 space-y-6">
        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-lg font-bold tracking-tight text-ink">{section.heading}</h2>
            {section.blocks.map((block) =>
              block.type === 'paragraph' ? (
                <p key={block.text} className="mt-1 leading-relaxed text-ink-2">
                  {block.text}
                </p>
              ) : (
                <ul
                  key={block.items.join('|')}
                  className="mt-1 list-disc space-y-1 pl-5 text-ink-2"
                >
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ),
            )}
          </section>
        ))}
      </div>
    </article>
  )
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** AAAA-MM-DD → «19 de agosto de 2026», sin pasar por `Date` (sin zonas horarias). */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${Number(day)} de ${MONTHS[Number(month) - 1]} de ${year}`
}
