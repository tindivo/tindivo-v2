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

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

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
  ],
})
