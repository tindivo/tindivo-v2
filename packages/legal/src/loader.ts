import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type LegalName = 'terminos' | 'privacidad'

export type LegalBlock = { type: 'paragraph'; text: string } | { type: 'list'; items: string[] }

export type LegalSection = { heading: string; blocks: LegalBlock[] }

export type LegalDocument = {
  title: string
  /** Versión del texto: la que `app_settings.terms_version` debe repetir. */
  version: string
  /** AAAA-MM-DD de la última modificación del texto. */
  date: string
  subtitle: string
  sections: LegalSection[]
}

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'content')
const HEADER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

function readHeader(source: string, name: string): { fields: Map<string, string>; body: string } {
  const match = HEADER.exec(source)
  if (!match) throw new Error(`${name}: falta la cabecera (--- titulo, version, fecha ---)`)
  const fields = new Map<string, string>()
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const colon = line.indexOf(':')
    if (colon > 0) fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim())
  }
  return { fields, body: source.slice(match[0].length) }
}

function requireField(fields: Map<string, string>, key: string, name: string): string {
  const value = fields.get(key)
  if (!value) throw new Error(`${name}: la cabecera no trae «${key}»`)
  return value
}

function parseBlocks(lines: string[]): LegalBlock[] {
  const blocks: LegalBlock[] = []
  let paragraph: string[] = []
  let list: string[] = []
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
    if (list.length) blocks.push({ type: 'list', items: list })
    paragraph = []
    list = []
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flush()
    } else if (line.startsWith('- ')) {
      if (paragraph.length) flush()
      list.push(line.slice(2).trim())
    } else {
      if (list.length) flush()
      paragraph.push(line)
    }
  }
  flush()
  return blocks
}

/** Convierte un markdown legal (cabecera + secciones `## `) en datos. Falla si falta versión o fecha. */
export function parseLegalDocument(source: string, name: string): LegalDocument {
  const { fields, body } = readHeader(source, name)
  const version = requireField(fields, 'version', name)
  const date = requireField(fields, 'fecha', name)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${name}: la fecha «${date}» no es AAAA-MM-DD`)
  }

  const sections: LegalSection[] = []
  let current: { heading: string; lines: string[] } | undefined
  const close = () => {
    if (current) sections.push({ heading: current.heading, blocks: parseBlocks(current.lines) })
  }
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      close()
      current = { heading: line.slice(3).trim(), lines: [] }
    } else {
      current?.lines.push(line)
    }
  }
  close()
  if (sections.length === 0) throw new Error(`${name}: no tiene ninguna sección («## »)`)

  return {
    title: requireField(fields, 'titulo', name),
    version,
    date,
    subtitle: fields.get('subtitulo') ?? '',
    sections,
  }
}

/** Lee `content/<name>.md` del paquete. Solo para el build (usa el sistema de archivos). */
export function loadLegalDocument(name: LegalName): LegalDocument {
  return parseLegalDocument(readFileSync(join(CONTENT_DIR, `${name}.md`), 'utf8'), name)
}
