/**
 * Tindivo Store de punta a punta por la capa HTTP (0242–0244 + rutas públicas y
 * de admin). Se ejerce el `Request` real con un JWT real de admin.
 *
 * Qué prueba y por qué importa:
 *  · lo PÚBLICO nunca ve borradores ni ocultos (ni por slug);
 *  · el flujo de publicación: borrador → fotos → campos → publicar, y que el
 *    botón «Publicar» recibe el mensaje de lo que falta;
 *  · los estados con su Deshacer (vender y deshacer limpia `sold_at`);
 *  · las fotos: máximo 6, reordenar, no dejar un publicado sin fotos;
 *  · los eventos y el resumen del experimento.
 *
 * Los artículos llevan el prefijo `ZZ Test Store` en el título: es lo que barre
 * `vitest.global-setup.ts` si una corrida se aborta.
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { POST as adminDuplicate } from '../../app/api/v1/admin/store/[id]/duplicate/route'
import { DELETE as imageDelete } from '../../app/api/v1/admin/store/[id]/images/[imageId]/route'
import { POST as imageAdd, PUT as imageOrder } from '../../app/api/v1/admin/store/[id]/images/route'
import {
  DELETE as adminDelete,
  GET as adminGet,
  PATCH as adminPatch,
} from '../../app/api/v1/admin/store/[id]/route'
import { POST as adminStatus } from '../../app/api/v1/admin/store/[id]/status/route'
import { POST as adminCreate, GET as adminList } from '../../app/api/v1/admin/store/route'
import { GET as settingsGet, PUT as settingsPut } from '../../app/api/v1/admin/store/settings/route'
import { GET as publicDetail } from '../../app/api/v1/public/store/[slug]/route'
import { POST as eventPost } from '../../app/api/v1/public/store/events/route'
import { GET as publicList } from '../../app/api/v1/public/store/route'
import { localClient as db } from './helpers/local-db'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY

// biome-ignore lint/suspicious/noExplicitAny: las tablas de Store aún no están en database.types.ts
const sdb = db as any

const PREFIX = 'ZZ Test Store'
const SESSION = `ztest-${Math.random().toString(36).slice(2, 10)}`
let adminToken = ''
let ropaId = ''
let tecnologiaId = ''
let originalSettings: unknown = null
const created: string[] = []

type Json = Record<string, any>

async function call(
  handler: (req: Request, ctx: any) => Promise<Response>,
  opts: {
    method?: string
    body?: unknown
    params?: Record<string, string>
    qs?: string
    auth?: boolean
  } = {},
): Promise<{ status: number; json: Json | null }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.auth !== false) headers.authorization = `Bearer ${adminToken}`
  const res = await handler(
    new Request(`${LOCAL_URL}/api/v1/x${opts.qs ?? ''}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
    { params: Promise.resolve(opts.params ?? {}) },
  )
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}

/** URL de foto válida para el artículo: apunta a su carpeta del bucket. */
const photo = (id: string, n: number) => ({
  url: `${LOCAL_URL}/storage/v1/object/public/store-products/${id}/${n}.webp`,
  thumbUrl: `${LOCAL_URL}/storage/v1/object/public/store-products/${id}/${n}-t.webp`,
})

async function newDraft(): Promise<Json> {
  const r = await call(adminCreate, { method: 'POST' })
  expect(r.status).toBe(201)
  created.push(r.json?.data.id)
  return r.json?.data
}

async function addPhotos(id: string, n: number): Promise<Json> {
  let last: Json = {}
  for (let i = 0; i < n; i++) {
    const r = await call(imageAdd, { method: 'POST', params: { id }, body: photo(id, i) })
    expect(r.status).toBe(201)
    last = r.json?.data
  }
  return last
}

/** Un artículo completo y publicado. */
async function published(over: Json = {}, photos = 1): Promise<Json> {
  const d = await newDraft()
  await addPhotos(d.id, photos)
  const patch = await call(adminPatch, {
    method: 'PATCH',
    params: { id: d.id },
    body: {
      title: `${PREFIX} Casaca`,
      price: 30,
      originalPrice: 60,
      categoryId: ropaId,
      condition: 'used',
      conditionScore: 9,
      sizeLabel: 'M',
      ...over,
    },
  })
  expect(patch.status).toBe(200)
  const s = await call(adminStatus, {
    method: 'POST',
    params: { id: d.id },
    body: { status: 'available' },
  })
  expect(s.status).toBe(200)
  return s.json?.data.product
}

const setStatus = (id: string, status: string) =>
  call(adminStatus, { method: 'POST', params: { id }, body: { status } })

beforeAll(async () => {
  const auth = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await auth.auth.signInWithPassword({
    email: 'admin@e2e.local',
    password: 'e2e-password-12345',
  })
  if (error) throw new Error(`login admin falló: ${error.message}`)
  adminToken = data.session?.access_token ?? ''

  const { data: cats } = await sdb.from('store_categories').select('id,slug')
  ropaId = cats.find((c: Json) => c.slug === 'ropa').id
  tecnologiaId = cats.find((c: Json) => c.slug === 'tecnologia').id
  const { data: s } = await sdb.from('app_settings').select('value').eq('key', 'store').single()
  originalSettings = s.value
})

afterAll(async () => {
  if (created.length > 0) await sdb.from('store_products').delete().in('id', created)
  await sdb.from('store_events').delete().eq('session_id', SESSION)
  if (originalSettings) {
    await sdb
      .from('app_settings')
      .upsert({ key: 'store', value: originalSettings }, { onConflict: 'key' })
  }
})

describe('autorización del admin', () => {
  it('sin token → 401 en lista, creación y ajustes', async () => {
    expect((await call(adminList, { auth: false })).status).toBe(401)
    expect((await call(adminCreate, { method: 'POST', auth: false })).status).toBe(401)
    expect((await call(settingsGet, { auth: false })).status).toBe(401)
  })
})

describe('borrador', () => {
  it('nace vacío, con código TS-NNNN y sin slug', async () => {
    const d = await newDraft()
    expect(d.status).toBe('draft')
    expect(d.code).toMatch(/^TS-\d{4,}$/)
    expect(d.slug).toBeNull()
    expect(d.images).toEqual([])
  })

  it('el público no lo ve, ni por slug ni por código', async () => {
    const d = await newDraft()
    await call(adminPatch, {
      method: 'PATCH',
      params: { id: d.id },
      body: { title: `${PREFIX} Secreto` },
    })
    const list = await call(publicList)
    expect(JSON.stringify(list.json)).not.toContain(`${PREFIX} Secreto`)
    expect((await call(publicDetail, { params: { slug: d.code.toLowerCase() } })).status).toBe(404)
  })

  it('el autosave valida: título >60 → 422; precio 0 → 422', async () => {
    const d = await newDraft()
    const long = await call(adminPatch, {
      method: 'PATCH',
      params: { id: d.id },
      body: { title: 'a'.repeat(61) },
    })
    expect(long.status).toBe(422)
    const zero = await call(adminPatch, {
      method: 'PATCH',
      params: { id: d.id },
      body: { price: 0 },
    })
    expect(zero.status).toBe(422)
  })

  it('cambiar a nuevo borra el estado 1–10', async () => {
    const d = await newDraft()
    await call(adminPatch, {
      method: 'PATCH',
      params: { id: d.id },
      body: { condition: 'used', conditionScore: 7 },
    })
    const r = await call(adminPatch, {
      method: 'PATCH',
      params: { id: d.id },
      body: { condition: 'new_unused' },
    })
    expect(r.json?.data.conditionScore).toBeNull()
  })

  it('un campo vacío se guarda como null (se puede borrar la descripción)', async () => {
    const d = await newDraft()
    await call(adminPatch, { method: 'PATCH', params: { id: d.id }, body: { description: 'hola' } })
    const r = await call(adminPatch, {
      method: 'PATCH',
      params: { id: d.id },
      body: { description: '  ' },
    })
    expect(r.json?.data.description).toBeNull()
  })

  it('el parche no puede colar status ni code', async () => {
    const d = await newDraft()
    const r = await call(adminPatch, {
      method: 'PATCH',
      params: { id: d.id },
      body: { title: `${PREFIX} X`, status: 'sold', code: 'TS-9999' },
    })
    expect(r.json?.data.status).toBe('draft')
    expect(r.json?.data.code).toBe(d.code)
  })
})

describe('publicar: el botón dice qué falta', () => {
  it('sin foto → «Falta al menos una foto»', async () => {
    const d = await newDraft()
    const r = await setStatus(d.id, 'available')
    expect(r.status).toBe(422)
    expect(r.json?.detail).toBe('Falta al menos una foto')
  })

  it('con foto pero sin título → «Falta el título»; luego precio, categoría, condición, estado', async () => {
    const d = await newDraft()
    await addPhotos(d.id, 1)
    expect((await setStatus(d.id, 'available')).json?.detail).toBe('Falta el título')
    await call(adminPatch, {
      method: 'PATCH',
      params: { id: d.id },
      body: { title: `${PREFIX} Faltas` },
    })
    expect((await setStatus(d.id, 'available')).json?.detail).toBe('Falta el precio')
    await call(adminPatch, { method: 'PATCH', params: { id: d.id }, body: { price: 20 } })
    expect((await setStatus(d.id, 'available')).json?.detail).toBe('Falta la categoría')
    await call(adminPatch, { method: 'PATCH', params: { id: d.id }, body: { categoryId: ropaId } })
    expect((await setStatus(d.id, 'available')).json?.detail).toBe('Falta la condición')
    await call(adminPatch, { method: 'PATCH', params: { id: d.id }, body: { condition: 'used' } })
    expect((await setStatus(d.id, 'available')).json?.detail).toBe('Falta el estado del 1 al 10')
    await call(adminPatch, { method: 'PATCH', params: { id: d.id }, body: { conditionScore: 8 } })
    const ok = await setStatus(d.id, 'available')
    expect(ok.status).toBe(200)
    expect(ok.json?.data.product.slug).toMatch(/^zz-test-store-faltas-ts-\d{4,}$/)
    expect(ok.json?.data.previous.status).toBe('draft')
  })

  it('desde borrador solo se puede publicar: reservar un borrador → 409', async () => {
    const d = await newDraft()
    await addPhotos(d.id, 1)
    expect((await setStatus(d.id, 'reserved')).status).toBe(409)
  })

  it('nada vuelve a borrador', async () => {
    const p = await published()
    const r = await call(adminStatus, {
      method: 'POST',
      params: { id: p.id },
      body: { status: 'draft' },
    })
    expect(r.status).toBe(422) // 'draft' no es un destino válido del contrato
  })

  it('el slug no cambia aunque se edite el título', async () => {
    const p = await published()
    const r = await call(adminPatch, {
      method: 'PATCH',
      params: { id: p.id },
      body: { title: `${PREFIX} Otro nombre` },
    })
    expect(r.json?.data.slug).toBe(p.slug)
  })
})

describe('vitrina pública', () => {
  it('un publicado sale en el detalle, sin campos internos del admin', async () => {
    const p = await published({ description: 'Poco uso' })
    const r = await call(publicDetail, { params: { slug: p.slug } })
    expect(r.status).toBe(200)
    const prod = r.json?.data.product
    expect(prod.title).toBe(`${PREFIX} Casaca`)
    expect(prod.images).toHaveLength(1)
    expect(prod.price).toBe(30)
    for (const internal of ['views', 'whatsappClicks', 'updatedAt', 'publishedAt', 'categoryId']) {
      expect(prod).not.toHaveProperty(internal)
    }
    expect(r.json?.data.settings.whatsappNumber).toMatch(/^\d{11,15}$/)
  })

  it('sale en el listado con su miniatura y la categoría con su cantidad', async () => {
    const p = await published()
    const r = await call(publicList, { qs: '?q=ZZ%20Test%20Store' })
    const found = r.json?.data.products.find((x: Json) => x.id === p.id)
    expect(found.thumbUrl).toContain('-t.webp')
    expect(r.json?.data.categories.find((c: Json) => c.slug === 'ropa').count).toBeGreaterThan(0)
  })

  it('la búsqueda ignora tildes y mayúsculas', async () => {
    const p = await published({ title: `${PREFIX} Móvil Samsung` })
    for (const q of ['MOVIL', 'móvil', 'samsung']) {
      const r = await call(publicList, { qs: `?q=${encodeURIComponent(q)}` })
      expect(r.json?.data.products.some((x: Json) => x.id === p.id)).toBe(true)
    }
  })

  it('busca por talla y por categoría', async () => {
    const p = await published({ sizeLabel: 'XXL-test' })
    const bySize = await call(publicList, { qs: '?q=xxl-test' })
    expect(bySize.json?.data.products.some((x: Json) => x.id === p.id)).toBe(true)
  })

  it('filtra por condición y ordena por precio', async () => {
    const a = await published({ title: `${PREFIX} Barato`, price: 5, originalPrice: null })
    const b = await published({ title: `${PREFIX} Caro`, price: 500, originalPrice: null })
    const asc = await call(publicList, { qs: '?q=ZZ%20Test%20Store&orden=precio_asc' })
    const ids = asc.json?.data.products.map((x: Json) => x.id)
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id))
    const desc = await call(publicList, { qs: '?q=ZZ%20Test%20Store&orden=precio_desc' })
    const ids2 = desc.json?.data.products.map((x: Json) => x.id)
    expect(ids2.indexOf(b.id)).toBeLessThan(ids2.indexOf(a.id))
    const nuevo = await call(publicList, { qs: '?q=ZZ%20Test%20Store&condicion=nuevo' })
    expect(nuevo.json?.data.products.some((x: Json) => x.id === a.id)).toBe(false)
  })

  it('relacionados: misma categoría, disponibles, sin el actual', async () => {
    const a = await published({ title: `${PREFIX} Rel A`, categoryId: tecnologiaId })
    const b = await published({ title: `${PREFIX} Rel B`, categoryId: tecnologiaId })
    const c = await published({ title: `${PREFIX} Rel C`, categoryId: tecnologiaId })
    await setStatus(c.id, 'reserved')
    const r = await call(publicDetail, { params: { slug: a.slug } })
    const ids = r.json?.data.related.map((x: Json) => x.id)
    expect(ids).toContain(b.id)
    expect(ids).not.toContain(a.id)
    expect(ids).not.toContain(c.id) // reservado no es «disponible»
    expect(ids.length).toBeGreaterThanOrEqual(2)
    expect(ids.length).toBeLessThanOrEqual(4)
  })
})

describe('estados con Deshacer', () => {
  it('reservado sigue en la grilla; vendido sale de la grilla y entra en «Vendidos»; deshacer limpia sold_at', async () => {
    const p = await published({ title: `${PREFIX} Estados` })
    const grid = async () =>
      (await call(publicList, { qs: '?q=ZZ%20Test%20Store%20Estados' })).json?.data

    const res = await setStatus(p.id, 'reserved')
    expect(res.json?.data.previous.status).toBe('available')
    expect((await grid()).products.find((x: Json) => x.id === p.id).status).toBe('reserved')

    const sold = await setStatus(p.id, 'sold')
    expect(sold.json?.data.product.soldAt).not.toBeNull()
    const g = await grid()
    expect(g.products.some((x: Json) => x.id === p.id)).toBe(false)
    expect(g.sold.some((x: Json) => x.id === p.id)).toBe(true)
    // el detalle de un vendido existe (es prueba social)
    expect((await call(publicDetail, { params: { slug: p.slug } })).json?.data.product.status).toBe(
      'sold',
    )

    // Deshacer = volver al estado anterior que devolvió la API
    const undo = await setStatus(p.id, sold.json?.data.previous.status)
    expect(undo.json?.data.product.status).toBe('reserved')
    expect(undo.json?.data.product.soldAt).toBeNull()
  })

  it('las tarjetas de vendidos traen los mismos campos que la grilla (condición, precio original)', async () => {
    const p = await published({ title: `${PREFIX} Vendida completa` })
    await setStatus(p.id, 'sold')
    const r = await call(publicList, { qs: '?q=ZZ%20Test%20Store' })
    const card = r.json?.data.sold.find((x: Json) => x.id === p.id)
    expect(card.condition).toBe('used')
    expect(card.originalPrice).toBe(60)
    expect(card.status).toBe('sold')
    expect(card.thumbUrl).toContain('-t.webp')
  })

  it('«Vendidos recientemente» trae como máximo 6', async () => {
    const r = await call(publicList)
    expect(r.json?.data.sold.length).toBeLessThanOrEqual(6)
  })

  it('oculto desaparece del público (404) y vuelve al publicar de nuevo', async () => {
    const p = await published()
    await setStatus(p.id, 'hidden')
    expect((await call(publicDetail, { params: { slug: p.slug } })).status).toBe(404)
    const list = await call(publicList, { qs: `?q=${encodeURIComponent(p.title)}` })
    expect(list.json?.data.products.some((x: Json) => x.id === p.id)).toBe(false)
    await setStatus(p.id, 'available')
    expect((await call(publicDetail, { params: { slug: p.slug } })).status).toBe(200)
  })

  it('mismo estado no es una transición → 409', async () => {
    const p = await published()
    expect((await setStatus(p.id, 'available')).status).toBe(409)
  })
})

describe('fotos', () => {
  it('máximo 6: la séptima se rechaza', async () => {
    const d = await newDraft()
    await addPhotos(d.id, 6)
    const r = await call(imageAdd, { method: 'POST', params: { id: d.id }, body: photo(d.id, 6) })
    expect(r.status).toBe(422)
    expect(r.json?.detail).toBe('Máximo 6 fotos por artículo')
  })

  it('una foto de otra carpeta (otro artículo o internet) no se registra', async () => {
    const d = await newDraft()
    const other = await newDraft()
    const r = await call(imageAdd, {
      method: 'POST',
      params: { id: d.id },
      body: photo(other.id, 0),
    })
    expect(r.status).toBe(422)
    const web = await call(imageAdd, {
      method: 'POST',
      params: { id: d.id },
      body: { url: 'https://example.com/a.jpg', thumbUrl: 'https://example.com/b.jpg' },
    })
    expect(web.status).toBe(422)
  })

  it('reordenar cambia la portada (la primera)', async () => {
    const p = await published({}, 3)
    const ids = p.images.map((i: Json) => i.id)
    const reversed = [...ids].reverse()
    const r = await call(imageOrder, {
      method: 'PUT',
      params: { id: p.id },
      body: { ids: reversed },
    })
    expect(r.status).toBe(200)
    expect(r.json?.data.images.map((i: Json) => i.id)).toEqual(reversed)
    expect(r.json?.data.thumbUrl).toBe(p.images[2].thumbUrl) // la nueva portada
    // el listado público usa la nueva portada
    const list = await call(publicList, { qs: `?q=${encodeURIComponent(p.title)}` })
    expect(list.json?.data.products.find((x: Json) => x.id === p.id).thumbUrl).toBe(
      p.images[2].thumbUrl,
    )
  })

  it('un orden que no coincide con las fotos → 409', async () => {
    const p = await published({}, 2)
    const r = await call(imageOrder, {
      method: 'PUT',
      params: { id: p.id },
      body: { ids: [p.images[0].id] },
    })
    expect(r.status).toBe(409)
  })

  it('borrar una foto recompacta posiciones; la última de un publicado no se puede borrar', async () => {
    const p = await published({}, 3)
    const del = await call(imageDelete, {
      method: 'DELETE',
      params: { id: p.id, imageId: p.images[0].id },
    })
    expect(del.status).toBe(200)
    expect(del.json?.data.images.map((i: Json) => i.position)).toEqual([0, 1])

    await call(imageDelete, {
      method: 'DELETE',
      params: { id: p.id, imageId: del.json?.data.images[0].id },
    })
    const last = await call(imageDelete, {
      method: 'DELETE',
      params: { id: p.id, imageId: del.json?.data.images[1].id },
    })
    expect(last.status).toBe(422)
    expect(last.json?.detail).toBe('Un artículo necesita al menos una foto')
  })
})

describe('duplicar y eliminar', () => {
  it('duplicar copia los campos, no las fotos, y genera código y slug propios', async () => {
    const p = await published({ title: `${PREFIX} Original`, description: 'Detalle' }, 2)
    const r = await call(adminDuplicate, { method: 'POST', params: { id: p.id } })
    expect(r.status).toBe(201)
    created.push(r.json?.data.id)
    const dup = r.json?.data
    expect(dup.status).toBe('draft')
    expect(dup.title).toBe(`${PREFIX} Original`)
    expect(dup.description).toBe('Detalle')
    expect(dup.price).toBe(30)
    expect(dup.images).toEqual([])
    expect(dup.code).not.toBe(p.code)
    expect(dup.slug).toBeNull()
  })

  it('solo se eliminan borradores; un publicado → 409 (se oculta)', async () => {
    const p = await published()
    expect((await call(adminDelete, { method: 'DELETE', params: { id: p.id } })).status).toBe(409)
    const d = await newDraft()
    expect((await call(adminDelete, { method: 'DELETE', params: { id: d.id } })).status).toBe(204)
    expect((await call(adminGet, { params: { id: d.id } })).status).toBe(404)
  })
})

describe('eventos y resumen del experimento', () => {
  const ev = (body: Json) => call(eventPost, { method: 'POST', auth: false, body })

  it('un evento válido → 204', async () => {
    expect((await ev({ type: 'view_list', sessionId: SESSION })).status).toBe(204)
  })

  it('tipo desconocido → 422; sessionId corto → 422', async () => {
    expect((await ev({ type: 'hack', sessionId: SESSION })).status).toBe(422)
    expect((await ev({ type: 'view_list', sessionId: 'x' })).status).toBe(422)
  })

  it('guarda la fuente conocida y descarta la desconocida', async () => {
    await ev({ type: 'view_list', sessionId: SESSION, ref: 'wa_estado' })
    await ev({ type: 'view_list', sessionId: SESSION, ref: 'inventada' })
    const { data } = await sdb.from('store_events').select('ref').eq('session_id', SESSION)
    expect(data.some((e: Json) => e.ref === 'wa_estado')).toBe(true)
    expect(data.some((e: Json) => e.ref === 'inventada')).toBe(false)
  })

  it('un producto inexistente no pierde el evento', async () => {
    const r = await ev({
      type: 'view_product',
      sessionId: SESSION,
      productId: '00000000-0000-4000-8000-00000000dead',
    })
    expect(r.status).toBe(204)
  })

  it('vistas y clics a WhatsApp aparecen en la fila del admin y en el resumen', async () => {
    const p = await published({ title: `${PREFIX} Medido` })
    await ev({ type: 'view_product', sessionId: SESSION, productId: p.id, ref: 'fb' })
    await ev({ type: 'view_product', sessionId: SESSION, productId: p.id })
    await ev({ type: 'click_whatsapp', sessionId: SESSION, productId: p.id, ref: 'fb' })

    const list = await call(adminList)
    const item = list.json?.data.items.find((x: Json) => x.id === p.id)
    expect(item.views).toBe(2)
    expect(item.whatsappClicks).toBe(1)

    const m = list.json?.data.metrics
    expect(m.day).toBeGreaterThanOrEqual(1)
    expect(m.totalDays).toBe(14)
    expect(m.whatsappClicks).toBeGreaterThanOrEqual(1)
    expect(m.byRef.find((r: Json) => r.ref === 'fb').whatsappClicks).toBeGreaterThanOrEqual(1)
    expect(list.json?.data.goals.visits).toEqual({ min: 150, target: 250 })
  })

  it('la lista del admin cuenta pestañas y avisa de borradores', async () => {
    await newDraft()
    const list = await call(adminList)
    const d = list.json?.data
    expect(d.counts.draft).toBeGreaterThanOrEqual(1)
    expect(d.drafts.count).toBe(d.counts.draft)
    expect(d.drafts.lastUpdatedAt).not.toBeNull()
    const drafts = await call(adminList, { qs: '?status=draft' })
    expect(drafts.json?.data.items.every((x: Json) => x.status === 'draft')).toBe(true)
  })

  it('el límite por sesión corta el ruido (429)', async () => {
    const noisy = `ztest-noisy-${Math.random().toString(36).slice(2, 8)}`
    const rows = Array.from({ length: 60 }, () => ({ type: 'view_list', session_id: noisy }))
    await sdb.from('store_events').insert(rows)
    const r = await ev({ type: 'view_list', sessionId: noisy })
    expect(r.status).toBe(429)
    await sdb.from('store_events').delete().eq('session_id', noisy)
  })
})

describe('ajustes', () => {
  it('se guardan y se leen; el número se normaliza a dígitos', async () => {
    const put = await call(settingsPut, {
      method: 'PUT',
      body: {
        whatsappNumber: '+51 911 222 333',
        deliveryMin: 2,
        deliveryMax: 3,
        deliveryText: 'Rápido',
      },
    })
    expect(put.status).toBe(200)
    const got = await call(settingsGet)
    expect(got.json?.data).toEqual({
      whatsappNumber: '51911222333',
      deliveryMin: 2,
      deliveryMax: 3,
      deliveryText: 'Rápido',
    })
    // y lo ve el público
    expect((await call(publicList)).json?.data.settings.whatsappNumber).toBe('51911222333')
  })

  it('mínimo mayor que máximo → 422; sin código de país → 422', async () => {
    const bad = await call(settingsPut, {
      method: 'PUT',
      body: { whatsappNumber: '51906550166', deliveryMin: 5, deliveryMax: 2, deliveryText: null },
    })
    expect(bad.status).toBe(422)
    const short = await call(settingsPut, {
      method: 'PUT',
      body: { whatsappNumber: '906550166', deliveryMin: 2, deliveryMax: 3, deliveryText: null },
    })
    expect(short.status).toBe(422)
  })
})
