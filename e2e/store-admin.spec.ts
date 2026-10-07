/**
 * Admin de Tindivo Store (apps/admin, :3003) en un navegador a 390 px.
 *
 * Los artículos de prueba se siembran por la API real y llevan el prefijo
 * `ZZ Test Store` (lo barre `apps/api/vitest.global-setup.ts` si algo se aborta);
 * lo que cree la propia UI se borra al terminar por REST con el JWT admin.
 *
 * Requiere: Supabase local, apps/api (:3001) y apps/admin (:3003) levantadas.
 */
import { type APIRequestContext, expect, type Page, test } from '@playwright/test'

const SB = 'http://127.0.0.1:54321'
const API = 'http://localhost:3001/api/v1'
const ADMIN = 'http://localhost:3003'
const CUSTOMER = 'http://localhost:3000'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const PREFIX = 'ZZ Test Store'

test.use({
  baseURL: ADMIN,
  viewport: { width: 390, height: 844 },
  permissions: ['clipboard-read', 'clipboard-write'],
})

let token = ''
let ropaId = ''
const created: string[] = []
let originalSettings: unknown = null

const auth = () => ({ authorization: `Bearer ${token}` })

async function api(
  request: APIRequestContext,
  method: 'get' | 'post' | 'patch' | 'put',
  path: string,
  data?: unknown,
) {
  const res = await request.fetch(`${API}${path}`, {
    method,
    headers: auth(),
    data: data ?? (method === 'get' ? undefined : {}),
  })
  return {
    status: res.status(),
    json: (await res.json().catch(() => null)) as { data: any } | null,
  }
}

/** Artículo publicado sembrado por la API (fotos con URL de la carpeta del artículo). */
async function seed(
  request: APIRequestContext,
  title: string,
  fields: Record<string, unknown>,
  status: 'available' | 'reserved' | 'sold' | 'hidden' = 'available',
) {
  const c = await api(request, 'post', '/admin/store')
  const id = c.json?.data.id as string
  created.push(id)
  const base = `${SB}/storage/v1/object/public/store-products/${id}`
  await api(request, 'post', `/admin/store/${id}/images`, {
    url: `${base}/0.webp`,
    thumbUrl: `${base}/0-t.webp`,
  })
  await api(request, 'patch', `/admin/store/${id}`, {
    title: `${PREFIX} ${title}`,
    categoryId: ropaId,
    ...fields,
  })
  let s = await api(request, 'post', `/admin/store/${id}/status`, { status: 'available' })
  if (status !== 'available')
    s = await api(request, 'post', `/admin/store/${id}/status`, { status })
  return {
    id,
    code: s.json?.data.product.code as string,
    slug: s.json?.data.product.slug as string,
    title: `${PREFIX} ${title}`,
  }
}

const getItem = async (request: APIRequestContext, id: string) =>
  (await api(request, 'get', `/admin/store/${id}`)).json?.data

async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('Correo').fill('admin@e2e.local')
  await page.getByLabel('Contraseña').fill('e2e-password-12345')
  await page.getByRole('button', { name: /entrar|ingresar|iniciar/i }).click()
  // «Sala de control» también sale en la pantalla de login: se espera al botón del
  // menú, que solo existe dentro, o el siguiente `goto` corta el inicio de sesión.
  await expect(page.getByRole('button', { name: 'Menú' })).toBeVisible({ timeout: 30_000 })
}

/** Una imagen de verdad (no plana) para que el compresor del navegador la procese. */
async function makePng(page: Page, seedN: number): Promise<Buffer> {
  const b64 = await page.evaluate((n) => {
    const c = document.createElement('canvas')
    c.width = 480
    c.height = 360
    const ctx = c.getContext('2d') as CanvasRenderingContext2D
    for (let y = 0; y < 360; y += 12) {
      for (let x = 0; x < 480; x += 12) {
        ctx.fillStyle = `hsl(${(x * 0.7 + y * 0.5 + n * 53) % 360} 70% ${35 + ((x + y) % 40)}%)`
        ctx.fillRect(x, y, 12, 12)
      }
    }
    return c.toDataURL('image/png').split(',')[1] as string
  }, seedN)
  return Buffer.from(b64, 'base64')
}

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext()
  const r = await request.post(`${SB}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON },
    data: { email: 'admin@e2e.local', password: 'e2e-password-12345' },
  })
  token = (await r.json()).access_token
  const cats = await request.get(`${SB}/rest/v1/store_categories?select=id&slug=eq.ropa`, {
    headers: { apikey: ANON, ...auth() },
  })
  ropaId = (await cats.json())[0].id
  const s = await request.get(`${SB}/rest/v1/app_settings?select=value&key=eq.store`, {
    headers: { apikey: ANON, ...auth() },
  })
  originalSettings = (await s.json())[0]?.value ?? null
  await request.dispose()
})

test.afterAll(async ({ playwright }) => {
  const request = await playwright.request.newContext()
  // Lo que creó la propia UI no lleva el prefijo: se rastrea por el título vacío o el prefijo.
  const all = await request.get(
    `${SB}/rest/v1/store_products?select=id,title&or=(title.is.null,title.like.${encodeURIComponent('ZZ Test Store*')})`,
    { headers: { apikey: ANON, ...auth() } },
  )
  const ids = new Set([...created, ...((await all.json()) as { id: string }[]).map((p) => p.id)])
  for (const id of ids) {
    await request.delete(`${SB}/rest/v1/store_products?id=eq.${id}`, {
      headers: { apikey: ANON, ...auth() },
    })
  }
  if (originalSettings) {
    await request.post(`${SB}/rest/v1/app_settings?on_conflict=key`, {
      headers: { apikey: ANON, ...auth(), prefer: 'resolution=merge-duplicates' },
      data: { key: 'store', value: originalSettings },
    })
  }
  await request.dispose()
})

test.describe('lista /store', () => {
  test('muestra el resumen, las pestañas con su cantidad y las filas con vistas y clics', async ({
    page,
    request,
  }) => {
    const a = await seed(request, 'Fila lista', { price: 30, condition: 'new_unused' })
    await login(page)
    await page.goto('/store')
    await expect(page.getByText(/Día \d+ de 14|Experimento de 14 días/)).toBeVisible()
    await expect(page.getByRole('tab', { name: /Disponibles/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Reservados/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Vendidos/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Más/ })).toBeVisible()
    const row = page.locator('.as-item', { hasText: a.title })
    await expect(row).toBeVisible()
    await expect(row).toContainText(a.code)
    await expect(row).toContainText('S/30')
    await expect(row.locator('.as-st')).toHaveText('Disponible')
  })

  test('el botón «Nuevo artículo» nunca tapa la última fila', async ({ page, request }) => {
    for (let i = 0; i < 4; i++)
      await seed(request, `Relleno ${i}`, { price: 10 + i, condition: 'new_unused' })
    await login(page)
    await page.goto('/store')
    const rows = page.locator('.as-item')
    await expect(rows.first()).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const last = rows.last()
    await last.scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const box = await last.boundingBox()
    const fab = await page.locator('.as-fab').boundingBox()
    expect(box && fab && box.y + box.height <= fab.y).toBe(true)
  })

  test('a 360 px no hay scroll horizontal', async ({ page, request }) => {
    await seed(request, 'Ancho', { price: 12, condition: 'new_unused' })
    await page.setViewportSize({ width: 360, height: 740 })
    await login(page)
    await page.goto('/store')
    await expect(page.locator('.as-item').first()).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBe(0)
  })

  test('reservar desde la hoja: avisa, y «Deshacer» devuelve el estado', async ({
    page,
    request,
  }) => {
    const a = await seed(request, 'Reservable', { price: 25, condition: 'new_unused' })
    await login(page)
    await page.goto('/store')
    await page.locator('.as-item', { hasText: a.title }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByRole('button', { name: 'Reservar' })).toBeVisible()
    await sheet.getByRole('button', { name: 'Reservar' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Marcado como reservado' }),
    ).toBeVisible()
    expect((await getItem(request, a.id)).status).toBe('reserved')
    await page.getByRole('button', { name: 'Deshacer' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Cambio deshecho' })).toBeVisible()
    expect((await getItem(request, a.id)).status).toBe('available')
  })

  test('marcar vendido fija la fecha y deshacer la limpia', async ({ page, request }) => {
    const a = await seed(request, 'Vendible', { price: 40, condition: 'new_unused' })
    await login(page)
    await page.goto('/store')
    await page.locator('.as-item', { hasText: a.title }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^Vendido$/ })
      .click()
    await expect(page.getByRole('status').filter({ hasText: 'Marcado como vendido' })).toBeVisible()
    const sold = await getItem(request, a.id)
    expect(sold.status).toBe('sold')
    expect(sold.soldAt).not.toBeNull()
    await page.getByRole('button', { name: 'Deshacer' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Cambio deshecho' })).toBeVisible()
    const back = await getItem(request, a.id)
    expect(back.status).toBe('available')
    expect(back.soldAt).toBeNull()
  })

  test('el aviso de Deshacer desaparece solo a los ~5 segundos', async ({ page, request }) => {
    const a = await seed(request, 'Aviso', { price: 20, condition: 'new_unused' })
    await login(page)
    await page.goto('/store')
    await page.locator('.as-item', { hasText: a.title }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Ocultar' }).click()
    const toast = page.getByRole('status').filter({ hasText: 'Artículo oculto' })
    await expect(toast).toBeVisible()
    await expect(toast).toBeHidden({ timeout: 8000 })
  })

  test('la hoja cambia según el estado: reservado ofrece «Marcar vendido», oculto «Volver a publicar»', async ({
    page,
    request,
  }) => {
    const r = await seed(
      request,
      'Hoja reservado',
      { price: 15, condition: 'new_unused' },
      'reserved',
    )
    const h = await seed(request, 'Hoja oculto', { price: 15, condition: 'new_unused' }, 'hidden')
    await login(page)
    await page.goto('/store')
    await page.getByRole('tab', { name: /Reservados/ }).click()
    await page.locator('.as-item', { hasText: r.title }).click()
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Marcar vendido' }),
    ).toBeVisible()
    await expect(
      page
        .getByRole('dialog')
        .getByRole('button', { name: /Volver a disponible/ })
        .first(),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: /Más/ }).click()
    await page.locator('.as-item', { hasText: h.title }).click()
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Volver a publicar' }),
    ).toBeVisible()
  })

  test('copiar link y texto usan la fuente elegida', async ({ page, request }) => {
    const a = await seed(request, 'Copiable', {
      price: 30,
      originalPrice: 60,
      condition: 'used',
      conditionScore: 9,
    })
    await login(page)
    await page.goto('/store')
    await page.locator('.as-item', { hasText: a.title }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('button', { name: 'Marketplace' }).click()
    await sheet.getByRole('button', { name: 'Copiar link' }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
      new RegExp(`/store/${a.slug}\\?ref=mp$`),
    )
    await sheet.getByRole('button', { name: 'Estado de WhatsApp' }).click()
    await sheet.getByRole('button', { name: 'Copiar texto' }).click()
    const text = await page.evaluate(() => navigator.clipboard.readText())
    expect(text).toContain(a.title)
    expect(text).toContain('Estado 9/10')
    expect(text).toContain('S/30 (antes S/60)')
    expect(text).toContain('pagas al recibir')
    expect(text).toContain(`/store/${a.slug}?ref=wa_estado`)
  })

  test('duplicar crea un borrador con los mismos campos y sin fotos', async ({ page, request }) => {
    const a = await seed(request, 'Duplicable', {
      price: 33,
      condition: 'new_unused',
      description: 'Igual',
    })
    await login(page)
    await page.goto('/store')
    await page.locator('.as-item', { hasText: a.title }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Duplicar' }).click()
    // La primera visita a /store/[id] compila en frío (dev): hasta ~15 s.
    await expect(page).toHaveURL(/\/store\/[0-9a-f-]{36}$/, { timeout: 40_000 })
    await expect(page.getByLabel('Título')).toHaveValue(a.title)
    await expect(page.getByLabel('Precio', { exact: true })).toHaveValue('33')
    await expect(page.locator('.as-shot img')).toHaveCount(0)
    const id = page.url().split('/').pop() as string
    created.push(id)
    const dup = await getItem(request, id)
    expect(dup.status).toBe('draft')
    expect(dup.code).not.toBe(a.code)
  })
})

test.describe('formulario', () => {
  test('primera foto → borrador en el servidor, autosave, falta→publicar, y queda publicado', async ({
    page,
    request,
  }) => {
    await login(page)
    await page.goto('/store/nuevo')
    const publish = page.locator('.as-publish')
    await expect(publish).toBeDisabled()
    await expect(publish).toHaveText('Falta al menos una foto')

    // Subir la primera foto crea el borrador y deja el id en la URL.
    const png = await makePng(page, 1)
    await page.locator('.as-cap input[type=file]:not([capture])').setInputFiles({
      name: 'a.png',
      mimeType: 'image/png',
      buffer: png,
    })
    await expect(page).toHaveURL(/\/store\/[0-9a-f-]{36}$/, { timeout: 30_000 })
    await expect(page.locator('.as-shot img')).toHaveCount(1, { timeout: 30_000 })
    const id = page.url().split('/').pop() as string
    created.push(id)
    expect((await getItem(request, id)).status).toBe('draft')
    await expect(publish).toHaveText('Falta el título')

    // Cada campo se guarda solo.
    await page.getByLabel('Título').fill(`${PREFIX} Desde el formulario`)
    await expect(page.getByText('Guardado')).toBeVisible({ timeout: 10_000 })
    expect((await getItem(request, id)).title).toBe(`${PREFIX} Desde el formulario`)
    await expect(publish).toHaveText('Falta el precio')

    await page.getByLabel('Precio', { exact: true }).fill('45')
    await expect(publish).toHaveText('Falta la categoría')
    await page.getByRole('button', { name: 'Ropa' }).click()
    await expect(publish).toHaveText('Falta la condición')
    await page.getByRole('button', { name: 'Usado' }).click()
    await expect(page.getByText(/Estado \d+\/10|\/10/).first()).toBeVisible()
    await expect(publish).toHaveText('Publicar') // el estado 8 viene por defecto
    await page.getByLabel('Precio original').fill('90')
    await page.getByLabel('Descripción').fill('Poco uso, sin detalles.')
    await page.getByRole('switch', { name: 'Acepta ofertas' }).click()

    await expect(page.getByText('Guardado')).toBeVisible({ timeout: 10_000 })
    const draft = await getItem(request, id)
    expect(draft).toMatchObject({
      price: 45,
      originalPrice: 90,
      condition: 'used',
      conditionScore: 8,
      description: 'Poco uso, sin detalles.',
      negotiable: true,
      status: 'draft',
    })

    await publish.click()
    await expect(page).toHaveURL(/\/store$/, { timeout: 30_000 })
    const published = await getItem(request, id)
    expect(published.status).toBe('available')
    expect(published.slug).toMatch(/^zz-test-store-desde-el-formulario-ts-\d+$/)

    // Y el comprador ya lo ve.
    const shop = await request.get(`${CUSTOMER}/store/${published.slug}`)
    expect(shop.status()).toBe(200)
  })

  test('un borrador sobrevive: aviso en la lista, «Continuar» y sus fotos siguen ahí', async ({
    page,
    request,
  }) => {
    await login(page)
    await page.goto('/store/nuevo')
    const png = await makePng(page, 2)
    await page
      .locator('.as-cap input[type=file]:not([capture])')
      .setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: png })
    await expect(page).toHaveURL(/\/store\/[0-9a-f-]{36}$/, { timeout: 30_000 })
    await expect(page.locator('.as-shot img')).toHaveCount(1, { timeout: 30_000 })
    const id = page.url().split('/').pop() as string
    created.push(id)

    await page.goto('/store')
    await expect(page.getByText(/Tienes \d+ borradores? pendientes?/)).toBeVisible()
    await page.getByRole('link', { name: /Continuar/ }).click()
    await expect(page).toHaveURL(/\/store\/[0-9a-f-]{36}$/)
    await expect(page.locator('.as-shot img')).toHaveCount(1)
    void request
  })

  test('máximo 6 fotos: a la sexta se deshabilitan Cámara y Galería', async ({ page, request }) => {
    await login(page)
    await page.goto('/store/nuevo')
    const gallery = page.locator('.as-cap input[type=file]:not([capture])')
    const files = []
    for (let i = 0; i < 6; i++) {
      files.push({ name: `f${i}.png`, mimeType: 'image/png', buffer: await makePng(page, 10 + i) })
    }
    await gallery.setInputFiles(files)
    await expect(page.locator('.as-shot img')).toHaveCount(6, { timeout: 90_000 })
    await expect(page.getByText('6/6 fotos')).toBeVisible()
    await expect(page.locator('.as-cap label[aria-disabled="true"]')).toHaveCount(2)
    created.push(page.url().split('/').pop() as string)
    void request
  })

  test('reordenar con las flechas cambia la portada en el servidor', async ({ page, request }) => {
    await login(page)
    await page.goto('/store/nuevo')
    await page.locator('.as-cap input[type=file]:not([capture])').setInputFiles([
      { name: 'p1.png', mimeType: 'image/png', buffer: await makePng(page, 21) },
      { name: 'p2.png', mimeType: 'image/png', buffer: await makePng(page, 22) },
    ])
    await expect(page.locator('.as-shot img')).toHaveCount(2, { timeout: 60_000 })
    const id = page.url().split('/').pop() as string
    created.push(id)
    const before = (await getItem(request, id)).images.map((i: { id: string }) => i.id)
    await page.getByRole('button', { name: 'Mover foto 2 a la izquierda' }).click()
    await expect
      .poll(async () => (await getItem(request, id)).images.map((i: { id: string }) => i.id))
      .toEqual([before[1], before[0]])
  })

  test('el punto central de la portada se guarda', async ({ page, request }) => {
    await login(page)
    await page.goto('/store/nuevo')
    await page.locator('.as-cap input[type=file]:not([capture])').setInputFiles({
      name: 'c.png',
      mimeType: 'image/png',
      buffer: await makePng(page, 30),
    })
    await expect(page.locator('.as-cpick')).toBeVisible({ timeout: 30_000 })
    const id = page.url().split('/').pop() as string
    created.push(id)
    const box = (await page.locator('.as-cpick').boundingBox()) as {
      x: number
      y: number
      width: number
      height: number
    }
    await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.25)
    await expect
      .poll(async () => (await getItem(request, id)).coverFocusX, { timeout: 10_000 })
      .toBeCloseTo(0.8, 1)
    expect((await getItem(request, id)).coverFocusY).toBeCloseTo(0.25, 1)
  })

  test('a 360 px el formulario no desborda y nada baja de 12 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await login(page)
    await page.goto('/store/nuevo')
    await expect(page.getByLabel('Título')).toBeVisible()
    const r = await page.evaluate(() => {
      const small: string[] = []
      const walker = document.createTreeWalker(
        document.querySelector('.as-wrap') as Node,
        NodeFilter.SHOW_TEXT,
      )
      let n = walker.nextNode()
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
    expect(r.overflow).toBe(0)
    expect(r.small).toEqual([])
  })
})

test.describe('ajustes', () => {
  test('se editan, se guardan y los ve el comprador', async ({ page, request }) => {
    await login(page)
    await page.goto('/store/ajustes')
    await page.getByLabel('Delivery máximo').fill('3')
    await page.getByLabel(/Texto de entrega/).fill('Entrega rápida en el pueblo')
    await expect(page.getByText('Así se ve en la tienda')).toBeVisible()
    await expect(page.getByText('Entrega rápida en el pueblo').first()).toBeVisible()
    await page.getByRole('button', { name: 'Guardar ajustes' }).click()
    await expect(page.getByRole('button', { name: /Guardado/ })).toBeVisible()
    const saved = (await api(request, 'get', '/admin/store/settings')).json?.data
    expect(saved).toMatchObject({ deliveryMax: 3, deliveryText: 'Entrega rápida en el pueblo' })
    const pub = await request.get(`${API}/public/store`)
    expect((await pub.json()).data.settings.deliveryText).toBe('Entrega rápida en el pueblo')
  })

  test('un mínimo mayor que el máximo no deja guardar', async ({ page }) => {
    await login(page)
    await page.goto('/store/ajustes')
    await page.getByLabel('Delivery mínimo').fill('9')
    await expect(page.getByRole('button', { name: 'Guardar ajustes' })).toBeDisabled()
    await expect(page.getByText('El mínimo no puede superar al máximo')).toBeVisible()
  })
})
