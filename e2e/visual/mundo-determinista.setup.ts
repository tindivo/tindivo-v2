import { execFileSync } from 'node:child_process'
import { expect, test as setup } from '@playwright/test'
import { localClient } from '../../apps/api/lib/__tests__/helpers/local-db.ts'
import { E2E } from '../../apps/api/scripts/e2e-fixtures.ts'

// biome-ignore lint/suspicious/noExplicitAny: database.types.ts se genera contra el remoto
const db = localClient as any

/**
 * El mundo determinista de la regresión visual. Corre antes de capturar nada.
 *
 * EL FALLO QUE ESTO EVITA, y no es el que parecía. La sospecha era el pedido que
 * `viaje-pedido-online` deja entregado: `delivered` es terminal, nadie lo
 * limpia, y sale en «Entregados hoy», en la deuda y en el historial. Se probó
 * —`db:seed:e2e:clean` primero, sin re-sembrar— y NO cambió ni uno de los siete
 * rojos. La causa era otra y mucho más tonta:
 *
 *   `business_service_days` lleva UNA FILA POR DÍA, y el panel del negocio tapa
 *   la pantalla con el modal «¿Abren hoy?» mientras no exista la de hoy. El seed
 *   la crea con `current_service_date()`, o sea para el día en que se sembró.
 *
 *   Resultado: **la suite visual se pone roja sola cada medianoche**, y no con
 *   una diferencia sutil sino con el 96% de los píxeles, porque lo que compara
 *   es un modal centrado contra la pantalla que debería haber debajo. Doce
 *   snapshots fallando a la vez por algo que no tiene que ver con la UI.
 *
 * POR QUÉ NO `supabase db reset`. Se lo lleva todo por delante y hay más de una
 * persona trabajando contra esta base. `db:seed:e2e:clean` borra solo los
 * pedidos de las corridas, y `db:seed:e2e` reescribe el mundo —incluida la fila
 * del día—: entre los dos dejan el estado declarado sin destruir nada más.
 *
 * SE AFIRMA EL RESULTADO, no solo se corren los scripts. Si algún día el seed
 * deja de refrescar el día de servicio, esto falla aquí con una frase, en vez
 * de doce capturas rojas que no dicen por qué.
 *
 * CONVIVE CON LOS DEMÁS PROYECTOS. `visual` y `chromium` pueden correr en la
 * misma invocación: con `workers: 1` los proyectos no se solapan, y esto repone
 * el mundo justo antes de capturar, así que da igual lo que `chromium` haya
 * dejado sembrado antes.
 */

/** Corre un script del monorepo. `pnpm` en Windows necesita shell. */
function pnpm(script: string): void {
  try {
    execFileSync('pnpm', [script], { stdio: 'pipe', shell: true })
  } catch (e) {
    const proceso = e as { stderr?: Buffer; stdout?: Buffer }
    const salida = [proceso.stderr?.toString(), proceso.stdout?.toString()]
      .filter(Boolean)
      .join('\n')
      .trim()
    throw new Error(`\`pnpm ${script}\` falló:\n${salida || '(el proceso no dijo nada)'}`)
  }
}

setup('mundo determinista para las capturas', async () => {
  pnpm('db:seed:e2e:clean')
  pnpm('db:seed:e2e')

  // La fecha la manda la base, no el reloj de esta máquina: `current_service_date`
  // aplica el corte del día operativo, que no es la medianoche civil.
  const { data: hoy, error } = await db.rpc('current_service_date')
  expect(error, `no se pudo leer la fecha de servicio: ${error?.message}`).toBeNull()

  const { data: fila } = await db
    .from('business_service_days')
    .select('service_date,status')
    .eq('business_id', E2E.BUSINESS_ID)
    .eq('service_date', hoy)
    .maybeSingle()

  expect(
    fila?.status,
    `El negocio del e2e no tiene confirmada la apertura de ${hoy}.\n` +
      '  Sin esa fila el panel abre el modal «¿Abren hoy?» encima de todo y las\n' +
      '  doce capturas fallan con el 96% de los píxeles distintos, sin que la UI\n' +
      '  haya cambiado nada. Debería haberla creado `pnpm db:seed:e2e`.',
  ).toBe('open')

  console.log(`\n  Mundo repuesto · día de servicio ${hoy} confirmado abierto\n`)
})
