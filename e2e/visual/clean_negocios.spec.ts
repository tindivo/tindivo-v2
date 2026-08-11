import * as path from 'node:path'
import { expect, test } from '@playwright/test'

const ARTIFACTS_DIR =
  'C:\\Users\\Jesus\\.gemini\\antigravity-ide\\brain\\59261a63-8b4d-408f-84f8-9884daee88fe'

test('Capturar negocios limpio de pedidos activos', async ({ browser }) => {
  const negContext = await browser.newContext({
    storageState: 'e2e/.auth/negocios.json',
    viewport: { width: 1280, height: 900 },
    permissions: ['notifications'],
  })
  const negPage = await negContext.newPage()
  await negPage.goto('http://localhost:3002/')
  await negPage.evaluate(() => {
    localStorage.setItem('tindivo_sound_on', 'true')
    localStorage.setItem('tindivo_notifications_gate_dismissed', 'true')
  })
  await negPage.reload()
  await negPage.waitForTimeout(2000)

  const negPath = path.join(ARTIFACTS_DIR, 'clean_negocios_dashboard.png')
  await negPage.screenshot({ path: negPath, fullPage: true })
  console.log('✓ Captura negocios totalmente limpio guardada:', negPath)

  await negContext.close()
})
