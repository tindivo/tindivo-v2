/**
 * Tindivo Store, de punta a punta en un navegador a 390 px.
 *
 * Siembra sus PROPIOS artículos por la API real del admin (título con el
 * prefijo `ZZ Test Store`, que barre `apps/api/vitest.global-setup.ts`) y los
 * borra al terminar. No depende del seed e2e.
 *
 * Requiere, como el resto: Supabase local, apps/customer (:3000) y apps/api
 * (:3001) levantadas.
 */
import { type APIRequestContext, expect, test } from '@playwright/test'

const SB = 'http://127.0.0.1:54321'
const API = 'http://localhost:3001/api/v1'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const PREFIX = 'ZZ Test Store'

test.use({ viewport: { width: 390, height: 844 } })

interface Item {
  id: string
  slug: string
  code: string
  title: string
}

let token = ''
let ropaId = ''
const created: string[] = []

async function adminApi(
  request: APIRequestContext,
  method: 'post' | 'patch' | 'delete',
  path: string,
  data?: unknown,
) {
  const res = await request.fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
    data: data ?? {},
  })
  return res
}

async function make(
  request: APIRequestContext,
  title: string,
  fields: Record<string, unknown>,
  photos = 2,
  status: 'available' | 'reserved' | 'sold' | 'hidden' = 'available',
): Promise<Item> {
  const created1 = await (await adminApi(request, 'post', '/admin/store')).json()
  const id = created1.data.id as string
  created.push(id)
  for (let i = 0; i < photos; i++) {
    const base = `${SB}/storage/v1/object/public/store-products/${id}`
    const r = await adminApi(request, 'post', `/admin/store/${id}/images`, {
      url: `${base}/${i}.webp`,
      thumbUrl: `${base}/${i}-t.webp`,
    })
    expect(r.status()).toBe(201)
  }
  const p = await adminApi(request, 'patch', `/admin/store/${id}`, {
    title: `${PREFIX} ${title}`,
    categoryId: ropaId,
    ...fields,
  })
  expect(p.status()).toBe(200)
  const s1 = await adminApi(request, 'post', `/admin/store/${id}/status`, { status: 'available' })
  expect(s1.status()).toBe(200)
  let product = (await s1.json()).data.product
  if (status !== 'available') {
    const s2 = await adminApi(request, 'post', `/admin/store/${id}/status`, { status })
    expect(s2.status()).toBe(200)
    product = (await s2.json()).data.product
  }
  return { id, slug: product.slug, code: product.code, title: product.title }
}

let avail: Item
let discounted: Item
let reserved: Item
let sold: Item
let hidden: Item

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext()
  const auth = await request.post(`${SB}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON },
    data: { email: 'admin@e2e.local', password: 'e2e-password-12345' },
  })
  token = (await auth.json()).access_token
  const cats = await request.get(`${SB}/rest/v1/store_categories?select=id,slug&slug=eq.ropa`, {
    headers: { apikey: ANON, authorization: `Bearer ${token}` },
  })
  ropaId = (await cats.json())[0].id

  avail = await make(request, 'Móvil Samsung', {
    price: 120,
    condition: 'new_unused',
    sizeLabel: '128 GB',
    description: 'Equipo nuevo en caja.',
  })
  discounted = await make(request, 'Casaca jean', {
    price: 30,
    originalPrice: 60,
    condition: 'used',
    conditionScore: 9,
    sizeLabel: 'M',
    audience: 'women',
    negotiable: true,
    description: 'Poco uso.',
  })
  reserved = await make(
    request,
    'Hoodie reservado',
    { price: 40, condition: 'used', conditionScore: 7, sizeLabel: 'M' },
    1,
    'reserved',
  )
  sold = await make(
    request,
    'Zapatillas vendidas',
    { price: 45, condition: 'used', conditionScore: 8, sizeLabel: '38' },
    1,
    'sold',
  )
  hidden = await make(request, 'Oculto', { price: 10, condition: 'new_unused' }, 1, 'hidden')
  await request.dispose()
})

test.afterAll(async ({ playwright }) => {
  const request = await playwright.request.newContext()
  // Sin endpoint de borrado para publicados: se limpian por REST con el JWT admin.
  for (const id of created) {
    await request.delete(`${SB}/rest/v1/store_products?id=eq.${id}`, {
      headers: { apikey: ANON, authorization: `Bearer ${token}` },
    })
  }
  await request.dispose()
})

/** Espera a que React hidrate (los handlers existen), no solo a que haya HTML. */
async function hydrated(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('.st-box input')
    return !!el && Object.keys(el).some((k) => k.startsWith('__react'))
  })
}

test.describe('listado /store', () => {
  test('pinta header, hero, buscador, categorías y la grilla, sin desborde ni textos <12 px', async ({
    page,
  }) => {
    await page.goto('/store?q=ZZ%20Test%20Store')
    await hydrated(page)

    await expect(page.getByText('Encuentra oportunidades cerca de ti')).toBeVisible()
    await expect(page.getByRole('search')).toBeVisible()
    await expect(page.locator('.st-chip').first()).toContainText('Todo')
    await expect(page.locator('main a.st-pc').first()).toBeVisible()

    const audit = await page.evaluate(() => {
      const small: string[] = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let n: Node | null = walker.nextNode()
      while (n) {
        const el = n.parentElement
        if (el && n.textContent?.trim() && !el.closest('script,style,.material-symbols-rounded')) {
          const fs = Number.parseFloat(getComputedStyle(el).fontSize)
          if (fs < 12) small.push(`${n.textContent.trim().slice(0, 20)}:${fs}`)
        }
        n = walker.nextNode()
      }
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        small,
      }
    })
    expect(audit.overflow).toBe(0)
    expect(audit.small).toEqual([])
  })

  test('a 360 px tampoco hay scroll horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await page.goto('/store?q=ZZ%20Test%20Store')
    await hydrated(page)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBe(0)
  })

  test('cada tarjeta lleva UNA sola insignia, y el descuento gana', async ({ page }) => {
    await page.goto('/store?q=ZZ%20Test%20Store')
    await hydrated(page)
    const card = page.locator('main a.st-pc', { hasText: 'Casaca jean' })
    await expect(card.locator('.st-bg')).toHaveCount(1)
    await expect(card.locator('.st-bg')).toHaveText('-50%')
    await expect(card).toContainText('S/30')
    await expect(card).toContainText('S/60')
    const counts = await page
      .locator('main a.st-pc')
      .evaluateAll((els) => els.map((e) => e.querySelectorAll('.st-bg').length))
    expect(Math.max(...counts)).toBeLessThanOrEqual(1)
  })

  test('el reservado sigue en la grilla con su insignia; el vendido va aparte; el oculto no sale', async ({
    page,
  }) => {
    // El listado del servidor se cachea 15 s (stale-while-revalidate): la primera
    // petición tras expirar puede traer datos de antes de sembrar. Se recarga
    // hasta que lo sembrado aparezca; en producción ese desfase es el aceptado.
    const grid = page.locator('main .st-grid a.st-pc')
    await expect(async () => {
      await page.goto('/store')
      await expect(grid.filter({ hasText: 'Hoodie reservado' })).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 40_000 })
    await hydrated(page)
    await expect(grid.filter({ hasText: 'Hoodie reservado' }).locator('.st-bg')).toHaveText(
      'Reservado',
    )
    await expect(grid.filter({ hasText: 'Zapatillas vendidas' })).toHaveCount(0)
    await expect(page.getByText('Vendidos recientemente')).toBeVisible()
    await expect(
      page.locator('.st-gsold a.st-pc', { hasText: 'Zapatillas vendidas' }),
    ).toBeVisible()
    await expect(page.getByText(`${PREFIX} Oculto`)).toHaveCount(0)
  })

  test('buscar sin tildes ni mayúsculas, y la URL queda compartible', async ({ page }) => {
    await page.goto('/store')
    await hydrated(page)
    await page.getByLabel('Buscar en la tienda').fill('MOVIL samsung')
    await expect(page.locator('main a.st-pc')).toHaveCount(1)
    await expect(page.locator('main a.st-pc')).toContainText('Móvil Samsung')
    await expect(page).toHaveURL(/q=MOVIL(\+|%20)samsung/)
    await page.getByLabel('Borrar búsqueda').click()
    await expect(page).not.toHaveURL(/q=/)
  })

  test('sin resultados: mensaje, WhatsApp con lo buscado y «Mientras tanto»', async ({ page }) => {
    await page.goto('/store')
    await hydrated(page)
    await page.getByLabel('Buscar en la tienda').fill('cargador solar')
    await expect(
      page.getByText('No lo tenemos aún. Escríbenos y te avisamos si llega'),
    ).toBeVisible()
    const wa = page.getByRole('link', { name: 'Escribir por WhatsApp' })
    const href = decodeURIComponent((await wa.getAttribute('href')) ?? '')
    expect(href).toContain('wa.me/')
    expect(href).toContain('Hola Tindivo, busco: cargador solar. ¿Me avisan si llega?')
    await expect(page.getByRole('heading', { name: 'Mientras tanto' })).toBeVisible()
    await expect(page.locator('.st-meanwhile + .st-grid a.st-pc').first()).toBeVisible()
  })

  test('la hoja de filtros dice cuántos artículos verás y lo deja en la URL', async ({ page }) => {
    await page.goto('/store?q=ZZ%20Test%20Store')
    await hydrated(page)
    await page.getByRole('button', { name: 'Filtros' }).click()
    const dialog = page.getByRole('dialog', { name: 'Filtros' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Segunda' }).click()
    // 2 usados disponibles/reservados: Casaca jean y Hoodie reservado
    await expect(dialog.getByRole('button', { name: /^Ver 2 artículos$/ })).toBeVisible()
    await dialog.getByRole('button', { name: /^Ver 2 artículos$/ }).click()
    await expect(page.locator('main a.st-pc')).toHaveCount(2)
    await expect(page).toHaveURL(/condicion=segunda/)
    // el punto naranja avisa de que hay filtros activos
    await expect(page.getByRole('button', { name: /hay filtros activos/ })).toBeVisible()
  })

  test('una categoría filtra y queda en la URL', async ({ page }) => {
    await page.goto('/store?q=ZZ%20Test%20Store')
    await hydrated(page)
    await page.locator('.st-chip', { hasText: 'Ropa' }).click()
    await expect(page).toHaveURL(/categoria=ropa/)
    await expect(page.locator('.st-chip', { hasText: 'Ropa' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

test.describe('detalle /store/[slug]', () => {
  test('disponible: precio, ficha, estado, entrega y botón verde con el mensaje y el código', async ({
    page,
  }) => {
    await page.goto(`/store/${discounted.slug}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${PREFIX} Casaca jean`)
    await expect(page.locator('.st-dprice')).toContainText('S/30')
    await expect(page.locator('.st-dprice s')).toHaveText('S/60')
    await expect(page.locator('.st-gal .st-bg')).toHaveText('-50%')
    await expect(page.getByText('Pieza única')).toBeVisible()
    await expect(page.getByText('Acepta ofertas')).toBeVisible()
    await expect(page.locator('.st-ficha')).toContainText('Usado')
    await expect(page.locator('.st-ficha')).toContainText('Talla M')
    await expect(page.locator('.st-ficha')).toContainText('Dama')
    await expect(page.getByText('Estado 9/10 · Muy buen estado')).toBeVisible()
    await expect(page.getByText(/Te lo llevamos en San Jacinto desde S\/2/)).toBeVisible()
    await expect(page.getByText(`Ref. ${discounted.code}`)).toBeVisible()
    await expect(page.getByText('Revísalo antes de pagar')).toBeVisible()

    const wa = page.getByRole('link', { name: /Lo quiero — pedir por WhatsApp/ })
    const href = decodeURIComponent((await wa.getAttribute('href')) ?? '')
    expect(href).toContain('Hola Tindivo, quiero: ')
    expect(href).toContain('(S/30)')
    expect(href).toContain(`código ${discounted.code}`)
    expect(href).toContain(`/store/${discounted.slug}`)
    expect(href).toContain('¿Sigue disponible?')
  })

  test('el clic a WhatsApp registra un evento con el producto y la fuente', async ({ page }) => {
    await page.goto(`/store/${avail.slug}?ref=fb`)
    await hydrated(page).catch(() => undefined)
    await page.waitForFunction(() => {
      const a = document.querySelector('.st-wab')
      return !!a && Object.keys(a).some((k) => k.startsWith('__react'))
    })
    const eventReq = page.waitForRequest(
      (r) =>
        r.url().includes('/public/store/events') &&
        r.method() === 'POST' &&
        (r.postDataJSON() as { type: string }).type === 'click_whatsapp',
    )
    // el enlace abre WhatsApp en otra pestaña: se intercepta para no salir del test
    await page.route('https://wa.me/**', (route) => route.fulfill({ status: 200, body: 'ok' }))
    await page.getByRole('link', { name: /Lo quiero — pedir por WhatsApp/ }).click()
    const body = (await eventReq).postDataJSON() as {
      type: string
      productId: string
      ref: string
      sessionId: string
    }
    expect(body.productId).toBe(avail.id)
    expect(body.ref).toBe('fb')
    expect(body.sessionId.length).toBeGreaterThanOrEqual(8)
  })

  test('reservado: aviso, etiqueta RESERVADO y «Avísame si se libera» (nunca verde)', async ({
    page,
  }) => {
    await page.goto(`/store/${reserved.slug}`)
    await expect(page.getByText('Otra persona lo pidió.')).toBeVisible()
    await expect(page.locator('.st-lab')).toHaveText('RESERVADO')
    await expect(page.locator('.st-wab')).toHaveCount(0)
    const notify = page.getByRole('link', { name: /Avísame si se libera/ })
    const href = decodeURIComponent((await notify.getAttribute('href')) ?? '')
    expect(href).toContain(
      `Hola Tindivo, vi que ${reserved.code} está reservado. Avísame si se libera.`,
    )
  })

  test('vendido: etiqueta VENDIDO y «Ver parecidos»', async ({ page }) => {
    await page.goto(`/store/${sold.slug}`)
    await expect(page.getByText('Ya encontró dueño.')).toBeVisible()
    await expect(page.locator('.st-lab')).toHaveText('VENDIDO')
    await expect(page.getByRole('link', { name: 'Ver parecidos' })).toHaveAttribute(
      'href',
      '/store?categoria=ropa',
    )
  })

  test('un oculto y un slug inexistente responden 404 de verdad', async ({ request }) => {
    expect((await request.get(`/store/${hidden.slug}`)).status()).toBe(404)
    expect((await request.get('/store/no-existe-ts-9999')).status()).toBe(404)
    expect((await request.get(`/store/${avail.slug}`)).status()).toBe(200)
  })

  test('Open Graph: título con precio, descripción, canónica e imagen PNG', async ({ request }) => {
    const html = await (await request.get(`/store/${discounted.slug}`)).text()
    expect(html).toContain(`${PREFIX} Casaca jean — S/30`)
    expect(html).toMatch(/property="og:image" content="[^"]+opengraph-image/)
    expect(html).toContain('property="og:image:type" content="image/png"')
    expect(html).toContain(`rel="canonical" href="http://localhost:3000/store/${discounted.slug}"`)
    expect(html).toContain('application/ld+json')
    expect(html).toContain('"availability":"https://schema.org/InStock"')
  })

  test('el visor abre con la foto tocada, cuenta, bloquea el fondo y cierra con Escape', async ({
    page,
  }) => {
    await page.goto(`/store/${discounted.slug}`)
    await page.waitForFunction(() => {
      const b = document.querySelector('.st-gal-slide')
      return !!b && Object.keys(b).some((k) => k.startsWith('__react'))
    })
    await page.locator('.st-gal-slide').first().click()
    const viewer = page.getByRole('dialog', { name: 'Fotos del artículo' })
    await expect(viewer).toBeVisible()
    await expect(viewer.locator('.n')).toHaveText('1/2')
    await expect(viewer.locator('.st-thumbs button')).toHaveCount(2)
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
    await page.keyboard.press('Escape')
    await expect(viewer).toBeHidden()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
  })

  test('volver: desde el listado va al historial (conserva filtros); desde un link externo, a /store', async ({
    page,
  }) => {
    await page.goto('/store?categoria=ropa&q=ZZ%20Test%20Store')
    await hydrated(page)
    await page.locator('main a.st-pc').first().click()
    await expect(page).toHaveURL(/\/store\/.+-ts-\d+/)
    await page.getByRole('button', { name: 'Volver' }).click()
    await expect(page).toHaveURL(/categoria=ropa/)

    // Link directo (WhatsApp/Facebook): no hay historial de Tindivo.
    await page.goto(`/store/${discounted.slug}?ref=fb`)
    await page.waitForFunction(() => {
      const b = document.querySelector('.st-rb')
      return !!b && Object.keys(b).some((k) => k.startsWith('__react'))
    })
    await page.getByRole('button', { name: 'Volver' }).click()
    await expect(page).toHaveURL(/\/store$/)
  })

  test('relacionados: misma tienda, sin el artículo actual', async ({ page }) => {
    await page.goto(`/store/${discounted.slug}`)
    const related = page.locator('.st-sim a.st-pc')
    await expect(related.first()).toBeVisible()
    await expect(related.filter({ hasText: `${PREFIX} Casaca jean` })).toHaveCount(0)
  })
})
