import { existsSync, rmSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import { verificarPuertos } from './scripts/e2e-puertos.mjs'

/**
 * Cómo se sirven las cinco apps.
 *
 *   dev   (por defecto en local) `next dev`: arranque sin build, pero compila cada ruta la primera vez.
 *   start (CI, o `E2E_SERVER=start`) `next start` sobre un build: sin compilación bajo demanda ni
 *         observador de archivos. Requiere `pnpm build` antes (el job `e2e` de CI lo hace).
 *
 * En `start` no se reutiliza nada: si un puerto está ocupado, falla en claro en vez de hablar con
 * lo que haya detrás.
 */
const MODO =
  process.env.E2E_SERVER === 'start' || (process.env.CI && process.env.E2E_SERVER !== 'dev')
    ? 'start'
    : 'dev'

// Una sola vez por corrida (los workers heredan la marca): quien escucha en 3000-3004 tiene que ser de ESTE
// árbol. `reuseExistingServer` acepta a cualquiera que conteste, y el servidor de otro worktree sirve otro
// código. Ver `scripts/e2e-puertos.mjs`.
if (!process.env.E2E_PUERTOS_VERIFICADOS) {
  if (MODO === 'dev') {
    // Solo `dev` reutiliza servidores; en `start` Playwright falla solo si el puerto está ocupado.
    verificarPuertos(__dirname)
    // `next build` y `next dev` comparten `apps/<app>/.next`: un build de la corrida anterior en modo `start`
    // deja 404 en todas las rutas del dev server (Docs/operacion/trampas.md, «pnpm build envenena el dev
    // server vivo»). Los puertos ya están libres o son nuestros: se retira el build antes de arrancar.
    for (const app of ['api', 'customer', 'admin', 'negocios', 'motorizados']) {
      const dir = `${__dirname}/apps/${app}/.next`
      if (existsSync(`${dir}/BUILD_ID`)) rmSync(dir, { recursive: true, force: true })
    }
  }
  if (MODO === 'start') {
    // Con `next start`, los `fetch(..., { next: { revalidate } })` del servidor (la tienda del cliente pide el
    // detalle con `revalidate: 15`) se guardan EN DISCO, en `.next/cache/fetch-cache`, y sobreviven a los
    // reinicios. Tras un `supabase db reset` los códigos de artículo vuelven a numerarse y el mismo slug apunta a
    // OTRO producto: una respuesta de la corrida anterior serviría datos de una base que ya no existe. Cada
    // corrida e2e empieza con esa caché vacía (el build y su caché de compilación se conservan).
    for (const app of ['api', 'customer', 'admin', 'negocios', 'motorizados']) {
      rmSync(`${__dirname}/apps/${app}/.next/cache/fetch-cache`, { recursive: true, force: true })
    }
  }
  process.env.E2E_PUERTOS_VERIFICADOS = '1'
}

const servir = (app: string) =>
  `pnpm --filter @tindivo/${app} ${MODO === 'start' ? 'start' : 'dev'}`

/**
 * Playwright — e2e contra el stack LOCAL.
 *
 * Requiere:
 *   1. Supabase local corriendo (`supabase start`).
 *   2. El mundo e2e sembrado: `node apps/api/scripts/seed-e2e.ts`.
 *   3. apps/customer (:3000) y apps/api (:3001) levantadas. `webServer` las arranca
 *      si no lo están y las reutiliza si ya corren (`reuseExistingServer`), para no
 *      chocar con un `pnpm dev` que ya tengas abierto.
 *
 * NUNCA apunta a producción: baseURL y las env de las apps son locales.
 */
export default defineConfig({
  testDir: './e2e',
  // Sin paralelismo: los tests comparten una única DB local y el mundo sembrado.
  workers: 1,
  fullyParallel: false,
  // En local queremos ver el fallo real, no que un reintento lo esconda.
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // En CI el reporte HTML (con las trazas) se sube como artefacto si algo falla.
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list']],

  use: {
    baseURL: 'http://localhost:3000',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    /*
      Los e2e corren como alguien que YA activó los avisos.

      Las tres apps levantan una hoja modal cuando el permiso está sin
      contestar: el panel de negocios su «Activa las notificaciones», y el
      cliente la de `PushPermissionSheet`, que aparece a segundo y medio de
      abrir el seguimiento de un pedido vivo. Con el permiso sin conceder, esa
      hoja se pone encima de la pantalla con su backdrop y cualquier click
      posterior queda interceptado: los specs que siguen un pedido fallan por
      timeout de actionability, apuntando al botón que quisieran pulsar en vez
      de al modal que lo tapa.

      Concederlo aquí y no proyecto por proyecto para que el siguiente spec que
      alguien escriba nazca ya inmune. Lo que se pierde es poder VER esas hojas
      en e2e; un spec que quiera probarlas declara `test.use({ permissions: [] })`
      y las recupera.
    */
    permissions: ['notifications'],
  },

  projects: [
    /**
     * Precalentado. Todo depende de esto, directa o indirectamente.
     *
     * `webServer` solo espera a UNA ruta por app; Next compila las demás dentro
     * del primer test que las toca, y eso costaba hasta 5s por ruta. El detalle
     * y las mediciones, en `e2e/precalentar.setup.ts`.
     */
    {
      name: 'precalentar',
      testMatch: /precalentar\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Flujos funcionales (customer). No tocan el panel de negocios.
    //
    // Depende de LOS DOS setups aunque la mayoría de sus specs no usen sesión:
    // `viaje-pedido-online.spec.ts` abre la cajera y el motorizado con los
    // `storageState` que dejan en disco. Sin declararlo, Playwright corría este
    // proyecto ANTES que los setups y el test consumía las sesiones de la
    // corrida anterior — que un `supabase db reset` deja con el refresh token
    // revocado. El síntoma es `Invalid Refresh Token` en el panel de negocios y
    // una cajera que nunca ve el pedido; y como los setups sí corren después,
    // el siguiente intento pasa y lo disfraza de flake.
    {
      name: 'chromium',
      dependencies: ['precalentar', 'setup-negocios', 'setup-motorizados'],
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [/visual[\\/]/, /driver[\\/]/, /negocios[\\/]/],
    },
    // Sesión del motorizado: corre una vez y deja la cookie en disco, igual que
    // la de negocios. Vive en `visual/` por cercanía con su gemela, pero su
    // extensión (`.setup.ts`, no `.spec.ts`) la mantiene fuera del proyecto
    // `visual`, que usa OTRA sesión.
    {
      name: 'setup-motorizados',
      dependencies: ['precalentar'],
      use: { ...devices['Desktop Chrome'] },
      testMatch: /visual[\\/]motorizados\.setup\.ts/,
    },
    // Flujos del motorizado. Separados de `chromium` porque necesitan sesión de
    // driver, y de `visual` porque no comparan capturas.
    {
      name: 'driver',
      dependencies: ['setup-motorizados'],
      testMatch: /driver[\\/].*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/motorizados.json',
      },
    },
    // Flujos del panel del negocio. Separados de `visual` porque no comparan
    // capturas, y de `chromium` porque necesitan la sesión de la cajera. El
    // gemelo de `driver`, al otro lado del mostrador.
    {
      name: 'negocios',
      dependencies: ['precalentar', 'setup-negocios'],
      testMatch: /negocios[\\/].*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/negocios.json',
        // `baseURL` PROPIO, y no la constante con la URL absoluta que usan los
        // specs de `driver`. El global apunta al cliente (:3000), así que un
        // `goto('/menu/extras')` sin prefijo se va al puerto equivocado y
        // devuelve un 404 que parece un fallo de la pantalla. Declararlo aquí
        // hace ese error imposible para los specs que vengan.
        baseURL: 'http://localhost:3002',
      },
    },
    /**
     * Repone el mundo antes de capturar. `visual` depende de esto porque
     * `business_service_days` caduca a medianoche y sin la fila de hoy el panel
     * abre el modal «¿Abren hoy?» encima de todo: doce capturas rojas por algo
     * que no es la UI. El detalle, en `e2e/visual/mundo-determinista.setup.ts`.
     */
    {
      name: 'mundo-visual',
      dependencies: ['precalentar'],
      testMatch: /visual[/]mundo-determinista\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Sesión de negocios: corre una vez y deja la cookie en disco.
    {
      name: 'setup-negocios',
      dependencies: ['precalentar'],
      use: { ...devices['Desktop Chrome'] },
      testMatch: /visual[\\/]negocios\.setup\.ts/,
    },
    // Regresión visual: viewport FIJO — si cambia, cambian todas las capturas.
    {
      name: 'visual',
      dependencies: ['mundo-visual', 'setup-negocios'],
      testMatch: /visual[\\/].*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: 'e2e/.auth/negocios.json',
        // Sin esto, el panel levanta el modal «Activa las notificaciones» encima
        // de todo y las capturas salen del modal, no de la pantalla.
        permissions: ['notifications'],
      },
    },
  ],

  /*
    240 s y no 120, medido: arrancar en frío las CUATRO apps Next a la vez en
    esta máquina pasa de los dos minutos, y Playwright aborta la suite entera
    con «Timed out waiting 120000ms from config.webServer» antes de correr un
    solo test. Da un rojo que no dice nada del código y que se va solo al
    reintentar —el peor tipo—, porque la segunda corrida ya encuentra los
    servidores levantados y los reutiliza.

    No cuesta nada cuando ya están arriba: `reuseExistingServer` comprueba la
    URL y sigue de largo. El tope solo se gasta en el arranque en frío.
  */
  webServer: [
    {
      command: servir('api'),
      url: 'http://localhost:3001/api/v1/health',
      reuseExistingServer: MODO === 'dev',
      timeout: 240_000,
    },
    {
      command: servir('customer'),
      url: 'http://localhost:3000',
      reuseExistingServer: MODO === 'dev',
      timeout: 240_000,
    },
    {
      command: servir('admin'),
      url: 'http://localhost:3003',
      reuseExistingServer: MODO === 'dev',
      timeout: 240_000,
    },
    {
      command: servir('negocios'),
      url: 'http://localhost:3002',
      reuseExistingServer: MODO === 'dev',
      timeout: 240_000,
    },
    {
      command: servir('motorizados'),
      url: 'http://localhost:3004',
      reuseExistingServer: MODO === 'dev',
      timeout: 240_000,
    },
  ],
})
