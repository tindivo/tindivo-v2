import type { BrowserContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { localClient } from '../../apps/api/lib/__tests__/helpers/local-db.ts'
import { E2E } from '../../apps/api/scripts/e2e-fixtures.ts'

// biome-ignore lint/suspicious/noExplicitAny: helper de tests
const db = localClient as any

/**
 * HU-X-005 · Cerrar sesión echa a ESTE dispositivo y a ningún otro.
 *
 * El bug que este test existe para no repetir: `auth.signOut()` a secas usa
 * `scope: 'global'` y revoca TODOS los refresh tokens del usuario. Se vio en
 * dos teléfonos con la misma cuenta de motorizado — cerrar sesión en uno echó
 * al otro.
 *
 * Corre con la cuenta del SEGUNDO motorizado a propósito. Con la del primero,
 * una regresión a scope global revocaría de paso la sesión que
 * `motorizados.setup.ts` dejó en disco, y el resto de la suite fallaría después
 * culpando a otra cosa.
 */
const MOTOS = 'http://localhost:3004'
const SUPABASE_URL = 'http://127.0.0.1:54321'
const COOKIE = 'tindivo-driver-auth'

/**
 * Anon key del stack local del CLI de Supabase: pública y documentada, igual
 * que en `e2e-fixtures.ts`. Se lee del entorno si está definida, por si alguien
 * levanta el stack con otras llaves.
 */
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

/** Login por la UI real, igual que `motorizados.setup.ts`. */
async function entrar(page: Page, email: string): Promise<void> {
  await page.goto(`${MOTOS}/`)
  const campoEmail = page.locator('input[type="email"]')
  const campoPass = page.locator('input[type="password"]')
  await expect(campoEmail).toBeVisible({ timeout: 30_000 })

  // Rellenar y comprobar que los valores siguen ahí: el montaje de React puede
  // limpiar un campo entre un `fill` y el siguiente.
  await expect
    .poll(
      async () => {
        await campoEmail.fill(email)
        await campoPass.fill(E2E.PASSWORD)
        return (await campoEmail.inputValue()) !== '' && (await campoPass.inputValue()) !== ''
      },
      { timeout: 20_000 },
    )
    .toBe(true)

  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('tab', { name: /En espera/ })).toBeVisible({ timeout: 30_000 })
}

/**
 * Saca el refresh token que `@supabase/ssr` guarda en la cookie del contexto.
 *
 * Es el ÚNICO dato que permite preguntarle al servidor de auth si la sesión
 * sigue viva. Mirar solo la pantalla no serviría: el access token dura una hora
 * en memoria, así que tras un logout GLOBAL el segundo dispositivo seguiría
 * pintando la app tan tranquilo y el test pasaría en verde con el bug dentro.
 *
 * La cookie se parte en trozos `.0`, `.1`… cuando no cabe, y el valor va como
 * `base64-<payload>`. Cualquier fallo al reconstruirla LANZA: un token que no
 * se puede leer tiene que romper el test, no colarse como "sesión revocada".
 */
async function refreshTokenDe(ctx: BrowserContext): Promise<string> {
  const trozos = (await ctx.cookies())
    .filter((c) => c.name === COOKIE || c.name.startsWith(`${COOKIE}.`))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  if (trozos.length === 0) throw new Error(`no hay cookie de sesión "${COOKIE}" en el contexto`)

  let crudo = trozos.map((c) => decodeURIComponent(c.value)).join('')
  if (crudo.startsWith('base64-')) {
    const payload = crudo.slice('base64-'.length).replace(/-/g, '+').replace(/_/g, '/')
    crudo = Buffer.from(payload, 'base64').toString('utf8')
  }

  let sesion: { refresh_token?: string }
  try {
    sesion = JSON.parse(crudo)
  } catch {
    throw new Error(`la cookie "${COOKIE}" no se pudo parsear como JSON: ${crudo.slice(0, 120)}`)
  }
  if (!sesion.refresh_token) throw new Error(`la cookie "${COOKIE}" no traía refresh_token`)
  return sesion.refresh_token
}

/**
 * Canjea el refresh token contra el servidor de auth. 200 = la sesión sigue
 * viva; 400 = revocada.
 *
 * OJO: el canje ROTA el token, así que invalida la copia que tiene el
 * navegador. Llamar a esto una sola vez y al final.
 */
async function canjear(refreshToken: string): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  return res.status
}

test('cerrar sesión en un dispositivo NO echa al otro', async ({ browser }) => {
  // Dos contextos = dos navegadores independientes = dos dispositivos. Cada uno
  // inicia su propia sesión, con su propio refresh token.
  //
  // El `storageState` vacío es OBLIGATORIO y va explícito: `browser.newContext()`
  // hereda las opciones del proyecto, y el proyecto `driver` trae la sesión del
  // PRIMER motorizado que dejó en disco `motorizados.setup.ts`. Sin esto los dos
  // "dispositivos nuevos" nacen ya logueados con otra cuenta, y el test no prueba
  // lo que dice probar. Un `storageState: undefined` no sirve: en el merge de
  // opciones de Playwright, `undefined` no pisa el valor heredado.
  const limpio = { storageState: { cookies: [], origins: [] } }
  const dispositivoA = await browser.newContext(limpio)
  const dispositivoB = await browser.newContext(limpio)

  try {
    const pageA = await dispositivoA.newPage()
    const pageB = await dispositivoB.newPage()

    await entrar(pageA, E2E.DRIVER_2_EMAIL)
    await entrar(pageB, E2E.DRIVER_2_EMAIL)
    console.log('[X5] los dos dispositivos dentro con la misma cuenta')

    // Se lee ANTES del logout y se canjea DESPUÉS: leerlo después valdría
    // igual, pero así queda claro que el token es el que B tenía cuando A salió.
    const tokenB = await refreshTokenDe(dispositivoB)
    expect(tokenB.length).toBeGreaterThan(10)

    // ── A cierra sesión por la vía real: el botón de /perfil ──────────────────
    // `handleLogout` pregunta con `confirm()`, y Playwright descarta los
    // diálogos por defecto: sin esto el logout se cancelaría y el test pasaría
    // sin haber probado nada.
    pageA.on('dialog', (d) => void d.accept())
    await pageA.goto(`${MOTOS}/perfil`)
    await pageA.getByRole('button', { name: /Cerrar sesión/ }).click()

    await expect(pageA.locator('input[type="email"]')).toBeVisible({ timeout: 30_000 })
    console.log('[X5] A salió: vuelve a ver el login')

    // ── B sigue dentro ────────────────────────────────────────────────────────
    // Recarga para que la sesión se rehidrate desde la cookie, no desde la
    // memoria de la pestaña.
    await pageB.reload()
    await expect(pageB.getByRole('tab', { name: /En espera/ })).toBeVisible({ timeout: 30_000 })
    console.log('[X5] B sigue dentro tras recargar')

    // ── LA ASERCIÓN QUE SOSTIENE LA HU ────────────────────────────────────────
    // La verdad está en el servidor de auth, no en la pantalla de B.
    const estado = await canjear(tokenB)
    console.log(`[X5] canje del refresh token de B -> HTTP ${estado} (400 = revocado)`)
    expect(
      estado,
      'el logout de A revocó el refresh token de B: signOut se hizo con scope global',
    ).toBe(200)
  } finally {
    await dispositivoA.close()
    await dispositivoB.close()
  }
})

/**
 * La contrapartida: «perdí mi teléfono» SÍ tiene que echar a todos.
 *
 * Sin este test, el anterior se podría satisfacer con un logout que no hiciera
 * nada. Juntos fijan que los dos caminos existen y que son distintos.
 *
 * Cubre además la mitad que se olvida: revocar las sesiones no basta si las
 * suscripciones push sobreviven — el equipo perdido se queda sin poder abrir la
 * app pero sigue recibiendo avisos con el nombre y la dirección del cliente en
 * la vista previa.
 */
const ENDPOINT_FIXTURE = 'https://fcm.googleapis.com/fcm/send/e2e-logout-todos-'

async function sembrarSuscripciones(): Promise<void> {
  await db.from('push_subscriptions').delete().like('endpoint', `${ENDPOINT_FIXTURE}%`)
  const { error } = await db.from('push_subscriptions').insert(
    ['equipo-1', 'equipo-2'].map((n) => ({
      user_id: E2E.DRIVER_2_USER_ID,
      endpoint: `${ENDPOINT_FIXTURE}${n}`,
      p256dh: 'p256dh-de-prueba',
      auth: 'auth-de-prueba',
      user_agent: `UA-${n}`,
    })),
  )
  if (error) throw new Error(`FALLÓ sembrar suscripciones push: ${error.message}`)
}

async function suscripcionesDelSegundoMotorizado(): Promise<number> {
  const { data, error } = await db
    .from('push_subscriptions')
    .select('endpoint')
    .eq('user_id', E2E.DRIVER_2_USER_ID)
  if (error) throw new Error(`FALLÓ leer suscripciones push: ${error.message}`)
  return (data ?? []).length
}

test('«perdí mi teléfono» SÍ echa a los demás dispositivos y borra sus avisos', async ({
  browser,
}) => {
  const limpio = { storageState: { cookies: [], origins: [] } }
  const dispositivoA = await browser.newContext(limpio)
  const dispositivoB = await browser.newContext(limpio)

  try {
    await sembrarSuscripciones()
    expect(await suscripcionesDelSegundoMotorizado()).toBe(2)

    const pageA = await dispositivoA.newPage()
    const pageB = await dispositivoB.newPage()
    await entrar(pageA, E2E.DRIVER_2_EMAIL)
    await entrar(pageB, E2E.DRIVER_2_EMAIL)

    const tokenB = await refreshTokenDe(dispositivoB)

    pageA.on('dialog', (d) => void d.accept())
    await pageA.goto(`${MOTOS}/perfil`)
    await pageA.getByRole('button', { name: /Perdí mi teléfono/ }).click()

    await expect(pageA.locator('input[type="email"]')).toBeVisible({ timeout: 30_000 })
    console.log('[X5-todos] A salió')

    // 1) La sesión del OTRO dispositivo queda revocada.
    const estado = await canjear(tokenB)
    console.log(`[X5-todos] canje del refresh token de B -> HTTP ${estado} (400 = revocado)`)
    expect(estado, 'la sesión de B sobrevivió a un cierre en todos los dispositivos').toBe(400)

    // 2) Y sus avisos también: si esto falla, el equipo perdido sigue enseñando
    //    datos del cliente en las notificaciones aunque no pueda entrar.
    const quedan = await suscripcionesDelSegundoMotorizado()
    console.log(`[X5-todos] suscripciones push que quedan: ${quedan}`)
    expect(quedan, 'quedaron suscripciones push vivas tras cerrar en todos').toBe(0)
  } finally {
    await db.from('push_subscriptions').delete().like('endpoint', `${ENDPOINT_FIXTURE}%`)
    await dispositivoA.close()
    await dispositivoB.close()
  }
})
