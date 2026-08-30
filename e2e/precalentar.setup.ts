import { expect, test as setup } from '@playwright/test'
import { localClient } from '../apps/api/lib/__tests__/helpers/local-db.ts'
import { E2E } from '../apps/api/scripts/e2e-fixtures.ts'

/**
 * Precalentado del stack local. Corre una vez, antes que todo lo demás.
 *
 * EL PROBLEMA QUE RESUELVE. Next en desarrollo **compila cada ruta la primera
 * vez que alguien la pide**, y `webServer` de Playwright solo espera a UNA por
 * app —`/api/v1/health` y la portada—. Todo lo demás compila dentro del primer
 * test que lo toca. Medido en esta máquina, en frío:
 *
 *     GET /api/v1/public/schedule        5.14 s  →  0.08 s la segunda
 *     GET /negocio/:id (página)          4.10 s  →  0.49 s
 *     GET /api/v1/public/businesses/:id  1.87 s  →  0.12 s
 *
 * Un test que abre la ficha de un negocio pagaba las tres: ~11 s contra un
 * `actionTimeout` de 15 s. Por eso fallaba a veces y a veces no.
 *
 * Y el síntoma no se parecía a la causa. Los dos que costaron media hora:
 *
 *   · «No se pudo cargar» en la ficha del negocio — el catálogo tardó más de lo
 *     que el hook aguanta y la pantalla cayó a su estado de error.
 *   · `element was detached from the DOM, retrying` al hacer clic en un plato —
 *     la respuesta lenta llegaba DURANTE el clic, React re-renderizaba y el
 *     nodo que Playwright tenía agarrado desaparecía debajo.
 *
 * Ninguno de los dos dice «esto es un servidor de desarrollo compilando».
 *
 * POR QUÉ AQUÍ Y NO SUBIENDO LOS TIMEOUTS. Subirlos esconde el retraso en vez de
 * quitarlo, y lo paga cada corrida. Precalentar lo paga una vez y además deja
 * las peticiones de los tests midiendo lo que dicen medir. Por lo mismo NO se
 * tocan los `retries`: el comentario de `playwright.config.ts` es explícito en
 * que un reintento escondería el fallo real, y aquí no hace falta ninguno
 * porque la causa desaparece.
 *
 * SE COMPRUEBA TAMBIÉN EL MUNDO SEMBRADO. `supabase db reset` lo borra y no lo
 * repone (no hay `seed.sql`), y sin él los tests fallan en masa señalando al
 * sitio equivocado. Mejor un mensaje aquí que veinte rojos indescifrables.
 */

const APPS = {
  api: 'http://localhost:3001/api/v1',
  customer: 'http://localhost:3000',
  negocios: 'http://localhost:3002',
  motorizados: 'http://localhost:3004',
} as const

/**
 * Las rutas que los tests tocan de verdad, agrupadas por app.
 *
 * Se calientan en paralelo ENTRE apps y en serie DENTRO de cada una: son cuatro
 * compiladores distintos, y lanzarle diez peticiones a la vez a uno solo lo
 * pone a competir consigo mismo.
 */
const RUTAS: Record<keyof typeof APPS, string[]> = {
  api: [
    '/health',
    '/public/businesses',
    `/public/businesses/${E2E.BUSINESS_ID}`,
    `/public/schedule?businessId=${E2E.BUSINESS_ID}`,
  ],
  customer: ['/', '/entrar', `/negocio/${E2E.BUSINESS_ID}`, '/checkout', '/cuenta', '/pedidos'],
  // El editor de plato y el panel de Extras: los toca el spec de negocios y
  // son de las rutas más caras de compilar.
  negocios: ['/', '/menu', '/menu/extras'],
  motorizados: ['/'],
}

/** Lento de verdad: por debajo de esto no merece la pena ni mencionarlo. */
const UMBRAL_LENTO_MS = 1_000

interface Medida {
  ruta: string
  ms: number
}

async function calentarApp(base: string, rutas: string[]): Promise<Medida[]> {
  const medidas: Medida[] = []
  for (const ruta of rutas) {
    const t0 = Date.now()
    try {
      // Cualquier respuesta HTTP vale: lo que importa es que la ruta quedó
      // compilada. Un 401 o un 404 la compila igual que un 200.
      await fetch(`${base}${ruta}`, { signal: AbortSignal.timeout(90_000) })
    } catch (err) {
      // Esto SÍ es fatal: no hubo respuesta. O el servidor no llegó a levantar,
      // o `reuseExistingServer` reutilizó uno que se estaba muriendo de la
      // corrida anterior — la carrera que dejaba un ERR_CONNECTION_REFUSED
      // cincuenta líneas más abajo, dentro de un test que no tenía la culpa.
      throw new Error(
        `No respondió ${base}${ruta}\n` +
          `  ${err instanceof Error ? err.message : String(err)}\n` +
          '  Revisa que la app esté levantada (o deja que la levante `webServer`).',
      )
    }
    medidas.push({ ruta: `${base}${ruta}`, ms: Date.now() - t0 })
  }
  return medidas
}

setup('precalentar el stack local', async () => {
  // 1. El mundo sembrado existe. Antes de calentar nada: si esto falta, todo lo
  //    demás va a fallar por el motivo equivocado.
  const { data: negocio, error } = await localClient
    .from('businesses')
    .select('id,name')
    .eq('id', E2E.BUSINESS_ID)
    .maybeSingle()

  expect(
    error,
    `No se pudo consultar la DB local: ${error?.message}\n` +
      '  ¿Está Supabase local arriba? (`supabase start`)',
  ).toBeNull()

  expect(
    negocio,
    `El mundo e2e no está sembrado: falta el negocio ${E2E.BUSINESS_ID}.\n` +
      '  Corre `pnpm db:seed:e2e`. (`supabase db reset` lo borra y NO lo repone:\n' +
      '  el seed no vive en `seed.sql`, vive en ese script.)',
  ).not.toBeNull()

  // 2. A compilar. En paralelo entre apps.
  const t0 = Date.now()
  const porApp = await Promise.all(
    (Object.keys(RUTAS) as (keyof typeof APPS)[]).map((app) => calentarApp(APPS[app], RUTAS[app])),
  )
  const total = Date.now() - t0

  // 3. Lo que tardó, para que el día que una ruta nueva se ponga cara se vea
  //    aquí y no como un test intermitente en otra parte.
  const lentas = porApp
    .flat()
    .filter((m) => m.ms >= UMBRAL_LENTO_MS)
    .sort((a, b) => b.ms - a.ms)

  const resumen = lentas.length
    ? lentas.map((m) => `    ${(m.ms / 1000).toFixed(1)}s  ${m.ruta}`).join('\n')
    : '    (ninguna pasó de 1s — los servidores ya estaban calientes)'
  console.log(`\n  Stack precalentado en ${(total / 1000).toFixed(1)}s\n${resumen}\n`)
})
