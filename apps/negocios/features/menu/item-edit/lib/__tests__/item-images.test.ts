import { describe, expect, it } from 'vitest'
import {
  type ItemImageStorage,
  itemImagePaths,
  itemImageRemovalPaths,
  uploadItemImages,
} from '../item-images'

function fakeStorage(failOn: string[] = []) {
  const uploads: { path: string; type: string; upsert: boolean; cacheControl: string }[] = []
  const storage: ItemImageStorage = {
    from(bucket) {
      expect(bucket).toBe('menu-items')
      return {
        async upload(path, file, options) {
          if (failOn.includes(path)) return { error: { message: `falló ${path}` } }
          uploads.push({
            path,
            type: file.type,
            upsert: options.upsert,
            cacheControl: options.cacheControl,
          })
          return { error: null }
        },
        getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
      }
    },
  }
  return { storage, uploads }
}

const full = new File(['a'], 'full.webp', { type: 'image/webp' })
const thumb = new File(['b'], 'thumb.webp', { type: 'image/webp' })
const base = { bizId: 'biz', itemId: 'item', cacheControl: '3600', version: 123 }

describe('rutas de las fotos del plato', () => {
  it('la miniatura va junto a la grande, con sufijo -t', () => {
    expect(itemImagePaths('biz', 'item')).toEqual({
      full: 'biz/items/item',
      thumb: 'biz/items/item-t',
    })
  })
  it('al quitar la foto se borran los dos objetos', () => {
    expect(itemImageRemovalPaths('biz', 'item')).toEqual(['biz/items/item', 'biz/items/item-t'])
  })
})

describe('uploadItemImages', () => {
  it('sube las dos con las mismas opciones y el mismo ?v=', async () => {
    const { storage, uploads } = fakeStorage()
    const r = await uploadItemImages(storage, { ...base, full, thumb })
    expect(r).toEqual({
      ok: true,
      imageUrl: 'https://cdn.test/biz/items/item?v=123',
      thumbnailUrl: 'https://cdn.test/biz/items/item-t?v=123',
      thumbnailError: null,
    })
    expect(uploads.map((u) => u.path)).toEqual(['biz/items/item', 'biz/items/item-t'])
    expect(uploads.every((u) => u.upsert && u.cacheControl === '3600')).toBe(true)
  })

  it('si falla la subida de la miniatura, guarda la grande y thumbnailUrl null', async () => {
    const { storage } = fakeStorage(['biz/items/item-t'])
    const r = await uploadItemImages(storage, { ...base, full, thumb })
    expect(r).toMatchObject({
      ok: true,
      imageUrl: 'https://cdn.test/biz/items/item?v=123',
      thumbnailUrl: null,
    })
    expect(r.ok && r.thumbnailError).toContain('item-t')
  })

  it('si la miniatura no se pudo generar, thumbnailUrl null y solo sube la grande', async () => {
    const { storage, uploads } = fakeStorage()
    const r = await uploadItemImages(storage, { ...base, full, thumb: null })
    expect(r).toMatchObject({ ok: true, thumbnailUrl: null })
    expect(uploads.map((u) => u.path)).toEqual(['biz/items/item'])
  })

  it('si falla la grande, devuelve el error y no sube la miniatura', async () => {
    const { storage, uploads } = fakeStorage(['biz/items/item'])
    const r = await uploadItemImages(storage, { ...base, full, thumb })
    expect(r).toEqual({ ok: false, message: 'No se pudo subir la imagen: falló biz/items/item' })
    expect(uploads).toEqual([])
  })
})
