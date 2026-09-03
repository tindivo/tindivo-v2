import { defineConfig, devices } from '@playwright/test'

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
  reporter: [['list']],

  use: {
    baseURL: 'http://localhost:3000',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
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
      command: 'pnpm --filter @tindivo/api dev',
      url: 'http://localhost:3001/api/v1/health',
      reuseExistingServer: true,
      timeout: 240_000,
    },
    {
      command: 'pnpm --filter @tindivo/customer dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 240_000,
    },
    {
      command: 'pnpm --filter @tindivo/negocios dev',
      url: 'http://localhost:3002',
      reuseExistingServer: true,
      timeout: 240_000,
    },
    {
      command: 'pnpm --filter @tindivo/motorizados dev',
      url: 'http://localhost:3004',
      reuseExistingServer: true,
      timeout: 240_000,
    },
  ],
})
