import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  CATALOG_BUSINESSES,
  CATALOG_OWNERS,
  catalogImagePaths,
  parseTestYape,
  seedStagingCatalog,
  stableId,
} from '../../scripts/seed-staging-catalog.ts'
import { qrDe } from '../../scripts/seed-world.ts'
import { createStagingClient } from '../../scripts/staging-client.ts'
import { STAGING_ORIGIN } from '../../scripts/staging-target.ts'

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
/** Número FICTICIO, solo de este test: el real nunca va al repo. */
const FAKE_YAPE = '900000000'
const sha = (k: string) => createHash('sha256').update(k, 'utf8').digest('hex')
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
    expect(qrDe('900000000')).toBe(
      'https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&margin=8&data=yape%3A%2F%2Fp2p%3Fn%3D900000000',
    )
  })
})

describe('CAX-002: ningún número real en el catálogo', () => {
  it('los negocios no llevan teléfono ni ningún número de 9 dígitos en sus datos', () => {
    for (const b of CATALOG_BUSINESSES) expect(b.phone).toBeNull()
    expect(JSON.stringify(CATALOG_BUSINESSES)).not.toMatch(/9\d{8}/)
  })

  it('parseTestYape: vacío es null; valida ^9[0-9]{8}$ sin repetir el valor', () => {
    expect(parseTestYape(undefined)).toBeNull()
    expect(parseTestYape('  ')).toBeNull()
    expect(parseTestYape(FAKE_YAPE)).toBe(FAKE_YAPE)
    for (const bad of ['12345', '800000000', '9000000001', '90000000a']) {
      expect(() => parseTestYape(bad)).toThrow(/STAGING_TEST_YAPE_NUMBER/)
      try {
        parseTestYape(bad)
      } catch (e) {
        expect((e as Error).message).not.toContain(bad)
      }
    }
  })
})

/** Cliente de staging verificado cuyas operaciones se anotan en vez de salir a la red. */
function recordingDb() {
  const db = createStagingClient(STAGING_ORIGIN, 'clave-de-prueba', sha('clave-de-prueba'))
  const upserts: { table: string; rows: Record<string, unknown>[] }[] = []
  const deletes: string[] = []
  const target = db as unknown as Record<string, unknown>
  target.from = (table: string) => ({
    upsert: async (rows: Record<string, unknown>[]) => {
      upserts.push({ table, rows })
      return { error: null }
    },
    delete: () => ({
      eq: async () => {
        deletes.push(table)
        return { error: null }
      },
    }),
  })
  target.rpc = async () => ({ data: '2026-11-25', error: null })
  Object.defineProperty(db, 'storage', {
    value: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x/${p}` } }),
      }),
    },
  })
  return { db, upserts, deletes }
}

describe('seedStagingCatalog: dinero (sin red)', () => {
  it('sin la variable: no crea «Prueba Yape», avisa, y ningún negocio lleva Yape', async () => {
    const { db, upserts, deletes } = recordingDb()
    const ensure = vi.fn().mockResolvedValue(undefined)
    const summary = await seedStagingCatalog(db, ensure)
    expect(summary.businesses).toBe(4)
    expect(summary.warnings.join(' ')).toContain('STAGING_TEST_YAPE_NUMBER')
    expect(ensure).toHaveBeenCalledTimes(4)
    expect(upserts.some((u) => u.table === 'business_payment_qrs')).toBe(false)
    expect(deletes.filter((t) => t === 'business_payment_qrs')).toHaveLength(4)
    for (const u of upserts.filter((x) => x.table === 'businesses')) {
      for (const r of u.rows) {
        expect(r.phone).toBeNull()
        expect(r.yape_number).toBeNull()
      }
    }
  })

  it('con la variable: crea solo «Prueba Yape» con ese número y su QR', async () => {
    const { db, upserts, deletes } = recordingDb()
    const ensure = vi.fn().mockResolvedValue(undefined)
    const summary = await seedStagingCatalog(db, ensure, { testYape: FAKE_YAPE })
    expect(summary.businesses).toBe(5)
    expect(summary.warnings).toEqual([])
    const qrs = upserts.filter((u) => u.table === 'business_payment_qrs').flatMap((u) => u.rows)
    expect(qrs).toHaveLength(1)
    expect(qrs[0]).toMatchObject({ account_number: FAKE_YAPE, qr_url: qrDe(FAKE_YAPE) })
    const withYape = upserts
      .filter((u) => u.table === 'businesses')
      .flatMap((u) => u.rows)
      .filter((r) => r.yape_number)
    expect(withYape).toHaveLength(1)
    expect(withYape[0]).toMatchObject({ name: 'Prueba Yape', phone: null, yape_number: FAKE_YAPE })
    expect(deletes.filter((t) => t === 'business_payment_qrs')).toHaveLength(4)
  })
})
