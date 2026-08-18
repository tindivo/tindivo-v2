import { expect, test } from '@playwright/test'

/**
 * Muro del piloto cerrado en la portada de `apps/customer`.
 *
 * Este fichero cubría siete casos: que el muro viniera pintado desde el
 * servidor, que un número de `pilot_whitelist` entrara y otro no, que
 * `?pilot=<token>` lo levantara y lo recordara, y que pasada la hora de
 * lanzamiento no se renderizara.
 *
 * Seis de esos siete ya no pueden ocurrir. `PILOT_LAUNCH_AT` (2026-08-14 23:00Z)
 * quedó atrás y el corte es automático: el muro no se renderiza nunca más. Y la
 * migración `0164` eliminó `pilot_whitelist` tras el lanzamiento público, así
 * que el `beforeAll` que la sembraba fallaba en seco y arrastraba consigo al
 * resto del fichero — el único test que SÍ seguía siendo cierto no llegaba a
 * correr.
 *
 * Queda el que describe el estado permanente: no hay muro. El componente
 * `PilotWall` sigue montado en la portada (se autodesmonta por fecha), y esto es
 * lo que vigila que no vuelva a aparecer.
 */

/** Un minuto después de PILOT_LAUNCH_AT (2026-08-14T23:00:00Z). */
const AFTER_LAUNCH = new Date('2026-08-14T23:01:00Z')

const WALL = { role: 'dialog' as const, name: 'Tindivo abre pronto' }

test.describe('muro del piloto', () => {
  test('P6.g pasada la hora de lanzamiento el muro no se renderiza', async ({ page }) => {
    await page.clock.setFixedTime(AFTER_LAUNCH)
    await page.goto('/')

    await expect(page.getByRole(WALL.role, { name: WALL.name })).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})
