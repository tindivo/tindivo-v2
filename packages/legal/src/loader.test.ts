import { describe, expect, it } from 'vitest'
import { loadLegalDocument, parseLegalDocument } from './loader'

const VALID = `---
titulo: Términos de prueba
version: 2026-05
fecha: 2026-08-19
subtitulo: San Jacinto
---

## 1. Primera

Un párrafo.

Otro párrafo.

## 2. Segunda

- uno
- dos
`

describe('parseLegalDocument', () => {
  it('lee versión, fecha, título y subtítulo de la cabecera', () => {
    const doc = parseLegalDocument(VALID, 'prueba')
    expect(doc).toMatchObject({
      title: 'Términos de prueba',
      version: '2026-05',
      date: '2026-08-19',
      subtitle: 'San Jacinto',
    })
  })

  it('separa las secciones por encabezado y conserva los párrafos y las listas', () => {
    const { sections } = parseLegalDocument(VALID, 'prueba')
    expect(sections.map((s) => s.heading)).toEqual(['1. Primera', '2. Segunda'])
    expect(sections[0]?.blocks).toEqual([
      { type: 'paragraph', text: 'Un párrafo.' },
      { type: 'paragraph', text: 'Otro párrafo.' },
    ])
    expect(sections[1]?.blocks).toEqual([{ type: 'list', items: ['uno', 'dos'] }])
  })

  it('falla si no hay cabecera', () => {
    expect(() => parseLegalDocument('## 1. Sola\n\nTexto.', 'prueba')).toThrow(/cabecera/)
  })

  it('falla si falta la versión', () => {
    const source = VALID.replace('version: 2026-05\n', '')
    expect(() => parseLegalDocument(source, 'prueba')).toThrow(/version/)
  })

  it('falla si falta la fecha o no es AAAA-MM-DD', () => {
    expect(() => parseLegalDocument(VALID.replace('fecha: 2026-08-19\n', ''), 'prueba')).toThrow(
      /fecha/,
    )
    expect(() => parseLegalDocument(VALID.replace('2026-08-19', '19/08/2026'), 'prueba')).toThrow(
      /fecha/,
    )
  })

  it('falla si el documento no tiene ninguna sección', () => {
    const source = '---\ntitulo: T\nversion: 1\nfecha: 2026-01-01\n---\n\nSolo texto.\n'
    expect(() => parseLegalDocument(source, 'prueba')).toThrow(/sección/)
  })
})

describe('loadLegalDocument', () => {
  it.each(['terminos', 'privacidad'] as const)('carga %s del repo con versión y fecha', (name) => {
    const doc = loadLegalDocument(name)
    expect(doc.version).toMatch(/^\d{4}-\d{2}$/)
    expect(doc.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(doc.sections.length).toBeGreaterThan(0)
  })
})
