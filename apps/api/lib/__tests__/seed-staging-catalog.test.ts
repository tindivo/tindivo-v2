import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CATALOG_BUSINESSES,
  CATALOG_OWNERS,
  catalogImagePaths,
  seedStagingCatalog,
  stableId,
} from '../../scripts/seed-staging-catalog.ts'
import { PROD_REF, STAGING_ORIGIN } from '../../scripts/staging-target.ts'

const KEY = 'clave-de-prueba'

/** Doble de `@supabase/supabase-js`: ningún test sale a la red. `state` se comparte con la fábrica del mock. */
const state = vi.hoisted(() => ({
  created: [] as { url: string; key: string }[],
  upserts: [] as { table: string; rows: Record<string, unknown>[] }[],
  deletes: [] as { table: string; column: string; value: unknown }[],
  uploads: [] as string[],
  authTouched: [] as string[],
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string) => {
    state.created.push({ url, key })
    return {
      from: (table: string) => ({
        upsert: async (rows: Record<string, unknown>[]) => {
          state.upserts.push({ table, rows })
          return { error: null }
        },
        delete: () => ({
          eq: async (column: string, value: unknown) => {
            state.deletes.push({ table, column, value })
            return { error: null }
          },
        }),
      }),
      rpc: async () => ({ data: '2026-11-25', error: null }),
      storage: {
        from: (bucket: string) => ({
          upload: async (path: string) => {
            state.uploads.push(`${bucket}/${path}`)
            return { error: null }
          },
          getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x/${p}` } }),
        }),
      },
      // Cualquier acceso a `auth` (y por tanto a su servicio de administración) deja rastro y falla.
      get auth() {
        return new Proxy(
          {},
          {
            get(_t, prop) {
              state.authTouched.push(String(prop))
              throw new Error(`la semilla del catálogo tocó auth.${String(prop)}`)
            },
          },
        )
      },
    }
  },
}))

// Solo se sustituye la huella esperada, y solo aquí: la API operativa no la acepta.
vi.mock('../../scripts/staging-target.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../scripts/staging-target.ts')>()
  const sha = createHash('sha256').update('clave-de-prueba', 'utf8').digest('hex')
  return {
    ...real,
    assertStagingTarget: (url: string, key: string) => real.assertStagingTarget(url, key, sha),
  }
})

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

describe('CAX-002: ningún número real en el catálogo', () => {
  it('los negocios no llevan teléfono ni ningún número de 9 dígitos en sus datos', () => {
    for (const b of CATALOG_BUSINESSES) expect(b.phone).toBeNull()
    expect(JSON.stringify(CATALOG_BUSINESSES)).not.toMatch(/9\d{8}/)
  })
})

beforeEach(() => {
  state.created.length = 0
  state.upserts.length = 0
  state.deletes.length = 0
  state.uploads.length = 0
  state.authTouched.length = 0
})

describe('seedStagingCatalog: guardia propia (sin red)', () => {
  it('aborta sin crear cliente ni pedir nada si la URL es de producción, ajena o la clave no es la de staging', async () => {
    const casos: [string, string, RegExp][] = [
      [`https://${PROD_REF}.supabase.co`, KEY, /PRODUCCIÓN/],
      ['https://otra.supabase.co', KEY, /debe ser exactamente/],
      [STAGING_ORIGIN, 'otra-clave', /huella/],
    ]
    for (const [url, key, re] of casos) {
      await expect(seedStagingCatalog(url, key)).rejects.toThrow(re)
    }
    expect(state.created).toEqual([])
    expect(state.upserts).toEqual([])
    expect(state.uploads).toEqual([])
  })

  it('la API pública solo recibe (url, serviceKey): no acepta un cliente ni un tercer argumento', async () => {
    expect(seedStagingCatalog.length).toBe(2)
    const ajeno = { from: () => ({ upsert: async () => ({ error: null }) }) }
    // @ts-expect-error el primer argumento es una URL, no un cliente
    await expect(seedStagingCatalog(ajeno, KEY)).rejects.toThrow()
    expect(state.created).toEqual([])
    expect(state.upserts).toEqual([])
    // @ts-expect-error no hay tercer parámetro (ni cliente, ni huella, ni callback de cuentas)
    await seedStagingCatalog(STAGING_ORIGIN, KEY, ajeno)
    expect(state.created).toEqual([{ url: STAGING_ORIGIN, key: KEY }])
  })

  it('el cliente se crea contra la constante de staging, nunca contra la URL recibida', async () => {
    await seedStagingCatalog(`${STAGING_ORIGIN}/`, KEY)
    expect(state.created).toEqual([{ url: STAGING_ORIGIN, key: KEY }])
  })
})

describe('seedStagingCatalog: sin cuentas de Auth ni dinero (sin red)', () => {
  it('ninguna ruta del catálogo toca auth (un espía falla si se llama)', async () => {
    const summary = await seedStagingCatalog(STAGING_ORIGIN, KEY)
    expect(state.authTouched).toEqual([])
    expect(summary.businesses).toBe(4)
  })

  it('los 4 dueños son solo filas de users y user_roles, con ids estables y correo de pruebas', async () => {
    await seedStagingCatalog(STAGING_ORIGIN, KEY)
    const users = state.upserts.filter((u) => u.table === 'users').flatMap((u) => u.rows)
    const roles = state.upserts.filter((u) => u.table === 'user_roles').flatMap((u) => u.rows)
    expect(users.map((u) => u.id)).toEqual(CATALOG_OWNERS.map((o) => o.userId))
    for (const u of users) {
      expect(String(u.email)).toMatch(/^catalogo-[a-z]+@staging\.tindivo\.local$/)
      expect(u.primary_role).toBe('business')
    }
    expect(roles).toEqual(CATALOG_OWNERS.map((o) => ({ user_id: o.userId, role: 'business' })))
    const owners = state.upserts
      .filter((u) => u.table === 'businesses')
      .flatMap((u) => u.rows)
      .map((r) => r.user_id)
    expect(owners).toEqual(CATALOG_OWNERS.map((o) => o.userId))
  })

  it('los 4 negocios quedan sin teléfono, sin Yape y sin filas de cobro', async () => {
    await seedStagingCatalog(STAGING_ORIGIN, KEY)
    const biz = state.upserts.filter((u) => u.table === 'businesses').flatMap((u) => u.rows)
    expect(biz).toHaveLength(4)
    for (const r of biz) {
      expect(r.phone).toBeNull()
      expect(r.yape_number).toBeNull()
    }
    expect(state.upserts.some((u) => u.table === 'business_payment_qrs')).toBe(false)
    expect(
      state.deletes.filter((d) => d.table === 'business_payment_qrs').map((d) => d.value),
    ).toEqual(CATALOG_OWNERS.map((o) => o.businessId))
  })

  it('es idempotente: dos corridas escriben lo mismo (mismos ids, filas y rutas de imagen)', async () => {
    const a = await seedStagingCatalog(STAGING_ORIGIN, KEY)
    const upsertsA = JSON.stringify(state.upserts)
    const uploadsA = [...state.uploads]
    state.upserts.length = 0
    state.uploads.length = 0
    const b = await seedStagingCatalog(STAGING_ORIGIN, KEY)
    expect(b).toEqual(a)
    expect(JSON.stringify(state.upserts)).toBe(upsertsA)
    expect(state.uploads).toEqual(uploadsA)
  })
})
