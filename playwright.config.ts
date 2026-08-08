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
    // Flujos funcionales (customer). No tocan el panel de negocios.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /visual[\\/]/,
    },
    // Sesión de negocios: corre una vez y deja la cookie en disco.
    {
      name: 'setup-negocios',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /visual[\\/]negocios\.setup\.ts/,
    },
    // Regresión visual: viewport FIJO — si cambia, cambian todas las capturas.
    {
      name: 'visual',
      dependencies: ['setup-negocios'],
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

  webServer: [
    {
      command: 'pnpm --filter @tindivo/api dev',
      url: 'http://localhost:3001/api/v1/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @tindivo/customer dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @tindivo/negocios dev',
      url: 'http://localhost:3002',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
