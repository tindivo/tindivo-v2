import { existsSync } from 'node:fs'
import { DomainError } from '@tindivo/core'
import type { Browser } from 'puppeteer-core'
import puppeteer from 'puppeteer-core'
import { serverEnv } from '../env'

/**
 * Rutas típicas de Chrome/Edge instalados localmente, para dev sin depender de
 * descargar Chromium completo (~170MB) como devDependency solo para probar PDFs.
 */
const LOCAL_BROWSER_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
]

/**
 * A4 a 96dpi. Se fija a propósito en vez de dejar el 800x600 por defecto de
 * puppeteer: el documento mide `210mm` de ancho y el viewport decide dónde
 * caen los `%` y los saltos de línea. Sin fijarlo, dev y producción podían
 * maquetar distinto por una diferencia que no está en ninguna parte del código.
 */
const A4_VIEWPORT = { width: 794, height: 1123, deviceScaleFactor: 1 }

function resolveLocalExecutablePath(): string | null {
  const configured = serverEnv().PUPPETEER_EXECUTABLE_PATH
  if (configured) return configured
  return LOCAL_BROWSER_CANDIDATES.find((p) => existsSync(p)) ?? null
}

/**
 * Lanza Chromium para renderizar un PDF. En producción usa
 * `@sparticuz/chromium` (binario comprimido pensado para funciones serverless,
 * cabe en el límite de tamaño de Vercel); en dev reutiliza el Chrome/Edge ya
 * instalado en la máquina en vez de sumar `puppeteer` completo como
 * devDependency solo para esto.
 *
 * OJO CON LAS DOS RAMAS. No son la misma cosa con distinto binario: la de dev
 * arranca un Chrome COMPLETO y la de producción arranca `chrome-headless-shell`,
 * que es otro programa con otras capacidades. Todo lo que se pruebe aquí en
 * local pasa por la rama que producción no ejecuta nunca. Es exactamente por
 * eso que el PDF pudo desplegarse roto sin que nadie lo notara.
 */
export async function launchBrowser(): Promise<Browser> {
  if (process.env.NODE_ENV === 'production') {
    const chromium = (await import('@sparticuz/chromium')).default

    // Sin WebGL: el reporte es HTML y SVG estáticos, no dibuja nada acelerado.
    // Esto solo quita los flags de swiftshader (`--use-gl=angle`, etc.) y añade
    // `--disable-webgl`; los `.br` que se extraen son los mismos, porque
    // `executablePath()` infla swiftshader igual pase lo que pase con esta
    // bandera. O sea: menos superficie en el arranque, mismo peso en disco.
    chromium.setGraphicsMode = false

    try {
      return await puppeteer.launch({
        // `headless: 'shell'`, NO `true`. `@sparticuz/chromium` no empaqueta
        // Chrome: empaqueta `chrome-headless-shell`, y su README dice que ese
        // binario no soporta el modo «new» de headless. Con `headless: true`,
        // puppeteer-core añade `--headless=new` (`ChromeLauncher.js`:
        // `headless === 'shell' ? '--headless' : '--headless=new'`), que es
        // justo el que no entiende.
        //
        // En dev no se nota, porque allí el binario es un Chrome de verdad y sí
        // lo acepta. Otro fallo que solo existe en la rama de producción.
        args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
        defaultViewport: A4_VIEWPORT,
        executablePath: await chromium.executablePath(),
        headless: 'shell',
      })
    } catch (err) {
      // El fallo llegaba al negocio como «Ocurrió un error interno» y a los
      // logs como un stack sin contexto. Se etiqueta para poder buscarlo, y se
      // conserva la causa: los dos modos de romperse (el `bin/` que no viaja en
      // la traza, el binario que no arranca) dan mensajes muy distintos y hay
      // que poder distinguirlos sin volver a instrumentar nada.
      console.error('[api][pdf] no se pudo arrancar chromium serverless:', err)
      throw new DomainError(
        'No se pudo generar el PDF: el motor de reportes no arrancó. Ya estamos avisados.',
        'internal_error',
      )
    }
  }

  const executablePath = resolveLocalExecutablePath()
  if (!executablePath) {
    throw new DomainError(
      'No se encontró Chrome/Edge local para generar el PDF. Define PUPPETEER_EXECUTABLE_PATH en .env.local',
      'internal_error',
    )
  }
  return puppeteer.launch({ executablePath, headless: true, defaultViewport: A4_VIEWPORT })
}
