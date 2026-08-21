import type { ReactNode } from 'react'
import type { MatchRange } from '@/features/catalog/lib/menu-search'

interface HighlightedTextProps {
  text: string
  /** Tramos de `text` a resaltar. Vienen de `menu-search`, ya fusionados. */
  ranges?: MatchRange[]
}

/**
 * Pinta `text` resaltando los tramos que casaron con la búsqueda.
 *
 * Los índices se calculan sobre el texto plegado (sin tildes ni mayúsculas) y
 * se aplican sobre el original: `fold()` conserva la longitud justamente para
 * que esto funcione. Sin el resaltado, un plato que aparece por su descripción
 * parece un resultado sin motivo.
 */
export function HighlightedText({ text, ranges }: HighlightedTextProps) {
  if (!ranges || ranges.length === 0) return <>{text}</>

  const parts: ReactNode[] = []
  let cursor = 0
  for (const range of ranges) {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start))
    parts.push(
      <mark
        key={`${range.start}-${range.end}`}
        className="rounded-[3px] bg-brand/[0.16] text-inherit"
      >
        {text.slice(range.start, range.end)}
      </mark>,
    )
    cursor = range.end
  }
  if (cursor < text.length) parts.push(text.slice(cursor))

  return <>{parts}</>
}
