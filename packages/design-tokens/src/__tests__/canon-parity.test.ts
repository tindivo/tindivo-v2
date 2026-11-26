import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadTokens } from '../generate.ts'

/**
 * tokens.json se escribe a mano a partir de Docs/negocio/sistema-de-diseno.md. Este test lee las tablas de §2 a §5
 * del canon y exige que los valores coincidan con el JSON; si una fila no se puede leer, el test falla (no la salta).
 */
const CANON = readFileSync(
  fileURLToPath(new URL('../../../../Docs/negocio/sistema-de-diseno.md', import.meta.url)),
  'utf8',
)
const tokens = loadTokens()

/** Filas `| a | b | ... |` de la primera tabla bajo el encabezado que contiene `heading`. */
function rows(heading: string): string[][] {
  const start = CANON.indexOf(heading)
  expect(start, `no está el encabezado ${heading}`).toBeGreaterThan(-1)
  const lines = CANON.slice(start).split('\n').slice(1)
  const out: string[][] = []
  let inTable = false
  for (const line of lines) {
    if (line.startsWith('|')) {
      inTable = true
      if (/^\|\s*-/.test(line)) continue
      out.push(
        line
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim()),
      )
    } else if (inTable) break
  }
  return out.slice(1) // sin la fila de títulos
}

const names = (cell: string) => [...cell.matchAll(/`(\w+)`/g)].map((m) => m[1] as string)
const hexes = (cell: string) => [...cell.matchAll(/#[0-9A-F]{6}/g)].map((m) => m[0])
const nums = (cell: string) => [...cell.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))

describe('el JSON coincide con las tablas del canon', () => {
  it('§2.1 color: cada token y su hex', () => {
    const fromCanon: Record<string, string> = {}
    for (const [tok, value] of rows('### 2.1 Tabla de tokens y contraste')) {
      const n = names(tok as string)
      const h = hexes(value as string)
      if (n[0] === 'gradientCta') {
        expect(h).toHaveLength(3)
        fromCanon.gradientCtaStart = h[0] as string
        fromCanon.gradientCtaMid = h[1] as string
        fromCanon.gradientCtaEnd = h[2] as string
      } else if (n[0] === 'scrim') {
        expect(value).toContain('al 48 %')
        fromCanon.scrim = h[0] as string
      } else {
        expect(h.length, `fila ${tok}: no se pudo leer el hex`).toBe(n.length)
        n.forEach((name, i) => {
          fromCanon[name] = h[i] as string
        })
      }
    }
    const json = Object.fromEntries(Object.entries(tokens.color).map(([k, v]) => [k, v.value]))
    expect(Object.keys(fromCanon).length).toBeGreaterThan(25)
    expect(json).toEqual(fromCanon)
    expect(tokens.color.scrim?.alpha).toBe(0.48)
  })

  it('§3 radios', () => {
    const fromCanon: Record<string, number> = {}
    const r = rows('## 3. Forma y elevación')
    for (const [tok, value] of r.filter((x) => (x[0] as string).startsWith('`radius'))) {
      fromCanon[names(tok as string)[0] as string] = nums(value as string)[0] as number
    }
    const json = Object.fromEntries(Object.entries(tokens.radius).map(([k, v]) => [k, v.value]))
    expect(Object.keys(fromCanon)).toHaveLength(5)
    expect(json).toEqual(fromCanon)
  })

  it('§3 elevaciones: capas x, y, blur, color y alfa', () => {
    const r = rows('## 3. Forma y elevación').filter((x) =>
      (x[0] as string).startsWith('`elevation'),
    )
    expect(r).toHaveLength(3)
    for (const [tok, value] of r) {
      const layers = [
        ...(value as string).matchAll(
          /(\d+) (\d+)px (\d+)px rgba\((\d+),(\d+),(\d+),(\.?\d+(?:\.\d+)?)\)/g,
        ),
      ].map((m) => ({
        x: Number(m[1]),
        y: Number(m[2]),
        blur: Number(m[3]),
        color: `#${[m[4], m[5], m[6]].map((c) => Number(c).toString(16).toUpperCase().padStart(2, '0')).join('')}`,
        alpha: Number(m[7]),
      }))
      expect(layers.length, `fila ${tok}: no se pudieron leer las capas`).toBeGreaterThan(0)
      expect(tokens.elevation[names(tok as string)[0] as string]?.layers).toEqual(layers)
    }
  })

  it('§4 tipografía: tamaño, interlineado y peso', () => {
    const found: string[] = []
    for (const [tok, size, weight] of rows('## 4. Tipografía')) {
      const name = names(tok as string)[0] as string
      if (name === 'price') continue // no es un valor: el tamaño es el del contexto
      const t = tokens.type[name]
      expect(t, `${name} no está en tokens.json`).toBeDefined()
      const [s, l] = nums(size as string)
      expect(t?.size).toBe(s)
      expect(t?.line).toBe(l) // chip: el canon no da interlineado y el JSON tampoco
      const w = nums(weight as string)
      expect(w.length).toBeGreaterThan(0)
      // Un rango (400–500) vale con su peso base; lo resuelto lleva "pending".
      expect(t?.weight).toBe(w[0])
      if (/[–-]/.test(weight as string) && w.length > 1) {
        expect(t?.pending, `${name}: un rango de peso exige "pending"`).toBeTruthy()
      }
      found.push(name)
    }
    expect(found.sort()).toEqual(Object.keys(tokens.type).sort())
  })

  it('§5 espaciado y tamaños táctiles (primer número; un rango lleva "pending")', () => {
    const found: string[] = []
    for (const [tok, value] of rows('## 5. Táctil, espaciado y elementos fijos')) {
      const n = names(tok as string)
      const v = nums(value as string)
      if (n.length === 2) {
        // `spaceGroup` / `spaceInner` | 24 / 12
        expect(v).toHaveLength(2)
        n.forEach((name, i) => {
          expect(tokens.spacing[name]?.value).toBe(v[i])
        })
      } else {
        const name = n[0] as string
        expect(tokens.spacing[name]?.value, name).toBe(v[0])
        if (/–/.test(value as string)) expect(tokens.spacing[name]?.pending, name).toBeTruthy()
      }
      found.push(...n)
    }
    expect(found.sort()).toEqual(Object.keys(tokens.spacing).sort())
  })
})
