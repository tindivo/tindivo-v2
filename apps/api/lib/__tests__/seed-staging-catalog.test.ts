import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CATALOG_BUSINESSES,
  CATALOG_OWNERS,
  catalogImagePaths,
  stableId,
} from '../../scripts/seed-staging-catalog.ts'
import { qrDe } from '../../scripts/seed-world.ts'

const IMG_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'scripts',
  'fixtures',
  'staging-catalog',
)
/** Naranja de la marca: reservado (`accent-colors.ts`). */
const RESERVED_ACCENT = 'f97316'
const dosDecimales = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9

describe('stableId', () => {
  it('es determinista y con forma de UUID v4', () => {
    expect(stableId('a')).toBe(stableId('a'))
    expect(stableId('a')).not.toBe(stableId('b'))
    expect(stableId('a')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })
})

describe('catálogo', () => {
  it('ids únicos: negocios, dueños, categorías, platos, grupos y opciones', () => {
    const ids: string[] = []
    for (const b of CATALOG_BUSINESSES) {
      ids.push(stableId(`biz:${b.key}`), stableId(`owner:${b.key}`))
      for (const g of b.groups) {
        ids.push(stableId(`grp:${b.key}:${g.key}`))
        for (const [name] of g.options) ids.push(stableId(`opt:${b.key}:${g.key}:${name}`))
      }
      for (const c of b.categories) {
        ids.push(stableId(`cat:${b.key}:${c.name}`))
        for (const [name] of c.dishes) ids.push(stableId(`item:${b.key}:${c.name}:${name}`))
      }
    }
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('los dueños tienen correo y negocio únicos', () => {
    expect(new Set(CATALOG_OWNERS.map((o) => o.email)).size).toBe(CATALOG_BUSINESSES.length)
    expect(new Set(CATALOG_OWNERS.map((o) => o.businessId)).size).toBe(CATALOG_BUSINESSES.length)
  })

  it('cada imagen referenciada existe, con su miniatura WebP', () => {
    const covers = new Set(CATALOG_BUSINESSES.map((b) => b.cover).filter((k): k is string => !!k))
    const dishes = new Set(
      CATALOG_BUSINESSES.flatMap((b) => b.categories.map((c) => c.image)).filter(
        (k): k is string => !!k,
      ),
    )
    for (const k of [...covers, ...dishes]) {
      expect(existsSync(join(IMG_DIR, `${k}.jpg`)), `${k}.jpg`).toBe(true)
    }
    for (const k of dishes) {
      expect(existsSync(join(IMG_DIR, `thumb-${k}.webp`)), `thumb-${k}.webp`).toBe(true)
    }
  })

  it('los grupos enlazados a una categoría existen en su negocio', () => {
    for (const b of CATALOG_BUSINESSES) {
      const keys = new Set(b.groups.map((g) => g.key))
      for (const c of b.categories) {
        for (const g of c.groups ?? []) expect(keys.has(g), `${b.key}/${g}`).toBe(true)
      }
    }
  })

  it('reglas de grupos: single admite 1; multi con tope válido; opciones únicas', () => {
    for (const b of CATALOG_BUSINESSES) {
      for (const g of b.groups) {
        expect(g.options.length).toBeGreaterThan(0)
        if (g.type === 'single') expect(g.max).toBe(1)
        if (g.type === 'multi' && g.max !== null) {
          expect(g.max).toBeGreaterThanOrEqual(1)
          expect(g.max).toBeLessThanOrEqual(g.options.length)
        }
        const names = g.options.map(([n]) => n)
        expect(new Set(names).size).toBe(names.length)
      }
    }
  })

  it('precios positivos con a lo sumo 2 decimales; extras no negativos', () => {
    for (const b of CATALOG_BUSINESSES) {
      expect(dosDecimales(b.fee)).toBe(true)
      for (const g of b.groups) {
        for (const [, extra] of g.options) {
          expect(extra).toBeGreaterThanOrEqual(0)
          expect(dosDecimales(extra)).toBe(true)
        }
      }
      for (const c of b.categories) {
        for (const [name, price] of c.dishes) {
          expect(price, name).toBeGreaterThan(0)
          expect(dosDecimales(price), name).toBe(true)
        }
      }
    }
  })

  it('ningún negocio usa el naranja reservado de la marca', () => {
    for (const b of CATALOG_BUSINESSES) expect(b.accent.toLowerCase()).not.toBe(RESERVED_ACCENT)
  })

  it('los platos no se repiten dentro de una categoría', () => {
    for (const b of CATALOG_BUSINESSES) {
      for (const c of b.categories) {
        const names = c.dishes.map(([n]) => n)
        expect(new Set(names).size, `${b.key}/${c.name}`).toBe(names.length)
      }
    }
  })
})

describe('catalogImagePaths', () => {
  it('una ruta por plato, con su miniatura al lado (convención de Negocios)', () => {
    const a = catalogImagePaths('biz', stableId('item:1'))
    const b = catalogImagePaths('biz', stableId('item:2'))
    expect(a.full).toBe(`biz/items/${stableId('item:1')}.seed`)
    expect(a.thumb).toBe(`${a.full}-t`)
    expect(a.full).not.toBe(b.full)
  })
})

describe('qrDe', () => {
  it('es el mismo QR que usa la semilla base', () => {
    expect(qrDe('900000021')).toBe(
      'https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&margin=8&data=yape%3A%2F%2Fp2p%3Fn%3D900000021',
    )
  })
})
