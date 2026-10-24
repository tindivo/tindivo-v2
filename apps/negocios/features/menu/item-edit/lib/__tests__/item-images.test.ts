import { describe, expect, it } from 'vitest'
import {
  type ItemImageStorage,
  type ItemImageUrls,
  itemImagePaths,
  itemImageRemovalPaths,
  objectPathFromPublicUrl,
  publishItemImages,
} from '../item-images'

const PUB = 'https://x.supabase.co/storage/v1/object/public/menu-items/'
const url = (path: string) => `${PUB}${path}`

interface World {
  objects: Map<string, string>
  row: ItemImageUrls
  uploads: { path: string; upsert: boolean; cacheControl: string }[]
}

/** Publicado A/A: la grande y la miniatura de la foto A, en rutas versionadas. */
function worldWithA(): World {
  const a = itemImagePaths('biz', 'item', 1)
  return {
    objects: new Map([
      [a.full, 'A'],
      [a.thumb, 'A-t'],
    ]),
    row: { imageUrl: url(a.full), thumbnailUrl: url(a.thumb) },
    uploads: [],
  }
}

function fakeStorage(
  world: World,
  opts: { failUpload?: string[]; throwUpload?: string[]; failRemove?: boolean } = {},
): ItemImageStorage {
  return {
    from(bucket) {
      expect(bucket).toBe('menu-items')
      return {
        async upload(path, file, options) {
          if (opts.throwUpload?.includes(path)) throw new Error(`interrumpido ${path}`)
          if (opts.failUpload?.includes(path)) return { error: { message: `falló ${path}` } }
          if (!options.upsert && world.objects.has(path)) {
            return { error: { message: `ya existe ${path}` } }
          }
          world.uploads.push({ path, upsert: options.upsert, cacheControl: options.cacheControl })
          world.objects.set(path, file.name)
          return { error: null }
        },
        async remove(paths) {
          if (opts.failRemove) throw new Error('sin red')
          for (const p of paths) world.objects.delete(p)
          return { error: null }
        },
        getPublicUrl: (path) => ({ data: { publicUrl: url(path) } }),
      }
    },
  }
}

/**
 * `true`: la base rechaza el UPDATE. `'confirma-y-error'` / `'confirma-y-lanza'`: la
 * base lo confirma y la respuesta se pierde (CAX-002).
 */
type RowFailure = boolean | 'confirma-y-error' | 'confirma-y-lanza'

function rowUpdater(world: World, fail: RowFailure = false) {
  return async (urls: ItemImageUrls) => {
    if (fail === true) return { error: { message: 'falló el UPDATE' } }
    world.row = urls
    if (fail === 'confirma-y-error') return { error: { message: 'respuesta perdida' } }
    if (fail === 'confirma-y-lanza') throw new Error('conexión cortada')
    return { error: null }
  }
}

const full = new File(['b'], 'B', { type: 'image/webp' })
const thumb = new File(['b'], 'B-t', { type: 'image/webp' })
const A = itemImagePaths('biz', 'item', 1)
const B = itemImagePaths('biz', 'item', 2)

function params(w: World, over: Partial<{ thumb: File | null }> = {}) {
  return {
    bizId: 'biz',
    itemId: 'item',
    full,
    thumb,
    cacheControl: '3600',
    version: 2,
    previous: { ...w.row },
    ...over,
  }
}

/** Lo que la fila referencia debe existir y nunca mezclar B con A. */
function referenced(w: World) {
  return [w.row.imageUrl, w.row.thumbnailUrl].map((u) => {
    const p = objectPathFromPublicUrl(u, 'biz')
    return p === null ? null : (w.objects.get(p) ?? 'FALTA')
  })
}

describe('rutas de las fotos del plato', () => {
  it('cada versión usa rutas propias bajo la carpeta del negocio', () => {
    expect(itemImagePaths('biz', 'item', 7)).toEqual({
      full: 'biz/items/item.7',
      thumb: 'biz/items/item.7-t',
    })
  })
})

describe('publishItemImages', () => {
  it('(a) éxito: la fila queda B/B, A y su miniatura se borran, sin upsert', async () => {
    const w = worldWithA()
    const r = await publishItemImages(fakeStorage(w), rowUpdater(w), params(w))
    expect(r).toMatchObject({ ok: true, thumbnailError: null })
    expect(referenced(w)).toEqual(['B', 'B-t'])
    expect([...w.objects.keys()].sort()).toEqual([B.full, B.thumb].sort())
    expect(w.uploads.every((u) => !u.upsert && u.cacheControl === '3600')).toBe(true)
  })

  it('(b) falla la miniatura: la fila queda B/null, A y su miniatura se borran', async () => {
    const w = worldWithA()
    const r = await publishItemImages(
      fakeStorage(w, { failUpload: [B.thumb] }),
      rowUpdater(w),
      params(w),
    )
    expect(r).toMatchObject({ ok: true, thumbnailUrl: null })
    expect(r.ok && r.thumbnailError).toContain('falló')
    expect(referenced(w)).toEqual(['B', null])
    expect([...w.objects.keys()]).toEqual([B.full])
  })

  it('(b2) sin miniatura generada: B/null y A se retira', async () => {
    const w = worldWithA()
    const r = await publishItemImages(fakeStorage(w), rowUpdater(w), params(w, { thumb: null }))
    expect(r).toMatchObject({ ok: true, thumbnailUrl: null })
    expect(referenced(w)).toEqual(['B', null])
    expect([...w.objects.keys()]).toEqual([B.full])
  })

  it('(c) falla el UPDATE: la fila sigue A/A, A intacto, y B queda sin borrar (resultado incierto)', async () => {
    const w = worldWithA()
    const r = await publishItemImages(fakeStorage(w), rowUpdater(w, true), params(w))
    expect(r).toEqual({ ok: false, message: 'falló el UPDATE' })
    expect(referenced(w)).toEqual(['A', 'A-t'])
    expect([...w.objects.keys()].sort()).toEqual([A.full, A.thumb, B.full, B.thumb].sort())
  })

  it('(c3) CAX-002: la base confirma B/B y la respuesta llega como error: B sigue existiendo', async () => {
    const w = worldWithA()
    const r = await publishItemImages(fakeStorage(w), rowUpdater(w, 'confirma-y-error'), params(w))
    expect(r.ok).toBe(false)
    expect(referenced(w)).toEqual(['B', 'B-t'])
    expect(w.objects.get(A.full)).toBe('A')
    expect(w.objects.get(A.thumb)).toBe('A-t')
  })

  it('(c4) CAX-002: la base confirma B/B y la llamada lanza: B sigue existiendo', async () => {
    const w = worldWithA()
    const r = await publishItemImages(fakeStorage(w), rowUpdater(w, 'confirma-y-lanza'), params(w))
    expect(r.ok).toBe(false)
    expect(referenced(w)).toEqual(['B', 'B-t'])
    expect(w.objects.get(A.full)).toBe('A')
    expect(w.objects.get(A.thumb)).toBe('A-t')
  })

  it('(c2) falla el UPDATE y también el borrado: la fila sigue A/A y A intacto', async () => {
    const w = worldWithA()
    const r = await publishItemImages(
      fakeStorage(w, { failRemove: true }),
      rowUpdater(w, true),
      params(w),
    )
    expect(r.ok).toBe(false)
    expect(referenced(w)).toEqual(['A', 'A-t'])
    expect(w.objects.get(A.full)).toBe('A')
    expect(w.objects.get(A.thumb)).toBe('A-t')
  })

  it('(d) falla la grande: la fila sigue A/A y no se sube nada', async () => {
    const w = worldWithA()
    const r = await publishItemImages(
      fakeStorage(w, { failUpload: [B.full] }),
      rowUpdater(w),
      params(w),
    )
    expect(r).toEqual({ ok: false, message: `No se pudo subir la imagen: falló ${B.full}` })
    expect(w.uploads).toEqual([])
    expect(referenced(w)).toEqual(['A', 'A-t'])
    expect([...w.objects.keys()].sort()).toEqual([A.full, A.thumb].sort())
  })

  it('(e) interrupción entre subidas: la fila sigue A/A y A nunca se sobrescribió', async () => {
    const w = worldWithA()
    const r = await publishItemImages(
      fakeStorage(w, { throwUpload: [B.thumb] }),
      rowUpdater(w),
      params(w),
    )
    expect(r.ok).toBe(false)
    expect(referenced(w)).toEqual(['A', 'A-t'])
    expect(w.objects.get(A.full)).toBe('A')
    expect(w.objects.get(A.thumb)).toBe('A-t')
  })

  it('(e2) interrupción sin limpieza posible: lo huérfano es nuevo, nunca A', async () => {
    const w = worldWithA()
    await publishItemImages(
      fakeStorage(w, { throwUpload: [B.thumb], failRemove: true }),
      rowUpdater(w),
      params(w),
    )
    expect(referenced(w)).toEqual(['A', 'A-t'])
    expect(w.objects.get(A.full)).toBe('A')
    expect(w.objects.get(A.thumb)).toBe('A-t')
  })

  it('nunca sobrescribe: si la ruta nueva ya existe, falla sin tocar A', async () => {
    const w = worldWithA()
    w.objects.set(B.full, 'otro')
    const r = await publishItemImages(fakeStorage(w), rowUpdater(w), params(w))
    expect(r.ok).toBe(false)
    expect(w.objects.get(B.full)).toBe('otro')
    expect(referenced(w)).toEqual(['A', 'A-t'])
  })

  it('la foto histórica sin versión también se retira al reemplazarla', async () => {
    const w = worldWithA()
    w.objects.clear()
    w.objects.set('biz/items/item', 'H')
    w.objects.set('biz/items/item-t', 'H-t')
    w.row = {
      imageUrl: `${url('biz/items/item')}?v=99`,
      thumbnailUrl: `${url('biz/items/item-t')}?v=99`,
    }
    const r = await publishItemImages(fakeStorage(w), rowUpdater(w), params(w))
    expect(r.ok).toBe(true)
    expect(referenced(w)).toEqual(['B', 'B-t'])
    expect([...w.objects.keys()].sort()).toEqual([B.full, B.thumb].sort())
  })

  it('un plato sin foto previa: publica B/B y no borra nada', async () => {
    const w = worldWithA()
    w.objects.clear()
    w.row = { imageUrl: null, thumbnailUrl: null }
    const r = await publishItemImages(fakeStorage(w), rowUpdater(w), params(w))
    expect(r.ok).toBe(true)
    expect(referenced(w)).toEqual(['B', 'B-t'])
  })

  it('ninguna combinación de fallos deja B con la miniatura de A', async () => {
    const combos = [
      { failUpload: [B.full] },
      { failUpload: [B.thumb] },
      { throwUpload: [B.full] },
      { throwUpload: [B.thumb] },
      { failUpload: [B.thumb], failRemove: true },
      { failRemove: true },
    ]
    for (const opts of combos) {
      for (const failRow of [false, true, 'confirma-y-error', 'confirma-y-lanza'] as const) {
        const w = worldWithA()
        await publishItemImages(fakeStorage(w, opts), rowUpdater(w, failRow), params(w))
        const [img, th] = referenced(w)
        expect(img === 'B' && th === 'A-t').toBe(false)
        expect(img).not.toBe('FALTA')
        expect(th).not.toBe('FALTA')
      }
    }
  })
})

describe('objectPathFromPublicUrl', () => {
  it('URL propia, con y sin ?v=', () => {
    expect(objectPathFromPublicUrl(url('biz/items/item.5'), 'biz')).toBe('biz/items/item.5')
    expect(objectPathFromPublicUrl(`${url('biz/items/item.5-t')}?v=123`, 'biz')).toBe(
      'biz/items/item.5-t',
    )
  })
  it('ruta histórica sin versión y miniatura -t del primer diseño', () => {
    expect(objectPathFromPublicUrl(`${url('biz/items/item')}?v=9`, 'biz')).toBe('biz/items/item')
    expect(objectPathFromPublicUrl(`${url('biz/items/item-t')}?v=9`, 'biz')).toBe(
      'biz/items/item-t',
    )
  })
  it('otro bucket, otra carpeta de negocio y basura dan null', () => {
    expect(
      objectPathFromPublicUrl('https://x.supabase.co/storage/v1/object/public/otro/biz/a', 'biz'),
    ).toBeNull()
    expect(objectPathFromPublicUrl(url('otro-biz/items/item'), 'biz')).toBeNull()
    expect(objectPathFromPublicUrl(url('biz2/items/item'), 'biz')).toBeNull()
    expect(objectPathFromPublicUrl(url('biz/../otro/x'), 'biz')).toBeNull()
    expect(objectPathFromPublicUrl(url('biz/'), 'biz')).toBeNull()
    expect(objectPathFromPublicUrl('no es una url', 'biz')).toBeNull()
    expect(objectPathFromPublicUrl('', 'biz')).toBeNull()
    expect(objectPathFromPublicUrl(null, 'biz')).toBeNull()
    expect(objectPathFromPublicUrl(url('biz/%E0%A4%A'), 'biz')).toBeNull()
  })
})

describe('itemImageRemovalPaths (quitar foto / borrar plato)', () => {
  it('borra exactamente las dos rutas derivadas de las URL de la fila', () => {
    expect(
      itemImageRemovalPaths('biz', {
        imageUrl: `${url('biz/items/item.5')}?v=1`,
        thumbnailUrl: url('biz/items/item.5-t'),
      }),
    ).toEqual(['biz/items/item.5', 'biz/items/item.5-t'])
  })
  it('sin miniatura o con URL ajenas, solo lo propio', () => {
    expect(
      itemImageRemovalPaths('biz', { imageUrl: url('biz/items/item.5'), thumbnailUrl: null }),
    ).toEqual(['biz/items/item.5'])
    expect(
      itemImageRemovalPaths('biz', { imageUrl: url('otro/items/x'), thumbnailUrl: 'basura' }),
    ).toEqual([])
  })
})
